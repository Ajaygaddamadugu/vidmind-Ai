import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Film, Music, RotateCcw, Subtitles, X } from 'lucide-react';
import type { Platform, VideoInfo } from '../types';
import { useDownload } from '../hooks/useDownload';
import { formatBytes, formatEta } from '../lib/format';
import { Card, ErrorNote, Spinner } from './ui';
import { buttonStyles } from '../lib/styles';

interface Props {
  video: VideoInfo;
  subtitlesAvailable: boolean;
  subtitlesPending: boolean;
  source?: Platform;
}

const PREFERRED = ['1080p', '720p', '480p', '360p'];

export function DownloadPanel({ video, subtitlesAvailable, subtitlesPending, source = 'youtube' }: Props) {
  const { job, starting, error, start, cancel, saveAgain, reset, active } = useDownload();

  const defaultQuality = useMemo(
    () => PREFERRED.find((q) => video.qualities.some((v) => v.id === q)) || video.qualities[0]?.id || 'audio',
    [video.qualities]
  );
  const [qualityId, setQualityId] = useState(defaultQuality);
  const [audioTrackId, setAudioTrackId] = useState(video.audioTracks[0]?.id || '');
  const [subtitles, setSubtitles] = useState(true);

  useEffect(() => {
    setQualityId(defaultQuality);
    setAudioTrackId(video.audioTracks[0]?.id || '');
    reset();
  }, [video.id, defaultQuality, video.audioTracks, reset]);

  const audio = video.audioTracks.find((a) => a.id === audioTrackId) || video.audioTracks[0];
  const isAudio = qualityId === 'audio';
  const canEmbed = !isAudio && subtitlesAvailable && source === 'youtube';
  const request = () => ({ videoId: video.id, qualityId, audioTrackId: audio?.id, embedSubtitles: canEmbed && subtitles, source });

  const options = [
    ...video.qualities.map((q) => ({
      id: q.id,
      label: q.label,
      kind: 'video' as const,
      size: q.videoSizeBytes ? q.videoSizeBytes + (q.muxed ? 0 : audio?.sizeBytes || 0) : null,
    })),
    { id: 'audio', label: 'Audio only · MP3', kind: 'audio' as const, size: audio?.sizeBytes ? audio.sizeBytes * 1.3 : null },
  ];

  const busy = starting || active;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Download className="h-4 w-4 text-indigo-300" /> Download
        </h2>
        {!isAudio && <span className="text-xs text-slate-500">MP4 · plays everywhere</span>}
      </div>

      <fieldset disabled={busy} className="disabled:opacity-60">
        <legend className="sr-only">Quality</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((o) => {
            const selected = o.id === qualityId;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 transition ${
                  selected ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                } ${o.kind === 'audio' ? 'col-span-2 sm:col-span-1' : ''}`}
              >
                <input type="radio" name="quality" value={o.id} checked={selected} onChange={() => setQualityId(o.id)} className="sr-only" />
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  {o.kind === 'audio' ? <Music className="h-3.5 w-3.5 text-fuchsia-300" /> : <Film className="h-3.5 w-3.5 text-slate-400" />}
                  {o.label.split(' · ')[0]}
                </span>
                <span className="mt-0.5 text-xs text-slate-500">
                  {o.label.split(' · ')[1] || ''}
                  {o.label.includes(' · ') && o.size ? ' · ' : ''}
                  {o.size ? `~${formatBytes(o.size)}` : ''}
                </span>
              </label>
            );
          })}
        </div>

        {video.audioTracks.length > 1 && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Audio language</span>
            <select
              value={audioTrackId}
              onChange={(e) => setAudioTrackId(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
            >
              {video.audioTracks.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
        )}

        {!isAudio && source === 'youtube' && (
          <label className={`mt-4 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 ${canEmbed ? 'cursor-pointer' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={canEmbed && subtitles}
              disabled={!canEmbed}
              onChange={(e) => setSubtitles(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-500"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium text-slate-100">
                <Subtitles className="h-4 w-4 text-slate-400" /> Include English subtitles
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {subtitlesPending
                  ? 'Getting the transcript ready…'
                  : subtitlesAvailable
                    ? 'Turn them on in VLC, your phone, or any player. The original language is included too when available.'
                    : 'This video has no captions.'}
              </span>
            </span>
          </label>
        )}
      </fieldset>

      {/* Progress */}
      {job && job.status !== 'cancelled' && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 animate-fade-in" aria-live="polite">
          {job.status === 'completed' ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-300">Download ready</p>
                <p className="mt-0.5 truncate text-xs text-slate-400" title={job.fileName || ''}>
                  {job.fileName} · {formatBytes(job.fileSize)}
                </p>
                <p className="mt-1 text-xs text-slate-500">If it didn't start automatically, use the button below.</p>
              </div>
              <button type="button" onClick={saveAgain} className={buttonStyles.secondary}>
                <Download className="h-4 w-4" /> Save
              </button>
            </div>
          ) : job.status === 'failed' ? (
            <ErrorNote
              action={
                <button type="button" onClick={() => start(request())} className={buttonStyles.ghost}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </button>
              }
            >
              {job.error}
            </ErrorNote>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 font-medium text-slate-300">
                  <Spinner className="h-3.5 w-3.5 text-indigo-300" />
                  {job.phase}
                </span>
                <span className="font-semibold tabular-nums text-indigo-300">{Math.floor(job.progress)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={Math.floor(job.progress)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500 transition-all duration-500 ${job.status === 'processing' ? 'animate-pulse' : ''}`}
                  style={{ width: `${Math.max(2, job.progress)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span className="tabular-nums">
                  {job.speedBps ? `${formatBytes(job.speedBps)}/s` : job.status === 'processing' ? 'Almost done…' : ''}
                  {job.etaSeconds ? ` · ${formatEta(job.etaSeconds)}` : ''}
                </span>
                <button type="button" onClick={cancel} className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-300 cursor-pointer">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {!active && (
        <button
          type="button"
          disabled={busy}
          onClick={() => start(request())}
          className={`${buttonStyles.primary} mt-4 w-full py-3 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500`}
        >
          {starting ? <Spinner /> : <Download className="h-4 w-4" />}
          {job?.status === 'completed' ? 'Download another format' : isAudio ? 'Download MP3' : qualityId === 'best' ? 'Download MP4' : `Download ${qualityId} MP4`}
        </button>
      )}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600">
        Only download videos you own or have permission to save.
      </p>
    </Card>
  );
}
