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
    "index.html", "styles.css", "neon.css", "app.mjs", "db.mjs", "domain.mjs",
    "parser.mjs", "dictation.mjs", "csv.mjs", "workout-guide.mjs", "progression.mjs", "records.mjs", "rest.mjs", "plates.mjs", "manifest.webmanifest", "icon.svg",
    "icon-192.png", "sw.js",
]


def main() -> None:
    OUTPUT_ZIP.parent.mkdir(exist_ok=True)
    files = [(NAS / name, name) for name in ("compose.yaml", "nginx.conf", "README.md")]
    files += [(SITE / name, f"site/{name}") for name in SITE_FILES]
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
