import { NextResponse } from "next/server";

// This endpoint is deprecated. Use POST /api/collabs/[id]/generate instead.
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use POST /api/collabs/[id]/generate instead." },
    { status: 410 }
  );
}
