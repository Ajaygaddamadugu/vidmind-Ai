import { useEffect, useState } from 'react';
import { AlignLeft, CheckCircle2, Copy, ListTree, RefreshCw, Sparkles } from 'lucide-react';
import type { SummaryData, VideoInfo } from '../types';
import { formatTime } from '../lib/format';
import { seekTo, usePlayerTime } from '../lib/player';
import { copyText } from '../lib/toast';
import { EmptyState, ErrorNote } from './ui';
import { buttonStyles } from '../lib/styles';

interface Props {
  video: VideoInfo;
  summary: SummaryData | null;
  loading: boolean;
  error: string | null;
  onRetry: (refresh?: boolean) => void;
}

const LOADING_STEPS = ['Reading the transcript…', 'Finding the key ideas…', 'Building chapters…', 'Polishing the summary…'];

function toMarkdown(video: VideoInfo, s: SummaryData): string {
  return [
    `# ${video.title}`,
    `${video.url}`,
    '',
    '## Summary',
    s.summary,
    '',
    '## Key takeaways',
    ...s.keyPoints.map((p) => `- ${p}`),
    ...(s.chapters.length ? ['', '## Chapters', ...s.chapters.map((c) => `- ${formatTime(c.start)} ${c.title}`)] : []),
  ].join('\n');
}

export function SummaryPanel({ video, summary, loading, error, onRetry }: Props) {
  const [step, setStep] = useState(0);
  const time = usePlayerTime();

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 7000);
    return () => window.clearInterval(id);
  }, [loading]);

  if (loading) {
    return (
      <div className="space-y-5 p-5" aria-busy>
        <div className="flex items-center gap-2 text-sm text-indigo-200">
          <Sparkles className="h-4 w-4 animate-pulse" /> {LOADING_STEPS[step]}
          <span className="text-xs text-slate-500">· long videos can take up to a minute</span>
        </div>
        <div className="space-y-2">
          {[100, 95, 88, 60].map((w, i) => <div key={i} className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} />)}
        </div>
        <div className="space-y-2.5 pt-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <ErrorNote
          action={
            <button type="button" onClick={() => onRetry()} className={buttonStyles.ghost}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          }
        >
          {error}
        </ErrorNote>
      </div>
    );
  }

  if (!summary) return <EmptyState icon={<AlignLeft className="h-6 w-6" />} title="No summary yet" />;

  const activeChapter = summary.chapters.reduce((acc, c, i) => (time >= c.start ? i : acc), -1);

  return (
    <div className="space-y-6 p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] leading-relaxed text-slate-200">{summary.summary}</p>
      </div>

      {summary.keyPoints.length > 0 && (
        <div>
          <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> Key takeaways
          </h3>
          <ul className="space-y-2">
            {summary.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3 text-sm leading-relaxed text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.chapters.length > 0 && (
        <div>
          <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ListTree className="h-3.5 w-3.5 text-indigo-300" /> Chapters
          </h3>
          <ol className="space-y-1">
            {summary.chapters.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => seekTo(c.start)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition cursor-pointer ${
                    i === activeChapter ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="w-14 flex-shrink-0 font-mono text-xs font-semibold text-indigo-300">{formatTime(c.start)}</span>
                  <span className="flex-1">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
        <button type="button" onClick={() => copyText(toMarkdown(video, summary), 'Summary copied')} className={buttonStyles.ghost}>
          <Copy className="h-3.5 w-3.5" /> Copy summary
        </button>
        <button type="button" onClick={() => onRetry(true)} className={buttonStyles.ghost}>
          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
        </button>
      </div>
    </div>
  );
}
