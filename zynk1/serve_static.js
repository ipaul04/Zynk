import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { URL } from 'url';

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

const API_LOGIN_URL = 'http://localhost:3000/login';
const API_VERIFY_URL = 'http://localhost:3000/verify_token';

createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const token = parsedUrl.searchParams.get('token');

    // Special route for config (no auth needed for config normally, or served by API)
    if (pathname === '/config') {
        try {
            const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pkg.config || {}));
            return;
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to read config' }));
            return;
        }
    }

    // Middleware: Check for token or valid session
    // For a simple static server, we'll check the token in URL.
    // If it's the root or an HTML file, we require a token.
    if (pathname === '/' || pathname.endsWith('.html')) {
        if (!token) {
            res.writeHead(302, { 'Location': API_LOGIN_URL });
            res.end();
            return;
        }

        // Verify token with API
        try {
            const verifyRes = await fetch(`${API_VERIFY_URL}?token=${token}`);
            if (!verifyRes.ok) {
                res.writeHead(302, { 'Location': API_LOGIN_URL });
                res.end();
                return;
            }
        } catch (e) {
            console.error('Auth verification failed:', e);
            res.writeHead(500);
            res.end('Authentication server unavailable');
            return;
        }
    }

    let filePath = join(dir, pathname === '/' ? 'index.html' : pathname);
    try {
        statSync(filePath).isFile();
    } catch {
        // If file doesn't exist, we might want to default to index.html 
        // but only if it's authorized
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
