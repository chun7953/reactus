import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { createAdminHandler } from './adminHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '..', '..', 'public');
const adminAssetVersion = encodeURIComponent(
    process.env.FLY_IMAGE_REF || process.env.GITHUB_SHA || `boot-${Date.now()}`,
);

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

function staticCacheControl(filePath) {
    const base = path.basename(filePath || '');
    if (filePath?.endsWith('.html') || base.startsWith('admin')) return 'no-store';
    return 'public, max-age=300';
}

function versionAdminHtml(content, filePath) {
    if (path.basename(filePath || '') !== 'admin.html') return content;
    const assetQuery = `?v=${adminAssetVersion}`;
    const compatBoot = [
        `<script>window.__reactusAdminAssetQuery=${JSON.stringify(assetQuery)};</script>`,
        `<script defer src="/admin-compat.js${assetQuery}"></script>`,
        '<noscript><style>#startupShell{display:none!important}#loginRequired{display:block!important}</style><section class="panel"><h2>JavaScriptを有効にしてください</h2><p>Reactus管理画面の利用にはJavaScriptが必要です。</p></section></noscript>',
    ].join('');
    const html = content.toString('utf8')
        .replace('</head>', `${compatBoot}</head>`)
        .replace(/href="\/admin\.css"/g, `href="/admin.css${assetQuery}"`)
        .replace(
            /src="\/(admin\.js|common\/admin-[^"?]+\.js)"/g,
            (_, assetPath) => `src="/${assetPath}${assetQuery}"`,
        );
    return Buffer.from(html, 'utf8');
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

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': staticCacheControl(filePath),
            'X-Content-Type-Options': 'nosniff',
        });
        const payload = versionAdminHtml(content, filePath);
        res.end(req.method === 'HEAD' ? undefined : payload);
    });
}

function getContentType(filePath) {
    switch (path.extname(filePath)) {
        case '.css': return 'text/css; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.png': return 'image/png';
        case '.ico': return 'image/x-icon';
        case '.html': return 'text/html; charset=utf-8';
        default: return 'application/octet-stream';
    }
}

export function createWebServer({
    getStatus = () => ({ status: 'ok', ready: true }),
    staticRoot = publicPath,
    client = null,
    adminHandler = null,
} = {}) {
    const handleAdmin = adminHandler || createAdminHandler({ client });

    return http.createServer((req, res) => {
        void (async () => {
            const requestUrl = new URL(req.url, 'http://localhost');
            const pathname = requestUrl.pathname;

            if (await handleAdmin(req, res, requestUrl)) return;

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    Allow: 'GET, HEAD',
                });
                res.end('Method Not Allowed');
                return;
            }

            if (pathname === '/healthz' || pathname === '/readyz') {
                const status = getStatus();
                const statusCode = pathname === '/readyz' && !status.ready ? 503 : 200;
                sendJson(req, res, statusCode, status);
                return;
            }

            if (pathname === '/') {
                serveFile(req, res, path.join(staticRoot, 'index.html'), 'text/html; charset=utf-8');
            } else if (pathname === '/admin' || pathname === '/admin/') {
                serveFile(req, res, path.join(staticRoot, 'admin.html'), 'text/html; charset=utf-8');
            } else if (['/admin.css', '/admin.js', '/admin-compat.js', '/admin.bundle.js'].includes(pathname)) {
                const filePath = safeStaticPath(staticRoot, pathname);
                serveFile(req, res, filePath, getContentType(filePath || ''));
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
        })().catch((error) => {
            console.error('[WebServer] request failed:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            res.end('Server Error');
        });
    });
}

export function startServer({
    getStatus,
    port = config.web.port,
    host = '0.0.0.0',
    logger = console,
    client = null,
} = {}) {
    const server = createWebServer({ getStatus, client });
    server.listen(port, host, () => {
        logger.log(`Server is running on http://${host}:${port}`);
    });
    return server;
}
