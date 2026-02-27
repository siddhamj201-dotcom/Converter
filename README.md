# React + Tailwind to Vanilla Converter

A web application that accepts a public GitHub repository URL and converts React/Tailwind source into framework-free assets:

- `index.html`
- `styles.css`
- `script.js`

## Features

- URL input UI for a public GitHub repository
- Backend logic to fetch repo files from GitHub API, find JSX return blocks, and convert them to HTML
- Tailwind utility extraction and CSS generation (practical subset)
- Live preview panel
- ZIP download of generated files

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Conversion behavior

- JSX `className` attributes become HTML `class` attributes.
- JSX expressions are preserved as `<!-- dynamic: ... -->` comments.
- React event handlers are removed from static HTML.
- JavaScript is extracted for manual follow-up and cleanup.
- Tailwind conversion covers common utility classes and leaves TODO comments for unsupported classes.

> This tool is intentionally conservative: output is readable and functional for static structure, but advanced React behavior still needs manual refinement.
