import hashlib
import subprocess

files = ['app.js', 'index.html', 'style.css', 'server.py', 'nodes.json', 'start_dashboard.sh']

print('=== LOCAL HASHES ===')
local_hashes = {}
for f in files:
    try:
        with open(f, 'rb') as file_obj:
            h = hashlib.md5(file_obj.read()).hexdigest()
            local_hashes[f] = h
            print(f'  {f}: {h}')
    except Exception as e:
        print(f'  {f}: Failed to read ({e})')

print('\n=== REMOTE HASHES ===')
for f in files:
    try:
        # Run remote md5sum command via SSH
        out = subprocess.check_output(
            f'ssh Star-Spark "md5sum /home/nigel-spark/spark_dashboard/{f}"',
            shell=True
        ).decode().strip()
        h = out.split()[0]
        match = 'MATCH' if h == local_hashes.get(f) else 'MISMATCH'
        print(f'  {f}: {h} ({match})')
    except Exception as e:
        print(f'  {f}: Failed to query ({e})')
