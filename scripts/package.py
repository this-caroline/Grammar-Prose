"""Package only production files, with reproducible ZIP metadata."""

import hashlib
import json
from pathlib import Path
import zipfile


PRODUCTION_FILES = (
    "background.js",
    "content.js",
    "manifest.json",
    "options.css",
    "options.html",
    "options.js",
)


def package_extension():
    version = json.loads(Path("package.json").read_text())["version"]
    manifest = json.loads(Path("dist/manifest.json").read_text())
    if manifest["version"] != version:
        raise ValueError("Build version does not match package.json; rebuild first.")
    output = Path("artifacts") / f"grammar-prose-{version}.zip"
    output.parent.mkdir(exist_ok=True)
    temporary = output.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED) as archive:
        for name in sorted(PRODUCTION_FILES):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, (Path("dist") / name).read_bytes())
    temporary.replace(output)
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".zip.sha256").write_text(f"{checksum}  {output.name}\n")
    print(f"Packaged {output}; SHA-256 {checksum}")


if __name__ == "__main__":
    package_extension()
