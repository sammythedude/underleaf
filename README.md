# Underleaf

Underleaf is a local-first Overleaf-style desktop app for macOS. It keeps plain `.tex` files on disk, gives you a live structured document view while typing, and lets you switch to exact PDF compile on demand.

## What It Includes

- Electron + React + Vite desktop app
- Multi-project dashboard for creating and reopening local projects
- Monaco LaTeX editor with autosave
- Visual editor for title, author, date, sections, paragraphs, lists, and figure metadata
- Live View for fast structured preview
- PDF View for exact compile with PDF.js rendering
- Guided local TeX engine install using Tectonic when no system TeX is found
- CLI launcher via `underleaf [project-folder]`

## Local Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Build A Local App Bundle

```bash
npm run build:dir
```

That produces a macOS app directory in `release/mac-arm64/Underleaf.app`.

## Build A Distributable Zip

```bash
npm run build
```

## CLI Launch

Link the local CLI once:

```bash
npm run link-cli
```

Then launch the app from your shell:

```bash
underleaf
underleaf /absolute/path/to/project
```

## TeX Engine Notes

On first launch, Underleaf checks for:

- `pdflatex`
- `tectonic`
- MacTeX/BasicTeX in standard macOS locations

If none is available, the app offers a guided one-time install of a local Tectonic binary inside the app data directory.
