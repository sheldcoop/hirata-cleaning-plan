"""Build one self-contained HTML file (no separate .js/.css files) for shares that block script files.

    python tools/build-single.py      ->  dist/Hirata-Cleaning-Plan.html

Copy only that one file to the shared drive (plus the data folder). Open it in Microsoft Edge.
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def css(m):
    return '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

def js(m):
    code = (root / m.group(1)).read_text(encoding='utf-8')
    if '</script' in code.lower():
        raise SystemExit('cannot inline ' + m.group(1) + ': contains </script')
    return '<script>\n/* ' + m.group(1) + ' */\n' + code + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
assert 'src="js/' not in html and 'href="css/' not in html
out = root / 'dist' / 'Hirata-Cleaning-Plan.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print('written', out, round(out.stat().st_size / 1024), 'KB')
