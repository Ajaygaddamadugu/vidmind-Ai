const SHORTCODE = /^[A-Za-z0-9_-]{5,40}$/;

/**
 * Extracts an Instagram post shortcode from reel / post / IGTV links
 * (instagram.com/reel/CODE, /reels/CODE, /p/CODE, /tv/CODE, also with a /username/ prefix).
 * Returns null for anything else, including profile and story links.
 */
export function extractInstagramId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (host !== 'instagram.com' && host !== 'instagr.am') return null;

  const match = url.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p|tv)\/([^/?#]+)/);
  const code = match?.[1];
  return code && SHORTCODE.test(code) ? code : null;
}

/** Bare shortcode (as used in our own URLs and API paths). */
export function isInstagramId(value: unknown): value is string {
  return typeof value === 'string' && SHORTCODE.test(value);
}

/** The only URL shape we ever hand to yt-dlp — never user input verbatim. */
export function instagramUrl(code: string): string {
  return `https://www.instagram.com/reel/${code}/`;
}
