// Local-only browser regression fixture. No ERP or Mercado Pago requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {
  '/activities': ['content.test.html', 'text/html'],
  '/content.test.js': ['content.test.js', 'text/javascript'],
  '/content.js': ['../content.js', 'text/javascript'],
};
http.createServer((req, res) => {
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(__dirname, file[0])));
}).listen(8766, '127.0.0.1', () => console.log('Pruebas: http://127.0.0.1:8766/activities'));
