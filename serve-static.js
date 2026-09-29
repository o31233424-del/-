const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
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

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (!err) {
      send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream');
      return;
    }
    fs.readFile(path.join(root, 'index.html'), (e2, html) => {
      if (e2) return send(res, 404, 'Not found');
      send(res, 200, html, types['.html']);
    });
  });
}).listen(port, '0.0.0.0', () => {
  console.log('listening on ' + port);
});
