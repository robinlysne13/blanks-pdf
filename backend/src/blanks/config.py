"""Where Blanks keeps the few things it remembers: profile, marks, settings.

Everything lives in ~/.blanks (override with BLANKS_HOME), outside the repo,
so personal details can never be committed by accident.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

MARKS = ("signature", "initials")

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


def mark_path(kind: str) -> Path:
    if kind not in MARKS:
        raise ValueError(kind)
    return home() / f"{kind}.png"


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
