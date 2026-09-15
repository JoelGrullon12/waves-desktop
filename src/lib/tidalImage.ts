// TIDAL serves artwork over HTTPS. The v2 API already resolves artwork to a
// CDN href (`https://resources.tidal.com/images/<uuid>/<size>.jpg`); the CDN
// only serves the exact sizes declared on the artwork resource, so a stored
// href is returned unchanged. Legacy always built the URL from the artwork id.
export function artworkUrl(coverId: string | null | undefined, size = 640): string | undefined {
  if (!coverId) return undefined;
  if (/^https?:\/\//.test(coverId)) return coverId;
  return `https://tidal.com/images/${coverId}/${size}x${size}.jpg`;
}