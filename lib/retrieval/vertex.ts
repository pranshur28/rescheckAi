// PRD §11.3 Vertex AI RAG Engine retrieval, scoped via rag_file_ids.
//
// We call the REST endpoint directly because @google-cloud/aiplatform's Node
// SDK does not surface retrieveContexts. Auth via google-auth-library, with
// the service account JSON inlined in GOOGLE_APPLICATION_CREDENTIALS_JSON
// (Netlify Functions can't read a credentials file path).
//
// Endpoint:
//   POST https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}:retrieveContexts
//
// Body shape (verified against
//   https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/rag-api):
//   {
//     "vertex_rag_store": {
//       "rag_resources": [{
//         "rag_corpus": "projects/.../ragCorpora/...",
//         "rag_file_ids": ["projects/.../ragFiles/..."]
//       }]
//     },
//     "query": { "text": "..." }
//   }

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { RetrievalResult, RetrievedChunk } from "./types.ts";

let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (authClient) return authClient;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credsJson) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not set");
  }
  const credentials = JSON.parse(credsJson);
  authClient = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return authClient;
}

let lawToFileIdCache: Record<string, string> | null = null;

function loadLawToFileId(): Record<string, string> {
  if (lawToFileIdCache) return lawToFileIdCache;
  const path = join(process.cwd(), "data", "law-to-file-id.json");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("law-to-file-id.json must be a JSON object");
  }
  lawToFileIdCache = parsed as Record<string, string>;
  return lawToFileIdCache;
}

export interface VertexRetrieveOptions {
  topK?: number;
}

export interface VertexRetrievalChunk {
  // The Vertex response shape varies slightly between regions and versions; we
  // normalize the few fields we care about. Keeping the raw chunk around in
  // case the eval script wants to inspect scores.
  text: string;
  source_uri?: string;
  source_display_name?: string;
  score?: number;
}

interface RetrieveContextsResponse {
  contexts?: {
    contexts?: VertexRetrievalChunk[];
  };
}

export async function retrieveFromVertex(
  lawNumber: string,
  queryText: string,
  options: VertexRetrieveOptions = {},
): Promise<RetrievalResult> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_LOCATION;
  const corpusId = process.env.RAG_CORPUS_ID;
  if (!project || !location || !corpusId) {
    throw new Error("Missing one of: GOOGLE_CLOUD_PROJECT, VERTEX_LOCATION, RAG_CORPUS_ID");
  }

  const map = loadLawToFileId();
  const fileId = map[lawNumber];
  if (!fileId) {
    throw new Error(`No Vertex file ID mapped for ${lawNumber} in law-to-file-id.json`);
  }

  const topK = options.topK ?? 5;

  const auth = getAuth();
  const tokenResp = await auth.getAccessToken();
  if (!tokenResp) throw new Error("Failed to obtain Vertex access token");

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}:retrieveContexts`;
  const body = {
    vertex_rag_store: {
      rag_resources: [
        {
          rag_corpus: corpusId,
          rag_file_ids: [fileId],
        },
      ],
    },
    query: {
      text: queryText,
      // top_k goes in rag_retrieval_config in some versions of the API.
      // We send it both ways to be safe; unknown fields are ignored.
      rag_retrieval_config: { top_k: topK },
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenResp}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Vertex retrieveContexts failed (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const json = (await resp.json()) as RetrieveContextsResponse;
  const rawChunks = json.contexts?.contexts ?? [];

  const chunks: RetrievedChunk[] = rawChunks.map((c, i) => ({
    // Vertex doesn't expose a stable per-chunk id in the retrieve response,
    // so we synthesize one from the file ID and chunk index. Stable for the
    // duration of one retrieval call, which is all the validator needs.
    id: `${lawNumber.toLowerCase().replace(/\s+/g, "-")}-chunk-${i}`,
    law_number: lawNumber,
    law_title: deriveLawTitle(lawNumber),
    section: c.source_display_name ?? "Retrieved passage",
    text: c.text ?? "",
    score: typeof c.score === "number" ? c.score : undefined,
  }));

  return { source: "vertex", chunks };
}

// Map Law N → human title for the response object. Kept here (not in §6's
// types.ts map) because the title is presentation-only.
const LAW_TITLES: Record<string, string> = {
  "Law 9": "The Ball In and Out of Play",
  "Law 11": "Offside",
  "Law 12": "Fouls and Misconduct",
  "Law 13": "Free Kicks",
  "Law 14": "The Penalty Kick",
  "Law 15": "The Throw-in",
  "Law 16": "The Goal Kick",
  "Law 17": "The Corner Kick",
};

function deriveLawTitle(lawNumber: string): string {
  return LAW_TITLES[lawNumber] ?? lawNumber;
}

// Test seam.
export function _setLawMapForTesting(map: Record<string, string> | null): void {
  lawToFileIdCache = map;
}
