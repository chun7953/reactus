function channelLabel(channelId) {
  const option = [...document.querySelectorAll('#announcementLinkChannel option')]
    .find(item => String(item.value) === String(channelId));
  return option?.textContent?.trim() || `#${channelId}`;
}

function renderChannelLinks(node) {
  if (!node || node.dataset.channelLinksRendered === 'true') return;
  const text = node.textContent || '';
  const matches = [...text.matchAll(/<#(\d{15,22})>/g)];
  if (!matches.length) {
    node.dataset.channelLinksRendered = 'true';
    return;
  }

  node.replaceChildren();
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) node.append(document.createTextNode(text.slice(cursor, match.index)));
    const channel = document.createElement('span');
    channel.className = 'announcement-channel-preview';
    channel.textContent = channelLabel(match[1]);
    node.append(channel);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) node.append(document.createTextNode(text.slice(cursor)));
  node.dataset.channelLinksRendered = 'true';
}

function renderAnnouncementListLinks() {
  document.querySelectorAll('.announcement-card-text').forEach(renderChannelLinks);
}

const observer = new MutationObserver(() => renderAnnouncementListLinks());
observer.observe(document.documentElement, { childList: true, subtree: true });
renderAnnouncementListLinks();
