"""X2 notes raise device count and leave symbol count unchanged."""
from __future__ import annotations

from takeoff_worker.pdf_engine.quantity_notes import (
    NoteMark,
    SymbolMark,
    note_devices,
    socket_quantity,
)


def test_note_devices_accepts_only_a_whole_x2_token():
    assert note_devices("X2") == 2
    assert note_devices("x2") == 2
    assert note_devices("×2") == 2
    assert note_devices("X 2") == 2
    assert note_devices("× 2") == 2
    assert note_devices("(X2)") == 2
    assert note_devices("X2.") == 2
    assert note_devices("2X16A") is None
    assert note_devices("X24") is None
    assert note_devices("X20") is None
    assert note_devices("2x1.5") is None
    assert note_devices("X4") is None
    assert note_devices("X3") is None
    assert note_devices("×4") is None
    assert note_devices("שקע") is None
    assert note_devices("C12") is None
    assert note_devices("16A") is None


def test_one_x2_next_to_the_first_symbol_adds_one_device():
    symbols = [
        SymbolMark("a", 0, 0, 10),
        SymbolMark("b", 80, 0, 10),
        SymbolMark("c", 160, 0, 10),
    ]
    result = socket_quantity(symbols, [NoteMark("X2", 4, 0)])
    assert result.symbol_count == 3
    assert result.device_count == 4
    assert result.assigned == (("a", 2), ("b", 1), ("c", 1))
    assert result.unassigned_notes == 0


def test_x2_halfway_between_equal_symbols_is_unassigned():
    symbols = [
        SymbolMark("a", 0, 0, 10),
        SymbolMark("b", 30, 0, 10),
    ]
    result = socket_quantity(symbols, [NoteMark("X2", 15, 0)])
    assert result.symbol_count == 2
    assert result.device_count == 2
    assert result.assigned == (("a", 1), ("b", 1))
    assert result.unassigned_notes == 1


def test_two_x2_notes_on_the_same_symbol_stay_two_devices():
    symbols = [SymbolMark("a", 0, 0, 10)]
    notes = [NoteMark("X2", 1, 0), NoteMark("×2", 2, 1)]
    result = socket_quantity(symbols, notes)
    assert result.symbol_count == 1
    assert result.device_count == 2
    assert result.assigned == (("a", 2),)
    assert result.unassigned_notes == 0


def test_gap_below_winner_margin_does_not_guess():
    symbols = [
        SymbolMark("a", 0, 0, 10),
        SymbolMark("b", 20, 0, 10),
    ]
    result = socket_quantity(symbols, [NoteMark("X2", 9, 0)])
    assert result.device_count == 2
    assert result.assigned == (("a", 1), ("b", 1))
    assert result.unassigned_notes == 1


def test_clear_gap_uses_the_winner_extent_and_input_order():
    symbols = [
        SymbolMark("wide", 30, 0, 20),
        SymbolMark("near", 0, 0, 10),
    ]
    result = socket_quantity(symbols, [NoteMark("X 2", 13, 0)])
    assert result.assigned == (("wide", 1), ("near", 2))
    assert result.symbol_count == 2
    assert result.device_count == 3
    assert result.unassigned_notes == 0


def test_ocr_merge_keeps_x2_and_rejects_ampere_notes():
    from takeoff_worker.pdf_engine.quantity_notes import multiplier_notes

    notes = multiplier_notes([("EX2\u200f", 4, 4), ("2X16A", 30, 0), ("X4", 50, 0), ("X24", 70, 0)])
    assert [(note.text, note.x, note.y) for note in notes] == [("X2", 4, 4)]


def test_split_x2_is_one_note_and_x4_is_not():
    from takeoff_worker.pdf_engine.quantity_notes import multiplier_notes

    notes = multiplier_notes([("X", 0, 0), ("2", 6, 0), ("X4", 40, 0), ("2X16A", 80, 0)])
    assert len(notes) == 1
    assert notes[0].text == "X2"
    assert notes[0].x == 3


def test_note_crop_is_wider_than_the_symbol_and_not_the_page():
    from takeoff_worker.pdf_engine.note_read import note_crop_radius

    assert note_crop_radius(12) == 96.0
    assert note_crop_radius(20) == 120.0
    assert note_crop_radius(40) == 120.0
    assert note_crop_radius(0) == 96.0


def test_ampere_note_does_not_change_devices():
    symbols = [SymbolMark("a", 0, 0, 10)]
    result = socket_quantity(symbols, [NoteMark("16A", 1, 0)])
    assert result.symbol_count == 1
    assert result.device_count == 1
    assert result.assigned == (("a", 1),)
    assert result.unassigned_notes == 0
