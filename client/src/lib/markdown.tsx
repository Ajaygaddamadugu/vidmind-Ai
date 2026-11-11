import { Fragment, type ReactNode } from 'react';
import { parseTime } from './format';
import { seekTo } from './player';

/**
 * A small, safe Markdown renderer for chat answers (no HTML injection):
 * paragraphs, "-"/"*"/"•" and numbered lists, headings, **bold**, *italic*, `code`,
 * and clickable [m:ss] timestamps that seek the video.
 */

const INLINE = /(\[\d{1,2}:\d{2}(?::\d{2})?\]|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

export function TimestampButton({ seconds, label }: { seconds: number; label: string }) {
  return (
    <button
      type="button"
      onClick={() => seekTo(seconds)}
      className="inline-flex items-center rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200 transition align-baseline cursor-pointer"
      title={`Play from ${label}`}
    >
      {label}
    </button>
  );
}

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    const ts = part.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/);
    if (ts) {
      const seconds = parseTime(ts[1]);
      return seconds !== null ? <TimestampButton key={i} seconds={seconds} label={ts[1]} /> : part;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] };

export function Markdown({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    const last = blocks[blocks.length - 1];
    const bullet = line.match(/^(?:[-*•])\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (!line) {
      blocks.push({ kind: 'p', text: '' });
    } else if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[1]);
      else blocks.push({ kind: 'ol', items: [numbered[1]] });
    } else if (heading) {
      blocks.push({ kind: 'h', text: heading[1] });
    } else if (last?.kind === 'p' && last.text) {
      last.text += ' ' + line;
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.kind === 'ul')
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-slate-500">
              {b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
            </ul>
          );
        if (b.kind === 'ol')
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-slate-500">
              {b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
            </ol>
          );
        if (b.kind === 'h') return <p key={i} className="font-semibold text-white">{renderInline(b.text)}</p>;
        return b.text ? <p key={i}>{renderInline(b.text)}</p> : null;
      })}
    </div>
  );
}
