import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const [,, dir, portArg] = process.argv;
if (!dir || !portArg) { console.error('Usage: node serve_static.js <directory> <port>'); process.exit(1); }
const port = parseInt(portArg);

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.wasm': 'application/wasm',
};

createServer((req, res) => {
    const url = req.url.split('?')[0];
    let filePath = join(dir, url === '/' ? 'index.html' : url);
    try {
        statSync(filePath).isFile();
    } catch {
        filePath = join(dir, 'index.html');
    }
    try {
        const data = readFileSync(filePath);
        const ct = mime[extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
}).listen(port, () => {
    console.log(`Serving ${dir}/ at http://localhost:${port}`);
});
