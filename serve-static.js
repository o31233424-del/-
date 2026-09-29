const http = require('http');
const fs = require('fs');
const path = require('path');

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

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
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

http.createServer((req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    urlPath = '/';
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
