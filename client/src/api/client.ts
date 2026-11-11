import type {
  ChatMessage,
  ChatSource,
  DownloadJob,
  PrepStatus,
  SummaryData,
  TranscriptData,
  VideoInfo,
} from '../types';

// Same-origin "/api" by default (Vite proxies it in dev; Express serves the app in prod).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection and try again.", 0, 'NETWORK');
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON */
  }

  if (!response.ok || body?.success === false) {
    throw new ApiError(body?.error || `Request failed (${response.status})`, response.status, body?.code);
  }
  return body.data as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  analyze: (url: string) => request<{ video: VideoInfo; status: PrepStatus }>('/videos', post({ url })),
  getVideo: (videoId: string) => request<{ video: VideoInfo; status: PrepStatus }>(`/videos/${videoId}`),
  getStatus: (videoId: string) => request<PrepStatus>(`/videos/${videoId}/status`),
  getTranscript: (videoId: string) => request<TranscriptData>(`/videos/${videoId}/transcript`),
  getSummary: (videoId: string, refresh = false) =>
    request<SummaryData>(`/videos/${videoId}/summary${refresh ? '?refresh=1' : ''}`),
  subtitlesUrl: (videoId: string, lang: 'en' | 'original') => `${API_BASE_URL}/videos/${videoId}/subtitles.srt?lang=${lang}`,

  startDownload: (input: { videoId: string; qualityId: string; audioTrackId?: string; embedSubtitles?: boolean }) =>
    request<DownloadJob>('/downloads', post(input)),
  getDownload: (id: string) => request<DownloadJob>(`/downloads/${id}`),
  cancelDownload: (id: string) => request<DownloadJob>(`/downloads/${id}/cancel`, post({})),
  downloadFileUrl: (id: string) => `${API_BASE_URL}/downloads/${id}/file`,

  createChatSession: (videoId: string) =>
    request<{ sessionId: string; videoId: string; messages: ChatMessage[] }>('/chat/sessions', post({ videoId })),
  getChatSession: (sessionId: string) =>
    request<{ sessionId: string; videoId: string; messages: ChatMessage[] }>(`/chat/sessions/${sessionId}`),

  /**
   * Sends a chat message and streams the answer.
   */
  async streamChat(
    sessionId: string,
    message: string,
    handlers: { onSources: (s: ChatSource[]) => void; onToken: (t: string) => void },
    signal?: AbortSignal
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        ...post({ message }),
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      throw new ApiError("Can't reach the server. Check your connection and try again.", 0, 'NETWORK');
    }

    if (!response.ok || !response.body) {
      let body: any = null;
      try {
        body = await response.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(body?.error || `Request failed (${response.status})`, response.status, body?.code);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const raw of events) {
          const line = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const event = JSON.parse(line.slice(5));
          if (event.type === 'sources') handlers.onSources(event.sources);
          else if (event.type === 'token') handlers.onToken(event.text);
          else if (event.type === 'error') throw new ApiError(event.error, 500);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      throw err;
    }
  },
};

/** Starts a browser download for a URL without leaving the page. */
export function triggerBrowserDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
