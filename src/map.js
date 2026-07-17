export function createMapUrl(location) {
  const query = String(location || '').trim();
  return query ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : '';
}
