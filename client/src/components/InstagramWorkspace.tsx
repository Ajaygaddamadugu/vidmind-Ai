import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, Instagram, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { formatTime } from '../lib/format';
import { instagramUrl } from '../lib/instagram';
import type { VideoInfo } from '../types';
import { DownloadPanel } from './DownloadPanel';
import { Card, Spinner } from './ui';
import { buttonStyles } from '../lib/styles';

/** Instagram reels are download-only: preview + details on the left, download options on the right. */
export function InstagramWorkspace({ code, onBack }: { code: string; onBack: () => void }) {
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setVideo(null);
    try {
      const { video } = await api.getInstagram(code);
      setVideo(video);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Something went wrong. Please try again.', 0));
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (video) document.title = `${video.title} · VidMind AI`;
    return () => {
      document.title = 'VidMind AI · Download, summarize & chat with YouTube videos';
    };
  }, [video]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <h2 className="text-lg font-semibold text-white">We couldn't open this reel</h2>
          <p className="mt-2 text-sm text-slate-400">{error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={onBack} className={buttonStyles.secondary}>
              <ArrowLeft className="h-4 w-4" /> Try another link
            </button>
            {error.status !== 400 && (
              <button type="button" onClick={load} className={buttonStyles.primary}>
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 animate-fade-in">
      <button type="button" onClick={onBack} className={`${buttonStyles.ghost} mb-4 -ml-2 text-sm`}>
        <ArrowLeft className="h-4 w-4" /> New reel
      </button>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Left: preview + details */}
        <div className="flex min-w-0 flex-col gap-4 md:col-span-5">
          <Card className="mx-auto w-full max-w-sm overflow-hidden">
            <div className="relative aspect-[9/16] bg-slate-900">
              {video?.thumbnail && !thumbFailed ? (
                <img
                  src={video.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setThumbFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className={`flex h-full w-full items-center justify-center ${video ? '' : 'skeleton'}`}>
                  {video && <Instagram className="h-12 w-12 text-slate-600" />}
                </div>
              )}
              {video && video.duration > 0 && (
                <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {formatTime(video.duration)}
                </span>
              )}
            </div>
          </Card>

          {video ? (
            <div className="mx-auto w-full max-w-sm">
              <h1 className="text-lg font-bold leading-snug text-white">{video.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                <span>{video.channel}</span>
                <a href={instagramUrl(video.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-white">
                  Open on Instagram <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <p className="mx-auto flex w-full max-w-sm items-center gap-2 text-sm text-slate-400">
              <Spinner /> Fetching reel details from Instagram…
            </p>
          )}
        </div>

        {/* Right: downloads */}
        <div className="min-w-0 md:col-span-7">
          {video ? (
            <DownloadPanel video={video} subtitlesAvailable={false} subtitlesPending={false} source="instagram" />
          ) : (
            <div className="skeleton h-64 rounded-2xl" />
          )}
        </div>
      </div>
    </div>
  );
}
