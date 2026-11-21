from pathlib import Path

from takeoff_worker.dwg_engine.convert import libredwg_engine_label


def test_libredwg_label_is_basename_not_host_path():
    exe = Path(r"C:\Users\ERAN YOSEF\Desktop\projectflow\takeoff-worker\tools\bin\dwg2dxf.exe")
    assert libredwg_engine_label(exe) == "dwg2dxf.exe"
    assert "Users" not in libredwg_engine_label(exe)
    assert libredwg_engine_label(None) == "not_found"
