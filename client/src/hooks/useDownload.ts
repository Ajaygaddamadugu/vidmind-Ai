import { useCallback, useEffect, useRef, useState } from 'react';
import { api, triggerBrowserDownload } from '../api/client';
import { toast } from '../lib/toast';
import type { DownloadJob } from '../types';

const ACTIVE = new Set(['queued', 'downloading', 'processing']);

/**
 * Starts a server-side download, polls its progress, and hands the finished file to the browser.
 */
export function useDownload() {
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const deliveredFor = useRef<string | null>(null);

  const stopPolling = () => window.clearTimeout(timer.current);
  useEffect(() => stopPolling, []);

  const poll = useCallback((id: string, failures = 0) => {
    timer.current = window.setTimeout(async () => {
      try {
        const next = await api.getDownload(id);
        setJob(next);
        if (ACTIVE.has(next.status)) return poll(id, 0);
        if (next.status === 'completed' && deliveredFor.current !== id) {
          deliveredFor.current = id;
          triggerBrowserDownload(api.downloadFileUrl(id));
          toast('Your download has started');
        }
      } catch (err: any) {
        if (failures < 5) return poll(id, failures + 1); // brief network blips shouldn't kill the download
        setError(err.message || 'Lost track of the download.');
      }
    }, 1000);
  }, []);

  const start = useCallback(
    async (input: { videoId: string; qualityId: string; audioTrackId?: string; embedSubtitles?: boolean }) => {
      stopPolling();
      setStarting(true);
      setError(null);
      setJob(null);
      try {
        const created = await api.startDownload(input);
        setJob(created);
        poll(created.id);
      } catch (err: any) {
        setError(err.message || 'Could not start the download.');
      } finally {
        setStarting(false);
      }
    },
    [poll]
  );

  const cancel = useCallback(async () => {
    if (!job) return;
    stopPolling();
    try {
      setJob(await api.cancelDownload(job.id));
    } catch (err: any) {
      setError(err.message);
    }
  }, [job]);

  const saveAgain = useCallback(() => {
    if (job?.status === 'completed') triggerBrowserDownload(api.downloadFileUrl(job.id));
  }, [job]);

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setError(null);
  }, []);

  return { job, starting, error, start, cancel, saveAgain, reset, active: !!job && ACTIVE.has(job.status) };
}
