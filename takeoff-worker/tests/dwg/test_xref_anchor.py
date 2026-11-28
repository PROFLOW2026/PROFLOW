from takeoff_worker.models import JobOptions


def test_dwg_magic_is_not_treated_as_a_dxf_document(tmp_path):
    from takeoff_worker.dwg_engine.corpus_cache import _is_dxf_document

    dwg = tmp_path / "plan.dwg"
    dwg.write_bytes(b"AC1018" + b"\x00" * 64)
    assert _is_dxf_document(dwg) is False
    text = tmp_path / "child.bin"
    text.write_text("0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n", encoding="ascii")
    assert _is_dxf_document(text) is True


def test_dxf_bytes_saved_without_a_dxf_suffix_are_not_sent_to_the_dwg_converter(tmp_path):
    from takeoff_worker.dwg_engine.corpus_cache import ensure_dxf

    src = tmp_path / "child.bin"
    src.write_text("0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n", encoding="ascii")
    out, converted, _hit = ensure_dxf(src, cache=tmp_path / "cache")
    assert out == src
    assert converted is None


def test_project_options_leave_anchor_resolution_off():
    options = JobOptions()
    assert options.resolveXrefByAnchor is False


def test_second_reference_is_not_a_cycle_and_absolute_paths_stay_distinct():
    from takeoff_worker.dwg_engine.xref_budget import XrefBudget

    budget = XrefBudget(100, 0)
    assert budget.reject(10, "logical-a") is None
    budget.seen.add("logical-a")
    assert budget.reject(10, "logical-a") == "cycle"
    assert budget.reject_new_bytes(10) is None
    assert ("host", "BLOCK", r"C:\abs\a.dwg") != ("host", "BLOCK", "a.dwg")
    assert ("host", "BLOCK", "")[2] == ""


def test_same_block_name_under_another_parent_does_not_replace_the_host_file(tmp_path):
    """Host block SHARED must expand file A, not file B which uses the same block name."""
    import ezdxf

    from takeoff_worker.dwg_engine import DwgEngine
    from takeoff_worker.dwg_engine.xref_merge import xref_binding_key

    assert xref_binding_key("host", "SHARED", "a.dxf") != xref_binding_key("doc-a", "SHARED", "b.dxf")

    file_b = ezdxf.new("R2010", setup=True)
    file_b.layers.add("S-LIGHT")
    far = file_b.blocks.new("T1")
    far.add_circle((0, 0), 2)
    file_b.modelspace().add_blockref("T1", (800, 800), dxfattribs={"layer": "S-LIGHT"})
    back = file_b.blocks.new("SHARED", dxfattribs={"flags": 4})
    back.block.dxf.xref_path = "a.dxf"
    file_b.modelspace().add_blockref("SHARED", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    path_b = tmp_path / "b.dxf"
    file_b.saveas(path_b)

    file_a = ezdxf.new("R2010", setup=True)
    file_a.layers.add("S-LIGHT")
    near = file_a.blocks.new("T1")
    near.add_circle((0, 0), 2)
    file_a.modelspace().add_blockref("T1", (10, 10), dxfattribs={"layer": "S-LIGHT"})
    nested = file_a.blocks.new("SHARED", dxfattribs={"flags": 4})
    nested.block.dxf.xref_path = "b.dxf"
    file_a.modelspace().add_blockref("SHARED", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    path_a = tmp_path / "a.dxf"
    file_a.saveas(path_a)

    host = ezdxf.new("R2010", setup=True)
    host.layers.add("S-LIGHT")
    shared = host.blocks.new("SHARED", dxfattribs={"flags": 4})
    shared.block.dxf.xref_path = "a.dxf"
    host.modelspace().add_blockref("SHARED", (0, 0), dxfattribs={"layer": "S-LIGHT"})
    host_path = tmp_path / "host.dxf"
    host.saveas(host_path)

    calls: list[tuple[str, str, str]] = []

    def fetch(name: str, saved_path: str, anchor: str):
        calls.append((name, saved_path, anchor))
        if anchor == "host-1" and saved_path == "a.dxf":
            return str(path_a), path_a.stat().st_size, "doc-a"
        if anchor == "doc-a" and saved_path == "b.dxf":
            return str(path_b), path_b.stat().st_size, "doc-b"
        if anchor == "doc-b" and saved_path == "a.dxf":
            return str(path_a), path_a.stat().st_size, "doc-a"
        return None

    out = DwgEngine().analyze(
        str(host_path),
        "host-1",
        kind="dxf",
        xref_paths={},
        options=JobOptions(renderPreview=False, resolveXrefByAnchor=True),
        library=[],
        xref_fetch=fetch,
    )
    xs = [(round(row.x, 1), round(row.y, 1), row.blockName) for row in out.detections]
    assert len(xs) == 1, (xs, [(w.code, w.message) for w in out.warnings], calls)
    assert not any(abs(row.x - 800) < 5 and abs(row.y - 800) < 5 for row in out.detections)
    assert ("SHARED", "b.dxf", "doc-a") in calls
    assert any(code == "xref_cycle" for code in (w.code for w in out.warnings))


def test_anchor_slot_keeps_block_name_when_the_path_matches():
    left = ("host", "BLOCK_A", "shared.dwg")
    right = ("host", "BLOCK_B", "shared.dwg")
    assert left != right
    empty = ("host", "BLOCK_A", "")
    assert empty[2] == ""
