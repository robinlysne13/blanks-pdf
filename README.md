# Blanks

**Fill in the blanks.** A small app that runs on your own computer for filling in and signing PDF forms, with one-click auto-fill by Claude.

![Claude has filled a lease form from the profile and the chat; its values are highlighted in blue](docs/autofill-fillable.jpg)

- **Fill any form.** Fillable PDFs get live inputs over their real fields. Flat and scanned PDFs work too: click anywhere and type.
- **Sign once.** Draw your signature and initials one time. Blanks saves them on your computer and reuses them on every form.
- **Keep other people's signatures too.** Save a witness's or co-signer's signature and initials under their name, and place whichever one a form needs.
- **Stamp what forms ask for.** Today's date, checkmarks and crosses are one click each.
- **Auto-fill with Claude.** One button fills what your profile answers. It runs through your local Claude Code, so it uses your Claude subscription and needs no API key.
- **Chat to fill the rest.** Tell Claude what goes where, or paste an email, and it fills the form from that.
- **Private by default.** The server only listens on localhost. Your PDF never leaves your computer. Press **Done** when you're finished and Blanks forgets it.
- **Flattened output.** The downloaded PDF has everything burned into the page, so nobody can move or edit your signature.

## Quick start

Blanks is built and tested on macOS. It should also run on Linux. On Windows, use WSL, since `./start` is a shell script.

You need [uv](https://docs.astral.sh/uv/) and [Node.js](https://nodejs.org/) 20 or newer. Auto-fill also needs [Claude Code](https://claude.com/claude-code), installed and signed in. Everything else works without it.

```bash
git clone https://github.com/robinlysne13/blanks-pdf.git
```

```bash
cd blanks-pdf && ./start
```

The first run builds the interface, then Blanks opens in its own window. No form handy? The start screen has three sample forms to try.

![The start screen: drop a PDF, or try one of three sample forms](docs/start.jpg)

Blanks uses Chrome, Edge or Brave in app mode: a window with no tabs or address bar. Without one of those it opens a normal tab in your default browser. Add `--tab` to always use a tab.

### A real Mac app

```bash
scripts/make_mac_app.sh
```

This builds `Blanks.app` in `~/Applications`: a native app with its own window, menu bar and red icon in the Dock and app switcher, with no browser involved. It needs Xcode's Command Line Tools to compile. Opening it starts the Blanks server from this folder, and quitting it stops the server. Downloads go to your Downloads folder. The app points at this folder, so run the script again if you move it.

## Auto-fill

Blanks fills forms from a profile you write yourself. Edit it in **Settings → Profile**: every change saves as you type, and values stay hidden until you click Show values. It's a plain text file, so you can also edit it directly:

```text
full name: Sam Example
date of birth: 1994-03-12
email: sam@example.com
```

The profile lives at `~/.blanks/profile.md`, outside the repo, so it can never be committed. Set `BLANKS_HOME` to keep it, your signature and your settings somewhere else.

**On a fillable form,** Claude gets each field's name, label and nearby printed text, and returns values only for what the profile answers. It leaves choices, agreements, signatures and signing dates for you.

**On a flat or scanned form,** Claude reads page images, plus the printed words where the PDF has a text layer. It places text boxes next to the labels it recognises, and you can drag any that sit wrong.

![On a scanned intake form, Claude has placed text boxes on the right lines](docs/autofill-scan.jpg)

### Chat

The **Chat with Claude** tab beside the form fills it by conversation. Tell Claude what to put where, or paste an email or letter, and it fills what fits: from what you say, what you paste, and your profile. It can tick choices you name, edits text it placed earlier, and asks when something is unclear. Each reply has an **Undo** for the changes it made. Pasted text is treated as information only, so instructions hidden inside an email are ignored.

Claude's values stay highlighted in blue until you edit them. The download dialog warns you about any you haven't checked.

### What Claude sees

Auto-fill runs `claude -p` with a locked-down setup:

- **Tools:** none for fillable forms. For scans, only Read, inside a temporary folder that holds just the page images.
- **Context:** no MCP servers and no user or project settings.
- **Sessions:** nothing is saved.
- **Model:** your Claude Code default. Set `BLANKS_CLAUDE_MODEL` to pick another.

You can turn off page images for scans in Settings.

## How it works

```text
browser (React)  ──HTTP──▶  FastAPI on 127.0.0.1  ──▶  PyMuPDF  (read, render, fill, flatten)
                                                   └─▶  claude -p (auto-fill, optional)
```

- **Backend:** Python, FastAPI and [PyMuPDF](https://pymupdf.readthedocs.io/), in `backend/`. It renders pages to images, reads form fields, and builds the final PDF. Building means filling the fields, drawing text, marks and signatures, then flattening.
- **Frontend:** React, TypeScript and Vite, in `frontend/`. Pages show as images, with inputs and placed items positioned on top in PDF points.
- **Rotated pages** are handled both ways, for display and when writing the PDF.
- **Security:** the API answers only on localhost and requires a custom header on every call. That stops other websites from talking to it through your browser.

## Development

Run the backend and the Vite dev server side by side. Vite forwards `/api` calls to the backend.

```bash
uv run --project backend blanks --no-browser
```

```bash
npm --prefix frontend install && npm --prefix frontend run dev
```

Run the tests and checks with these commands:

```bash
cd backend && uv run pytest
```

```bash
cd frontend && npm run build && npx oxlint src
```

To regenerate the sample forms:

```bash
uv run --project backend python scripts/make_samples.py
```

## License

MIT
