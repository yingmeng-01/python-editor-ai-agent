"""
Jedi HTTP micro-server.
Provides /complete and /hover endpoints for code intelligence.
Started once by the Node.js backend; communicates via HTTP to avoid
repeated process spawning (which is limited by the sandbox).
"""
import os
import sys
import json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# === Step 1: Disable parso cache BEFORE importing jedi ===
import parso.cache as _parso_cache
import tempfile

_dummy_path = Path(tempfile.gettempdir()) / 'parso_disabled'
_dummy_path.mkdir(parents=True, exist_ok=True)
_parso_cache.load_module = lambda *a, **kw: None
_parso_cache.store_module = lambda *a, **kw: None
_parso_cache._default_cache_path = _dummy_path
_parso_cache._get_default_cache_path = lambda: _dummy_path

# === Step 2: Import jedi ===
import jedi

try:
    jedi.settings.cache_directory = None
    jedi.settings.dynamic_completions = False
except Exception:
    pass

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3456


def handle_complete(content, line, column):
    script = jedi.Script(content)
    completions = script.complete(line, column)
    result = []
    for c in completions[:30]:
        result.append({
            'name': c.name,
            'type': c.type,
            'description': (c.docstring() or '')[:200],
        })
    return {'success': True, 'completions': result}


def handle_hover(content, line, column):
    script = jedi.Script(content)
    hover = None
    defs = script.goto(line, column)
    if defs:
        d = defs[0]
        hover = {
            'name': d.name,
            'module': d.module_name,
            'type': getattr(d, 'type', 'unknown'),
            'description': (d.docstring() or '')[:500],
        }
    else:
        infs = script.infer(line, column)
        if infs:
            i = infs[0]
            hover = {
                'name': i.name,
                'module': getattr(i, 'module_name', '__main__'),
                'type': getattr(i, 'type', 'unknown'),
                'description': (i.docstring() or '')[:500],
            }
    return {'success': True, 'hover': hover}


class JediHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            data = json.loads(body)
            content = data.get('content', '')
            line = int(data.get('line', 1))
            column = max(0, int(data.get('column', 1)) - 1)

            if self.path == '/complete':
                result = handle_complete(content, line, column)
            elif self.path == '/hover':
                result = handle_hover(content, line, column)
            else:
                result = {'success': False, 'error': f'Unknown path: {self.path}'}
        except Exception as e:
            result = {'success': False, 'error': str(e)}

        response = json.dumps(result, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        pass  # Suppress logging


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), JediHandler)
    print(f'Jedi server ready on port {PORT}', flush=True)
    server.serve_forever()
