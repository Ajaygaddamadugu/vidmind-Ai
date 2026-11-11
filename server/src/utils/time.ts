/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1:15" -> 75, "1:02:05" -> 3725, "75" -> 75; invalid -> null */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return null;
  const parts = value.trim().replace(/^\[|\]$/g, '').split(':').map((p) => Number(p));
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** SubRip timestamp: 00:01:02,500 */
export function srtTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const p = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(rest, 3)}`;
}

export function toSrt(segments: { text: string; start: number; duration: number }[]): string {
  return segments
    .map((seg, i) => {
      const next = segments[i + 1];
      // Avoid overlapping cues: end at the next cue's start if that comes first.
      let end = seg.start + (seg.duration || 2);
      if (next && next.start < end) end = next.start;
      if (end <= seg.start) end = seg.start + 1;
      return `${i + 1}\n${srtTimestamp(seg.start)} --> ${srtTimestamp(end)}\n${seg.text.replace(/\s+/g, ' ').trim()}\n`;
    })
    .join('\n');
}
