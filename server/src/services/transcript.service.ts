import path from 'path';
import { runPython, usableCookiesFile } from './python.service';
import { env } from '../config/env';
import { translateSegmentsToEnglish } from './translation.service';
import { HttpError } from '../utils/httpError';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];   // English when possible — used by summary, chat and subtitles
  language: string;                // display name of `segments` language
  languageCode: string;
  translatedBy: 'youtube' | 'ai' | null;
  isGenerated: boolean;            // auto-generated captions (less accurate)
  original: { language: string; languageCode: string; segments: TranscriptSegment[] } | null;
  translationFailed?: boolean;     // AI translation was attempted and failed — retry later
}

/**
 * Fetches captions through the Python helper. Returns null when the video has no captions.
 */
export async function fetchTranscript(
  videoId: string,
  onTranslateProgress?: (fraction: number) => void
): Promise<TranscriptResult | null> {
  const scriptPath = path.resolve(__dirname, '../utils/get_transcript.py');
  let raw: any;
  try {
    const { stdout } = await runPython([scriptPath, videoId], 120_000, 50, {
      VIDMIND_COOKIES: usableCookiesFile(env.YTDLP_COOKIES_FILE),
      VIDMIND_PROXY: env.YOUTUBE_PROXY_URL,
    });
    raw = JSON.parse(stdout);
  } catch (err: any) {
    console.error('[transcript] helper failed:', err.stderr || err.message);
    throw new HttpError(502, 'Could not load captions for this video. Please try again.');
  }

  if (!raw.success) {
    if (/no captions|unavailable/i.test(raw.error || '')) return null;
    throw new HttpError(502, raw.error || 'Could not load captions for this video.');
  }

  const result: TranscriptResult = {
    segments: raw.transcript,
    language: raw.language,
    languageCode: raw.languageCode,
    translatedBy: raw.translated ? 'youtube' : null,
    isGenerated: !!raw.isGenerated,
    original: raw.original
      ? { language: raw.original.language, languageCode: raw.original.languageCode, segments: raw.original.transcript }
      : null,
  };

  // YouTube could not translate — do it ourselves with the LLM.
  if (!String(result.languageCode).toLowerCase().startsWith('en') && result.segments.length > 0) {
    const sourceName = String(result.language).replace(/\s*\(auto-generated\)/i, '');
    const original = { language: result.language, languageCode: result.languageCode, segments: result.segments };
    try {
      const english = await translateSegmentsToEnglish(result.segments, sourceName, onTranslateProgress);
      return { ...result, segments: english, language: 'English', languageCode: 'en', translatedBy: 'ai', original };
    } catch (err) {
      console.warn('[transcript] AI translation failed, keeping original language:', (err as Error).message);
      return { ...result, translationFailed: true };
    }
  }

  return result;
}
