# React + Tailwind to Vanilla Converter

A web application that accepts a public GitHub repository URL and attempts to convert React + Tailwind source files into framework-free assets:

- `index.html`
- `styles.css`
- `script.js`

It includes:

- A UI for entering the GitHub URL
- Backend conversion logic (download, parse JSX, generate HTML, compile Tailwind classes)
- Live preview pane for generated output
- ZIP download for converted files

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Notes about conversion

This converter is intentionally conservative and focuses on readability:

- Static JSX structures are transformed into HTML.
- Dynamic JSX expressions are preserved as HTML comments (e.g. `<!-- dynamic: ... -->`).
- Non-React helper JavaScript is extracted into `script.js`.
- Tailwind classes found in generated HTML are compiled into standard CSS utilities.

Complex React behavior (hooks, routing, context, advanced component composition) still requires manual follow-up after conversion.
