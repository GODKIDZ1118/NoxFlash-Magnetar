"""Pack the editable desktop files without fetching updates or dependencies."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / "desktop"
header = {"files": {}}
payload = bytearray()
for path in sorted(source.iterdir()):
    if not path.is_file():
        continue
    if path.suffix == ".js":
        subprocess.run(["node", "--check", str(path)], check=True)
    data = path.read_bytes()
    block = 4 * 1024 * 1024
    header["files"][path.name] = {
        "size": len(data), "offset": str(len(payload)),
        "integrity": {
            "algorithm": "SHA256", "hash": hashlib.sha256(data).hexdigest(),
            "blockSize": block,
            "blocks": [hashlib.sha256(data[i:i + block]).hexdigest()
                       for i in range(0, len(data), block)],
        },
    }
    payload.extend(data)
data = json.dumps(header, separators=(",", ":")).encode()
inner = struct.pack("<I", len(data)) + data
inner += b"\0" * (-len(inner) % 4)
packed_header = struct.pack("<I", len(inner)) + inner
archive = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else root / "resources/app.asar"
packed = struct.pack("<II", 4, len(packed_header)) + packed_header + payload
if archive.is_file() and archive.read_bytes() == packed:
    print("Desktop archive already matches the editable source.")
    raise SystemExit(0)
backup = root.parent / (root.name + "_backups") / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
if len(sys.argv) == 1:
    backup.mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive, backup / "app.asar")
archive.parent.mkdir(parents=True, exist_ok=True)
temporary = archive.with_suffix(".asar.tmp")
temporary.write_bytes(packed)
try:
    os.replace(temporary, archive)
finally:
    if temporary.exists():
        temporary.unlink()
print("Packed", len(header["files"]), "desktop files. Restart NoxFlash to load them.")
