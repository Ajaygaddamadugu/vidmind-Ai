import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite';
import { extractVideoId } from '../utils/youtube';
import { HttpError } from '../utils/httpError';
import { getCachedSummaryText, getTranscriptData, getVideoInfo } from '../services/video.service';
import { buildRagMessages, ensureIndex, searchChunks } from '../services/rag.service';
import { streamChatCompletion } from '../services/nvidia.service';

const MAX_QUESTION_LENGTH = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSession(sessionId: string) {
  if (!UUID.test(sessionId)) throw new HttpError(400, 'Invalid chat session.');
  const session = await getDb().get('SELECT id, video_id FROM chat_sessions WHERE id = ?', [sessionId]);
  if (!session) throw new HttpError(404, 'This chat session no longer exists.', 'SESSION_NOT_FOUND');
  return session as { id: string; video_id: string };
}

/** POST /api/chat/sessions  { videoId } */
export async function createSession(req: Request, res: Response) {
  const videoId = extractVideoId(req.body?.videoId);
  if (!videoId) throw new HttpError(400, 'Invalid video ID.');
  await getVideoInfo(videoId); // ensures the video row exists
  const sessionId = uuidv4();
  await getDb().run('INSERT INTO chat_sessions (id, video_id) VALUES (?, ?)', [sessionId, videoId]);
  res.status(201).json({ success: true, data: { sessionId, videoId, messages: [] } });
}

/** GET /api/chat/sessions/:sessionId */
export async function getSession(req: Request, res: Response) {
  const session = await loadSession(req.params.sessionId);
  const rows = await getDb().all(
    'SELECT id, role, content, sources_json, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC',
    [session.id]
  );
  res.json({
    success: true,
    data: {
      sessionId: session.id,
      videoId: session.video_id,
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        sources: r.sources_json ? JSON.parse(r.sources_json) : [],
        createdAt: r.created_at,
      })),
    },
  });
}

/**
 * POST /api/chat/sessions/:sessionId/messages  { message }
 * Streams the answer as Server-Sent Events over the POST response:
 *   {type:'sources', sources}  {type:'token', text}  {type:'done', messageId}  {type:'error', error}
 */
export async function sendMessage(req: Request, res: Response) {
  const session = await loadSession(req.params.sessionId);
  const question = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!question) throw new HttpError(400, 'Please type a question.');
  if (question.length > MAX_QUESTION_LENGTH) throw new HttpError(400, `Questions can be at most ${MAX_QUESTION_LENGTH} characters.`);

  const db = getDb();
  const [video, transcript] = await Promise.all([getVideoInfo(session.video_id), getTranscriptData(session.video_id)]);
  if (!transcript) throw new HttpError(409, 'This video has no transcript yet, so chat is unavailable.');

  const history = (
    await db.all('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 8', [session.id])
  ).reverse() as { role: 'user' | 'assistant'; content: string }[];

  // From here on we stream — errors are sent as events, not HTTP status codes.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const index = await ensureIndex(session.video_id, transcript.segments);
    const sources = await searchChunks(index, question, 5);
    const summary = await getCachedSummaryText(session.video_id);
    send({ type: 'sources', sources: sources.map((s) => ({ start: s.start, text: s.text.slice(0, 280) })) });

    const messages = buildRagMessages(video.title, summary, sources, history, question);
    const answer = await streamChatCompletion(messages, (text) => send({ type: 'token', text }), abort.signal);

    if (!answer) throw new HttpError(502, 'The AI returned an empty answer. Please try again.');
    await db.run('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)', [session.id, 'user', question]);
    const saved = await db.run('INSERT INTO chat_messages (session_id, role, content, sources_json) VALUES (?, ?, ?, ?)', [
      session.id,
      'assistant',
      answer,
      JSON.stringify(sources.map((s) => ({ start: s.start, text: s.text.slice(0, 280) }))),
    ]);
    send({ type: 'done', messageId: saved.lastID });
  } catch (err: any) {
    if (!abort.signal.aborted) {
      console.error('[chat] failed:', err.message);
      send({ type: 'error', error: err instanceof HttpError ? err.message : 'Something went wrong. Please try again.' });
    }
  } finally {
    res.end();
  }
}
