const japaneseLabels = new Map([
  ['NEW SCHEDULE', '新しい予定'],
  ['EDIT SCHEDULE', '予定を編集中'],
  ['UPCOMING', '今後の予定'],
  ['CALENDAR', '月カレンダー'],
  ['REACTIONS', '自動リアクション'],
  ['DISCORD PREVIEW', 'Discord投稿イメージ'],
  ['CALENDAR INTEGRATION', 'カレンダー連携'],
  ['DUPLICATE', '予定を複製'],
  ['HISTORY', '予定の履歴'],
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
]);

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

function installBeginnerGuide() {
  if (document.querySelector('#adminBeginnerGuide')) return;
  const app = document.querySelector('#app');
  if (!app) return;
  const firstPanel = app.querySelector(':scope > .panel');
  if (!firstPanel) return;
  const guide = document.createElement('section');
  guide.id = 'adminBeginnerGuide';
  guide.className = 'panel';
  guide.innerHTML = `
    <h2>この画面でできること</h2>
    <p class="hint">普段使う機能を、Discordのコマンドを覚えなくても設定できます。</p>
    <div class="admin-guide-grid">
      <div><strong>予定を投稿する</strong><p>通常投稿や抽選を日時指定・繰り返しで登録できます。</p></div>
      <div><strong>チャンネル下部に案内を出す</strong><p>新しい発言があっても、案内文を一番下へ表示し直せます。</p></div>
      <div><strong>自動リアクションを設定する</strong><p>特定の言葉を含む投稿へ、指定した絵文字を自動で付けられます。</p></div>
      <div><strong>接続設定を変更する</strong><p>Googleカレンダーや投稿先を変えるときだけ使います。普段は触らなくて大丈夫です。</p></div>
    </div>`;
  firstPanel.before(guide);
}

function installGuideStyles() {
  if (document.querySelector('#adminJapaneseGuideStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminJapaneseGuideStyles';
  style.textContent = `
    .admin-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
    .admin-guide-grid>div{padding:12px;border:1px solid #293746;border-radius:10px;background:#0f161e}
    .admin-guide-grid p{margin:5px 0 0;color:#9ba8b6;font-size:.88rem;line-height:1.5}
    @media(max-width:720px){.admin-guide-grid{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function applyJapaneseAdminUi() {
  replaceEnglishEyebrows();
  replaceTechnicalLabels();
  installGuideStyles();
  installBeginnerGuide();
  const heading = document.querySelector('.topbar h1');
  if (heading && heading.textContent !== 'Reactus 管理画面') heading.textContent = 'Reactus 管理画面';
}

const japaneseUiObserver = new MutationObserver(() => applyJapaneseAdminUi());
japaneseUiObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
applyJapaneseAdminUi();
