import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE_ORIGIN = 'https://reactus.fly.dev';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_KEY_FILE = '5d09339110e16b9e2adf4cdb54aad9c1.txt';

function decodeXmlText(value) {
    return String(value)
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
}

export function parseSitemapUrls(xml, origin = SITE_ORIGIN) {
    const allowedOrigin = new URL(origin).origin;
    const urls = [];
    const seen = new Set();

    for (const match of String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
        let parsed;
        try {
            parsed = new URL(decodeXmlText(match[1]));
        } catch {
            continue;
        }
        if (parsed.origin !== allowedOrigin || parsed.protocol !== 'https:') continue;
        parsed.hash = '';
        const normalized = parsed.href;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push(normalized);
    }

    return urls;
}

export function selectChangedUrls(changedFiles, sitemapUrls, origin = SITE_ORIGIN) {
    const files = [...new Set((changedFiles || []).map((value) => String(value).trim()).filter(Boolean))];
    const allUrls = [...new Set(sitemapUrls || [])];
    if (files.length === 0) return [];

    const affectsEveryPublicPage = files.some((file) => (
        file === `public/${INDEXNOW_KEY_FILE}`
        || file === 'public/sitemap.xml'
        || file === 'public/robots.txt'
        || file === 'src/web/server.js'
        || file.startsWith('public/common/css/')
        || file.startsWith('public/images/')
    ));
    if (affectsEveryPublicPage) return allUrls;

    const changedPaths = new Set();
    for (const file of files) {
        if (!file.startsWith('public/') || !file.endsWith('.html')) continue;
        const relative = file.slice('public/'.length);
        changedPaths.add(relative === 'index.html' ? '/' : `/${relative}`);
    }

    return allUrls.filter((value) => {
        try {
            const url = new URL(value);
            return url.origin === new URL(origin).origin && changedPaths.has(url.pathname);
        } catch {
            return false;
        }
    });
}

async function readChangedFileList(filePath) {
    if (!filePath) return [];
    const content = await fs.readFile(filePath, 'utf8');
    return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseArguments(args) {
    let forceAll = false;
    let changedFileList = null;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--all') {
            forceAll = true;
        } else if (arg === '--changed-file-list') {
            changedFileList = args[index + 1] || null;
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!forceAll && !changedFileList) {
        throw new Error('Use --all or --changed-file-list <path>.');
    }
    return { forceAll, changedFileList };
}

export async function submitIndexNow({
    forceAll = false,
    changedFiles = [],
    fetchImpl = fetch,
    repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
    const localKeyPath = path.join(repoRoot, 'public', INDEXNOW_KEY_FILE);
    const key = (await fs.readFile(localKeyPath, 'utf8')).trim();
    if (!/^[0-9a-fA-F]{8,128}$/.test(key)) {
        throw new Error('IndexNow key must contain 8-128 hexadecimal characters.');
    }
    if (INDEXNOW_KEY_FILE !== `${key}.txt`) {
        throw new Error('IndexNow key filename must match the published key.');
    }

    const keyLocation = `${SITE_ORIGIN}/${INDEXNOW_KEY_FILE}`;
    const keyResponse = await fetchImpl(keyLocation, {
        headers: { 'User-Agent': 'Reactus-IndexNow/1.0' },
        cache: 'no-store',
    });
    if (!keyResponse.ok) {
        throw new Error(`Published IndexNow key is unavailable: HTTP ${keyResponse.status}`);
    }
    const publishedKey = (await keyResponse.text()).trim();
    if (publishedKey !== key) {
        throw new Error('Published IndexNow key does not match the repository key.');
    }

    const sitemapUrl = `${SITE_ORIGIN}/sitemap.xml`;
    const sitemapResponse = await fetchImpl(sitemapUrl, {
        headers: { 'User-Agent': 'Reactus-IndexNow/1.0' },
        cache: 'no-store',
    });
    if (!sitemapResponse.ok) {
        throw new Error(`Reactus sitemap is unavailable: HTTP ${sitemapResponse.status}`);
    }
    const sitemapUrls = parseSitemapUrls(await sitemapResponse.text());
    if (sitemapUrls.length === 0) {
        throw new Error('Reactus sitemap contains no valid same-origin HTTPS URLs.');
    }

    const urls = forceAll ? sitemapUrls : selectChangedUrls(changedFiles, sitemapUrls);
    if (urls.length === 0) {
        console.log('IndexNow: no public searchable URLs changed; nothing to submit.');
        return { submitted: false, urls: [], status: null };
    }

    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'Reactus-IndexNow/1.0',
        },
        body: JSON.stringify({
            host: new URL(SITE_ORIGIN).host,
            key,
            keyLocation,
            urlList: urls,
        }),
    });
    const responseBody = await response.text();
    if (response.status !== 200 && response.status !== 202) {
        throw new Error(`IndexNow submission failed: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ''}`);
    }

    console.log(`IndexNow: submitted ${urls.length} URL(s); HTTP ${response.status}.`);
    return { submitted: true, urls, status: response.status };
}

async function main() {
    const { forceAll, changedFileList } = parseArguments(process.argv.slice(2));
    const changedFiles = forceAll ? [] : await readChangedFileList(changedFileList);
    await submitIndexNow({ forceAll, changedFiles });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryPath === import.meta.url) {
    main().catch((error) => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}
