#!/usr/bin/env python3
"""Mock Pulse ingest + static server for the smoke harness.

Serves the sample apps and the real tracking scripts from ../public, and records
every POST to /api/v1/events and /api/v1/metrics IN MEMORY. It never talks to a
real backend — the whole point of the harness is that NO analytics event ever
reaches Pulse staging/production (which share one database). The sample apps
point their `data-api` at this server, so events are captured here and nowhere
else.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(ROOT, "..", "..", "public"))

_events = []
_lock = threading.Lock()


def recorded():
    with _lock:
        return list(_events)


def reset():
    with _lock:
        _events.clear()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # quiet
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {"_unparsed": raw.decode("utf-8", "replace")}
        with _lock:
            _events.append({"path": self.path, "body": body})
        self.send_response(202)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        # script.js expects {id} back from /events to start metrics timers.
        self.wfile.write(json.dumps({"id": f"mock-{len(_events)}"}).encode())

    def do_GET(self):
        # Introspection endpoint for the test process.
        if self.path == "/__events":
            payload = json.dumps(recorded()).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path == "/__reset":
            reset()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        # Serve sample apps from apps/, and the real scripts from ../../public.
        rel = self.path.split("?", 1)[0].lstrip("/")
        if rel.startswith("script") and rel.endswith(".js"):
            filepath = os.path.join(PUBLIC, os.path.basename(rel))
            ctype = "application/javascript"
        else:
            filepath = os.path.join(ROOT, "apps", rel or "index.html")
            ctype = "text/html"
        if not os.path.isfile(filepath):
            self.send_response(404)
            self.end_headers()
            return
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(data)


def serve(port=0):
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


if __name__ == "__main__":
    srv = serve(8799)
    print(f"mock ingest on http://127.0.0.1:{srv.server_address[1]}")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
