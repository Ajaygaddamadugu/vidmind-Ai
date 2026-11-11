const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Mirrors the server's parser: watch, youtu.be, shorts, embed, live, mobile, or a bare ID. */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') candidate = url.pathname.split('/')[1] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    candidate =
      url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/)?.[1] || null;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const watchUrl = (id: string, t?: number) =>
  `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.floor(t)}s` : ''}`;
