import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, FileDown, Languages, LocateFixed, Search, X } from 'lucide-react';
import type { TranscriptData } from '../types';
import { formatTime, languageName } from '../lib/format';
import { seekTo, usePlayerTime } from '../lib/player';
import { copyText } from '../lib/toast';
import { api, triggerBrowserDownload } from '../api/client';
import { buttonStyles } from '../lib/styles';

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    out.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  out.push(text.slice(i));
  return out;
}

export function TranscriptPanel({ videoId, data }: { videoId: string; data: TranscriptData }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const time = usePlayerTime();
  const listRef = useRef<HTMLDivElement>(null);

  const { meta } = data;
  const hasOriginal = !!data.original?.length;
  const segments = showOriginal && data.original ? data.original : data.segments;
  const originalName = languageName(meta.originalLanguage);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return segments.map((s, i) => ({ ...s, i })).filter((s) => !q || s.text.toLowerCase().includes(q));
  }, [segments, query]);

  // Index of the line currently playing.
  const activeIndex = useMemo(() => {
    let lo = 0;
    let hi = segments.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].start <= time + 0.3) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }, [segments, time]);

  useEffect(() => {
    if (!follow || query || activeIndex < 0 || time < 1) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`);
    // Scroll only the list (scrollIntoView would also move the page).
    if (list && el) list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [activeIndex, follow, query, time]);

  const plainText = () => segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join('\n');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-slate-800 p-4">
        {/* Language info + toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Languages className="h-3.5 w-3.5" />
            {meta.translatedBy
              ? `Translated to English from ${originalName}${meta.translatedBy === 'ai' ? ' by AI' : ''}`
              : meta.translationFailed
                ? `${meta.language} — English translation will be retried`
                : `${languageName(meta.language)}${meta.isGenerated ? ' · auto-generated captions' : ''}`}
          </p>
          {hasOriginal && (
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs" role="group" aria-label="Transcript language">
              {[
                { v: false, label: 'English' },
                { v: true, label: originalName },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setShowOriginal(o.v)}
                  aria-pressed={showOriginal === o.v}
                  className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${showOriginal === o.v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the transcript…"
            aria-label="Search the transcript"
            className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-20 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
          />
          {query && (
            <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-slate-500">
              {filtered.length} found
              <button type="button" onClick={() => setQuery('')} className="rounded p-0.5 hover:text-white cursor-pointer" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setFollow((f) => !f)} aria-pressed={follow} className={`${buttonStyles.ghost} ${follow ? 'text-indigo-300' : ''}`}>
            <LocateFixed className="h-3.5 w-3.5" /> {follow ? 'Following video' : 'Follow video'}
          </button>
          <button type="button" onClick={() => copyText(plainText(), 'Transcript copied')} className={buttonStyles.ghost}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button type="button" onClick={() => triggerBrowserDownload(api.subtitlesUrl(videoId, showOriginal ? 'original' : 'en'))} className={buttonStyles.ghost}>
            <FileDown className="h-3.5 w-3.5" /> Subtitles (.srt)
          </button>
        </div>
      </div>

      <div ref={listRef} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{query ? `No lines mention "${query}".` : 'The transcript is empty.'}</p>
        ) : (
          filtered.map((s) => {
            const active = s.i === activeIndex;
            return (
              <button
                key={s.i}
                data-i={s.i}
                type="button"
                onClick={() => seekTo(s.start)}
                className={`group flex w-full gap-3 rounded-lg px-2.5 py-2 text-left transition cursor-pointer ${active ? 'bg-indigo-500/15' : 'hover:bg-slate-800/60'}`}
              >
                <span className={`w-14 flex-shrink-0 pt-0.5 font-mono text-xs font-semibold ${active ? 'text-indigo-200' : 'text-indigo-400/80 group-hover:text-indigo-300'}`}>
                  {formatTime(s.start)}
                </span>
                <span className={`text-sm leading-relaxed ${active ? 'text-white' : 'text-slate-300'}`}>{highlight(s.text, query.trim())}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
