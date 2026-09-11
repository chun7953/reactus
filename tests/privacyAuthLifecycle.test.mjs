import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const privacyMarkdown = new URL('../privacy.md', import.meta.url);
const privacyHtml = new URL('../public/privacy.html', import.meta.url);

const disclosure = 'ログアウトした場合、または対象のDiscordサーバーからReactusを削除した場合は、有効期限前でもそのサーバーのログインリンクとセッションを失効します。';

test('privacy disclosures match early Web Admin credential revocation', async () => {
    const [markdown, html] = await Promise.all([
        readFile(privacyMarkdown, 'utf8'),
        readFile(privacyHtml, 'utf8'),
    ]);

    for (const source of [markdown, html]) {
        assert.match(source, /ワンタイムログインリンクは10分間有効/);
        assert.match(source, /セッションは30日間有効/);
        assert.ok(source.includes(disclosure));
    }
});
