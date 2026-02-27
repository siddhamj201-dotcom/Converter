const path = require('path');
const express = require('express');
const JSZip = require('jszip');
const { convertRepository } = require('./src/converter');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/convert', async (req, res) => {
  try {
    const { repoUrl } = req.body;
    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required.' });
    }

    const result = await convertRepository(repoUrl);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Conversion failed.' });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'Generated files are required.' });
    }

    const zip = new JSZip();
    Object.entries(files).forEach(([name, content]) => {
      zip.file(name, content);
    });

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="converted-site.zip"');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not create zip.' });
  }
});

app.listen(PORT, () => {
  console.log(`Converter app running at http://localhost:${PORT}`);
});
