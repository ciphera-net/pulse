"use client";

import { useEffect } from "react";
import { isChunkLoadError } from "@/lib/chunk-recovery";
import { useChunkRecovery } from "@/lib/hooks/useChunkRecovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // * A chunk-load failure is a stale tab meeting a new deploy, not an app bug —
  // * reload once (guarded) instead of showing an error page; the shared hook is the
  // * same one every route boundary uses via ErrorDisplay.
  const chunkFailure = isChunkLoadError(error);
  const phase = useChunkRecovery(error);

  // In an effect, not the render body: the phase state above makes this component
  // re-render, and a render-body beacon would fire once per render instead of once
  // per error.
  useEffect(() => {
    navigator.sendBeacon?.(
      "/api/client-errors",
      new Blob([JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 500),
        url: window.location.href,
        timestamp: new Date().toISOString(),
        level: "global",
        // Distinguish routine deploy-staleness self-heals from real crashes.
        chunkRecovery: chunkFailure,
      })], { type: "application/json" })
    );
  }, [error, chunkFailure]);

  return (
    <html>
      <body className="bg-neutral-950 text-white flex items-center justify-center min-h-screen">
        {phase === "show" && (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-medium">Something went wrong</h2>
            <button
              onClick={reset}
              className="px-4 py-2 bg-neutral-800 rounded-none hover:bg-neutral-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
