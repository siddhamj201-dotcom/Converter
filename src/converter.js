const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const AdmZip = require('adm-zip');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');

/**
 * Parse a GitHub URL and extract owner + repo name.
 */
function parseGitHubUrl(repoUrl) {
  const url = new URL(repoUrl);
  if (url.hostname !== 'github.com') {
    throw new Error('Only github.com repositories are supported.');
  }

  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository URL.');
  }

  return { owner, repo: repo.replace(/\.git$/, '') };
}

/**
 * Download and unzip a GitHub repository into a temporary directory.
 */
async function downloadRepository(repoUrl) {
  const { owner, repo } = parseGitHubUrl(repoUrl);
  const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;

  // Try `main` first. If it fails, fallback to `master`.
  let response = await fetch(zipUrl);
  if (!response.ok) {
    const fallbackUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/master`;
    response = await fetch(fallbackUrl);
  }

  if (!response.ok) {
    throw new Error('Failed to download repository. Ensure the repo exists and is public.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const zipPath = path.join(os.tmpdir(), `repo-${Date.now()}.zip`);
  const extractDir = path.join(os.tmpdir(), `repo-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  await fs.writeFile(zipPath, Buffer.from(arrayBuffer));
  await fs.mkdir(extractDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  const [rootFolder] = await fs.readdir(extractDir);
  const projectPath = path.join(extractDir, rootFolder);

  return { projectPath, cleanupPaths: [zipPath, extractDir] };
}

async function walkFiles(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, acc);
    } else {
      acc.push(fullPath);
    }
  }

  return acc;
}

function jsxNameToTag(nameNode) {
  if (!nameNode) return 'div';
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXMemberExpression') return `${jsxNameToTag(nameNode.object)}.${jsxNameToTag(nameNode.property)}`;
  return 'div';
}

function expressionToJs(exprNode) {
  return generate(exprNode).code;
}

function jsxAttrToHtml(attr) {
  if (!attr || attr.type !== 'JSXAttribute') return null;
  const attrName = attr.name.name === 'className' ? 'class' : attr.name.name;

  if (!attr.value) return `${attrName}`;

  if (attr.value.type === 'StringLiteral') {
    return `${attrName}="${attr.value.value}"`;
  }

  if (attr.value.type === 'JSXExpressionContainer') {
    const code = expressionToJs(attr.value.expression);
    return `${attrName}="${code}"`;
  }

  return null;
}

/**
 * Convert JSX AST node to plain HTML string.
 * Dynamic JSX expressions are preserved as data attributes/comments
 * so the output stays readable and debuggable.
 */
function jsxNodeToHtml(node) {
  if (!node) return '';

  if (node.type === 'JSXText') {
    return node.value;
  }

  if (node.type === 'JSXExpressionContainer') {
    const code = expressionToJs(node.expression);
    return `<!-- dynamic: ${code} -->`;
  }

  if (node.type === 'JSXFragment') {
    return node.children.map(jsxNodeToHtml).join('');
  }

  if (node.type === 'JSXElement') {
    const tag = jsxNameToTag(node.openingElement.name);
    const attrs = node.openingElement.attributes
      .filter((a) => a.type === 'JSXAttribute')
      .map(jsxAttrToHtml)
      .filter(Boolean)
      .join(' ');

    const children = node.children.map(jsxNodeToHtml).join('');
    const opening = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    return `${opening}${children}</${tag}>`;
  }

  return '';
}

function collectTailwindClassesFromHtml(html) {
  const classRegex = /class\s*=\s*"([^"]+)"/g;
  const classes = new Set();
  let match;

  while ((match = classRegex.exec(html))) {
    match[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((cls) => classes.add(cls));
  }

  return Array.from(classes);
}

async function generateTailwindCss(classes) {
  const rawContent = `<div class="${classes.join(' ')}"></div>`;

  const result = await postcss([
    tailwindcss({
      content: [{ raw: rawContent, extension: 'html' }],
      corePlugins: { preflight: false }
    })
  ]).process('@tailwind utilities;', { from: undefined });

  return `/* Generated from Tailwind classes found in source files */\n${result.css}`;
}

function extractComponentReturn(ast) {
  let returnedJsx = null;

  traverse(ast, {
    ReturnStatement(path) {
      if (returnedJsx || !path.node.argument) return;
      const arg = path.node.argument;
      if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') {
        returnedJsx = arg;
      }
    }
  });

  return returnedJsx;
}

function extractImperativeLogic(ast) {
  const logicBlocks = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      // Skip likely component declarations (PascalCase), keep helpers.
      const name = path.node.id?.name || '';
      if (/^[A-Z]/.test(name)) return;
      logicBlocks.push(generate(path.node).code);
    },
    VariableDeclaration(path) {
      const declarationCode = generate(path.node).code;
      if (/useState|useEffect|jsx|React/.test(declarationCode)) return;
      logicBlocks.push(declarationCode);
    }
  });

  return logicBlocks;
}

async function convertRepository(repoUrl) {
  const { projectPath, cleanupPaths } = await downloadRepository(repoUrl);

  try {
    const files = await walkFiles(projectPath);
    const reactFiles = files.filter((file) => /\.(jsx?|tsx?)$/.test(file));

    const htmlSections = [];
    const jsSections = [];
    const allClasses = new Set();

    for (const file of reactFiles) {
      const source = await fs.readFile(file, 'utf8');
      if (!source.includes('<') || !source.includes('>')) continue;

      let ast;
      try {
        ast = parser.parse(source, {
          sourceType: 'module',
          plugins: ['jsx']
        });
      } catch {
        continue;
      }

      const returnedJsx = extractComponentReturn(ast);
      if (returnedJsx) {
        const html = jsxNodeToHtml(returnedJsx);
        htmlSections.push(`<!-- Source: ${path.relative(projectPath, file)} -->\n${html}`);
        collectTailwindClassesFromHtml(html).forEach((cls) => allClasses.add(cls));
      }

      const logicBlocks = extractImperativeLogic(ast);
      if (logicBlocks.length) {
        jsSections.push(`// Source: ${path.relative(projectPath, file)}\n${logicBlocks.join('\n\n')}`);
      }
    }

    const css = await generateTailwindCss(Array.from(allClasses));

    const htmlOutput = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Converted Website</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <!-- Combined static HTML generated from React component return blocks -->
    <main id="app">
${htmlSections.join('\n\n') || '      <p>No JSX components could be converted.</p>'}
    </main>

    <script src="script.js"></script>
  </body>
</html>`;

    const jsOutput = `/**
 * Generated JavaScript extracted from non-React helper logic.
 * Dynamic JSX expressions were left as HTML comments in index.html.
 */
${jsSections.join('\n\n') || '// No reusable JS logic extracted.'}`;

    return {
      files: {
        'index.html': htmlOutput,
        'styles.css': css,
        'script.js': jsOutput
      },
      metadata: {
        convertedFiles: reactFiles.length,
        extractedClasses: allClasses.size
      }
    };
  } finally {
    // Clean temporary artifacts.
    for (const target of cleanupPaths) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}

module.exports = { convertRepository };
