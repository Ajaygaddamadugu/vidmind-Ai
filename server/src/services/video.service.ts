import { getDb } from '../db/sqlite';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { canonicalUrl, thumbnailUrl } from '../utils/youtube';
import { getVideoMetadata, VideoQuality, AudioTrack } from './ytdlp.service';
import { fetchTranscript, TranscriptSegment } from './transcript.service';
import { ensureIndex, forgetIndex } from './rag.service';
import { translateSegmentsToEnglish } from './translation.service';
import { generateSummary, SummaryResult } from './summary.service';

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  url: string;
  qualities: VideoQuality[];
  audioTracks: AudioTrack[];
}

export interface TranscriptMeta {
  language: string;
  languageCode: string;
  translatedBy: 'youtube' | 'ai' | null;
  isGenerated: boolean;
  originalLanguage: string | null;
  originalLanguageCode: string | null;
  translationFailed?: boolean;
}

export type PrepStage = 'transcript' | 'translating' | 'indexing' | 'ready' | 'no_transcript' | 'error';

export interface PrepStatus {
  stage: PrepStage;
  progress: number | null;   // 0..1 for long-running stages
  hasTranscript: boolean;
  chatReady: boolean;
  transcript: TranscriptMeta | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const metadataInflight = new Map<string, Promise<VideoInfo>>();

export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const db = getDb();
  const row = await db.get('SELECT id, title, channel, duration, formats_json FROM videos WHERE id = ?', [videoId]);
  if (row?.formats_json) {
    const formats = JSON.parse(row.formats_json);
    if (formats && !Array.isArray(formats) && Array.isArray(formats.qualities)) {
      return {
        id: row.id,
        title: row.title,
        channel: row.channel,
        duration: row.duration,
        thumbnail: thumbnailUrl(videoId),
        url: canonicalUrl(videoId),
        qualities: formats.qualities,
        audioTracks: formats.audioTracks || [],
      };
    }
  }

  const pending = metadataInflight.get(videoId);
  if (pending) return pending;

  const job = (async () => {
    const meta = await getVideoMetadata(videoId);
    if (meta.duration > env.MAX_VIDEO_DURATION_SECONDS) {
      const hours = (env.MAX_VIDEO_DURATION_SECONDS / 3600).toFixed(1).replace(/\.0$/, '');
      throw new HttpError(400, `This video is too long. The maximum length is ${hours} hours.`, 'TOO_LONG');
    }
    const formatsJson = JSON.stringify({ qualities: meta.qualities, audioTracks: meta.audioTracks });
    await db.run(
      `INSERT INTO videos (id, url, title, channel, duration, formats_json) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET url = excluded.url, title = excluded.title, channel = excluded.channel,
         duration = excluded.duration, formats_json = excluded.formats_json`,
      [videoId, meta.url, meta.title, meta.channel, meta.duration, formatsJson]
    );
    return meta;
  })().finally(() => metadataInflight.delete(videoId));

  metadataInflight.set(videoId, job);
  return job;
}

// ---------------------------------------------------------------------------
// Transcript + AI index preparation (runs in the background)
// ---------------------------------------------------------------------------

const prepState = new Map<string, PrepStatus>();
const prepRunning = new Map<string, Promise<void>>();

function readMeta(row: any): TranscriptMeta {
  if (row?.transcript_meta_json) return JSON.parse(row.transcript_meta_json);
  // Rows cached by older versions only ever stored English captions.
  return { language: 'English', languageCode: 'en', translatedBy: null, isGenerated: false, originalLanguage: null, originalLanguageCode: null };
}

export async function getTranscriptData(videoId: string) {
  const row = await getDb().get(
    'SELECT transcript_json, transcript_meta_json, original_transcript_json, transcript_status FROM videos WHERE id = ?',
    [videoId]
  );
  if (!row?.transcript_json) return null;
  return {
    segments: JSON.parse(row.transcript_json) as TranscriptSegment[],
    original: row.original_transcript_json ? (JSON.parse(row.original_transcript_json) as TranscriptSegment[]) : null,
    meta: readMeta(row),
  };
}

async function saveTranscript(
  videoId: string,
  segments: TranscriptSegment[],
  original: TranscriptSegment[] | null,
  meta: TranscriptMeta
) {
  await getDb().run(
    "UPDATE videos SET transcript_json = ?, transcript_meta_json = ?, original_transcript_json = ?, transcript_status = 'ready', summary = NULL WHERE id = ?",
    [JSON.stringify(segments), JSON.stringify(meta), original ? JSON.stringify(original) : null, videoId]
  );
}

function setState(videoId: string, patch: Partial<PrepStatus>) {
  const prev = prepState.get(videoId) || {
    stage: 'transcript' as PrepStage,
    progress: null,
    hasTranscript: false,
    chatReady: false,
    transcript: null,
    error: null,
  };
  prepState.set(videoId, { ...prev, ...patch });
}

/** Starts (or restarts after an error) the background preparation for a video. */
export function ensurePrepared(videoId: string): void {
  const state = prepState.get(videoId);
  if (prepRunning.has(videoId) || (state && state.stage !== 'error')) return;

  const run = (async () => {
    const db = getDb();
    try {
      const row = await db.get('SELECT title, transcript_status FROM videos WHERE id = ?', [videoId]);
      if (row?.transcript_status === 'none') {
        setState(videoId, { stage: 'no_transcript', progress: null, error: null });
        return;
      }

      let data = await getTranscriptData(videoId);
      if (!data) {
        setState(videoId, { stage: 'transcript', progress: null, error: null });
        const result = await fetchTranscript(videoId, (fraction) => setState(videoId, { stage: 'translating', progress: fraction }));
        if (!result || result.segments.length === 0) {
          await db.run("UPDATE videos SET transcript_status = 'none' WHERE id = ?", [videoId]);
          setState(videoId, { stage: 'no_transcript', progress: null });
          return;
        }
        const meta: TranscriptMeta = {
          language: result.language,
          languageCode: result.languageCode,
          translatedBy: result.translatedBy,
          isGenerated: result.isGenerated,
          originalLanguage: result.original?.language || null,
          originalLanguageCode: result.original?.languageCode || null,
          translationFailed: result.translationFailed || undefined,
        };
        await saveTranscript(videoId, result.segments, result.original?.segments || null, meta);
        data = { segments: result.segments, original: result.original?.segments || null, meta };
      } else if (data.meta.translationFailed) {
        // A previous AI translation failed (e.g. AI was down) — try again now.
        setState(videoId, { stage: 'translating', progress: 0, error: null });
        const sourceName = data.meta.language.replace(/\s*\(auto-generated\)/i, '');
        try {
          const english = await translateSegmentsToEnglish(data.segments, sourceName, (fraction) =>
            setState(videoId, { stage: 'translating', progress: fraction })
          );
          const meta: TranscriptMeta = {
            ...data.meta,
            language: 'English',
            languageCode: 'en',
            translatedBy: 'ai',
            originalLanguage: data.meta.language,
            originalLanguageCode: data.meta.languageCode,
            translationFailed: undefined,
          };
          await saveTranscript(videoId, english, data.segments, meta);
          // Embeddings were built from the untranslated text — rebuild them.
          await db.run('DELETE FROM video_embeddings WHERE video_id = ?', [videoId]);
          forgetIndex(videoId);
          data = { segments: english, original: data.segments, meta };
        } catch (err) {
          console.warn(`[prep] retrying translation for ${videoId} failed:`, (err as Error).message);
        }
      }

      setState(videoId, { stage: 'indexing', progress: null, hasTranscript: true, transcript: data.meta });
      // Warm the summary in parallel so it's usually ready when the user opens the Summary tab.
      if (!data.meta.translationFailed) getSummary(videoId).catch((e) => console.warn(`[prep] summary warm-up failed: ${e.message}`));
      await ensureIndex(videoId, data.segments);
      setState(videoId, { stage: 'ready', progress: null, chatReady: true });
    } catch (err: any) {
      console.error(`[prep] ${videoId} failed:`, err.message);
      setState(videoId, { stage: 'error', progress: null, error: err instanceof HttpError ? err.message : 'Something went wrong while preparing this video.' });
    }
  })().finally(() => prepRunning.delete(videoId));

  prepRunning.set(videoId, run);
}

export async function getPrepStatus(videoId: string): Promise<PrepStatus> {
  const state = prepState.get(videoId);
  if (state) {
    if (!state.transcript && state.hasTranscript) {
      const data = await getTranscriptData(videoId);
      if (data) state.transcript = data.meta;
    }
    return state;
  }
  ensurePrepared(videoId);
  return prepState.get(videoId) || {
    stage: 'transcript', progress: null, hasTranscript: false, chatReady: false, transcript: null, error: null,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summaryInflight = new Map<string, Promise<SummaryResult>>();

export async function getSummary(videoId: string, refresh = false): Promise<SummaryResult> {
  const db = getDb();
  const row = await db.get('SELECT title, duration, summary FROM videos WHERE id = ?', [videoId]);
  if (!row) throw new HttpError(404, 'Video not found. Analyze it first.');

  if (row.summary && !refresh) {
    try {
      const cached = JSON.parse(row.summary);
      if (Array.isArray(cached.chapters)) return cached; // older cache format lacks chapters → regenerate
    } catch {
      /* regenerate */
    }
  }

  const pending = summaryInflight.get(videoId);
  if (pending) return pending;

  const job = (async () => {
    const data = await getTranscriptData(videoId);
    if (!data || data.segments.length === 0) throw new HttpError(400, 'This video has no captions, so it cannot be summarized.');
    const summary = await generateSummary(row.title || 'YouTube video', data.segments, row.duration || 0);
    await db.run('UPDATE videos SET summary = ? WHERE id = ?', [JSON.stringify(summary), videoId]);
    return summary;
  })().finally(() => summaryInflight.delete(videoId));

  summaryInflight.set(videoId, job);
  return job;
}

export async function getCachedSummaryText(videoId: string): Promise<string | null> {
  const row = await getDb().get('SELECT summary FROM videos WHERE id = ?', [videoId]);
  if (!row?.summary) return null;
  try {
    const s = JSON.parse(row.summary);
    return [s.summary, ...(s.keyPoints || []).map((p: string) => `- ${p}`)].filter(Boolean).join('\n');
  } catch {
    return null;
  }
}
