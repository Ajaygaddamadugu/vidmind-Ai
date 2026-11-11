import { Check, Languages, RefreshCw, X } from 'lucide-react';
import type { PrepStatus } from '../types';
import { languageName } from '../lib/format';
import { Spinner } from './ui';
import { buttonStyles } from '../lib/styles';

type ChipState = 'done' | 'active' | 'waiting' | 'failed' | 'skipped';

function Chip({ state, label }: { state: ChipState; label: string }) {
  const styles: Record<ChipState, string> = {
    done: 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300',
    active: 'border-indigo-800/60 bg-indigo-950/40 text-indigo-200',
    waiting: 'border-slate-800 bg-slate-900/40 text-slate-500',
    failed: 'border-rose-900/60 bg-rose-950/30 text-rose-300',
    skipped: 'border-amber-900/60 bg-amber-950/30 text-amber-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[state]}`}>
      {state === 'done' && <Check className="h-3.5 w-3.5" />}
      {state === 'active' && <Spinner className="h-3.5 w-3.5" />}
      {(state === 'failed' || state === 'skipped') && <X className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

/**
 * Shows what the app is doing in the background, so users know when AI features unlock.
 */
export function StatusBar({ status, onRetry }: { status: PrepStatus | null; onRetry: () => void }) {
  if (!status) return null;
  const { stage, progress, transcript } = status;
  const order = ['transcript', 'translating', 'indexing', 'ready'];
  const at = order.indexOf(stage);

  const captions: ChipState =
    stage === 'no_transcript' ? 'skipped' : stage === 'transcript' ? 'active' : stage === 'error' && !status.hasTranscript ? 'failed' : 'done';
  const ai: ChipState =
    stage === 'ready' ? 'done' : stage === 'no_transcript' ? 'skipped' : stage === 'error' ? 'failed' : at >= 2 ? 'active' : 'waiting';

  const translated = transcript?.translatedBy;
  const pct = progress != null ? ` ${Math.round(progress * 100)}%` : '';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <Chip state="done" label="Video ready to download" />
      <Chip state={captions} label={stage === 'no_transcript' ? 'No captions on this video' : stage === 'transcript' ? 'Reading captions…' : 'Captions'} />
      {stage === 'translating' && <Chip state="active" label={`Translating to English${pct}`} />}
      {translated && stage !== 'translating' && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-900/60 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-300">
          <Languages className="h-3.5 w-3.5" />
          English · translated from {languageName(transcript?.originalLanguage)}
        </span>
      )}
      {stage !== 'no_transcript' && <Chip state={ai} label={stage === 'indexing' ? 'Preparing AI…' : stage === 'error' ? 'AI unavailable' : 'AI chat'} />}
      {stage === 'error' && (
        <button type="button" onClick={onRetry} className={buttonStyles.ghost}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}
