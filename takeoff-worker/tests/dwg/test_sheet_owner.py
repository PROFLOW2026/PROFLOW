"""Sheet ownership does not treat a larger window as the floor."""
from takeoff_worker.dwg_engine.sheet_owner import SheetClaim, decide_sheet_owner, is_overview_viewport
from takeoff_worker.dwg_engine.xref_budget import XrefBudget


def test_overview_loses_to_one_partial_sheet():
    decision = decide_sheet_owner(
        [
            SheetClaim("layout:Overview", partial=False, overview=True),
            SheetClaim("layout:Floor", partial=True, overview=False),
        ]
    )
    assert decision.owner_sheet_key == "layout:Floor"
    assert decision.needs_review is False


def test_two_partial_sheets_are_not_auto_assigned():
    decision = decide_sheet_owner(
        [
            SheetClaim("layout:A", partial=True, overview=False),
            SheetClaim("layout:B", partial=True, overview=False),
        ]
    )
    assert decision.needs_review is True
    assert decision.candidate_sheet_keys == ("layout:A", "layout:B")


def test_identical_copied_window_is_not_chosen_by_size():
    decision = decide_sheet_owner(
        [
            SheetClaim("layout:F0", partial=True, overview=False),
            SheetClaim("layout:M1", partial=True, overview=False),
        ]
    )
    assert decision.needs_review is True


def test_several_windows_on_one_sheet_stay_on_that_sheet():
    decision = decide_sheet_owner(
        [
            SheetClaim("layout:F0", partial=True, overview=False),
            SheetClaim("layout:F0", partial=True, overview=False),
        ]
    )
    assert decision.owner_sheet_key == "layout:F0"
    assert decision.needs_review is False


def test_only_an_overview_keeps_the_point():
    decision = decide_sheet_owner([SheetClaim("layout:IEC", partial=False, overview=True)])
    assert decision.owner_sheet_key == "layout:IEC"
    assert decision.needs_review is False


def test_overview_is_a_window_taller_than_the_model():
    assert is_overview_viewport(200, 100) is True
    assert is_overview_viewport(40, 100) is False


def test_xref_budget_stops_before_the_file_that_passes_150mb():
    budget = XrefBudget(host_bytes=100 * 1024 * 1024, host_inserts=10)
    assert budget.reject(60 * 1024 * 1024, "a") == "total_size"
    assert budget.reject(40 * 1024 * 1024, "b") is None


def test_host_over_150mb_loads_no_xref():
    budget = XrefBudget(host_bytes=151 * 1024 * 1024, host_inserts=1)
    assert budget.host_over_budget is True
    assert budget.reject(1000, "a") == "host_over_budget"


def test_cycle_and_count_and_inserts():
    budget = XrefBudget(host_bytes=1000, host_inserts=49_000, max_inserts=50_000)
    assert budget.reject_inserts(2_000) is True
    budget.note_file(10, "file-1")
    assert budget.reject(10, "file-1") == "cycle"
    for index in range(31):
        budget.note_file(10, f"n{index}")
    assert budget.reject(10, "overflow") == "count"
