"""Where Blanks keeps the few things it remembers: profile, marks, settings.

Everything lives in ~/.blanks (override with BLANKS_HOME), outside the repo,
so personal details can never be committed by accident.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any

MARK_KINDS = ("signature", "initials")

DEFAULT_SETTINGS: dict[str, Any] = {
    "date_format": "long",  # long | iso | dmy | mdy
    "send_images": True,  # let auto-fill read page images of scanned forms
}

EXAMPLE_PROFILE = Path(__file__).with_name("profile.example.md")


def home() -> Path:
    path = Path(os.environ.get("BLANKS_HOME") or Path.home() / ".blanks").expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def profile_path() -> Path:
    return home() / "profile.md"


def ensure_profile() -> Path:
    """Create the profile from the example the first time it's needed."""
    path = profile_path()
    if not path.exists():
        path.write_text(EXAMPLE_PROFILE.read_text())
    path.chmod(0o600)  # personal details: readable by you only
    return path


def read_profile() -> str | None:
    path = profile_path()
    if not path.exists():
        return None
    text = path.read_text().strip()
    return text or None


_ENTRY = re.compile(r"^\s*[-*]?\s*([^:#\n]{1,60}):\s*(.*?)\s*$")


def _entry_lines(lines: list[str]):
    """(line index, key, raw value) for each `key: value` line outside notes."""
    in_note = False
    for i, line in enumerate(lines):
        s = line.strip()
        if in_note:
            in_note = "-->" not in s
            continue
        if s.startswith("<!--"):
            in_note = "-->" not in s
            continue
        if s.startswith(("#", ">")):
            continue
        if m := _ENTRY.match(line):
            yield i, m.group(1).strip(), m.group(2)


def _is_placeholder(raw: str) -> bool:
    return raw.startswith("[") and raw.endswith("]")


def profile_rows(text: str | None) -> list[dict[str, str]]:
    """Every detail line. Placeholders come back as an empty value plus a hint."""
    rows = []
    for _, key, raw in _entry_lines((text or "").splitlines()):
        placeholder = _is_placeholder(raw)
        rows.append({"key": key, "value": "" if placeholder else raw, "hint": raw[1:-1] if placeholder else ""})
    return rows


def profile_entries(text: str | None) -> list[dict[str, str]]:
    """Details with a real value: what auto-fill can use."""
    return [{"key": r["key"], "value": r["value"]} for r in profile_rows(text) if r["value"]]


def save_profile_rows(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Write edited rows back into the profile, changing only the lines that
    hold details: notes, headings and order stay as the person left them.
    A row may carry `was`, its key before a rename."""
    path = ensure_profile()
    lines = path.read_text().splitlines()
    existing: dict[str, int] = {}
    hints: dict[str, str] = {}
    for i, key, raw in _entry_lines(lines):
        existing.setdefault(key, i)
        if _is_placeholder(raw):
            hints.setdefault(key, raw[1:-1])

    def fmt(key: str, value: str, hint: str) -> str:
        return f"{key}: {value}" if value else f"{key}: [{hint or 'not set'}]"

    used: set[int] = set()
    appended: list[str] = []
    for row in rows:
        key = re.sub(r"[:#\r\n]", " ", str(row.get("key", ""))).strip()[:60]
        value = re.sub(r"[\r\n]+", " ", str(row.get("value", ""))).strip()[:500]
        if not key:
            continue
        source = str(row.get("was") or key)
        hint = hints.get(source) or str(row.get("hint") or "")
        idx = existing.get(source)
        if idx is not None and idx not in used:
            lines[idx] = fmt(key, value, hint)
            used.add(idx)
        else:
            appended.append(fmt(key, value, hint))

    removed = {i for i in existing.values() if i not in used}
    out = [line for i, line in enumerate(lines) if i not in removed]
    while out and not out[-1].strip():
        out.pop()
    out.extend(appended)

    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(out) + "\n")
    tmp.chmod(0o600)
    tmp.replace(path)
    return profile_rows(path.read_text())


# ----------------------------------------------------- signature library
#
# Signatures and initials live in ~/.blanks/marks/<id>.png, with their names
# in ~/.blanks/marks.json. Several people's signatures can be kept, such as
# your own and a witness's.

_MARK_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
LEGACY_NAMES = {"signature": "My signature", "initials": "My initials"}
_marks_lock = threading.RLock()  # requests run in parallel; the index is one file


def _marks_dir() -> Path:
    path = home() / "marks"
    path.mkdir(exist_ok=True)
    return path


def _index_path() -> Path:
    return home() / "marks.json"


def _read_index() -> list[dict[str, str]]:
    try:
        data = json.loads(_index_path().read_text())
        return [m for m in data if isinstance(m, dict) and _MARK_ID.match(str(m.get("id", "")))]
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        return []


def _write_index(marks: list[dict[str, str]]) -> None:
    tmp = _index_path().with_suffix(".tmp")
    tmp.write_text(json.dumps(marks, indent=2))
    tmp.replace(_index_path())


def mark_file(mark_id: str) -> Path:
    if not _MARK_ID.match(mark_id):
        raise ValueError("bad mark id")
    return _marks_dir() / f"{mark_id}.png"


def list_marks() -> list[dict[str, str]]:
    """Every saved signature and set of initials, oldest first."""
    with _marks_lock:
        return _list_marks()


def _list_marks() -> list[dict[str, str]]:
    marks = _read_index()
    known = {m["id"] for m in marks}
    # Blanks used to keep one of each at ~/.blanks/signature.png and initials.png.
    for kind, name in LEGACY_NAMES.items():
        old = home() / f"{kind}.png"
        if old.exists() and kind not in known:
            old.replace(mark_file(kind))
            marks.append({"id": kind, "name": name, "kind": kind})
            _write_index(marks)
    return [m for m in marks if mark_file(m["id"]).exists()]


def _clean_name(name: str, kind: str) -> str:
    name = re.sub(r"\s+", " ", str(name)).strip()[:60]
    return name or LEGACY_NAMES.get(kind, "Signature")


def save_mark(mark_id: str, name: str, kind: str, png: bytes) -> dict[str, str]:
    with _marks_lock:
        return _save_mark(mark_id, name, kind, png)


def _save_mark(mark_id: str, name: str, kind: str, png: bytes) -> dict[str, str]:
    if kind not in MARK_KINDS:
        raise ValueError("kind must be signature or initials")
    path = mark_file(mark_id)
    marks = _list_marks()
    entry = {"id": mark_id, "name": _clean_name(name, kind), "kind": kind}
    if any(m["id"] == mark_id for m in marks):
        marks = [entry if m["id"] == mark_id else m for m in marks]  # redrawn: keep its place
    else:
        marks.append(entry)
    path.write_bytes(png)
    _write_index(marks)
    return entry


def rename_mark(mark_id: str, name: str) -> dict[str, str]:
    with _marks_lock:
        return _rename_mark(mark_id, name)


def _rename_mark(mark_id: str, name: str) -> dict[str, str]:
    marks = _list_marks()
    for m in marks:
        if m["id"] == mark_id:
            m["name"] = _clean_name(name, m["kind"])
            _write_index(marks)
            return m
    raise KeyError(mark_id)


def delete_mark(mark_id: str) -> None:
    with _marks_lock:
        _delete_mark(mark_id)


def _delete_mark(mark_id: str) -> None:
    marks = [m for m in _list_marks() if m["id"] != mark_id]
    mark_file(mark_id).unlink(missing_ok=True)
    _write_index(marks)


def read_settings() -> dict[str, Any]:
    path = home() / "settings.json"
    settings = dict(DEFAULT_SETTINGS)
    if path.exists():
        try:
            stored = json.loads(path.read_text())
            settings.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
        except (json.JSONDecodeError, AttributeError):
            pass
    return settings


def write_settings(patch: dict[str, Any]) -> dict[str, Any]:
    settings = read_settings()
    settings.update({k: v for k, v in patch.items() if k in DEFAULT_SETTINGS})
    (home() / "settings.json").write_text(json.dumps(settings, indent=2))
    return settings
