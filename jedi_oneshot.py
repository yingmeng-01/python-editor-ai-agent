"""
One-shot jedi script for code completion and hover.
Usage: python jedi_oneshot.py <action> <content_file> <line> <column> <cache_dir>
action: "complete" or "hover"
"""
import os
import sys
import json
from pathlib import Path

# === Step 1: Disable parso cache BEFORE importing jedi ===
# Must patch parso.cache BEFORE jedi imports it.
# The lock file (PARSO-CACHE-LOCK) causes subsequent processes to hang/crash.
import parso.cache as _parso_cache
import tempfile, os

# Use a throwaway temp dir as the cache path (must be a valid Path for joinpath)
_dummy_path = Path(tempfile.gettempdir()) / 'parso_disabled'
_dummy_path.mkdir(parents=True, exist_ok=True)

# Make all cache operations no-ops (no file I/O, no lock)
_parso_cache.load_module = lambda *a, **kw: None
_parso_cache.store_module = lambda *a, **kw: None
_parso_cache._default_cache_path = _dummy_path
_parso_cache._get_default_cache_path = lambda: _dummy_path

# === Step 2: Import jedi (parso cache is already disabled) ===
import jedi

# Disable jedi's own cache as well
try:
    jedi.settings.cache_directory = None
    jedi.settings.dynamic_completions = False
except Exception:
    pass

# === Step 4: Process request ===
try:
    action = sys.argv[1]
    content_file = sys.argv[2]
    line = int(sys.argv[3])
    # Monaco column is 1-based, jedi is 0-based
    column = max(0, int(sys.argv[4]) - 1)

    with open(content_file, 'r', encoding='utf-8') as f:
        content = f.read()

    script = jedi.Script(content)

    if action == 'complete':
        completions = script.complete(line, column)
        result = []
        for c in completions[:30]:
            result.append({
                'name': c.name,
                'type': c.type,
                'description': (c.docstring() or '')[:200],
            })
        print(json.dumps({'success': True, 'completions': result}, ensure_ascii=False))

    elif action == 'hover':
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
        print(json.dumps({'success': True, 'hover': hover}, ensure_ascii=False))

    elif action == 'goto':
        # 代码跳转：返回定义位置
        defs = script.goto(line, column, follow_imports=True)
        result = []
        for d in defs:
            # jedi 的行号是 1-based，Monaco 也是 1-based，无需转换
            # 但列号需要 +1 转为 Monaco 的 1-based
            result.append({
                'name': d.name,
                'uri': f'file:///{d.module_path}' if d.module_path else '',
                'line': d.line,
                'column': d.column + 1 if d.column else 1,
                'module': d.module_name,
            })
        print(json.dumps({'success': True, 'definitions': result}, ensure_ascii=False))

    else:
        print(json.dumps({'success': False, 'error': f'Unknown action: {action}'}, ensure_ascii=False))

except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False))
