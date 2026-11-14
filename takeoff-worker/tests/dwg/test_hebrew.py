from takeoff_worker.dwg_engine.hebrew import decode_dwg_text


def test_decode_kbd_samples():
    text, by = decode_dwg_text(",gk, ra, kjank", font_name="MIRYL.shx")
    assert by == "dwg_kbd"
    assert "תעלת" in text


def test_unicode_hebrew_unchanged():
    raw = "מנורה"
    text, by = decode_dwg_text(raw)
    assert text == raw
    assert by is None