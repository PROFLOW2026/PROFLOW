from takeoff_worker.dwg_engine.hebrew import decode_dwg_text


def test_decode_kbd_samples():
    text, by = decode_dwg_text(",gk, ra, kjank", font_name="MIRYL.shx")
    assert by == "dwg_kbd"
    assert "תעלת" in text


def test_israeli_shx_fonts_decode_keyboard_hebrew():
    text, by = decode_dwg_text("npxe huhs", font_name="caes-l$.shx")
    assert by == "dwg_kbd"
    assert "מפסק" in text
    text, by = decode_dwg_text("npxe huhs", font_name="cob2.shx")
    assert by == "dwg_kbd"
    assert text.startswith("מפסק")


def test_unicode_hebrew_unchanged():
    raw = "מנורה"
    text, by = decode_dwg_text(raw)
    assert text == raw
    assert by is None


def test_cob_shx_bracket_is_final_tsadi():
    text, by = decode_dwg_text("nec[ aegho", font_name="cob2.shx")
    assert by == "dwg_kbd"
    assert text.startswith("מקבץ שקעים")