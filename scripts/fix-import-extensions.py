"""Add .js extensions to relative imports in compiled JavaScript output.

TypeScript with moduleResolution: "Bundler" does not add .js extensions
to relative imports. Node.js v24+ ESM requires explicit file extensions
for relative imports, so this script adds them as a post-build step.
Virtual module files in dist/react/virtual/ are excluded — they are
loaded by the Vite module runner which resolves extensionless imports.
"""
import re
import os
import glob

EXTENSIONS = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.node'}

def has_extension(path):
    _, ext = os.path.splitext(path)
    return ext in EXTENSIONS

def fix_import_match(m):
    prefix = m.group(1)
    path = m.group(2)
    suffix = m.group(3)
    if not has_extension(path):
        return f"{prefix}{path}.js{suffix}"
    return m.group(0)

# Static imports
P1 = re.compile(r"""(from\s+['""])(\.\/[^'""]*?)(['""])""")
P2 = re.compile(r"""(from\s+['""])(\.\.[^'""]*?)(['""])""")
# Dynamic imports
P3 = re.compile(r"""(import\(['""])(\.\/[^'""]*?)(['""]\))""")
P4 = re.compile(r"""(import\(['""])(\.\.[^'""]*?)(['""]\))""")

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist_dir = os.path.join(root, 'dist')

count = 0
for fp in glob.glob(os.path.join(dist_dir, '**', '*.js'), recursive=True):
    if '.test.' in fp:
        continue
    with open(fp) as f:
        content = f.read()
    original = content
    content = P1.sub(fix_import_match, content)
    content = P2.sub(fix_import_match, content)
    content = P3.sub(fix_import_match, content)
    content = P4.sub(fix_import_match, content)
    if content != original:
        with open(fp, 'w') as f:
            f.write(content)
        count += 1

if count:
    print(f"fix-import-extensions: fixed {count} file(s)")
