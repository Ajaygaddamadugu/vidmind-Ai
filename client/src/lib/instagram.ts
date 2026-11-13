const SHORTCODE = /^[A-Za-z0-9_-]{5,40}$/;

/** Mirrors the server's parser: instagram.com/reel/CODE, /reels/, /p/, /tv/ (optionally after /username/). */
export function extractInstagramId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (host !== 'instagram.com' && host !== 'instagr.am') return null;
  const code = url.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p|tv)\/([^/?#]+)/)?.[1];
  return code && SHORTCODE.test(code) ? code : null;
}

export const isInstagramId = (value: string) => SHORTCODE.test(value);
export const instagramUrl = (code: string) => `https://www.instagram.com/reel/${code}/`;
