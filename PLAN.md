# Blanks — fill in the blanks

A local app for filling in and signing personal PDF forms, with one-click
auto-fill by Claude using your existing Claude subscription.

Repo: `blanks-pdf` (public). Built for Robin's own use first; also a
portfolio project, so the code and README should be clean.

UI design: https://claude.ai/artifact/Rpn3VvXPzEFqji1XYnbKxs

## What it does

- Open a PDF, fill it, sign it, download it. No document library or history.
- **Text:** uses the PDF's real form fields when present; otherwise click
  anywhere to place a text box. Every placed box is draggable.
- **Signature:** drawn once with mouse or trackpad, saved locally, reused on
  every form. **Initials** work the same way.
- **Marks:** one-click today's date, checkmark, cross.
- **Download:** everything is flattened into the page.

## Claude auto-fill

- An "Auto-fill with Claude" button runs the local Claude Code CLI
  (`claude -p`). Uses the Claude subscription; no API key, no extra cost.
- Source of truth: a local profile file, `~/.blanks/profile.md`, outside the
  repo. The repo ships `profile.example.md`.
- Fillable PDFs: Claude gets the field names and labels, returns values.
- Scanned PDFs: Claude gets page images, finds labels, returns text plus
  positions. Placement can be off, so every box is draggable.
- Claude's values are filled in and highlighted (blue). Editing a value clears
  its highlight. Fields missing from the profile are flagged and left empty.
- The download dialog warns when Claude values are still unreviewed.

## Stack

- Backend: Python, FastAPI, PyMuPDF (render, fill fields, stamp, flatten).
- Frontend: React + Vite + TypeScript. Pages are rendered to images by the
  backend (PyMuPDF), so the frontend needs no PDF library.
- Run locally with one command; nothing leaves the machine except what
  Claude Code sends to Claude during auto-fill.

## UI direction

- Borrowed from the Canvas app: glass sidebar with small-caps section
  labels, translucent white cards, soft warm-red glows behind, Hanken
  Grotesk, pill buttons.
- Accent: red, used generously. Bright red (#D92D20) for Download and
  selection; deep red (#B42318) for "+ Open PDF", section labels, the active
  tool and the "Local" chip.
- Claude-filled values: pale blue (#DDF1F7), never red, so the two never mix.
- Signature ink: near-black by default, optional dark blue.

## Screens

1. Start: drop zone, status of signature, profile and Claude.
2. Editor: tool sidebar, page in the middle, form-fields panel on the right.
3. After auto-fill: blue highlights, banner with undo, missing fields on top.
4. Download: flatten summary, unreviewed-values warning, file name.
5. Signature setup: draw once, signature and initials tabs.
6. Scanned form: Claude-placed boxes with drag handles.
7. Settings: profile, Claude status, saved marks, date format.

## Repo polish

- README with screenshots, MIT license, backend tests and GitHub Actions CI.
- Sample forms on the start screen (`scripts/make_samples.py`).
- Still open: a demo GIF and a tagged v1.0.0 release.
