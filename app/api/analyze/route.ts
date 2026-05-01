import { NextResponse } from "next/server";
import { parseAnalyzeRequest } from "@/lib/request.ts";
import { analyze } from "@/lib/analyze.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseAnalyzeRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const outcome = await analyze(parsed.value);
    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[analyze] failed:", message);
    return NextResponse.json(
      { error: "Analysis failed", detail: message },
      { status: 500 },
    );
  }
}
