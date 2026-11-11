import { getChatCompletion, parseJsonFromLlm } from './nvidia.service';
import type { TranscriptSegment } from './transcript.service';
import { formatTimestamp, parseTimestamp } from '../utils/time';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  chapters: { start: number; title: string }[];
  questions: string[];
}

// Short videos go in one pass. Longer ones are split into parts that are summarized
// in parallel — faster than one huge prompt, and chapters cover the whole video.
const SINGLE_PASS_WORDS = 6000;
const PART_WORDS = 3500;
const PART_CONCURRENCY = 5;

/** Groups segments into ~30s blocks prefixed with timestamps: "[1:15] text ..." */
function timestampedBlocks(segments: TranscriptSegment[], blockSeconds = 30): string[] {
  const blocks: string[] = [];
  let start = -Infinity;
  let parts: string[] = [];
  for (const seg of segments) {
    if (seg.start - start >= blockSeconds && parts.length) {
      blocks.push(`[${formatTimestamp(start)}] ${parts.join(' ')}`);
      parts = [];
    }
    if (parts.length === 0) start = seg.start;
    parts.push(seg.text.replace(/\s+/g, ' ').trim());
  }
  if (parts.length) blocks.push(`[${formatTimestamp(start)}] ${parts.join(' ')}`);
  return blocks;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

interface PartNotes {
  notes: string;
  chapters: { start: string; title: string }[];
}

async function summarizePart(text: string, index: number, total: number): Promise<PartNotes> {
  const reply = await getChatCompletion(
    [
      { role: 'system', content: 'You take precise notes on video transcripts. Always write in English.' },
      {
        role: 'user',
        content: [
          `This is part ${index + 1} of ${total} of a video transcript.`,
          'Reply in exactly this format and nothing else:',
          'CHAPTERS:',
          '[m:ss] Short chapter title   (1-3 lines, marking where the main topics of this part begin)',
          'NOTES:',
          '- [m:ss] one concise sentence   (6-8 bullets covering the most important ideas, facts and advice)',
          '',
          'Do not quote the transcript; paraphrase briefly.',
          '',
          'TRANSCRIPT PART:',
          text,
        ].join('\n'),
      },
    ],
    { temperature: 0.2, maxTokens: 900 }
  );
  const [head, notesPart] = reply.split(/^\s*\**NOTES:?\**\s*$/im);
  const chapterBlock = notesPart !== undefined ? head : reply;
  const notes = notesPart !== undefined ? notesPart : reply.replace(/^[\s\S]*?CHAPTERS:?/i, '');
  const chapters = [...chapterBlock.matchAll(/\[(\d{1,2}(?::\d{2}){1,2})\]\s*[-–:]?\s*(.+)/g)].map((m) => ({
    start: m[1],
    title: m[2].replace(/\*+/g, '').trim(),
  }));
  if (chapters.length === 0) console.warn(`[summary] part ${index + 1}: no chapters parsed. Tail:`, JSON.stringify(reply.slice(-300)));
  return { notes: notes.trim(), chapters };
}

/**
 * Summarizes a transcript of any length (map-reduce for long videos).
 */
export async function generateSummary(title: string, segments: TranscriptSegment[], duration: number): Promise<SummaryResult> {
  const blocks = timestampedBlocks(segments);
  const fullText = blocks.join('\n');

  let material: string;
  let materialKind: string;
  let partChapters: { start: string; title: string }[] | null = null;
  if (wordCount(fullText) <= SINGLE_PASS_WORDS) {
    material = fullText;
    materialKind = 'TRANSCRIPT (with timestamps)';
  } else {
    const parts: string[] = [];
    let current: string[] = [];
    let words = 0;
    for (const b of blocks) {
      current.push(b);
      words += wordCount(b);
      if (words >= PART_WORDS) {
        parts.push(current.join('\n'));
        current = [];
        words = 0;
      }
    }
    if (current.length) parts.push(current.join('\n'));
    const notes: PartNotes[] = new Array(parts.length);
    let next = 0;
    const worker = async () => {
      while (next < parts.length) {
        const i = next++;
        notes[i] = await summarizePart(parts[i], i, parts.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, parts.length) }, worker));
    material = notes.map((n) => n.notes).join('\n');
    // At most two chapters per part (its first + a middle one) so they spread evenly over the video.
    partChapters = notes.flatMap((n) => {
      const c = n.chapters;
      return c.length <= 2 ? c : [c[0], c[Math.floor(c.length / 2)]];
    });
    materialKind = 'NOTES FROM THE FULL VIDEO (with timestamps)';
  }

  const prompt = `Analyze this YouTube video titled "${title}" (length ${formatTimestamp(duration)}).

Return ONLY a valid JSON object, in English, with exactly this shape:
{
  "summary": "3-5 engaging sentences describing what the video is about and its main message",
  "keyPoints": ["5 to 7 specific, informative takeaways, each one sentence"],
  "chapters": [{ "start": "m:ss", "title": "short chapter title" }],
  "questions": ["3 specific questions a viewer might ask about this video"]
}
Rules: chapters must be in time order, use timestamps that appear in the material, there should be 4-10 of them, and they must be spread across the WHOLE video from the beginning to the end. No markdown, no extra text.

${materialKind}:
${material}`;

  const reply = await getChatCompletion(
    [
      { role: 'system', content: 'You are an expert video analyst who only outputs valid JSON.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 4000 }
  );

  let result: SummaryResult;
  try {
    result = normalize(parseJsonFromLlm(reply), duration);
  } catch {
    console.warn('[summary] could not parse JSON, salvaging what we can');
    result = salvage(reply, duration);
  }
  // For long videos, chapters come from every part so they cover the whole video.
  if (partChapters && partChapters.length >= 3) {
    result.chapters = normalize({ chapters: partChapters }, duration).chapters;
  }
  return result;
}

/** Recovers fields from truncated / slightly invalid JSON instead of showing raw JSON to users. */
function salvage(reply: string, duration: number): SummaryResult {
  const str = (s: string) => {
    try {
      return JSON.parse(`"${s}"`);
    } catch {
      return s;
    }
  };
  const summary = reply.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const listOf = (key: string) => {
    const body = reply.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)(\\]|$)`))?.[1] || '';
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => str(m[1]));
  };
  const chapters = [...reply.matchAll(/\{\s*"start"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)].map((m) => ({
    start: m[1],
    title: str(m[2]),
  }));
  return normalize(
    {
      summary: summary ? str(summary) : reply.replace(/[{}\[\]"]/g, '').slice(0, 800),
      keyPoints: listOf('keyPoints'),
      chapters,
      questions: listOf('questions'),
    },
    duration
  );
}

function normalize(raw: any, duration: number): SummaryResult {
  const strings = (v: any, max: number) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max) : [];

  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((c: any) => ({ start: parseTimestamp(c?.start), title: typeof c?.title === 'string' ? c.title.trim() : '' }))
    .filter((c: any) => c.start !== null && c.title && (!duration || c.start <= duration))
    .sort((a: any, b: any) => a.start - b.start)
    .filter((c: any, i: number, arr: any[]) => i === 0 || c.start !== arr[i - 1].start)
    .slice(0, 14);

  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    keyPoints: strings(raw.keyPoints, 8),
    chapters,
    questions: strings(raw.questions, 4),
  };
}
