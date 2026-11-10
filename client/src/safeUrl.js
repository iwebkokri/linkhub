// The server already refuses anything but http(s)/mailto/tel, but the public page is the
// last line of defence: never render an href with any other scheme (e.g. javascript:).
export function safeHref(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.toString() : '#';
  } catch {
    return '#';
  }
}

export function opensInNewTab(url) {
  return /^https?:/i.test(url);
}
