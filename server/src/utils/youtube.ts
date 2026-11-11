const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts an 11-character YouTube video ID from any common URL shape
 * (watch, youtu.be, shorts, embed, live, mobile) or from a bare ID.
 * Returns null for anything that is not clearly a YouTube video.
 */
export function extractVideoId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;

  if (VIDEO_ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let candidate: string | null = null;

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] || null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v');
    } else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/);
      candidate = match ? match[1] : null;
    }
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** The only URL shape we ever hand to yt-dlp — never user input verbatim. */
export function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
