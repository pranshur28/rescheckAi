import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(
    {
      ok: true,
      received: body,
      note: "Stub. Two-pass analyze flow lands in Hour 5 (PRD §11).",
    },
    { status: 200 },
  );
}
