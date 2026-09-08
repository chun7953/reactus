const japaneseLabels = new Map([
  ['NEW SCHEDULE', '新しい予定'],
  ['EDIT SCHEDULE', '予定を編集中'],
  ['UPCOMING', '今後の予定'],
  ['CALENDAR', '月カレンダー'],
  ['REACTIONS', '自動リアクション'],
  ['DISCORD PREVIEW', 'Discord投稿イメージ'],
  ['CALENDAR INTEGRATION', 'カレンダー連携'],
  ['DUPLICATE', '予定を複製'],
]);

const beginnerFriendlyText = new Map([
  ['投稿・抽選の監視設定', '投稿先とカレンダーの設定'],
  ['トリガーキーワード', '予定を見分ける合図（キーワード）'],
  ['既定メンションロール', 'いつも付けるメンション'],
  ['監視設定を追加', '投稿先の設定を追加'],
  ['接続設定を開く', 'Googleカレンダー・投稿先の設定を開く'],
  ['カレンダー上の長さ', 'Googleカレンダー上の予定の長さ'],
  ['現在のカレンダー設定を使う', 'いつもの設定を使う'],
  ['この予定だけ別ロール', 'この予定だけ別のロールを使う'],
  ['トリガー文字', '反応する言葉'],
  ['付けるリアクション', '自動で付ける絵文字'],
  ['よく使うDiscord絵文字', 'よく使う絵文字'],
]);

const beginnerPhrasePatterns = [
  [/自動リアクション（トリガー:/g, '自動リアクション（反応する言葉:'],
  [/トリガーを入力してください。/g, '反応する言葉を入力してください。'],
  [/トリガーは(\d+)文字以内にしてください。/g, '反応する言葉は$1文字以内にしてください。'],
  [/トリガーキーワードを入力してください。/g, '予定を見分ける合図（キーワード）を入力してください。'],
  [/トリガーキーワードは(\d+)文字以内にしてください。/g, '予定を見分ける合図（キーワード）は$1文字以内にしてください。'],
  [/投稿先やトリガーを追加・変更/g, '投稿先や予定を見分ける合図を追加・変更'],
  [/抽選用はトリガーを「ラキショ」にします。/g, '抽選用は予定を見分ける合図を「ラキショ」にします。'],
];

const beginnerActions = [
  { target: 'schedulePanel', title: '予定・抽選を作る', text: '日時や繰り返しを決めて、Googleカレンダーへ登録します。' },
  { target: 'announcementPanel', title: 'チャンネル下部に案内を出す', text: '長文・改行・チャンネルリンクを含む案内文を設定できます。' },
  { target: 'calendarOverview', title: '月カレンダーを見る', text: '登録済みの予定を月ごとに確認・移動できます。' },
  { target: 'reactionPanel', title: '自動リアクションを設定する', text: '指定した言葉を含む投稿へ絵文字を自動で付けます。' },
  { target: 'calendarSettingsPanel', title: 'Googleカレンダー・投稿先を設定する', text: '接続先や投稿先を変更するときだけ使います。' },
];

function replaceEnglishEyebrows() {
  document.querySelectorAll('.eyebrow').forEach(node => {
    const replacement = japaneseLabels.get(node.textContent?.trim());
    if (replacement && node.textContent !== replacement) node.textContent = replacement;
  });
}

function replaceTechnicalLabels() {
  document.querySelectorAll('span,strong,button,summary,option').forEach(node => {
    const current = node.textContent?.trim();
    const replacement = beginnerFriendlyText.get(current);
    if (replacement && node.textContent !== replacement) node.textContent = replacement;
  });
}

function replaceTechnicalSentences() {
  document.querySelectorAll('.hint,.discord-preview-meta,#notice').forEach(node => {
    let next = node.textContent || '';
    for (const [pattern, replacement] of beginnerPhrasePatterns) {
      next = next.replace(pattern, replacement);
    }
    if (node.textContent !== next) node.textContent = next;
  });
}

function preparePanelIds() {
  const app = document.querySelector('#app');
  const firstPanel = app?.querySelector(':scope > .panel');
  if (firstPanel && !firstPanel.id) firstPanel.id = 'schedulePanel';
}

function jumpToAdminPanel(targetId) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.add('admin-guide-highlight');
  window.setTimeout(() => target.classList.remove('admin-guide-highlight'), 1400);
}

function installBeginnerGuide() {
  if (document.querySelector('#adminBeginnerGuide')) return;
  const app = document.querySelector('#app');
  if (!app) return;
  preparePanelIds();
  const firstPanel = app.querySelector(':scope > .panel');
  if (!firstPanel) return;

  const guide = document.createElement('section');
  guide.id = 'adminBeginnerGuide';
  guide.className = 'panel';

  const heading = document.createElement('h2');
  heading.textContent = '何をしたいですか？';
  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent = 'やりたいことを選ぶと、その設定場所まで移動します。Discordのコマンドを覚える必要はありません。';
  const grid = document.createElement('div');
  grid.className = 'admin-guide-grid';

  for (const action of beginnerActions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-guide-action';
    const title = document.createElement('strong');
    title.textContent = action.title;
    const text = document.createElement('span');
    text.textContent = action.text;
    button.append(title, text);
    button.addEventListener('click', () => jumpToAdminPanel(action.target));
    grid.append(button);
  }

  guide.append(heading, intro, grid);
  firstPanel.before(guide);
}

function installGuideStyles() {
  if (document.querySelector('#adminJapaneseGuideStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminJapaneseGuideStyles';
  style.textContent = `
    .admin-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
    .admin-guide-action{display:block;width:100%;padding:13px 14px;border:1px solid #293746;border-radius:10px;background:#0f161e;color:inherit;text-align:left;cursor:pointer}
    .admin-guide-action:hover,.admin-guide-action:focus-visible{border-color:#7289ff;background:#131d2a}
    .admin-guide-action strong{display:block;margin-bottom:5px}
    .admin-guide-action span{display:block;color:#9ba8b6;font-size:.88rem;line-height:1.5}
    .admin-guide-highlight{animation:adminGuideHighlight 1.4s ease}
    @keyframes adminGuideHighlight{0%,100%{box-shadow:none}25%,70%{box-shadow:0 0 0 2px #7289ff}}
    @media(max-width:720px){.admin-guide-grid{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function makeGoogleLinksClearer() {
  document.querySelectorAll('#eventList a.small').forEach(link => {
    if (link.textContent?.trim() === 'Google') link.textContent = 'Googleカレンダーで開く';
  });
}

function applyJapaneseAdminUi() {
  replaceEnglishEyebrows();
  replaceTechnicalLabels();
  replaceTechnicalSentences();
  preparePanelIds();
  installGuideStyles();
  installBeginnerGuide();
  makeGoogleLinksClearer();
  const heading = document.querySelector('.topbar h1');
  if (heading && heading.textContent !== 'Reactus 管理画面') heading.textContent = 'Reactus 管理画面';
}

const japaneseUiObserver = new MutationObserver(() => applyJapaneseAdminUi());
japaneseUiObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
applyJapaneseAdminUi();
