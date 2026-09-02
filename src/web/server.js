import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '..', '..', 'public');

function sendJson(req, res, statusCode, body) {
    const content = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
}

function safeStaticPath(root, requestPath) {
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(requestPath);
    } catch {
        return null;
    }

    const candidate = path.resolve(root, decodedPath.replace(/^\/+/, ''));
    return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function serveFile(req, res, filePath, contentType) {
    if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            const statusCode = error.code === 'ENOENT' ? 404 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(statusCode === 404 ? 'Not Found' : 'Server Error');
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(req.method === 'HEAD' ? undefined : content);
    });
}

function getContentType(filePath) {
    switch (path.extname(filePath)) {
        case '.css': return 'text/css; charset=utf-8';
        case '.png': return 'image/png';
        case '.ico': return 'image/x-icon';
        case '.html': return 'text/html; charset=utf-8';
        default: return 'application/octet-stream';
    }
}

export function createWebServer({
    getStatus = () => ({ status: 'ok', ready: true }),
    staticRoot = publicPath,
} = {}) {
    return http.createServer((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, {
                'Content-Type': 'text/plain; charset=utf-8',
                Allow: 'GET, HEAD',
            });
            res.end('Method Not Allowed');
            return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const pathname = requestUrl.pathname;

        if (pathname === '/healthz' || pathname === '/readyz') {
            const status = getStatus();
            const statusCode = pathname === '/readyz' && !status.ready ? 503 : 200;
            sendJson(req, res, statusCode, status);
            return;
        }

        if (pathname === '/') {
            serveFile(req, res, path.join(staticRoot, 'index.html'), 'text/html; charset=utf-8');
        } else if (pathname.startsWith('/common/') || pathname.startsWith('/images/')) {
            const filePath = safeStaticPath(staticRoot, pathname);
            serveFile(req, res, filePath, getContentType(filePath || ''));
        } else if (pathname === '/interactions') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(req.method === 'HEAD' ? undefined : 'Reactus bot is running. This window can be closed.');
        } else if (pathname === '/privacy.html') {
            serveFile(req, res, path.join(staticRoot, 'privacy.html'), 'text/html; charset=utf-8');
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        }
    });
}

export function startServer({
    getStatus,
    port = config.web.port,
    host = '0.0.0.0',
    logger = console,
} = {}) {
    const server = createWebServer({ getStatus });
    server.listen(port, host, () => {
        logger.log(`Server is running on http://${host}:${port}`);
    });
    return server;
}
