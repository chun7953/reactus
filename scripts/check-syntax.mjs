import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const roots = ['src', 'scripts', 'tests'];

function collectJavaScriptFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptFiles(entryPath);
        return /\.(?:js|mjs)$/.test(entry.name) ? [entryPath] : [];
    });
}

const files = roots.flatMap(collectJavaScriptFiles).sort();
const failures = [];

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        failures.push(`${file}\n${result.stderr || result.stdout}`);
    }
}

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Syntax check passed for ${files.length} files.`);
}
