# React + Tailwind to Vanilla Converter

A web application that accepts a public GitHub repository URL and converts React/Tailwind source into framework-free assets.  
It attempts to convert React + Tailwind source files into framework-free assets:

- `index.html`
- `styles.css`
- `script.js`

## Features / Description

- URL input UI for a public GitHub repository
- Backend logic to fetch repo files from GitHub, find JSX return blocks, and convert them to HTML
- Tailwind utility extraction and CSS generation (practical subset)
- Live preview panel
- ZIP download of generated files
- UI for entering the GitHub URL
- Backend conversion logic (download, parse JSX, generate HTML, compile Tailwind classes)

## Run locally

```bash
npm install
npm start