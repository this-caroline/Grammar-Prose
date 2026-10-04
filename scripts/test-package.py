"""Verify production allowlisting, metadata, and repeatable packaging."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile


spec = importlib.util.spec_from_file_location("extension_package", Path(__file__).with_name("package.py"))
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackageTests(unittest.TestCase):
    def test_archive_is_repeatable_and_excludes_private_files(self):
        with tempfile.TemporaryDirectory() as directory:
            original_directory = Path.cwd()
            try:
                os.chdir(directory)
                Path("package.json").write_text(json.dumps({"version": "0.1.0"}))
                Path("dist").mkdir()
                for name in packager.PRODUCTION_FILES:
                    (Path("dist") / name).write_text(name)
                Path("dist/manifest.json").write_text(json.dumps({"version": "0.1.0"}))
                Path("dist/private-evaluation.json").write_text("private text")
                with contextlib.redirect_stdout(io.StringIO()):
                    packager.package_extension()
                    first = Path("artifacts/grammar-prose-0.1.0.zip").read_bytes()
                    packager.package_extension()
                self.assertEqual(first, Path("artifacts/grammar-prose-0.1.0.zip").read_bytes())
                with zipfile.ZipFile(io.BytesIO(first)) as archive:
                    self.assertEqual(archive.namelist(), sorted(packager.PRODUCTION_FILES))
                    self.assertIsNone(archive.testzip())
                    for entry in archive.infolist():
                        self.assertEqual(entry.date_time, (1980, 1, 1, 0, 0, 0))
                        self.assertEqual(entry.external_attr >> 16, 0o100644)
                Path("dist/manifest.json").write_text(json.dumps({"version": "1.0.0"}))
                with self.assertRaises(ValueError):
                    packager.package_extension()
                self.assertEqual(first, Path("artifacts/grammar-prose-0.1.0.zip").read_bytes())
            finally:
                os.chdir(original_directory)


if __name__ == "__main__":
    unittest.main()
