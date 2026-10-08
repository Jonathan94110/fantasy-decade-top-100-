"""Fetch a public pinned source for local auditing, never activate gameplay records."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys

REVISION = '53cf0b14b896f3aa9d5e5e2069b20acb75e74728'
SITE_ROOT = Path(__file__).resolve().parent.parent
EXTRA_FILES = {
    'fantasy-legends/VALIDATION_REPORT.md', 'fantasy-legends/README.md',
    'fantasy-legends/scripts/build_data.py', 'fantasy-legends/scripts/build_sheets_csv.py',
    'fantasy-legends/scripts/audit_report.py', 'fantasy-legends/scripts/nflverse_1999.py',
    'fantasy-legends/data/enrich/dedup_log.json',
}


def download(url):
    return subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '60', url],
                          check=True, capture_output=True).stdout


def fetch_snapshot(destination):
    root = Path(destination).resolve()
    if root.is_relative_to(SITE_ROOT):
        raise ValueError('Keep source snapshots outside the Site repository.')
    tree = json.loads(download(f'https://api.github.com/repos/Jonathan94110/prime-rushmore/git/trees/{REVISION}?recursive=1'))
    if tree.get('truncated'):
        raise ValueError('Incomplete upstream file inventory.')
    selected = [row for row in tree['tree'] if row['type'] == 'blob' and
                (row['path'] in EXTRA_FILES or
                 (row['path'].startswith('fantasy-legends/data/sheets/') and row['path'].endswith('.csv')))]

    def fetch(row):
        source_path = row['path']
        target = (root / source_path).resolve()
        if not target.is_relative_to(root):
            raise ValueError('Source path leaves its snapshot.')
        url = f'https://raw.githubusercontent.com/Jonathan94110/prime-rushmore/{REVISION}/{source_path}'
        data = download(url)
        blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        if len(data) != row['size'] or blob != row['sha']:
            raise ValueError(f'Pinned blob mismatch: {source_path}')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {'path': source_path, 'url': url, 'sizeBytes': len(data),
                'gitBlobSHA1': blob, 'sha256': hashlib.sha256(data).hexdigest()}

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = sorted(pool.map(fetch, selected), key=lambda row: row['path'])
    manifest = {'sourceRevision': REVISION,
                'representation': 'decade files only for audit counts; full files retained only for overlap comparison',
                'sourceUseDecision': 'pending', 'publicationHeld': True, 'files': files}
    (root / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return {'root': str(root), 'sourceRevision': REVISION, 'files': len(files),
            'bytes': sum(row['sizeBytes'] for row in files), 'normalGameplayImports': 0}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/fetch-prime-rushmore-source.py SNAPSHOT_DIRECTORY_OUTSIDE_SITE')
    print(json.dumps(fetch_snapshot(sys.argv[1])))
