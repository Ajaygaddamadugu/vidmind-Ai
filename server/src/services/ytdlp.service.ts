import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import ffmpegPath from 'ffmpeg-static';
import { env } from '../config/env';
import { canonicalUrl, thumbnailUrl } from '../utils/youtube';
import { friendlyYoutubeError, HttpError } from '../utils/httpError';
import { runPython, ytdlpBaseArgs } from './python.service';

export interface VideoQuality {
  id: string;            // '1080p', '720p', ...
  height: number;
  label: string;         // '1080p · Full HD'
  videoFormatId: string; // yt-dlp video-only (or muxed) format id
  muxed: boolean;        // format already contains audio
  videoSizeBytes: number | null;
}

export interface AudioTrack {
  id: string;            // yt-dlp audio format id
  language: string | null;
  label: string;         // 'English (original)'
  isOriginal: boolean;
  sizeBytes: number | null;
}

export interface VideoMetadata {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  url: string;
  qualities: VideoQuality[];
  audioTracks: AudioTrack[];
}

const TARGET_HEIGHTS: { height: number; id: string; label: string }[] = [
  { height: 2160, id: '2160p', label: '2160p · 4K' },
  { height: 1440, id: '1440p', label: '1440p · 2K' },
  { height: 1080, id: '1080p', label: '1080p · Full HD' },
  { height: 720, id: '720p', label: '720p · HD' },
  { height: 480, id: '480p', label: '480p' },
  { height: 360, id: '360p', label: '360p' },
  { height: 240, id: '240p', label: '240p · Data saver' },
];

/**
 * Fetches metadata and a cleaned-up list of download options via `yt-dlp -J`.
 */
export async function getVideoMetadata(videoId: string): Promise<VideoMetadata> {
  let stdout: string;
  try {
    ({ stdout } = await runPython([...ytdlpBaseArgs(), '-J', '--', canonicalUrl(videoId)], 90_000));
  } catch (err: any) {
    throw friendlyYoutubeError(err.stderr || err.message || '');
  }

  let info: any;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new HttpError(502, 'YouTube returned an unexpected response. Please try again.');
  }

  if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
    throw new HttpError(400, 'Live streams are not supported. Try again after the stream ends.', 'LIVE');
  }

  const duration = Math.round(info.duration || 0);
  const formats: any[] = (info.formats || []).filter(
    (f: any) => !f.has_drm && f.ext !== 'mhtml' && f.protocol !== 'mhtml'
  );

  const audioTracks = parseAudioTracks(formats, duration);
  const qualities = parseQualities(formats, duration);

  return {
    id: info.id || videoId,
    title: info.title || 'Untitled video',
    channel: info.channel || info.uploader || 'Unknown channel',
    duration,
    thumbnail: thumbnailUrl(videoId),
    url: canonicalUrl(videoId),
    qualities,
    audioTracks,
  };
}

function estimateSize(f: any, duration: number): number | null {
  const size = f.filesize || f.filesize_approx;
  if (size) return size;
  if (f.tbr && duration) return Math.round((duration * f.tbr * 1000) / 8);
  return null;
}

function parseAudioTracks(formats: any[], duration: number): AudioTrack[] {
  const audio = formats.filter(
    (f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none' && !String(f.format_id).includes('drc')
  );

  // Group by language, keep the best one per language.
  // Prefer m4a (AAC) because it merges into MP4 and plays everywhere.
  const byLang = new Map<string, any>();
  for (const f of audio) {
    const key = f.language || 'default';
    const current = byLang.get(key);
    const score = (x: any) => (x.ext === 'm4a' ? 1_000_000 : 0) + (x.tbr || x.abr || 0);
    if (!current || score(f) > score(current)) byLang.set(key, f);
  }

  const tracks: AudioTrack[] = [...byLang.values()].map((f) => {
    const note = String(f.format_note || '');
    const isOriginal = /original|default/i.test(note) || (f.language_preference ?? -1) >= 10;
    const langName = note.split(/\s+(original|default|,)/i)[0].replace(/,.*$/, '').trim();
    return {
      id: String(f.format_id),
      language: f.language || null,
      label: (langName && !/^(low|medium|high|ultralow)$/i.test(langName) ? langName : f.language || 'Default') + (isOriginal ? ' (original)' : ''),
      isOriginal,
      sizeBytes: estimateSize(f, duration),
    };
  });

  tracks.sort((a, b) => Number(b.isOriginal) - Number(a.isOriginal) || a.label.localeCompare(b.label));
  if (tracks.length === 1) tracks[0].label = 'Default';
  return tracks;
}

function parseQualities(formats: any[], duration: number): VideoQuality[] {
  const video = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height);
  const codecRank = (vcodec: string) => (vcodec.startsWith('avc1') ? 3 : vcodec.startsWith('vp') ? 2 : 1);

  const result: VideoQuality[] = [];
  for (const target of TARGET_HEIGHTS) {
    const matches = video.filter((f) => Math.abs(f.height - target.height) <= 20 || (target.height === 2160 && f.height > 2160));
    if (matches.length === 0) continue;

    // Prefer video-only streams (so the chosen audio language applies), then H.264
    // (plays in every player), then highest bitrate.
    const isMuxed = (f: any) => (f.acodec && f.acodec !== 'none' ? 1 : 0);
    matches.sort(
      (a, b) => isMuxed(a) - isMuxed(b) || codecRank(b.vcodec) - codecRank(a.vcodec) || (b.tbr || 0) - (a.tbr || 0)
    );
    const best = matches[0];
    result.push({
      id: target.id,
      height: target.height,
      label: target.label,
      videoFormatId: String(best.format_id),
      muxed: !!best.acodec && best.acodec !== 'none',
      videoSizeBytes: estimateSize(best, duration),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  percent: number;        // 0-100 overall
  speedBps: number | null;
  etaSeconds: number | null;
  phase: 'downloading' | 'merging' | 'converting';
}

export interface DownloadHandle {
  promise: Promise<string>;
  cancel: () => void;
}

const PROGRESS_PREFIX = 'VMPROG';
const SUBTITLE_EXT = /\.(vtt|srt|ttml|srv\d|json3)$/i;

/**
 * Runs yt-dlp to download `formatSelector` into DOWNLOAD_DIR/<fileBase>.<ext>.
 * Reports overall progress across the video + audio streams and the merge step.
 */
export function downloadMedia(
  videoId: string,
  formatSelector: string,
  audioOnly: boolean,
  fileBase: string,
  onProgress: (p: DownloadProgress) => void
): DownloadHandle {
  fs.mkdirSync(env.DOWNLOAD_DIR, { recursive: true });

  const args = [...ytdlpBaseArgs(), '--newline', '--no-part', '--no-mtime'];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  args.push('-f', formatSelector);
  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('--merge-output-format', 'mp4');
  }
  args.push(
    '--progress-template',
    `download:${PROGRESS_PREFIX} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s |%(progress.filename)s`,
    '-o',
    path.join(env.DOWNLOAD_DIR, `${fileBase}.%(ext)s`),
    '--',
    canonicalUrl(videoId)
  );

  const streamCount = audioOnly || !formatSelector.includes('+') ? 1 : 2;
  let child: ChildProcess | null = null;
  let cancelled = false;

  const promise = new Promise<string>((resolve, reject) => {
    child = spawn(env.PYTHON_BIN, args, { windowsHide: true });

    let stderr = '';
    let streamIndex = -1;
    let lastFile = '';
    let lastPercent = 0;

    const report = (p: DownloadProgress) => {
      // Never move backwards — keeps the progress bar calm.
      p.percent = Math.max(lastPercent, Math.min(99.5, p.percent));
      lastPercent = p.percent;
      onProgress(p);
    };

    let buffer = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith(PROGRESS_PREFIX)) {
          const [nums, filename = ''] = line.slice(PROGRESS_PREFIX.length + 1).split('|');
          if (SUBTITLE_EXT.test(filename)) continue;
          if (filename !== lastFile) {
            lastFile = filename;
            streamIndex = Math.min(streamIndex + 1, streamCount - 1);
          }
          const [done, total, estimate, speed, eta] = nums.trim().split(' ').map((n) => (n === 'NA' ? NaN : Number(n)));
          const size = Number.isFinite(total) ? total : estimate;
          const fraction = Number.isFinite(size) && size > 0 ? Math.min(1, done / size) : 0;
          // First stream (video) is ~85% of the work when there are two.
          const weights = streamCount === 2 ? [0.85, 0.12] : [0.97];
          const base = weights.slice(0, Math.max(0, streamIndex)).reduce((a, b) => a + b, 0);
          report({
            percent: (base + weights[Math.max(0, streamIndex)] * fraction) * 100,
            speedBps: Number.isFinite(speed) ? speed : null,
            etaSeconds: Number.isFinite(eta) ? eta : null,
            phase: 'downloading',
          });
        } else if (line.includes('[Merger]')) {
          report({ percent: 98, speedBps: null, etaSeconds: null, phase: 'merging' });
        } else if (line.includes('[ExtractAudio]')) {
          report({ percent: 98, speedBps: null, etaSeconds: null, phase: 'converting' });
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    child.on('error', (err) => reject(friendlyYoutubeError(err.message)));

    child.on('close', (code) => {
      if (cancelled) return reject(new HttpError(499, 'Download cancelled', 'CANCELLED'));
      if (code !== 0) {
        console.error(`[yt-dlp] download failed (${code}):`, stderr.slice(-2000));
        removeFilesWithPrefix(fileBase);
        return reject(friendlyYoutubeError(stderr));
      }
      const wantedExt = audioOnly ? '.mp3' : '.mp4';
      const files = fs.readdirSync(env.DOWNLOAD_DIR).filter((f) => f.startsWith(fileBase));
      const finalFile = files.find((f) => f.endsWith(wantedExt)) || files.find((f) => !SUBTITLE_EXT.test(f));
      if (!finalFile) return reject(new HttpError(500, 'Download finished but the file was not found.'));
      resolve(path.join(env.DOWNLOAD_DIR, finalFile));
    });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      child?.kill();
      // Give Windows a moment to release file handles before cleanup.
      setTimeout(() => removeFilesWithPrefix(fileBase), 1500);
    },
  };
}

export function removeFilesWithPrefix(prefix: string) {
  if (!fs.existsSync(env.DOWNLOAD_DIR)) return;
  for (const f of fs.readdirSync(env.DOWNLOAD_DIR)) {
    if (f.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(env.DOWNLOAD_DIR, f));
      } catch {
        /* file still locked — the periodic sweep will get it */
      }
    }
  }
}
