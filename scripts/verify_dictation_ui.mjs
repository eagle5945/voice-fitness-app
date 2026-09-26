// Local UI verification without STT. iPhone keyboard recognition needs a real device.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
const types = { html: 'text/html', mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) { console.error('UNEXPECTED API REQUEST', path); res.writeHead(503).end(); return; }
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (basename(name) !== name) { res.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(new URL(`../pwa/${name}`, import.meta.url));
    res.setHeader('Content-Type', types[name.split('.').pop()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
}).listen(8878, '127.0.0.1', () => console.log('Dictation UI verification: http://127.0.0.1:8878/'));
