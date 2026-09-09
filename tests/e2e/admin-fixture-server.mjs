import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.REACTUS_E2E_PORT || 4173);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.join(root, 'public');

const bootstrap = {
  guild: { id: '947086484098412564', name: 'Reactus E2E' },
  user: { id: '100000000000000001', displayName: 'テスト管理者' },
  channels: [
    { id: '100000000000000101', name: 'general', canManage: true },
    { id: '100000000000000102', name: 'giveaway', canManage: true },
    { id: '100000000000000103', name: 'readonly', canManage: false },
  ],
  roles: [
    { id: '200000000000000001', name: 'お知らせ' },
    { id: '200000000000000002', name: '抽選参加者' },
  ],
  monitors: [
    {
      id: 1,
      channelId: '100000000000000101',
      channelName: 'general',
      calendarId: 'calendar-e2e@example.test',
      triggerKeyword: 'お知らせ',
      mentionRoleId: '200000000000000001',
      canManage: true,
    },
    {
      id: 2,
      channelId: '100000000000000102',
      channelName: 'giveaway',
      calendarId: 'calendar-e2e@example.test',
      triggerKeyword: 'ラキショ',
      mentionRoleId: '200000000000000002',
      canManage: true,
    },
  ],
  guildEmojis: [],
  reactionRules: [
    {
      channelId: '100000000000000101',
      trigger: '確認',
      emojis: [{ type: 'unicode', value: '✅' }],
      rawEmojis: '✅',
      invalid: false,
    },
  ],
};

const events = [
  {
    id: 'single-9',
    calendarId: 'calendar-e2e@example.test',
    monitorId: 1,
    channelId: '100000000000000101',
    type: 'post',
    summary: '朝のお知らせ',
    description: '9日だけの通常投稿です。',
    start: '2026-09-09T10:30:00+09:00',
    end: '2026-09-09T11:00:00+09:00',
    htmlLink: 'https://calendar.google.com/calendar/event?eid=single9',
    hasImage: false,
  },
  {
    id: 'spanning-8-10',
    calendarId: 'calendar-e2e@example.test',
    monitorId: 1,
    channelId: '100000000000000101',
    type: 'post',
    summary: '連続イベント',
    description: '8日夜から10日朝まで続く予定です。',
    start: '2026-09-08T21:00:00+09:00',
    end: '2026-09-10T08:00:00+09:00',
    htmlLink: 'https://calendar.google.com/calendar/event?eid=span',
    hasImage: true,
    recurringEventId: 'series-span',
  },
  {
    id: 'single-15',
    calendarId: 'calendar-e2e@example.test',
    monitorId: 1,
    channelId: '100000000000000101',
    type: 'post',
    summary: '15日の予定',
    description: '1件だけの日の確認用です。',
    start: '2026-09-15T12:00:00+09:00',
    end: '2026-09-15T12:30:00+09:00',
    htmlLink: null,
    hasImage: false,
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `day24-${index + 1}`,
    calendarId: 'calendar-e2e@example.test',
    monitorId: index === 6 ? 2 : 1,
    channelId: index === 6 ? '100000000000000102' : '100000000000000101',
    type: index === 6 ? 'giveaway' : 'post',
    summary: index === 0 ? '【お知らせ】' : index === 6 ? '秋の抽選' : `24日の予定${index + 1}`,
    description: index === 0
      ? '内部キーワードだけのタイトルでも詳細は空になりません。'
      : index === 6
        ? '【テスト景品/2】\n抽選の案内本文です。'
        : `24日の予定${index + 1}の本文です。`,
    start: `2026-09-24T${String(9 + index).padStart(2, '0')}:00:00+09:00`,
    end: `2026-09-24T${String(9 + index).padStart(2, '0')}:30:00+09:00`,
    htmlLink: null,
    hasImage: index === 5,
    recurringEventId: index === 4 ? 'series-24' : null,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `day25-${index + 1}`,
    calendarId: 'calendar-e2e@example.test',
    monitorId: 1,
    channelId: '100000000000000101',
    type: 'post',
    summary: `25日の予定${index + 1}`,
    description: `6件ちょうどの日の確認用${index + 1}です。`,
    start: `2026-09-25T${String(9 + index).padStart(2, '0')}:00:00+09:00`,
    end: `2026-09-25T${String(9 + index).padStart(2, '0')}:30:00+09:00`,
    htmlLink: null,
    hasImage: false,
  })),
];

const announcements = [
  { channelId: '100000000000000101', message: '質問はこちらへどうぞ。' },
  { channelId: '100000000000000103', message: '閲覧のみの案内です。' },
];

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function json(res, value, status = 200) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function adminFixtureHtml() {
  const html = await readFile(path.join(publicRoot, 'admin.html'), 'utf8');
  return html.replace(
    '<script type="module" src="/admin-entry.js"></script>',
    '<script>window.__reactusAdminEnhancementSrc="/__e2e/enhancements.js";</script>\n  <script type="module" src="/admin-entry.js"></script>',
  );
}

function apiResponse(req, res, url) {
  if (url.pathname === '/api/admin/bootstrap') return json(res, bootstrap);
  if (url.pathname === '/api/admin/events') return json(res, { events });
  if (url.pathname === '/api/admin/announcements' && req.method === 'GET') {
    return json(res, { announcements });
  }
  if (url.pathname === '/api/admin/members') return json(res, { members: [] });
  if (url.pathname === '/api/admin/logout') return json(res, { ok: true });
  if (url.pathname === '/api/admin/event') return json(res, { event: events[0] });
  if (url.pathname === '/api/admin/schedules') return json(res, { event: events[0] });
  if (url.pathname === '/api/admin/update') return json(res, { event: events[0] });
  if (url.pathname === '/api/admin/announcements') {
    return json(res, { announcement: announcements[0] });
  }
  return json(res, { ok: true, events, announcements });
}

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/admin.html' : pathname;
  const decoded = decodeURIComponent(requested);
  const candidate = path.resolve(publicRoot, `.${decoded}`);
  if (!candidate.startsWith(`${publicRoot}${path.sep}`) && candidate !== publicRoot) {
    send(res, 403, 'Forbidden');
    return;
  }
  try {
    const body = await readFile(candidate);
    send(res, 200, body, mimeTypes.get(path.extname(candidate).toLowerCase()) || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (url.pathname === '/__e2e/health') return json(res, { ok: true });
  if (url.pathname === '/__e2e/enhancements.js') {
    return send(res, 200, "import('/admin-enhancements-entry.js');", 'text/javascript; charset=utf-8');
  }
  if (url.pathname === '/admin' || url.pathname === '/admin.html') {
    return send(res, 200, await adminFixtureHtml(), 'text/html; charset=utf-8');
  }
  if (url.pathname.startsWith('/api/admin/')) return apiResponse(req, res, url);
  return serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`[reactus-e2e] admin fixture listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
