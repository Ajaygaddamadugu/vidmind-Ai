import { env } from '../config/env';
import { getDb } from '../db/sqlite';
import { getEmbedding, getEmbeddings, ChatMessage } from './nvidia.service';
import type { TranscriptSegment } from './transcript.service';
import { formatTimestamp } from '../utils/time';

export interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
}

interface VectorIndex {
  chunks: TranscriptChunk[];
  embeddings: number[][];
  norms: number[];
}

const memoryCache = new Map<string, VectorIndex>();
const inflight = new Map<string, Promise<VectorIndex>>();
const MAX_CACHED_INDEXES = 50;

/**
 * Splits transcript segments into overlapping ~200-word chunks that remember their time range.
 */
export function chunkTranscript(segments: TranscriptSegment[], wordsPerChunk = 200, overlapWords = 40): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let i = 0;
  while (i < segments.length) {
    let words = 0;
    let j = i;
    const parts: string[] = [];
    while (j < segments.length && words < wordsPerChunk) {
      const text = segments[j].text.trim();
      if (text) {
        parts.push(text);
        words += text.split(/\s+/).length;
      }
      j++;
    }
    if (parts.length) {
      const last = segments[j - 1];
      chunks.push({ text: parts.join(' '), start: segments[i].start, end: last.start + (last.duration || 0) });
    }
    if (j >= segments.length) break;

    // Step back to create overlap, but always move forward.
    let back = j - 1;
    let overlap = 0;
    while (back > i && overlap < overlapWords) {
      overlap += segments[back].text.split(/\s+/).length;
      back--;
    }
    i = Math.max(back + 1, i + 1);
  }
  return chunks;
}

function norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s) || 1;
}

export function forgetIndex(videoId: string) {
  memoryCache.delete(videoId);
}

function remember(videoId: string, index: VectorIndex) {
  if (memoryCache.size >= MAX_CACHED_INDEXES) {
    memoryCache.delete(memoryCache.keys().next().value as string);
  }
  memoryCache.set(videoId, index);
}

/**
 * Returns the vector index for a video: memory → SQLite → build (once, even under concurrent calls).
 */
export function ensureIndex(videoId: string, segments: TranscriptSegment[]): Promise<VectorIndex> {
  const cached = memoryCache.get(videoId);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(videoId);
  if (pending) return pending;

  const job = (async () => {
    const db = getDb();
    const row = await db.get('SELECT model, chunks_json, embeddings_json FROM video_embeddings WHERE video_id = ?', [videoId]);
    if (row && row.model === env.NVIDIA_EMBEDDING_MODEL) {
      const embeddings: number[][] = JSON.parse(row.embeddings_json);
      const index = { chunks: JSON.parse(row.chunks_json), embeddings, norms: embeddings.map(norm) };
      remember(videoId, index);
      return index;
    }

    const chunks = chunkTranscript(segments);
    const embeddings = chunks.length ? await getEmbeddings(chunks.map((c) => c.text), 'passage') : [];
    await db.run(
      `INSERT INTO video_embeddings (video_id, model, chunks_json, embeddings_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET model = excluded.model, chunks_json = excluded.chunks_json,
         embeddings_json = excluded.embeddings_json, created_at = CURRENT_TIMESTAMP`,
      [videoId, env.NVIDIA_EMBEDDING_MODEL, JSON.stringify(chunks), JSON.stringify(embeddings)]
    );
    const index = { chunks, embeddings, norms: embeddings.map(norm) };
    remember(videoId, index);
    console.log(`[rag] indexed ${videoId}: ${chunks.length} chunks`);
    return index;
  })().finally(() => inflight.delete(videoId));

  inflight.set(videoId, job);
  return job;
}

export async function searchChunks(index: VectorIndex, query: string, k = 5): Promise<TranscriptChunk[]> {
  if (index.chunks.length === 0) return [];
  const q = await getEmbedding(query, 'query');
  const qNorm = norm(q);
  const scored = index.embeddings.map((emb, i) => {
    let dot = 0;
    for (let d = 0; d < Math.min(emb.length, q.length); d++) dot += emb[d] * q[d];
    return { chunk: index.chunks[i], score: dot / (index.norms[i] * qNorm) };
  });
  scored.sort((a, b) => b.score - a.score);
  // Present the selected chunks in video order — reads more naturally for the model.
  return scored.slice(0, k).map((s) => s.chunk).sort((a, b) => a.start - b.start);
}

/**
 * Builds the grounded prompt for a chat turn.
 */
export function buildRagMessages(
  videoTitle: string,
  summary: string | null,
  sources: TranscriptChunk[],
  history: { role: 'user' | 'assistant'; content: string }[],
  question: string
): ChatMessage[] {
  const context = sources.length
    ? sources.map((c) => `[${formatTimestamp(c.start)}] ${c.text}`).join('\n\n')
    : 'No relevant transcript passages were found.';

  const system = `You are VidMind, a helpful assistant that answers questions about the YouTube video "${videoTitle}".

Rules:
- Answer ONLY from the video information below. If the answer is not there, say you couldn't find it in the video, and suggest what the user could ask instead.
- Cite where things are said using timestamps in square brackets exactly like [12:34] or [1:02:03].
- Be concise and well structured. Use short paragraphs or bullet lists (markdown "- ") when listing things. Use **bold** sparingly.
- Always answer in English, even if the user's wording is informal.
${summary ? `\nVIDEO SUMMARY:\n${summary}\n` : ''}
RELEVANT TRANSCRIPT PASSAGES:
${context}`;

  // Keep only the most recent turns so long chats stay fast and within context.
  const recent = history.slice(-8);
  return [{ role: 'system', content: system }, ...recent, { role: 'user', content: question }];
}
