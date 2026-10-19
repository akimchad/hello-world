#!/usr/bin/env python3
"""Local dev server for Marvel Kombat. Serves this folder with caching off.

Usage: python3 serve.py [port]   then open http://localhost:8000
"""
import http.server
import os
import sys
import webbrowser


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    nums = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(nums[0]) if nums else 8000
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    url = f"http://localhost:{port}"
    print(f"Marvel Kombat running at {url}  (Ctrl+C to stop)")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
