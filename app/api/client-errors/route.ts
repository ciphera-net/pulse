import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.warn("[client-error]", JSON.stringify({
      message: payload.message,
      url: payload.url,
      timestamp: payload.timestamp,
    }));
  } catch {
    // ignore malformed payloads
  }
  return new NextResponse(null, { status: 204 });
}
