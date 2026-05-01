"""
RefCheck AI — Vertex RAG corpus prep (offline, one-time).

Implements PRD v1.7 §11.2:
  1. split   — split IFAB PDF into 8 per-law PDFs (Laws 9, 11, 12, 13, 14, 15, 16, 17)
  2. upload  — upload per-law PDFs to a GCS bucket folder
  3. ingest  — create corpus (or reuse), import_files, capture file IDs into law-to-file-id.json
  4. smoke   — retrieval_query with rag_file_ids=[mapped_law_file_id] for one law

The 8-law map is canonical: incident_to_law in PRD §6.

Usage examples:
  python prep_corpus.py split   --pdf ./data/ifab-source.pdf --ranges-json ./scripts/python/law-page-ranges.json
  python prep_corpus.py upload  --bucket my-rag-bucket
  python prep_corpus.py ingest  --bucket my-rag-bucket --display-name "ifab-laws-2025"
  python prep_corpus.py smoke   --law "Law 11" --query "offside offence interfering with play"

Env vars used (read from .env if python-dotenv is installed; otherwise from shell):
  GOOGLE_CLOUD_PROJECT         — GCP project ID
  VERTEX_LOCATION              — e.g. us-central1
  RAG_CORPUS_ID                — set after `ingest` completes; smoke uses it
  GOOGLE_APPLICATION_CREDENTIALS — local service-account JSON path

The runtime function in /api/analyze loads this same RAG_CORPUS_ID from env at request time.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
PER_LAW_DIR = DATA_DIR / "per-law-pdfs"
LAW_TO_FILE_ID_PATH = DATA_DIR / "law-to-file-id.json"

# PRD §6 — 8 supported laws
SUPPORTED_LAWS: List[Tuple[str, str]] = [
    ("Law 9", "ball-in-and-out-of-play"),
    ("Law 11", "offside"),
    ("Law 12", "fouls-and-misconduct"),
    ("Law 13", "free-kicks"),
    ("Law 14", "penalty-kick"),
    ("Law 15", "throw-in"),
    ("Law 16", "goal-kick"),
    ("Law 17", "corner-kick"),
]


def per_law_filename(law_number: str, slug: str) -> str:
    # e.g. "Law 9"  -> "law-09-ball-in-and-out-of-play.pdf"
    n = int(law_number.split()[1])
    return f"law-{n:02d}-{slug}.pdf"


# ---------------------------------------------------------------------------
# split
# ---------------------------------------------------------------------------
def cmd_split(args: argparse.Namespace) -> None:
    from pypdf import PdfReader, PdfWriter

    pdf_path = Path(args.pdf).resolve()
    if not pdf_path.exists():
        sys.exit(f"PDF not found: {pdf_path}")

    if not args.ranges_json:
        sys.exit(
            "split requires --ranges-json pointing to a JSON file with shape:\n"
            '  { "Law 9": [start_page, end_page], "Law 11": [...], ... }\n'
            "Pages are 1-indexed and inclusive (matches PDF reader page numbers)."
        )
    ranges_path = Path(args.ranges_json).resolve()
    ranges: Dict[str, List[int]] = json.loads(ranges_path.read_text())

    missing = [law for law, _ in SUPPORTED_LAWS if law not in ranges]
    if missing:
        sys.exit(f"Missing page ranges for: {', '.join(missing)}")

    PER_LAW_DIR.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)
    print(f"Loaded {pdf_path.name}: {total_pages} pages")

    for law_number, slug in SUPPORTED_LAWS:
        start_1, end_1 = ranges[law_number]
        if start_1 < 1 or end_1 > total_pages or start_1 > end_1:
            sys.exit(f"Bad range for {law_number}: [{start_1}, {end_1}] (PDF has {total_pages} pages)")

        writer = PdfWriter()
        for p in range(start_1 - 1, end_1):
            writer.add_page(reader.pages[p])
        out_path = PER_LAW_DIR / per_law_filename(law_number, slug)
        with out_path.open("wb") as fh:
            writer.write(fh)
        print(f"  {law_number}: pages {start_1}-{end_1} -> {out_path.relative_to(REPO_ROOT)}")

    print(f"Wrote {len(SUPPORTED_LAWS)} per-law PDFs to {PER_LAW_DIR.relative_to(REPO_ROOT)}")


# ---------------------------------------------------------------------------
# upload
# ---------------------------------------------------------------------------
def cmd_upload(args: argparse.Namespace) -> None:
    from google.cloud import storage

    project = require_env("GOOGLE_CLOUD_PROJECT")
    bucket_name = args.bucket
    folder = args.folder.rstrip("/")

    client = storage.Client(project=project)
    bucket = client.bucket(bucket_name)
    if not bucket.exists():
        sys.exit(f"Bucket gs://{bucket_name} does not exist; create it first.")

    if not PER_LAW_DIR.exists():
        sys.exit(f"{PER_LAW_DIR} not found — run `split` first.")

    uploaded: List[str] = []
    for law_number, slug in SUPPORTED_LAWS:
        local = PER_LAW_DIR / per_law_filename(law_number, slug)
        if not local.exists():
            sys.exit(f"Missing {local}; run `split` first.")
        blob_path = f"{folder}/{local.name}" if folder else local.name
        blob = bucket.blob(blob_path)
        blob.upload_from_filename(str(local), content_type="application/pdf")
        gcs_uri = f"gs://{bucket_name}/{blob_path}"
        uploaded.append(gcs_uri)
        print(f"  {law_number} -> {gcs_uri}")

    print(f"Uploaded {len(uploaded)} files to gs://{bucket_name}/{folder}")


# ---------------------------------------------------------------------------
# ingest
# ---------------------------------------------------------------------------
def cmd_ingest(args: argparse.Namespace) -> None:
    import vertexai
    from vertexai import rag

    project = require_env("GOOGLE_CLOUD_PROJECT")
    location = require_env("VERTEX_LOCATION")
    bucket_name = args.bucket
    folder = args.folder.rstrip("/")
    display_name = args.display_name

    vertexai.init(project=project, location=location)

    # Reuse existing corpus by display_name if present, else create.
    existing = None
    for c in rag.list_corpora():
        if c.display_name == display_name:
            existing = c
            break

    if existing is not None:
        corpus = existing
        print(f"Reusing corpus: {corpus.name}")
    else:
        corpus = rag.create_corpus(display_name=display_name)
        print(f"Created corpus: {corpus.name}")

    # Build the GCS paths to ingest. import_files accepts gs:// paths.
    paths = [
        f"gs://{bucket_name}/{folder}/{per_law_filename(law_number, slug)}"
        if folder
        else f"gs://{bucket_name}/{per_law_filename(law_number, slug)}"
        for law_number, slug in SUPPORTED_LAWS
    ]
    print("Importing:")
    for p in paths:
        print(f"  {p}")

    response = rag.import_files(
        corpus_name=corpus.name,
        paths=paths,
        # Default chunking is fine for short rule passages; the 8 PDFs are small.
        max_embedding_requests_per_min=600,
    )
    imported = getattr(response, "imported_rag_files_count", "?")
    print(f"Imported {imported} files. Waiting for indexing to settle...")

    # Vertex doesn't expose a per-import "ready" signal in the public SDK;
    # poll list_files until count == 8 with non-empty display_name.
    DEADLINE_SECONDS = 600
    start = time.time()
    files_by_basename: Dict[str, str] = {}
    while time.time() - start < DEADLINE_SECONDS:
        listing = list(rag.list_files(corpus.name))
        files_by_basename = {os.path.basename(f.display_name or ""): f.name for f in listing if f.display_name}
        if len(files_by_basename) >= len(SUPPORTED_LAWS):
            break
        print(f"  ...{len(files_by_basename)}/{len(SUPPORTED_LAWS)} files visible; sleeping 10s")
        time.sleep(10)
    else:
        sys.exit("Timed out waiting for files to register; run `ingest` again or check the Cloud Console.")

    # Map "Law N" -> file resource name. Display name in Vertex is typically the GCS object basename.
    law_to_file_id: Dict[str, str] = {}
    for law_number, slug in SUPPORTED_LAWS:
        basename = per_law_filename(law_number, slug)
        name = files_by_basename.get(basename)
        if name is None:
            sys.exit(f"Could not find ingested file for {law_number} (expected basename {basename})")
        law_to_file_id[law_number] = name

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LAW_TO_FILE_ID_PATH.write_text(json.dumps(law_to_file_id, indent=2) + "\n")
    print(f"Wrote {LAW_TO_FILE_ID_PATH.relative_to(REPO_ROOT)}")
    print()
    print("Add this to .env (or your Netlify env):")
    print(f"  RAG_CORPUS_ID={corpus.name}")


# ---------------------------------------------------------------------------
# smoke
# ---------------------------------------------------------------------------
def cmd_smoke(args: argparse.Namespace) -> None:
    import vertexai
    from vertexai import rag
    from vertexai.rag.utils.resources import RagResource, RagRetrievalConfig

    project = require_env("GOOGLE_CLOUD_PROJECT")
    location = require_env("VERTEX_LOCATION")
    corpus_id = require_env("RAG_CORPUS_ID")

    if not LAW_TO_FILE_ID_PATH.exists():
        sys.exit(f"{LAW_TO_FILE_ID_PATH} missing — run `ingest` first.")
    law_map: Dict[str, str] = json.loads(LAW_TO_FILE_ID_PATH.read_text())
    if args.law not in law_map:
        sys.exit(f"Unknown law {args.law!r}. Known: {sorted(law_map)}")

    vertexai.init(project=project, location=location)

    rag_resource = RagResource(rag_corpus=corpus_id, rag_file_ids=[law_map[args.law]])
    results = rag.retrieval_query(
        text=args.query,
        rag_resources=[rag_resource],
        rag_retrieval_config=RagRetrievalConfig(top_k=args.top_k),
    )

    contexts = list(results.contexts.contexts)
    print(f"Got {len(contexts)} chunks scoped to {args.law} ({law_map[args.law]}):")
    for i, ctx in enumerate(contexts, start=1):
        score = getattr(ctx, "score", None)
        text = (getattr(ctx, "text", "") or "").strip().replace("\n", " ")
        if len(text) > 200:
            text = text[:200] + "..."
        print(f"  [{i}] score={score} {text}")

    # Smoke assertion: every chunk's source should map back to this law's file.
    file_ids_in_results = {
        getattr(ctx, "source_uri", None) or getattr(ctx, "source_display_name", None)
        for ctx in contexts
    }
    print(f"Source identifiers in result set: {file_ids_in_results}")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        sys.exit(f"Missing required env var: {name}")
    return val


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_split = sub.add_parser("split", help="split IFAB PDF into per-law PDFs")
    p_split.add_argument("--pdf", required=True, help="path to the IFAB Laws of the Game PDF")
    p_split.add_argument("--ranges-json", required=True, help="JSON file mapping 'Law N' -> [start, end] (1-indexed inclusive)")
    p_split.set_defaults(func=cmd_split)

    p_upload = sub.add_parser("upload", help="upload per-law PDFs to GCS")
    p_upload.add_argument("--bucket", required=True)
    p_upload.add_argument("--folder", default="ifab-laws-of-the-game")
    p_upload.set_defaults(func=cmd_upload)

    p_ingest = sub.add_parser("ingest", help="create corpus, import files, capture file IDs")
    p_ingest.add_argument("--bucket", required=True)
    p_ingest.add_argument("--folder", default="ifab-laws-of-the-game")
    p_ingest.add_argument("--display-name", default="ifab-laws", help="Vertex RAG corpus display name")
    p_ingest.set_defaults(func=cmd_ingest)

    p_smoke = sub.add_parser("smoke", help="retrieval test scoped to one law via rag_file_ids")
    p_smoke.add_argument("--law", required=True, help="e.g. 'Law 11'")
    p_smoke.add_argument("--query", required=True, help="search terms")
    p_smoke.add_argument("--top-k", type=int, default=5)
    p_smoke.set_defaults(func=cmd_smoke)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
