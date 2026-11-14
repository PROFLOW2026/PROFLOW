from takeoff_worker.ai.legend_reader import MockReader, get_legend_reader


def test_mock_reader_no_network():
    reader = get_legend_reader(True, mock=True)
    assert isinstance(reader, MockReader)
    rows = reader.read(b"png", "שקע יחיד | גלאי עשן אופטי")
    assert len(rows) == 2
    assert rows[0].suggested_type_key == "power.socket.single"