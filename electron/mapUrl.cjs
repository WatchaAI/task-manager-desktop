function createMapUrl(location) {
  const query = typeof location === 'string' ? location.trim() : '';
  return query ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : '';
}

module.exports = {
  createMapUrl
};
