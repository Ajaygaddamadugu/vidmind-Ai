import { env } from '../config/env';
import { HttpError, friendlyInstagramError } from '../utils/httpError';
import { instagramUrl } from '../utils/instagram';
import { runPython, ytdlpBaseArgs } from './python.service';
import type { AudioTrack, MediaSource, VideoMetadata, VideoQuality } from './ytdlp.service';

/*
 * Instagram reels are download-only: no captions, so no transcript / summary / chat.
 * Metadata is cached in memory (thumbnail URLs from Instagram's CDN expire, so it isn't persisted).
 */

const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { info: VideoMetadata; expiresAt: number }>();
const inflight = new Map<string, Promise<VideoMetadata>>();

const STANDARD_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240];

export function instagramSource(code: string): MediaSource {
  return { url: instagramUrl(code), cookiesFile: env.INSTAGRAM_COOKIES_FILE, toError: friendlyInstagramError };
}

export async function getInstagramInfo(code: string): Promise<VideoMetadata> {
  const hit = cache.get(code);
  if (hit && hit.expiresAt > Date.now()) return hit.info;

  const pending = inflight.get(code);
  if (pending) return pending;

  const job = fetchInstagramInfo(code)
    .then((info) => {
      cache.set(code, { info, expiresAt: Date.now() + CACHE_TTL_MS });
      return info;
    })
    .finally(() => inflight.delete(code));
  inflight.set(code, job);
  return job;
}

async function fetchInstagramInfo(code: string): Promise<VideoMetadata> {
  const source = instagramSource(code);
  let stdout: string;
  try {
    ({ stdout } = await runPython([...ytdlpBaseArgs(source.cookiesFile), '-J', '--', source.url], 60_000));
  } catch (err: any) {
    const raw = String(err.stderr || err.message || '');
    console.error(`[yt-dlp] instagram metadata failed for ${code}:`, raw.slice(-1500));
    throw friendlyInstagramError(raw);
  }

  let info: any;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new HttpError(502, 'Instagram returned an unexpected response. Please try again.');
  }
  // Carousel posts come back as a playlist — use the first video in it.
  if (info._type === 'playlist') info = (info.entries || []).find((e: any) => e?.formats?.length) || info;

  const formats: any[] = (info.formats || []).filter((f: any) => !f.has_drm);
  if (!formats.some((f) => f.vcodec !== 'none')) {
    throw new HttpError(400, 'This post has no video. Only reels and video posts can be downloaded.', 'IG_NO_VIDEO');
  }

  const duration = Math.round(info.duration || 0);
  if (duration > env.MAX_VIDEO_DURATION_SECONDS) {
    throw new HttpError(400, 'This video is too long to download.', 'TOO_LONG');
  }

  const username = info.channel || info.uploader_id || '';
  const caption = String(info.description || '').split('\n')[0].trim();
  const title = caption ? (caption.length > 90 ? `${caption.slice(0, 87).trimEnd()}…` : caption) : username ? `Reel by @${username}` : 'Instagram reel';

  return {
    id: code,
    title,
    channel: username ? `@${username}` : info.uploader || 'Instagram',
    duration,
    thumbnail: info.thumbnail || '',
    url: instagramUrl(code),
    qualities: parseQualities(formats),
    audioTracks: parseAudio(formats),
  };
}

function parseAudio(formats: any[]): AudioTrack[] {
  const audio = formats
    .filter((f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
    .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
  return audio ? [{ id: String(audio.format_id), language: null, label: 'Default', isOriginal: true, sizeBytes: audio.filesize || null }] : [];
}

/** One option per resolution, named after the nearest standard size (reels are vertical, so use the short side). */
function parseQualities(formats: any[]): VideoQuality[] {
  const byId = new Map<string, { height: number; f: any; muxed: boolean }>();
  for (const f of formats) {
    if (f.vcodec === 'none' || !f.width || !f.height) continue;
    const short = Math.min(f.width, f.height);
    const height = STANDARD_HEIGHTS.reduce((best, h) => (Math.abs(h - short) < Math.abs(best - short) ? h : best));
    const muxed = !!f.acodec && f.acodec !== 'none';
    const id = `${height}p`;
    const current = byId.get(id);
    if (!current || (f.tbr || 0) > (current.f.tbr || 0)) byId.set(id, { height, f, muxed });
  }

  const qualities: VideoQuality[] = [...byId.entries()]
    .sort((a, b) => b[1].height - a[1].height)
    .map(([id, { height, f, muxed }]) => ({
      id,
      height,
      label: id,
      videoFormatId: String(f.format_id),
      muxed,
      videoSizeBytes: f.filesize || f.filesize_approx || null,
    }));

  // Some posts only expose progressive MP4s without dimensions — let yt-dlp pick the best one.
  return qualities.length > 0
    ? qualities
    : [{ id: 'best', height: 0, label: 'Best quality', videoFormatId: 'b', muxed: true, videoSizeBytes: null }];
}
