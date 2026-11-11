import type { RecentVideo, VideoInfo } from '../types';

const RECENT_KEY = 'vidmind_recent_v1';
const MAX_RECENT = 8;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — not critical */
  }
}

export function getRecentVideos(): RecentVideo[] {
  return read<RecentVideo[]>(RECENT_KEY, []);
}

export function addRecentVideo(video: VideoInfo) {
  const list = getRecentVideos().filter((v) => v.id !== video.id);
  list.unshift({ id: video.id, title: video.title, channel: video.channel, duration: video.duration, viewedAt: Date.now() });
  write(RECENT_KEY, list.slice(0, MAX_RECENT));
}

export function removeRecentVideo(id: string) {
  write(RECENT_KEY, getRecentVideos().filter((v) => v.id !== id));
}

export function getChatSessionId(videoId: string): string | null {
  return read<string | null>(`vidmind_chat_${videoId}`, null);
}

export function setChatSessionId(videoId: string, sessionId: string | null) {
  if (sessionId) write(`vidmind_chat_${videoId}`, sessionId);
  else {
    try {
      localStorage.removeItem(`vidmind_chat_${videoId}`);
    } catch {
      /* ignore */
    }
  }
}
