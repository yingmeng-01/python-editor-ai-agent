"""
Jedi language server - persistent process mode.
Reads JSON commands from stdin (one per line), writes JSON results to stdout.

Command format: {"action": "complete"|"hover", "content": "...", "line": N, "column": N}
Result format:  {"success": true, ...} or {"success": false, "error": "..."}
"""
import os
import sys
import json
from pathlib import Path

# === Step 1: Redirect parso cache BEFORE importing jedi ===
cache_root = os.environ.get('BACKEND_PARSO_CACHE')
if not cache_root:
    cache_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'parso')
os.makedirs(cache_root, exist_ok=True)
os.environ['LOCALAPPDATA'] = cache_root

# === Step 2: Import jedi ===
import jedi

# === Step 3: Patch parso cache path (belt-and-suspenders) ===
try:
    import parso.cache as _parso_cache
    new_path = Path(cache_root)
    _parso_cache._default_cache_path = new_path
    _parso_cache._get_default_cache_path = lambda: new_path
except Exception:
    pass

# Disable jedi's own cache to avoid permission issues
try:
    jedi.settings.cache_directory = None
    jedi.settings.dynamic_completions = False
except Exception:
    pass

# Signal that the server is ready
sys.stdout.write(json.dumps({"event": "ready"}, ensure_ascii=False) + "\n")
sys.stdout.flush()


def handle_complete(content, line, column):
    """Handle code completion request."""
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
    """Handle hover/documentation request."""
    script = jedi.Script(content)

    hover = None
    # Try goto first (gets definition location)
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
        # Fallback: infer (gets type information)
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


# === Main loop: read commands from stdin, write results to stdout ===
for raw_line in sys.stdin:
    raw_line = raw_line.strip()
    if not raw_line:
        continue

    try:
        cmd = json.loads(raw_line)
        action = cmd.get('action')
        content = cmd.get('content', '')
        # Monaco line/column are 1-based; jedi uses 1-based line, 0-based column
        line = int(cmd.get('line', 1))
        column = max(0, int(cmd.get('column', 1)) - 1)

        if action == 'complete':
            result = handle_complete(content, line, column)
        elif action == 'hover':
            result = handle_hover(content, line, column)
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}

    except Exception as e:
        result = {'success': False, 'error': str(e)}

    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()
