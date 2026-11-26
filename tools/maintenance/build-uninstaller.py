"""Build the local uninstaller from the checked-in NSIS source."""
from pathlib import Path
import datetime
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
cache = Path(os.environ["LOCALAPPDATA"]) / "electron-builder/Cache/nsis"
compilers = sorted(cache.rglob("makensis.exe"), key=lambda p: len(str(p)))
if not compilers:
    raise SystemExit("NSIS compiler not found. Install NSIS before rebuilding.")
with tempfile.TemporaryDirectory(prefix="noxflash-uninstaller-") as temporary:
    folder = Path(temporary)
    assert folder.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
    builder = folder / "builder.exe"
    subprocess.run([str(compilers[0]), "/V2", "/NOCD",
                    "/DBUILDER_OUTPUT=" + str(builder),
                    str(root / "tools/maintenance/uninstaller.nsi")], check=True)
    subprocess.run([str(builder), "/S"], check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW)
    target = root / "Uninstall NoxFlash.exe"
    backup = root.parent / (root.name + "_backups") / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup / target.name)
    shutil.copy2(folder / target.name, target)
print("Built NoxFlash uninstaller. User data is retained during uninstall.")
