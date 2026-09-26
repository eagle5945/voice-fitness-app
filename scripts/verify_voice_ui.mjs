// Local-only UI fixture. Uses the real app/parser with simulated recording and STT responses.
// This file is not included in the NAS deployment package.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../pwa/', import.meta.url));
let calls = 0;
const mock = `
Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
window.MediaRecorder = class {
  static isTypeSupported() { return true; }
  constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['mock recording'], {type:this.mimeType}) }); this.onstop(); }
};`;

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/stt/status') { res.setHeader('Content-Type', 'application/json'); res.end('{"available":true}'); return; }
  if (path === '/api/stt/transcribe') {
    for await (const chunk of req) { /* Consume the mock request. */ }
    const text = calls++ === 0 ? '칠십 키로 스무 해 <b>원문</b>' : '칠십 키로 스무 회입니다.';
    await new Promise(done => setTimeout(done, 100));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text, elapsedMs: 100 }));
    return;
  }
  if (path === '/mock.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(mock); return; }
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (basename(name) !== name) { res.writeHead(404).end(); return; }
  try {
    let bytes = await readFile(resolve(site, name));
    if (name === 'index.html') bytes = bytes.toString().replace('<body>', '<body><p>로컬 UI 테스트 · 녹음과 전사 응답은 모의 데이터입니다.</p><script src="/mock.js"></script>');
    if (name === 'app.mjs') bytes = bytes.toString().replace("if ('serviceWorker' in navigator)", 'if (false)');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', name.endsWith('.mjs') || name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
}).listen(8877, '127.0.0.1', () => console.log('Voice UI fixture: http://127.0.0.1:8877'));
