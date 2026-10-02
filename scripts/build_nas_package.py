"""Create a reviewable, isolated NAS package without touching live NAS state."""

from pathlib import Path
from tarfile import open as open_tar
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "pwa"
NAS = ROOT / "deploy" / "nas"
OUTPUT_ZIP = ROOT / "dist" / "voice-fitness-nas.zip"
OUTPUT_TAR = ROOT / "dist" / "voice-fitness-nas.tar.gz"
SITE_FILES = [
    "index.html", "styles.css", "app.mjs", "db.mjs", "domain.mjs",
    "parser.mjs", "dictation.mjs", "csv.mjs", "workout-guide.mjs", "progression.mjs", "records.mjs", "rest.mjs", "plates.mjs", "icons.mjs", "activity.mjs", "nas-backup.mjs", "fonts/VFSans-Variable.woff2", "fonts/OFL.txt", "manifest.webmanifest", "icon.svg",
    "icon-192.png", "sw.js",
]
BACKUP_SERVER_FILES = ["server.mjs", "backup-core.mjs"]


def main() -> None:
    OUTPUT_ZIP.parent.mkdir(exist_ok=True)
    files = [(NAS / name, name) for name in ("compose.yaml", "nginx.conf", "README.md")]
    files += [(SITE / name, f"site/{name}") for name in SITE_FILES]
    # The server validates with the app's own domain.mjs; the repo's re-export stub is replaced by a copy.
    files += [(NAS / "backup-server" / name, f"backup-server/{name}") for name in BACKUP_SERVER_FILES]
    files.append((SITE / "domain.mjs", "backup-server/domain.mjs"))
    with ZipFile(OUTPUT_ZIP, "w", ZIP_DEFLATED) as archive:
        for source, name in files:
            archive.write(source, name)
    with open_tar(OUTPUT_TAR, "w:gz") as archive:
        for source, name in files:
            archive.add(source, arcname=name, recursive=False)
    print(OUTPUT_ZIP)
    print(OUTPUT_TAR)


if __name__ == "__main__":
    main()
