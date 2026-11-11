import { env } from '../config/env';
import { getChatCompletion } from './nvidia.service';
import type { TranscriptSegment } from './transcript.service';

/**
 * Merges tiny caption fragments into sentence-sized lines (~8s) so translation
 * has enough context, while keeping the start timestamp of each line.
 */
export function mergeSegments(segments: TranscriptSegment[], minSeconds = 8, maxChars = 220): TranscriptSegment[] {
  const merged: TranscriptSegment[] = [];
  let current: TranscriptSegment | null = null;

  for (const seg of segments) {
    const text = seg.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!current) {
      current = { text, start: seg.start, duration: seg.duration };
      continue;
    }
    const span = seg.start + seg.duration - current.start;
    if (span - seg.duration >= minSeconds || current.text.length + text.length > maxChars) {
      merged.push(current);
      current = { text, start: seg.start, duration: seg.duration };
    } else {
      current.text += ' ' + text;
      current.duration = span;
    }
  }
  if (current) merged.push(current);
  return merged;
}

async function translateBatch(lines: string[], sourceLanguage: string): Promise<(string | null)[]> {
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
  const reply = await getChatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a professional subtitle translator. Translate naturally and accurately into English. ' +
          'Output exactly one line per input line, in the format "N. translation", with the same numbers. ' +
          'Lines are consecutive fragments of speech: translate each fragment as-is, without adding "..." or quotes. ' +
          'Do not merge, skip, explain, or add anything else.',
      },
      { role: 'user', content: `Translate these ${lines.length} subtitle lines from ${sourceLanguage} to English:\n\n${numbered}` },
    ],
    { temperature: 0.1, maxTokens: 3000, model: env.NVIDIA_TRANSLATE_MODEL }
  );

  const out: (string | null)[] = new Array(lines.length).fill(null);
  for (const line of reply.split('\n')) {
    const m = line.trim().match(/^(\d+)[.):\-]\s*(.+)$/);
    if (!m) continue;
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < lines.length && !out[idx]) out[idx] = m[2].trim();
  }
  return out;
}

/**
 * Translates transcript segments to English with the LLM.
 * Lines the model fails to return keep their original text, so nothing is lost.
 */
export async function translateSegmentsToEnglish(
  segments: TranscriptSegment[],
  sourceLanguage: string,
  onProgress?: (fraction: number) => void
): Promise<TranscriptSegment[]> {
  const merged = mergeSegments(segments);
  const batchSize = 30;
  const concurrency = 4;
  const batches: number[][] = [];
  for (let i = 0; i < merged.length; i += batchSize) {
    batches.push(Array.from({ length: Math.min(batchSize, merged.length - i) }, (_, k) => i + k));
  }

  const translated = merged.map((s) => ({ ...s }));
  let done = 0;
  let failures = 0;
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const result = await translateBatch(batch.map((i) => merged[i].text), sourceLanguage);
        batch.forEach((segIdx, k) => {
          if (result[k]) translated[segIdx].text = result[k]!;
        });
      } catch (err: any) {
        // Configuration problems won't fix themselves — stop right away.
        if (['AI_MODEL_GONE', 'AI_NOT_CONFIGURED', 'AI_AUTH'].includes(err?.code)) throw err;
        failures++;
        console.warn(`[translate] batch failed (${failures}):`, (err as Error).message);
        if (failures > Math.max(2, batches.length / 4)) throw err;
      }
      done++;
      onProgress?.(done / batches.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return translated;
}
