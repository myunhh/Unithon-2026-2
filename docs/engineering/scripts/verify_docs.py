#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import csv
import json
import re
import sys

import yaml
from jsonschema import Draft202012Validator

SCRIPT_DIR = Path(__file__).resolve().parent
BASE = SCRIPT_DIR.parent
if (BASE / 'docs' / 'api' / 'openapi.yaml').is_file():
    ROOT = BASE
    DOCS = ROOT / 'docs'
elif (BASE / 'api' / 'openapi.yaml').is_file():
    ROOT = BASE
    DOCS = ROOT
else:
    print('VERIFY FAILED', file=sys.stderr)
    print('- could not locate docs/api/openapi.yaml or api/openapi.yaml', file=sys.stderr)
    raise SystemExit(1)

errors: list[str] = []

required = [
    '00_PRODUCT_SCOPE_AND_ASSUMPTIONS.md',
    '03_REPOSITORY_SPLIT_PLAN.md',
    '04_DOMAIN_MODEL_AND_ERD.md',
    'api/openapi.yaml',
    'database/001_core_schema.sql',
    'contracts/selection-anchor.schema.json',
    '11_FRONTEND_TODO.md',
    '12_BACKEND_TODO.md',
    '17_MACOS_DESKTOP_RELEASE.md',
    '20_PUSH_AND_CODEX_RUNBOOK.md',
    '24_DEFINITION_OF_DONE.md',
    'prompts/00_coordinator.md',
]
for rel in required:
    p = DOCS / rel
    if not p.is_file() or p.stat().st_size == 0:
        errors.append(f'missing or empty: {rel}')

spec: dict = {}
try:
    spec = yaml.safe_load((DOCS / 'api' / 'openapi.yaml').read_text(encoding='utf-8'))
    if spec.get('openapi') != '3.1.0':
        errors.append('OpenAPI version must be 3.1.0')
    ids: list[str] = []
    for path, item in spec.get('paths', {}).items():
        for method, operation in item.items():
            if method.lower() not in {'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'}:
                continue
            oid = operation.get('operationId')
            if not oid:
                errors.append(f'missing operationId: {method.upper()} {path}')
            else:
                ids.append(oid)
    if len(ids) != len(set(ids)):
        errors.append('duplicate OpenAPI operationId')
    schemas = spec.get('components', {}).get('schemas', {})
    raw = json.dumps(spec)
    for name in re.findall(r'#/components/schemas/([A-Za-z0-9_.-]+)', raw):
        if name not in schemas:
            errors.append(f'unknown OpenAPI schema ref: {name}')
except Exception as exc:
    errors.append(f'OpenAPI parse failed: {exc}')

for p in (DOCS / 'contracts').glob('*.json'):
    try:
        Draft202012Validator.check_schema(json.loads(p.read_text(encoding='utf-8')))
    except Exception as exc:
        errors.append(f'JSON Schema invalid {p.name}: {exc}')

for filename, prefix in [('frontend.csv', 'FE-'), ('backend.csv', 'BE-')]:
    p = DOCS / 'todo' / filename
    try:
        with p.open(encoding='utf-8-sig', newline='') as fh:
            rows = list(csv.DictReader(fh))
        ids = [r['ID'] for r in rows]
        if len(rows) < 80:
            errors.append(f'{filename}: expected at least 80 tasks')
        if len(ids) != len(set(ids)):
            errors.append(f'{filename}: duplicate IDs')
        if any(not x.startswith(prefix) for x in ids):
            errors.append(f'{filename}: invalid ID prefix')
    except Exception as exc:
        errors.append(f'{filename}: parse failed: {exc}')

# Check explicit local file references that should exist inside the engineering docs tree.
all_markdown = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in DOCS.rglob('*.md'))
for rel in re.findall(r'`(?:docs/engineering/)?((?:api|contracts|database|prompts)/[^`\s]+)`', all_markdown):
    clean = rel.rstrip('.,;:)')
    if '*' in clean or '{' in clean:
        continue
    if not (DOCS / clean).exists():
        errors.append(f'broken documented local path: {clean}')

all_text = '\n'.join(
    p.read_text(encoding='utf-8', errors='ignore')
    for p in ROOT.rglob('*')
    if p.is_file() and p.name != 'verify_docs.py' and p.suffix.lower() in {'.md', '.txt', '.csv', '.yaml', '.yml', '.json', '.sql', '.sh', '.ts', '.py'}
)
for pattern, label in [
    (r'01[016789]-\d{3,4}-\d{4}', 'Korean phone number'),
    (r'dbruamyg13|mynok2714|kimgalam0831', 'personal email fragment'),
]:
    if re.search(pattern, all_text, re.I):
        errors.append(f'possible sensitive data found: {label}')

if errors:
    print('VERIFY FAILED', file=sys.stderr)
    for error in sorted(set(errors)):
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('VERIFY OK')
print(f'Markdown files: {len(list(DOCS.rglob("*.md")))}')
print(f'OpenAPI paths: {len(spec.get("paths", {}))}')
print(f'OpenAPI schemas: {len(spec.get("components", {}).get("schemas", {}))}')
