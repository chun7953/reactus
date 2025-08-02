import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '..', '..', 'public');

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        const filePath = path.join(publicPath, 'index.html');
        serveFile(res, filePath, 'text/html');
    } else if (req.url.startsWith('/common/') || req.url.startsWith('/images/')) {
        const filePath = path.join(publicPath, req.url);
        const contentType = getContentType(filePath);
        serveFile(res, filePath, contentType);
    } else if (req.url.startsWith('/interactions')) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Reactus bot is running. This window can be closed.');
    } else if (req.url === '/privacy.html') {
        const filePath = path.join(publicPath, 'privacy.html');
        serveFile(res, filePath, 'text/html');
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    }
});

function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500);
            res.end(`Server Error: ${err.code}`);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

function getContentType(filePath) {
    const extname = path.extname(filePath);
    switch (extname) {
        case '.css': return 'text/css';
        case '.png': return 'image/png';
        case '.ico': return 'image/x-icon';
        default: return 'application/octet-stream';
    }
}

export function startServer(callback) {
    server.listen(config.web.port, '0.0.0.0', () => {
        console.log(`Server is running on http://localhost:${config.web.port}`);
        if (callback) callback();
    }).on('error', (error) => {
        console.error('Error starting server:', error);
    });
}