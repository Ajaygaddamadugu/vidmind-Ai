import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { toSrt } from '../utils/time';
import { downloadMedia, DownloadHandle, removeFilesWithPrefix } from './ytdlp.service';
import { getTranscriptData, getVideoInfo } from './video.service';


export type DownloadStatus = 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface DownloadJob {
  id: string;
  videoId: string;
  title: string;
  qualityId: string;           // '1080p' | ... | 'audio'
  audioTrackId: string;
  embedSubtitles: boolean;
  status: DownloadStatus;
  phase: string | null;        // human-readable current step
  progress: number;            // 0..100
  speedBps: number | null;
  etaSeconds: number | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  // internal
  formatSelector: string;
  fallbackSelector: string;
  audioOnly: boolean;
  fileBase: string;
  filePath: string | null;
  handle: DownloadHandle | null;
}

const FILE_PREFIX = 'vm_';
const jobs = new Map<string, DownloadJob>();
const queue: string[] = [];
let active = 0;

const ISO3: Record<string, string> = {
  en: 'eng', hi: 'hin', te: 'tel', ta: 'tam', kn: 'kan', ml: 'mal', mr: 'mar', bn: 'ben', gu: 'guj', pa: 'pan', ur: 'urd',
  es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ru: 'rus', ja: 'jpn', ko: 'kor', zh: 'zho', ar: 'ara', tr: 'tur',
  id: 'ind', vi: 'vie', th: 'tha', nl: 'nld', pl: 'pol', uk: 'ukr', fa: 'fas',
};
const iso3 = (code?: string | null) => ISO3[(code || '').split('-')[0].toLowerCase()] || 'und';

function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
      .replace(/[. ]+$/, '') || 'video'
  );
}

export function publicJob(job: DownloadJob) {
  const { formatSelector, fallbackSelector, audioOnly, fileBase, filePath, handle, ...rest } = job;
  return rest;
}

export async function createDownload(input: {
  videoId: string;
  qualityId: string;
  audioTrackId?: string;
  embedSubtitles?: boolean;
}): Promise<DownloadJob> {
  const info = await getVideoInfo(input.videoId);
  const audioTrack = info.audioTracks.find((a) => a.id === input.audioTrackId) || info.audioTracks[0];
  const audioOnly = input.qualityId === 'audio';
  const quality = info.qualities.find((q) => q.id === input.qualityId);

  if (!audioOnly && !quality) throw new HttpError(400, 'That quality is not available for this video.');
  if (!audioTrack && (audioOnly || !quality?.muxed)) throw new HttpError(400, 'No audio stream is available for this video.');

  const formatSelector = audioOnly
    ? audioTrack!.id
    : quality!.muxed || !audioTrack
      ? quality!.videoFormatId
      : `${quality!.videoFormatId}+${audioTrack.id}`;

  const h = quality?.height || 0;
  const fallbackSelector = audioOnly
    ? 'bestaudio[ext=m4a]/bestaudio'
    : `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;

  const id = uuidv4();
  const job: DownloadJob = {
    id,
    videoId: info.id,
    title: info.title,
    qualityId: audioOnly ? 'audio' : quality!.id,
    audioTrackId: audioTrack?.id || '',
    embedSubtitles: !audioOnly && !!input.embedSubtitles,
    status: 'queued',
    phase: 'Waiting in queue',
    progress: 0,
    speedBps: null,
    etaSeconds: null,
    fileName: null,
    fileSize: null,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    formatSelector,
    fallbackSelector,
    audioOnly,
    fileBase: `${FILE_PREFIX}${info.id}_${id.slice(0, 8)}`,
    filePath: null,
    handle: null,
  };

  jobs.set(id, job);
  queue.push(id);
  pump();
  return job;
}

export function getDownload(id: string): DownloadJob {
  const job = jobs.get(id);
  if (!job) throw new HttpError(404, 'This download has expired. Please start it again.');
  return job;
}

export function cancelDownload(id: string): DownloadJob {
  const job = getDownload(id);
  if (job.status === 'queued') {
    queue.splice(queue.indexOf(id), 1);
  } else if (job.status === 'downloading' || job.status === 'processing') {
    job.handle?.cancel();
  } else {
    return job;
  }
  job.status = 'cancelled';
  job.phase = 'Cancelled';
  job.finishedAt = Date.now();
  return job;
}

function pump() {
  while (active < env.MAX_CONCURRENT_DOWNLOADS && queue.length > 0) {
    const job = jobs.get(queue.shift()!);
    if (!job || job.status !== 'queued') continue;
    active++;
    run(job).finally(() => {
      active--;
      pump();
    });
  }
  // Update queue positions for waiting jobs.
  queue.forEach((id, i) => {
    const job = jobs.get(id);
    if (job) job.phase = i === 0 ? 'Next in queue' : `Waiting in queue (#${i + 1})`;
  });
}

// Status can flip to 'cancelled' while we await, so read it through a function.
const isCancelled = (job: DownloadJob) => job.status === 'cancelled';

async function run(job: DownloadJob) {
  job.status = 'downloading';
  job.phase = 'Starting download';
  const attempt = (selector: string) => {
    job.handle = downloadMedia(job.videoId, selector, job.audioOnly, job.fileBase, (p) => {
      if (isCancelled(job)) return;
      job.progress = Math.round(p.percent * 10) / 10;
      job.speedBps = p.speedBps;
      job.etaSeconds = p.etaSeconds;
      job.phase =
        p.phase === 'merging' ? 'Merging video and audio' : p.phase === 'converting' ? 'Converting to MP3' : 'Downloading';
      job.status = p.phase === 'downloading' ? 'downloading' : 'processing';
    });
    return job.handle.promise;
  };

  try {
    let filePath: string;
    try {
      filePath = await attempt(job.formatSelector);
    } catch (err: any) {
      // YouTube sometimes refuses one specific stream — let yt-dlp pick an equivalent one.
      if (isCancelled(job) || !['YT_FORBIDDEN', 'FORMAT_GONE'].includes(err?.code)) throw err;
      console.warn(`[download] ${job.id}: ${err.code} on "${job.formatSelector}", retrying with "${job.fallbackSelector}"`);
      job.phase = 'Retrying with another stream';
      job.progress = 0;
      filePath = await attempt(job.fallbackSelector);
    }
    if (isCancelled(job)) return;

    if (job.embedSubtitles) {
      job.status = 'processing';
      job.phase = 'Adding English subtitles';
      job.speedBps = null;
      job.etaSeconds = null;
      filePath = await embedSubtitles(job, filePath);
    }

    const quality = job.audioOnly ? '' : ` [${job.qualityId}]`;
    job.filePath = filePath;
    job.fileName = `${safeFileName(job.title)}${quality}${path.extname(filePath)}`;
    job.fileSize = fs.statSync(filePath).size;
    job.status = 'completed';
    job.phase = 'Ready';
    job.progress = 100;
  } catch (err: any) {
    if (isCancelled(job)) return;
    job.status = 'failed';
    job.phase = 'Failed';
    job.error = err instanceof HttpError ? err.message : 'The download failed. Please try again.';
    console.error(`[download] ${job.id} failed:`, err.message);
    removeFilesWithPrefix(job.fileBase);
  } finally {
    job.handle = null;
    job.finishedAt = job.finishedAt || Date.now();
    job.speedBps = null;
    job.etaSeconds = null;
  }
}

/**
 * Muxes the English transcript (and the original-language one, if different) into the MP4
 * as selectable subtitle tracks. No re-encoding — takes a few seconds.
 * On any failure the plain video is kept.
 */
async function embedSubtitles(job: DownloadJob, videoPath: string): Promise<string> {
  const data = await getTranscriptData(job.videoId).catch(() => null);
  if (!data || data.segments.length === 0) return videoPath;

  const tracks: { file: string; lang: string; title: string }[] = [];
  const enFile = path.join(env.DOWNLOAD_DIR, `${job.fileBase}.en.srt`);
  fs.writeFileSync(enFile, toSrt(data.segments), 'utf8');
  tracks.push({ file: enFile, lang: iso3(data.meta.languageCode), title: data.meta.translatedBy ? 'English (translated)' : data.meta.language });

  if (data.original && data.meta.originalLanguage) {
    const origFile = path.join(env.DOWNLOAD_DIR, `${job.fileBase}.orig.srt`);
    fs.writeFileSync(origFile, toSrt(data.original), 'utf8');
    tracks.push({ file: origFile, lang: iso3(data.meta.originalLanguageCode), title: data.meta.originalLanguage });
  }

  const output = path.join(env.DOWNLOAD_DIR, `${job.fileBase}.subs.mp4`);
  try {
    // Args as an array (no shell, no splitting) so titles like "Hindi (auto-generated)" stay intact.
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath];
    tracks.forEach((t) => args.push('-i', t.file));
    args.push('-map', '0:v?', '-map', '0:a?');
    tracks.forEach((_, i) => args.push('-map', `${i + 1}:0`));
    args.push('-c:v', 'copy', '-c:a', 'copy', '-c:s', 'mov_text');
    tracks.forEach((t, i) => {
      args.push(`-metadata:s:s:${i}`, `language=${t.lang}`, `-metadata:s:s:${i}`, `title=${t.title}`);
    });
    args.push('-disposition:s:0', 'default', '-movflags', '+faststart', output);
    await runFfmpeg(args);
    fs.unlinkSync(videoPath);
    return output;
  } catch (err) {
    console.warn(`[download] subtitle embedding failed for ${job.id}, keeping video without subtitles:`, (err as Error).message);
    if (fs.existsSync(output)) fs.unlinkSync(output);
    return videoPath;
  } finally {
    tracks.forEach((t) => fs.existsSync(t.file) && fs.unlinkSync(t.file));
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not found'));
    execFile(ffmpegPath, args, { windowsHide: true, timeout: 10 * 60_000, maxBuffer: 10 * 1024 * 1024 }, (err, _out, stderr) =>
      err ? reject(new Error(stderr?.trim() || err.message)) : resolve()
    );
  });
}

// ---------------------------------------------------------------------------
// Cleanup — finished jobs and their files expire after DOWNLOAD_FILE_TTL_MINUTES.
// ---------------------------------------------------------------------------

function sweep() {
  const ttl = env.DOWNLOAD_FILE_TTL_MINUTES * 60_000;
  const now = Date.now();
  const liveBases = new Set<string>();

  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > ttl) {
      removeFilesWithPrefix(job.fileBase);
      jobs.delete(id);
    } else {
      liveBases.add(job.fileBase);
    }
  }

  // Orphans (e.g. left over after a crash): only touch files we created.
  if (!fs.existsSync(env.DOWNLOAD_DIR)) return;
  for (const f of fs.readdirSync(env.DOWNLOAD_DIR)) {
    if (!f.startsWith(FILE_PREFIX)) continue;
    if ([...liveBases].some((b) => f.startsWith(b))) continue;
    const full = path.join(env.DOWNLOAD_DIR, f);
    try {
      if (now - fs.statSync(full).mtimeMs > ttl) fs.unlinkSync(full);
    } catch {
      /* ignore */
    }
  }
}

export function startDownloadSweeper() {
  sweep();
  setInterval(sweep, 5 * 60_000).unref();
}
