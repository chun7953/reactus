export function analyzeAnnouncementMentions(text) {
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

export function hasAnnouncementMentions(info) {
  return Boolean(info?.everyone || info?.here || info?.roleCount || info?.userCount);
}

export function mentionSummary(info) {
  const parts = [];
  if (info?.everyone) parts.push('@everyone');
  if (info?.here) parts.push('@here');
  if (info?.roleCount) parts.push(`ロール ${info.roleCount}件`);
  if (info?.userCount) parts.push(`ユーザー ${info.userCount}件`);
  return parts.join('、');
}
