// TIDAL serves images from a raw image id returned by the API. The resolution
// suffix is not part of the id, so it is appended here when building the URL.
export function artworkUrl(coverId: string | null | undefined, size = 640): string | undefined {
  if (!coverId) return undefined;
  return `https://tidal.com/images/${coverId}/${size}x${size}.jpg`;
}