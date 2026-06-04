import find_n1
from pathlib import Path


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


def test_find_n1_fails_on_unapproved_findings(tmp_path, capsys):
    root = tmp_path / "app"
    root.mkdir()
    (root / "n1.py").write_text(
        "async def load(db, rows):\n"
        "    for row in rows:\n"
        "        await db.execute(row)\n",
        encoding="utf-8",
    )

    exit_code = find_n1.main([str(root)])
    captured = capsys.readouterr()

    assert exit_code == 1
    assert "N+1 candidate" in captured.out
    assert "Unapproved N+1 finding" in captured.err


def test_find_n1_scans_single_files(tmp_path, capsys):
    target = tmp_path / "n1.py"
    target.write_text(
        "async def load(db, rows):\n"
        "    for row in rows:\n"
        "        await db.scalar(row)\n",
        encoding="utf-8",
    )

    exit_code = find_n1.main([str(target)])
    captured = capsys.readouterr()

    assert exit_code == 1
    assert "N+1 candidate" in captured.out


def test_find_n1_allows_current_repository_baseline(capsys):
    exit_code = find_n1.main(["app"])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "backend/app/routers/quizzes.py" in captured.out
    assert captured.err == ""


def test_find_n1_succeeds_when_all_files_parse(tmp_path, capsys):
    root = tmp_path / "app"
    root.mkdir()
    (root / "clean.py").write_text("def ok():\n    return 1\n", encoding="utf-8")

    exit_code = find_n1.main([str(root)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert captured.err == ""


def test_backend_ci_runs_find_n1_guardrail():
    workflow = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ci-backend.yml"

    assert "python find_n1.py app" in workflow.read_text(encoding="utf-8")
