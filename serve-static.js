const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = path.resolve(__dirname);
const port = Number(process.env.PORT) || 3000;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type, extraHeaders) {
  res.writeHead(code, Object.assign({
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function listHtmlFiles() {
  try {
    return fs.readdirSync(root).filter((f) => /\.html$/i.test(f));
  } catch (e) {
    return [];
  }
}

function appHtmlPath() {
  const files = listHtmlFiles()
    .map((f) => path.join(root, f))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] || path.join(root, 'index.html');
}

function safeFile(rel) {
  const resolved = path.resolve(root, rel);
  const extra = path.relative(root, resolved);
  if (extra.startsWith('..') || path.isAbsolute(extra)) return null;
  return resolved;
}

function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isSafeProxyTarget(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (isPrivateHost(u.hostname)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function fetchRemote(targetUrl, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(targetUrl); } catch (e) { reject(e); return; }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,text/plain,*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cookie': 'beget=begetok'
      }
    }, (resp) => {
      const loc = resp.headers.location;
      if (loc && resp.statusCode >= 300 && resp.statusCode < 400 && redirectsLeft > 0) {
        resp.resume();
        let next;
        try { next = new URL(loc, u).href; } catch (e) { reject(e); return; }
        if (!isSafeProxyTarget(next)) { reject(new Error('bad redirect')); return; }
        fetchRemote(next, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      let size = 0;
      resp.on('data', (c) => {
        size += c.length;
        if (size > 2500000) {
          req.destroy();
          reject(new Error('too large'));
          return;
        }
        chunks.push(c);
      });
      resp.on('end', () => {
        resolve({
          status: resp.statusCode || 502,
          type: resp.headers['content-type'] || 'text/html; charset=utf-8',
          body: Buffer.concat(chunks)
        });
      });
    });
    req.setTimeout(40000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function handleProxy(res, target) {
  if (!target || !isSafeProxyTarget(target)) {
    send(res, 400, 'bad url', 'text/plain; charset=utf-8');
    return;
  }
  fetchRemote(target, 5).then((out) => {
    if (out.status >= 400 && out.body.length < 40) {
      send(res, 502, 'proxy error: ' + out.status, 'text/plain; charset=utf-8');
      return;
    }
    send(res, 200, out.body, out.type);
  }).catch((err) => {
    send(res, 502, 'proxy error: ' + (err && err.message ? err.message : err), 'text/plain; charset=utf-8');
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type, X-Return-Format'
    });
    res.end();
    return;
  }
  let parsed;
  try {
    parsed = new URL(req.url || '/', 'http://localhost');
  } catch (e) {
    send(res, 400, 'bad request', 'text/plain; charset=utf-8');
    return;
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/health') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8');
    return;
  }
  if (pathname === '/proxy') {
    handleProxy(res, parsed.searchParams.get('url'));
    return;
  }

  let urlPath = '/';
  try {
    urlPath = decodeURIComponent(pathname);
  } catch (e) {
    urlPath = pathname;
  }
  const rel = urlPath === '/' ? path.relative(root, appHtmlPath()) : urlPath.replace(/^\/+/, '');
  const file = safeFile(rel || 'index.html');
  if (!file) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (!err) {
      send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream');
      return;
    }
    const fallback = appHtmlPath();
    fs.readFile(fallback, (e2, html) => {
      if (e2) return send(res, 404, 'Not found');
      send(res, 200, html, types['.html']);
    });
  });
}).listen(port, '0.0.0.0', () => {
  console.log('listening on ' + port);
});
