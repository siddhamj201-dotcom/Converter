const form = document.getElementById('convert-form');
const repoInput = document.getElementById('repo-url');
const statusEl = document.getElementById('status');
const downloadBtn = document.getElementById('download-btn');
const previewFrame = document.getElementById('preview-frame');
const htmlOutput = document.getElementById('html-output');
const cssOutput = document.getElementById('css-output');
const jsOutput = document.getElementById('js-output');

let generatedFiles = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b42318' : '#2c3d58';
}

function renderPreview(files) {
  // Build an iframe document that inlines generated CSS + JS for immediate preview.
  const previewHtml = files['index.html']
    .replace('</head>', `<style>${files['styles.css']}</style></head>`)
    .replace('</body>', `<script>${files['script.js']}<\/script></body>`);

  previewFrame.srcdoc = previewHtml;
}

async function convertRepo(repoUrl) {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Conversion failed.');
  }

  return payload;
}

async function downloadZip(files) {
  const response = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Download failed.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'converted-site.zip';
  link.click();
  URL.revokeObjectURL(url);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Converting repository...');
  downloadBtn.disabled = true;

  try {
    const result = await convertRepo(repoInput.value.trim());
    generatedFiles = result.files;

    // Display generated files in readable text panels.
    htmlOutput.textContent = result.files['index.html'];
    cssOutput.textContent = result.files['styles.css'];
    jsOutput.textContent = result.files['script.js'];

    renderPreview(result.files);

    downloadBtn.disabled = false;
    setStatus(
      `Done. Processed ${result.metadata.convertedFiles} source file(s) and ${result.metadata.extractedClasses} Tailwind class(es).`
    );
  } catch (error) {
    setStatus(error.message, true);
  }
});

downloadBtn.addEventListener('click', async () => {
  if (!generatedFiles) return;

  try {
    await downloadZip(generatedFiles);
    setStatus('ZIP downloaded successfully.');
  } catch (error) {
    setStatus(error.message, true);
  }
});
