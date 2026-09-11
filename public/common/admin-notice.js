export const ADMIN_NOTICE_EVENT = 'reactus:admin-notice';

export function showAdminNotice(message, { error = false, duration = 7000 } = {}) {
  const requestedDuration = Number(duration);
  const safeDuration = Number.isFinite(requestedDuration) && requestedDuration >= 0
    ? requestedDuration
    : 7000;

  document.dispatchEvent(new CustomEvent(ADMIN_NOTICE_EVENT, {
    detail: {
      message: String(message ?? ''),
      error: Boolean(error),
      duration: safeDuration,
    },
  }));
}
