const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let bootstrap = null;

async function api(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function installStyles() {
  if ($('#discordPreviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'discordPreviewStyles';
  style.textContent = `
    .discord-preview-wrap{display:grid;gap:10px}
    .discord-message-preview{background:#313338;border-radius:8px;padding:14px 16px;color:#dbdee1;border:1px solid #3f4147}
    .discord-message-preview strong{color:#f2f3f5}
    .discord-preview-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
    .discord-preview-meta{font-size:.78rem;color:#949ba4;margin-bottom:8px}
    .discord-giveaway-preview{border-left:4px solid #5865f2;background:#2b2d31;border-radius:4px;padding:12px;margin-top:8px}
    .discord-giveaway-title{font-weight:800;color:#f2f3f5;margin-bottom:8px}
    .discord-button-preview{display:inline-block;margin-top:10px;padding:7px 12px;border-radius:4px;background:#5865f2;color:#fff;font-size:.86rem}
    .discord-preview-image{max-width:min(100%,520px);max-height:300px;object-fit:contain;border-radius:8px;margin-top:10px}
    .discord-reaction-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px}
    .discord-reaction-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #4e5058;background:#2b2d31;border-radius:8px;padding:4px 7px;font-size:.9rem}
    .discord-reaction-chip img{width:20px;height:20px;object-fit:contain}
    .discord-preview-warning{color:#f0b8b8;font-size:.86rem}
  `;
  document.head.append(style);
}

function monitor() {
  if (!bootstrap) return null;
  return bootstrap.monitors?.find(item => String(item.id) === String($('#monitor')?.value));
}

function roleName(id) {
  if (!id) return null;
  return bootstrap?.roles?.find(role => String(role.id) === String(id))?.name || id;
}

function selectedMention() {
  const mode = $('#mentionMode')?.value || 'default';
  if (mode === 'none') return null;
  if (mode === 'role') {
    const id = $('#mentionRole')?.value;
    return id ? `@${roleName(id)}` : null;
  }
  const id = monitor()?.defaultMentionRoleId;
  return id ? `@${roleName(id)}` : null;
}

function cleanBodyMentions(text) {
  const raw = String(text || '');
  const mentions = raw.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g) || [];
  const cleaned = raw.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
  return { cleaned, mentions };
}

function displayMentionToken(token) {
  const role = token.match(/^<@&(\d+)>$/);
  if (role) return `@${roleName(role[1])}`;
  if (token === '<@everyone>') return '@everyone';
  if (token === '<@here>') return '@here';
  return token;
}

function finalMentionText(rawBody) {
  const { mentions } = cleanBodyMentions(rawBody);
  const values = new Set(mentions.map(displayMentionToken));
  const configured = selectedMention();
  if (configured) values.add(configured);
  return [...values].join(' ');
}

function previewImage(container) {
  const source = $('#imagePreview');
  if (source && !source.classList.contains('hidden') && source.src) {
    const image = document.createElement('img');
    image.className = 'discord-preview-image';
    image.src = source.src;
    image.alt = '投稿画像プレビュー';
    container.append(image);
    return;
  }
  const label = String($('#imageName')?.textContent || '');
  if (label.includes('現在の画像あり')) {
    const p = document.createElement('p');
    p.className = 'discord-preview-meta';
    p.textContent = '画像: 既存画像を添付';
    container.append(p);
  }
}

function reactionDescriptorNode(descriptor) {
  const chip = document.createElement('span');
  chip.className = 'discord-reaction-chip';
  if (descriptor?.type === 'unicode') {
    chip.textContent = descriptor.value;
    return chip;
  }
  if (descriptor?.type === 'custom') {
    const emoji = bootstrap?.guildEmojis?.find(item => String(item.id) === String(descriptor.id));
    if (emoji) {
      const image = document.createElement('img');
      image.src = emoji.url;
      image.alt = `:${emoji.name}:`;
      const name = document.createElement('span');
      name.textContent = `:${emoji.name}:`;
      chip.append(image, name);
    } else {
      chip.textContent = `custom:${descriptor.id}`;
    }
  }
  return chip;
}

function appendReactionPreview(container, content) {
  const m = monitor();
  if (!m || !bootstrap?.reactionRules) return;
  const rule = bootstrap.reactionRules.find(item =>
    String(item.channelId) === String(m.channelId) && String(content).includes(String(item.trigger || ''))
  );
  if (!rule) return;

  const meta = document.createElement('div');
  meta.className = 'discord-preview-meta';
  meta.textContent = `自動リアクション（反応する言葉: ${rule.trigger}）`;
  container.append(meta);

  if (rule.invalid) {
    const warning = document.createElement('div');
    warning.className = 'discord-preview-warning';
    warning.textContent = `既存設定にDiscordで使えない絵文字があります: ${rule.rawEmojis || ''}`;
    container.append(warning);
    return;
  }

  const line = document.createElement('div');
  line.className = 'discord-reaction-line';
  for (const descriptor of rule.emojis || []) line.append(reactionDescriptorNode(descriptor));
  container.append(line);
}

function normalPreview(container) {
  const m = monitor();
  const trigger = m?.triggerKeyword || 'キーワード';
  const title = String($('#title')?.value || '').trim() || 'タイトル';
  const rawBody = $('#body')?.value || '';
  const { cleaned } = cleanBodyMentions(rawBody);
  const mentions = finalMentionText(rawBody);
  let content = `**【${trigger}】${title}**`;
  if (cleaned) content += `\n${cleaned}`;
  if (mentions) content += `\n\n${mentions}`;

  const card = document.createElement('div');
  card.className = 'discord-message-preview';
  const meta = document.createElement('div');
  meta.className = 'discord-preview-meta';
  meta.textContent = `#${m?.channelName || '投稿先'} に送信`;
  const body = document.createElement('div');
  body.className = 'discord-preview-body';
  body.textContent = content;
  card.append(meta, body);
  previewImage(card);
  appendReactionPreview(card, content);
  container.append(card);
}

function parseJstDateTimeInput(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const local = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  const date = local
    ? new Date(`${local[1]}T${local[2]}:${local[3] || '00'}+09:00`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEndTime(value) {
  const date = parseJstDateTimeInput(value);
  if (!date) return '終了日時未入力';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function giveawayPreview(container) {
  const m = monitor();
  const rows = $$('.prize-row');
  const endText = formatEndTime($('#endTime')?.value);
  const prizes = rows.map((row, index) => ({
    name: row.querySelector('.prize-name')?.value?.trim() || `景品${index + 1}`,
    winners: Math.max(1, Number(row.querySelector('.prize-winners')?.value || 1)),
  }));

  const intro = document.createElement('p');
  intro.className = 'discord-preview-meta';
  intro.textContent = `#${m?.channelName || '投稿先'} に ${prizes.length}件の抽選を上から連続投稿`;
  container.append(intro);

  for (const prize of prizes) {
    const card = document.createElement('div');
    card.className = 'discord-message-preview discord-giveaway-preview';
    const title = document.createElement('div');
    title.className = 'discord-giveaway-title';
    title.textContent = `🎉 景品: ${prize.name}`;
    const body = document.createElement('div');
    body.className = 'discord-preview-body';
    body.textContent = `リアクションを押して参加しよう！\n終了日時: ${endText}\n当選者数: ${prize.winners}名`;
    const button = document.createElement('span');
    button.className = 'discord-button-preview';
    button.textContent = '🎉 参加する';
    card.append(title, body, button);
    container.append(card);
  }

  const rawMessage = $('#message')?.value || '';
  const { cleaned } = cleanBodyMentions(rawMessage);
  const mentions = finalMentionText(rawMessage);
  const content = [mentions, cleaned].filter(Boolean).join('\n');
  const hasImage = !$('#imagePreview')?.classList.contains('hidden') || String($('#imageName')?.textContent || '').includes('現在の画像あり');
  if (content || hasImage) {
    const final = document.createElement('div');
    final.className = 'discord-message-preview';
    const meta = document.createElement('div');
    meta.className = 'discord-preview-meta';
    meta.textContent = 'すべての抽選投稿のあとに1回送信';
    const body = document.createElement('div');
    body.className = 'discord-preview-body';
    body.textContent = content || '（本文なし・画像のみ）';
    final.append(meta, body);
    previewImage(final);
    container.append(final);
  }
}

function render() {
  const container = $('#discordPreviewContent');
  if (!container) return;
  container.replaceChildren();
  const type = $('#scheduleType')?.value || 'post';
  if (type === 'giveaway') giveawayPreview(container);
  else normalPreview(container);
}

function installPanel() {
  if ($('#discordPreviewPanel')) return;
  const formPanel = $('#scheduleForm')?.closest('.panel');
  if (!formPanel) return;
  const section = document.createElement('section');
  section.id = 'discordPreviewPanel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="section-head">
      <div><p class="eyebrow">DISCORD PREVIEW</p><h2>投稿プレビュー</h2></div>
    </div>
    <p class="hint">Googleカレンダーへ保存する前に、Discordへ実際に送られる並び・メンション・画像・自動リアクションを確認できます。</p>
    <div id="discordPreviewContent" class="discord-preview-wrap"></div>`;
  formPanel.after(section);
}

async function initialize() {
  installStyles();
  installPanel();
  try {
    bootstrap = await api('/api/admin/bootstrap');
  } catch {
    return;
  }
  render();
  const form = $('#scheduleForm');
  if (form) {
    form.addEventListener('input', render);
    form.addEventListener('change', () => window.setTimeout(render, 0));
    const observer = new MutationObserver(() => render());
    observer.observe(form, { childList: true, subtree: true });
  }
  document.addEventListener('click', event => {
    if (event.target?.matches?.('.segment, #addPrize, .prize-row .danger, #clearImage')) {
      window.setTimeout(render, 0);
    }
  });
}

void initialize();
