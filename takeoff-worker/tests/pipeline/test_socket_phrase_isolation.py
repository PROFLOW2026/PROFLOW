from takeoff_worker.classify.legend_map import match_legend_text
from takeoff_worker.data.catalog_loader import load_default_catalog


def _key(text: str) -> str | None:
    match = match_legend_text(text, load_default_catalog())
    return None if match is None else match.type_key


def test_plain_socket_phrases_are_single_sockets():
    assert _key("שקע רגיל") == "power.socket.single"
    assert _key("בית תקע") == "power.socket.single"
    assert _key("שקע 16A") == "power.socket.single"
    assert _key("שקע 16 A") == "power.socket.single"


def test_ampere_rating_alone_is_not_a_socket():
    assert _key("16A") is None
    assert _key("3x16A") is None
    assert _key("3X16A CEE") is None
    assert _key("2X16A") is None


def test_amt_and_breaker_lines_are_not_sockets_or_switches():
    for phrase in (
        'מאמ"ת 16A',
        "מאמ״ת 16A",
        'אמ"ת 16A',
        "מפסק אוטומטי 16A",
        "מאמ״ת 3x16A",
    ):
        assert _key(phrase) is None, phrase


def test_switch_or_light_with_ampere_is_not_a_socket():
    assert _key("מפסק מאור 16A") == "control.switch.single"
    assert _key("נקודת מאור 16A") == "light.point"
    assert _key("מפסק יחיד") == "control.switch.single"
    assert _key("מפסק יחיד ושקע רגיל") is None
    assert _key("בית תקע ומפסק יחיד") is None


def test_hermetic_socket_is_not_a_plain_socket():
    assert _key("בית תקע הרמטי") == "power.socket.ip"
    assert _key("שקע מוגן מים") == "power.socket.ip"
