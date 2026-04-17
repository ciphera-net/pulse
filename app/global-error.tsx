"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    navigator.sendBeacon?.(
      "/api/client-errors",
      new Blob([JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 500),
        url: window.location.href,
        timestamp: new Date().toISOString(),
        level: "global",
      })], { type: "application/json" })
    );
  }

  return (
    <html>
      <body className="bg-neutral-950 text-white flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-medium">Something went wrong</h2>
          <button
            onClick={reset}
            className="px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
