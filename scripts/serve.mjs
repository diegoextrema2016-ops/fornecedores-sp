// Servidor local para testar o dist/ como a Vercel serve: arquivos primeiro, depois os rewrites do vercel.json,
// depois o 404.html (com status 404). Uso: node scripts/serve.mjs [pasta=dist] [porta=8099]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] || 'dist');
const PORT = Number(process.argv[3] || 8099);
const config = JSON.parse(await readFile(join(resolve(fileURLToPath(import.meta.url), '..', '..'), 'vercel.json'), 'utf8'));
const rewrites = (config.rewrites || []).map((r) => ({
  re: new RegExp('^' + r.source.replace(/:path\*/g, '.*').replace(/:[a-zA-Z]+/g, '[^/]+') + '$'),
  dest: r.destination,
}));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

async function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const direct = join(ROOT, clean);
  if (!direct.startsWith(ROOT)) return null;
  if (await isFile(direct)) return direct;
  if (await isFile(join(direct, 'index.html'))) return join(direct, 'index.html');
  const rw = rewrites.find((r) => r.re.test(clean));
  if (rw && (await isFile(join(ROOT, rw.dest)))) return join(ROOT, rw.dest);
  return null;
}

http.createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (file) {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
    return;
  }
  try {
    const body = await readFile(join(ROOT, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Servindo ${ROOT} em http://127.0.0.1:${PORT}`));
