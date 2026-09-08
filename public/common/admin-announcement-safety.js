function analyzeAnnouncementMentions(text) {
  const value = String(text || '');
  const everyone = /(^|\s)@everyone\b/i.test(value);
  const here = /(^|\s)@here\b/i.test(value);
  const roles = [...value.matchAll(/<@&(\d{15,22})>/g)].map(match => match[1]);
  const users = [...value.matchAll(/<@!?(\d{15,22})>/g)].map(match => match[1]);
  return {
    everyone,
    here,
    roleCount: new Set(roles).size,
    userCount: new Set(users).size,
  };
}

function hasAnnouncementMentions(info) {
  return Boolean(info.everyone || info.here || info.roleCount || info.userCount);
}

function mentionSummary(info) {
  const parts = [];
  if (info.everyone) parts.push('@everyone');
  if (info.here) parts.push('@here');
  if (info.roleCount) parts.push(`ロール ${info.roleCount}件`);
  if (info.userCount) parts.push(`ユーザー ${info.userCount}件`);
  return parts.join('、');
}

function installStyles() {
  if (document.querySelector('#announcementMentionSafetyStyles')) return;
  const style = document.createElement('style');
  style.id = 'announcementMentionSafetyStyles';
  style.textContent = `
    .announcement-mention-warning{margin-top:8px;padding:10px 12px;border:1px solid #76572a;border-radius:9px;background:#21190e;color:#f3d49a;line-height:1.5}
    .announcement-channel-link-note{margin-top:6px;color:#91a0af;font-size:.82rem}
  `;
  document.head.append(style);
}

function ensureSafetyUi() {
  const textarea = document.querySelector('#announcementMessage');
  if (!textarea) return false;

  if (!document.querySelector('#announcementMentionWarning')) {
    const warning = document.createElement('div');
    warning.id = 'announcementMentionWarning';
    warning.className = 'announcement-mention-warning hidden';
    warning.setAttribute('role', 'alert');
    const countRow = textarea.closest('label')?.querySelector('.announcement-count-row');
    if (countRow) countRow.after(warning);
    else textarea.after(warning);
  }

  const linkRow = document.querySelector('.announcement-link-row');
  if (linkRow && !document.querySelector('#announcementChannelLinkNote')) {
    const note = document.createElement('div');
    note.id = 'announcementChannelLinkNote';
    note.className = 'announcement-channel-link-note';
    note.textContent = 'チャンネルへのリンクは通知を送りません。案内先を示したいだけなら、メンションではなくこちらを使うのがおすすめです。';
    linkRow.after(note);
  }

  renderMentionWarning();
  return true;
}

function renderMentionWarning() {
  const textarea = document.querySelector('#announcementMessage');
  const warning = document.querySelector('#announcementMentionWarning');
  if (!textarea || !warning) return;
  const info = analyzeAnnouncementMentions(textarea.value);
  if (!hasAnnouncementMentions(info)) {
    warning.textContent = '';
    warning.classList.add('hidden');
    return;
  }
  warning.textContent = `⚠ メンションが含まれています（${mentionSummary(info)}）。この案内は新しい発言のたびに一番下へ再投稿されるため、そのたびに通知される可能性があります。`;
  warning.classList.remove('hidden');
}

function confirmMentionedAnnouncement(message) {
  const info = analyzeAnnouncementMentions(message);
  if (!hasAnnouncementMentions(info)) return true;
  return window.confirm(
    `この案内にはメンションが含まれています（${mentionSummary(info)}）。\n\n` +
    'チャンネルに新しい発言があるたび案内が再投稿されるため、メンションも繰り返し通知される可能性があります。\n\n' +
    'このまま保存しますか？',
  );
}

installStyles();

const observer = new MutationObserver(() => ensureSafetyUi());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureSafetyUi();

document.addEventListener('input', event => {
  if (event.target?.id === 'announcementMessage') renderMentionWarning();
});

document.addEventListener('submit', event => {
  if (event.target?.id !== 'announcementForm') return;
  const message = document.querySelector('#announcementMessage')?.value || '';
  if (confirmMentionedAnnouncement(message)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

export { analyzeAnnouncementMentions, hasAnnouncementMentions, mentionSummary };
