import find_n1


def test_find_n1_reports_parse_errors(tmp_path, capsys):
    root = tmp_path / "app"
    root.mkdir()
    (root / "good.py").write_text(
        "async def load(db, rows):\n"
        "    for row in rows:\n"
        "        await db.execute(row)\n",
        encoding="utf-8",
    )
    bad_path = root / "bad.py"
    bad_path.write_text("def broken(:\n", encoding="utf-8")

    exit_code = find_n1.main([str(root)])
    captured = capsys.readouterr()

    assert exit_code == 1
    assert f"Could not parse {bad_path.resolve()}" in captured.err
    assert "N+1 candidate" in captured.out


def test_find_n1_succeeds_when_all_files_parse(tmp_path, capsys):
    root = tmp_path / "app"
    root.mkdir()
    (root / "clean.py").write_text("def ok():\n    return 1\n", encoding="utf-8")

    exit_code = find_n1.main([str(root)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert captured.err == ""
