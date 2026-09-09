import { NextResponse } from "next/server";

/**
 * Crash beacon sink. Every route boundary (components/ErrorDisplay.tsx), the
 * inline boundaries (components/InlineErrorDisplay.tsx) and the double-fault
 * path (app/global-error.tsx) POST here when they render.
 *
 * 🔴 LOG THE STACK. This endpoint used to keep only { message, url, timestamp }
 * and drop the `stack` and `chunkRecovery` fields the client was already
 * sending. That cost a diagnosis: the owner's PWA showed "Dashboard failed to
 * load" on /sites/<id> most mornings for three days, and the only trace was
 * `Minified React error #185` — an infinite render loop with no way to tell
 * WHICH component was looping, because the one field that names it was being
 * thrown away here (audit:
 * Pulse/docs/audits/09-09-2026-pwa-dashboard-failed-to-load.md).
 *
 * `chunkRecovery` separates a routine stale-tab self-heal from a real crash, so
 * a count of these lines means something without parsing the message text.
 *
 * The payload is attacker-controllable — this route is unauthenticated by
 * necessity, since a crashed page cannot be trusted to hold a session — so the
 * fields are truncated here as well as at the sender.
 */
const MAX = { message: 500, stack: 2000, url: 500 } as const;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.warn("[client-error]", JSON.stringify({
      message: clip(payload.message, MAX.message),
      // The component that looped / threw. Without this the message alone is
      // a minified error code and nothing more.
      stack: clip(payload.stack, MAX.stack),
      url: clip(payload.url, MAX.url),
      timestamp: clip(payload.timestamp, 40),
      chunkRecovery: typeof payload.chunkRecovery === "boolean" ? payload.chunkRecovery : undefined,
    }));
  } catch {
    // ignore malformed payloads
  }
  return new NextResponse(null, { status: 204 });
}
