const beginnerActions = [
  { target: 'calendarOverview', title: 'カレンダーを見る', text: '登録済みの予定を月ごとに確認・移動できます。' },
  { target: 'schedulePanel', title: '予定・抽選を作る', text: '日時や繰り返しを決めて、Googleカレンダーへ登録します。' },
  { target: 'announcementPanel', title: 'チャンネル下部に案内を出す', text: '長文・改行・チャンネルリンクを含む案内文を設定できます。' },
  { target: 'reactionPanel', title: '自動リアクションを設定する', text: '指定した言葉を含む投稿へ絵文字を自動で付けます。' },
];

function jumpToAdminPanel(targetId) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.add('admin-guide-highlight');
  window.setTimeout(() => target.classList.remove('admin-guide-highlight'), 1400);
}

function installBeginnerGuide() {
  if (document.querySelector('#adminBeginnerGuide')) return;
  const schedulePanel = document.querySelector('#schedulePanel');
  if (!schedulePanel) return;

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
  schedulePanel.before(guide);
}

function installGuideStyles() {
  if (document.querySelector('#adminBeginnerGuideStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminBeginnerGuideStyles';
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

installGuideStyles();
installBeginnerGuide();
