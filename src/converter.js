const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { generateCssFromTailwindClasses } = require('./tailwindToCss');

const execFileAsync = promisify(execFile);

/** Parse repo URL or local path */
function parseRepoInput(repoUrl) {
  if (repoUrl.startsWith('file://')) {
    return { type: 'local', path: decodeURIComponent(repoUrl.replace('file://', '')) };
  }
  if (repoUrl.startsWith('/')) {
    return { type: 'local', path: repoUrl };
  }
  const url = new URL(repoUrl);
  if (url.hostname !== 'github.com') throw new Error('Only github.com URLs are supported (or use file:// for local testing).');
  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo) throw new Error('Invalid GitHub repository URL.');
  return { type: 'github', owner, repo: repo.replace(/\.git$/, '') };
}

/** Download + extract GitHub repo into a temporary folder */
async function downloadAndExtractRepository(owner, repo) {
  const branches = ['main', 'master'];
  for (const branch of branches) {
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
    const response = await fetch(zipUrl);
    if (!response.ok) continue;

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'converter-'));
    const zipPath = path.join(workDir, `${repo}.zip`);
    await fs.writeFile(zipPath, zipBuffer);

    try {
      await execFileAsync('unzip', ['-q', zipPath, '-d', workDir]);
      const entries = await fs.readdir(workDir, { withFileTypes: true });
      const rootDir = entries.find((entry) => entry.isDirectory() && entry.name !== '__MACOSX');
      if (!rootDir) throw new Error('Extracted archive is empty.');
      return { projectDir: path.join(workDir, rootDir.name), cleanupDir: workDir };
    } catch {
      await fs.rm(workDir, { recursive: true, force: true });
      throw new Error('Could not extract repository archive. Ensure `unzip` is installed.');
    }
  }
  throw new Error('Failed to download repository archive. Check repository URL and visibility.');
}

/** Recursively walk project files and collect .js/.jsx/.ts/.tsx files */
async function walkFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(fullPath, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(fullPath);
  }
  return out;
}

/** Extract JSX returned from React component */
function findReturnJsx(source) {
  const start = source.indexOf('return (');
  if (start === -1) return null;
  let index = start + 'return ('.length;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    index += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start + 'return ('.length, index - 1).trim();
}

/** Convert JSX string to plain HTML, preserving dynamic expressions as comments */
function cleanJsxToHtml(jsx) {
  return jsx
    .replace(/className=/g, 'class=')
    .replace(/\s+on[A-Z][a-zA-Z]+=("[^"]*"|\{[^}]*\})/g, '')
    .replace(/\{\/\*([\s\S]*?)\*\/\}/g, (_, c) => `<!-- ${c.trim()} -->`)
    .replace(/\{([^{}]+)\}/g, (_, c) => `<!-- dynamic: ${c.trim()} -->`);
}

/** Extract helper JS logic (non-React, non-hooks) */
function extractJsLogic(source) {
  const lines = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('import '))
    .filter((line) => !line.trim().startsWith('export default'))
    .filter((line) => !line.includes('useState(') && !line.includes('useEffect('));
  const block = lines.join('\n').trim();
  return block.length ? block : null;
}

/** Collect all classes from HTML */
function collectClasses(html) {
  const classes = new Set();
  const regex = /class\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(html))) {
    match[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  }
  return classes;
}

/** Main repository conversion */
async function convertRepository(repoUrl) {
  const parsed = parseRepoInput(repoUrl);
  let projectDir;
  let cleanupDir = null;

  if (parsed.type === 'github') {
    const downloaded = await downloadAndExtractRepository(parsed.owner, parsed.repo);
    projectDir = downloaded.projectDir;
    cleanupDir = downloaded.cleanupDir;
  } else {
    projectDir = parsed.path;
  }

  try {
    const files = await walkFiles(projectDir);
    const htmlSections = [];
    const jsSections = [];
    const allClasses = new Set();

    for (const filePath of files) {
      const source = await fs.readFile(filePath, 'utf8');
      const jsx = findReturnJsx(source);
      if (jsx) {
        const html = cleanJsxToHtml(jsx);
        htmlSections.push(`<!-- Source: ${path.relative(projectDir, filePath)} -->\n${html}`);
        collectClasses(html).forEach((c) => allClasses.add(c));
      }

      const js = extractJsLogic(source);
      if (js) jsSections.push(`// Source: ${path.relative(projectDir, filePath)}\n${js}`);
    }

    return {
      files: {
        'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Converted Website</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="app">
${htmlSections.join('\n\n') || '      <p>No JSX return blocks found.</p>'}
    </main>
    <script src="script.js"></script>
  </body>
</html>`,
        'styles.css': generateCssFromTailwindClasses(Array.from(allClasses).sort()),
        'script.js': `/**\n * Extracted JavaScript from source files.\n * Review and clean framework-specific code as needed.\n */\n${jsSections.join('\n\n') || '// No standalone JS logic found.'}`
      },
      metadata: {
        convertedFiles: files.length,
        extractedClasses: allClasses.size,
        note: 'Tailwind conversion supports a practical subset of utility classes.'
      }
    };
  } finally {
    if (cleanupDir) await fs.rm(cleanupDir, { recursive: true, force: true });
  }
}

module.exports = { convertRepository, parseRepoInput, cleanJsxToHtml, findReturnJsx };