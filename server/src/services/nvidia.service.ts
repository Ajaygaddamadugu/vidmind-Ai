import axios, { AxiosError } from 'axios';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function assertKey() {
  if (!env.NVIDIA_API_KEY || env.NVIDIA_API_KEY.includes('your_nvidia_api_key_here')) {
    throw new HttpError(500, 'AI features are not configured on this server (missing NVIDIA_API_KEY).', 'AI_NOT_CONFIGURED');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extra request fields for reasoning-capable models (turns "thinking" off for speed). */
function thinkingOptions(model: string): Record<string, unknown> {
  return env.NVIDIA_DISABLE_THINKING && /nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
}

/** Removes any <think>…</think> block a model may still emit. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
}

/**
 * POST to NVIDIA NIM with retries on rate limits / transient errors.
 */
async function nvidiaPost(endpoint: string, data: any, timeoutMs = 60_000, retries = 3): Promise<any> {
  assertKey();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.post(`${NVIDIA_BASE_URL}${endpoint}`, data, {
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      });
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (retryable && attempt < retries) {
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
        continue;
      }
      console.error(`[nvidia] ${endpoint} failed (${status}):`, JSON.stringify(err.response?.data || err.message).slice(0, 500));
      if (status === 401 || status === 403) throw new HttpError(500, 'The AI service rejected the server API key.', 'AI_AUTH');
      if (status === 404 || status === 410) {
        throw new HttpError(500, `The configured AI model "${data?.model}" is not available. Update NVIDIA_*_MODEL in server/.env.`, 'AI_MODEL_GONE');
      }
      if (status === 429) throw new HttpError(503, 'The AI service is busy right now. Please try again in a minute.', 'AI_BUSY');
      throw new HttpError(502, 'The AI service did not respond. Please try again.', 'AI_ERROR');
    }
  }
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

export async function getEmbeddings(texts: string[], type: 'query' | 'passage'): Promise<number[][]> {
  const embeddings: number[][] = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const result = await nvidiaPost('/embeddings', {
      model: env.NVIDIA_EMBEDDING_MODEL,
      input: texts.slice(i, i + batchSize),
      input_type: type,
      encoding_format: 'float',
      truncate: 'END',
    });
    const items = [...(result.data || [])].sort((a: any, b: any) => a.index - b.index);
    for (const item of items) embeddings.push(item.embedding);
  }
  return embeddings;
}

export async function getEmbedding(text: string, type: 'query' | 'passage'): Promise<number[]> {
  const [embedding] = await getEmbeddings([text], type);
  if (!embedding) throw new HttpError(502, 'The AI service returned no embedding.');
  return embedding;
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

export async function getChatCompletion(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; model?: string } = {}
): Promise<string> {
  const model = options.model || env.NVIDIA_LLM_MODEL;
  const result = await nvidiaPost(
    '/chat/completions',
    {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
      ...thinkingOptions(model),
    },
    120_000
  );
  return stripThinking(result.choices?.[0]?.message?.content || '');
}

/**
 * Streams a chat completion; calls onToken for each text delta and resolves with the full text.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  assertKey();
  let response;
  try {
    response = await axios.post(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        model: env.NVIDIA_LLM_MODEL,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1024,
        stream: true,
        ...thinkingOptions(env.NVIDIA_LLM_MODEL),
      },
      {
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        responseType: 'stream',
        timeout: 120_000,
        signal,
      }
    );
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 404 || status === 410) {
      throw new HttpError(500, `The configured AI model "${env.NVIDIA_LLM_MODEL}" is not available. Update NVIDIA_LLM_MODEL in server/.env.`, 'AI_MODEL_GONE');
    }
    if (status === 429) throw new HttpError(503, 'The AI service is busy right now. Please try again in a minute.', 'AI_BUSY');
    throw new HttpError(502, 'The AI service did not respond. Please try again.', 'AI_ERROR');
  }

  return new Promise<string>((resolve, reject) => {
    let full = '';
    let buffer = '';
    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onToken(delta);
          }
        } catch {
          /* partial / keep-alive line */
        }
      }
    });
    response.data.on('end', () => resolve(stripThinking(full)));
    response.data.on('error', (err: Error) => (signal?.aborted ? resolve(stripThinking(full)) : reject(err)));
  });
}

/**
 * Extracts the first JSON object/array from an LLM reply (handles ```json fences and chatter).
 */
export function parseJsonFromLlm<T = any>(text: string): T {
  let cleaned = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) cleaned = fence[1];
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}
