# PyInstaller folder build of the backend. Run from backend/ with 32-bit Python 3.13.
import os

root = os.path.abspath(os.path.join(SPECPATH, "../../backend"))
a = Analysis(
    [os.path.join(root, "run.py")],
    pathex=[root],
    datas=[(os.path.join(root, "migrations"), "migrations")],
    hiddenimports=["sqlalchemy.dialects.sqlite", "logging.config"],
    excludes=["tkinter", "greenlet"],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, exclude_binaries=True, name="gyros-backend", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="gyros-backend", upx=False)
