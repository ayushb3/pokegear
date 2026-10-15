#!/usr/bin/env node
/**
 * e2e-server.mjs
 *
 * 1. Runs `astro build` (unless E2E_SKIP_BUILD=1).
 * 2. Serves dist/ in the foreground on E2E_PORT (default 4399).
 *
 * Stays alive so Playwright's webServer process-exit check never fires.
 * Handles index.html for directories, correct Content-Types, and 404s.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 4399);
const SKIP_BUILD = process.env.E2E_SKIP_BUILD === '1';

// ── 1. Build ──────────────────────────────────────────────────────────────────
if (!SKIP_BUILD) {
  console.log('[e2e-server] running astro build…');
  execSync('npx astro build', { stdio: 'inherit' });
  console.log('[e2e-server] build done');
}

// ── 2. Determine dist dir ─────────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(__dirname, '../dist');

if (!existsSync(DIST)) {
  console.error(`[e2e-server] dist/ not found at ${DIST} — run with E2E_SKIP_BUILD=1 only after a successful build`);
  process.exit(1);
}

// ── 3. MIME types ─────────────────────────────────────────────────────────────
const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.htm':   'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.mjs':   'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.txt':   'text/plain; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.mid':   'audio/midi',
  '.midi':  'audio/midi',
  '.mp3':   'audio/mpeg',
  '.ogg':   'audio/ogg',
  '.wav':   'audio/wav',
  '.mp4':   'video/mp4',
  '.webm':  'video/webm',
  '.pdf':   'application/pdf',
  '.xml':   'application/xml; charset=utf-8',
  '.wasm':  'application/wasm',
  '.map':   'application/json; charset=utf-8',
};

function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// ── 4. Resolve a URL path to a file on disk ───────────────────────────────────
function resolve_path(urlPath) {
  // Strip query string
  const clean = urlPath.split('?')[0].split('#')[0];
  // Decode percent-encoding (but reject path traversal)
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
  if (decoded.includes('..')) return null;

  const full = join(DIST, decoded);

  // Exact file
  if (existsSync(full) && statSync(full).isFile()) return full;

  // Directory → index.html
  if (existsSync(full) && statSync(full).isDirectory()) {
    const idx = join(full, 'index.html');
    if (existsSync(idx)) return idx;
  }

  // Astro static pages: /foo → dist/foo.html or dist/foo/index.html
  const withHtml = full + '.html';
  if (existsSync(withHtml) && statSync(withHtml).isFile()) return withHtml;

  // Fallback: serve root index.html for SPA-style navigation
  const rootIndex = join(DIST, 'index.html');
  if (existsSync(rootIndex)) return rootIndex;

  return null;
}

// ── 5. HTTP server ────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const filePath = resolve_path(req.url ?? '/');

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  res.writeHead(200, { 'Content-Type': contentType(filePath) });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e-server] serving dist/ on http://localhost:${PORT}`);
});

// Keep the process alive (server.listen already does, but be explicit)
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
