import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { addRecentVideo } from '../lib/storage';
import type { PrepStatus, SummaryData, TranscriptData, VideoInfo } from '../types';

const TERMINAL = new Set(['ready', 'no_transcript', 'error']);

/**
 * Loads video info, then polls the background preparation status
 * (captions → translation → AI index) until it settles.
 */
export function useVideo(videoId: string) {
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [status, setStatus] = useState<PrepStatus | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setError(null);

    const poll = async () => {
      try {
        const next = await api.getStatus(videoId);
        if (cancelled) return;
        setStatus(next);
        if (!TERMINAL.has(next.stage)) timer = window.setTimeout(poll, next.stage === 'translating' ? 1500 : 2000);
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 4000); // transient — keep trying quietly
      }
    };

    api
      .getVideo(videoId)
      .then((res) => {
        if (cancelled) return;
        setVideo(res.video);
        setStatus(res.status);
        addRecentVideo(res.video);
        if (!TERMINAL.has(res.status.stage)) timer = window.setTimeout(poll, 1500);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err : new ApiError(String(err), 0)));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoId, attempt]);

  const retry = useCallback(() => {
    setStatus(null);
    setAttempt((n) => n + 1);
  }, []);

  return { video, status, error, retry };
}

export function useTranscript(videoId: string, enabled: boolean) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getTranscript(videoId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [videoId]);

  useEffect(() => {
    setData(null);
    if (enabled) load();
  }, [enabled, load]);

  return { data, error, loading, reload: load };
}

export function useSummary(videoId: string, enabled: boolean) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requested = useRef<string | null>(null);

  const load = useCallback(
    (refresh = false) => {
      setLoading(true);
      setError(null);
      api
        .getSummary(videoId, refresh)
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [videoId]
  );

  useEffect(() => {
    if (requested.current !== videoId) setData(null);
    if (enabled && requested.current !== videoId) {
      requested.current = videoId;
      load();
    }
  }, [enabled, videoId, load]);

  return { data, error, loading, reload: load };
}
