import { useEffect, useState } from 'react';
import { AlertTriangle, AlignLeft, ArrowLeft, Captions, ExternalLink, FileText, Languages, MessageSquare, RefreshCw } from 'lucide-react';
import { useSummary, useTranscript, useVideo } from '../hooks/useVideo';
import { formatTime, languageName } from '../lib/format';
import { thumbnailUrl, watchUrl } from '../lib/youtube';
import type { PrepStatus } from '../types';
import { VideoPlayer } from './VideoPlayer';
import { StatusBar } from './StatusBar';
import { DownloadPanel } from './DownloadPanel';
import { SummaryPanel } from './SummaryPanel';
import { ChatPanel } from './ChatPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { Card, EmptyState, Spinner } from './ui';
import { buttonStyles } from '../lib/styles';

type Tab = 'summary' | 'chat' | 'transcript';

const TABS: { id: Tab; label: string; icon: typeof AlignLeft }[] = [
  { id: 'summary', label: 'Summary', icon: AlignLeft },
  { id: 'chat', label: 'Ask AI', icon: MessageSquare },
  { id: 'transcript', label: 'Transcript', icon: FileText },
];

/** Placeholder shown in AI tabs while captions are being fetched / translated / indexed. */
function Preparing({ status, needs }: { status: PrepStatus | null; needs: 'transcript' | 'ai' }) {
  if (status?.stage === 'no_transcript') {
    return (
      <EmptyState icon={<Captions className="h-6 w-6" />} title="This video has no captions">
        Summary, chat and transcript need captions, and YouTube doesn't have any for this video. You can still download it in any quality.
      </EmptyState>
    );
  }
  if (status?.stage === 'error') {
    return (
      <EmptyState icon={<AlertTriangle className="h-6 w-6 text-amber-300" />} title="AI features are unavailable right now">
        {status.error || 'Something went wrong while preparing this video.'} Downloads still work.
      </EmptyState>
    );
  }
  const translating = status?.stage === 'translating';
  const pct = status?.progress != null ? Math.round(status.progress * 100) : null;
  return (
    <EmptyState
      icon={translating ? <Languages className="h-6 w-6 text-sky-300" /> : <Spinner className="h-6 w-6 text-indigo-300" />}
      title={
        translating
          ? `Translating to English${pct != null ? ` · ${pct}%` : ''}`
          : status?.stage === 'indexing' && needs === 'ai'
            ? 'Getting the AI ready…'
            : 'Reading the captions…'
      }
    >
      {translating
        ? `This video isn't in English, so we're translating ${languageName(status?.transcript?.originalLanguage) === 'original language' ? 'its captions' : 'the captions'} for you. Longer videos take a minute or two.`
        : 'This usually takes a few seconds. You can start a download in the meantime.'}
      {translating && pct != null && (
        <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-sky-400 transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      )}
    </EmptyState>
  );
}

export function Workspace({ videoId, onBack }: { videoId: string; onBack: () => void }) {
  const { video, status, error, retry } = useVideo(videoId);
  const [tab, setTab] = useState<Tab>('summary');

  const hasTranscript = !!status?.hasTranscript;
  const transcript = useTranscript(videoId, hasTranscript);
  const summary = useSummary(videoId, hasTranscript && !status?.transcript?.translationFailed);

  useEffect(() => setTab('summary'), [videoId]);
  useEffect(() => {
    if (video) document.title = `${video.title} · VidMind AI`;
    return () => {
      document.title = 'VidMind AI · Download, summarize & chat with YouTube videos';
    };
  }, [video]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="overflow-hidden">
          <img src={thumbnailUrl(videoId)} alt="" className="aspect-video w-full object-cover opacity-40" />
          <div className="p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-300" />
            <h2 className="text-lg font-semibold text-white">We couldn't open this video</h2>
            <p className="mt-2 text-sm text-slate-400">{error.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={onBack} className={buttonStyles.secondary}>
                <ArrowLeft className="h-4 w-4" /> Try another link
              </button>
              {error.status !== 400 && (
                <button type="button" onClick={retry} className={buttonStyles.primary}>
                  <RefreshCw className="h-4 w-4" /> Try again
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 animate-fade-in">
      <button type="button" onClick={onBack} className={`${buttonStyles.ghost} mb-4 -ml-2 text-sm`}>
        <ArrowLeft className="h-4 w-4" /> New video
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: player, details, downloads */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
          <VideoPlayer videoId={videoId} title={video?.title || 'YouTube video'} />

          <div>
            {video ? (
              <>
                <h1 className="text-xl font-bold leading-snug text-white md:text-2xl">{video.title}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                  <span>{video.channel}</span>
                  <span aria-hidden>·</span>
                  <span>{formatTime(video.duration)}</span>
                  <a href={watchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-white">
                    Open on YouTube <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </>
            ) : (
              <div className="space-y-2" aria-busy>
                <div className="skeleton h-7 w-4/5 rounded" />
                <div className="skeleton h-4 w-1/3 rounded" />
              </div>
            )}
            <div className="mt-4">
              {video ? <StatusBar status={status} onRetry={retry} /> : <p className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Fetching video details from YouTube…</p>}
            </div>
          </div>

          {video ? (
            <DownloadPanel
              video={video}
              subtitlesAvailable={hasTranscript}
              subtitlesPending={!status || ['transcript', 'translating'].includes(status.stage)}
            />
          ) : (
            <div className="skeleton h-64 rounded-2xl" />
          )}
        </div>

        {/* Right: AI companion */}
        <Card className="flex min-h-[560px] flex-col overflow-hidden lg:sticky lg:top-20 lg:col-span-5 lg:h-[calc(100vh-6.5rem)]">
          <div className="flex gap-1 border-b border-slate-800 bg-slate-950/40 p-1.5" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition cursor-pointer ${
                  tab === id ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" role="tabpanel">
            {tab === 'summary' &&
              (hasTranscript && video && !status?.transcript?.translationFailed ? (
                <SummaryPanel video={video} summary={summary.data} loading={summary.loading} error={summary.error} onRetry={summary.reload} />
              ) : (
                <Preparing status={status} needs="transcript" />
              ))}

            {tab === 'chat' &&
              (status?.chatReady ? (
                <ChatPanel videoId={videoId} ready suggestions={summary.data?.questions || []} />
              ) : (
                <Preparing status={status} needs="ai" />
              ))}

            {tab === 'transcript' &&
              (transcript.data ? (
                <TranscriptPanel videoId={videoId} data={transcript.data} />
              ) : hasTranscript && transcript.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400"><Spinner className="mr-2 h-4 w-4" /> Loading transcript…</div>
              ) : (
                <Preparing status={status} needs="transcript" />
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
