/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1:15" -> 75 */
export function parseTime(value: string): number | null {
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s left`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

/** Strips "(auto-generated)" etc. for display: "Hindi (auto-generated)" -> "Hindi" */
export function languageName(label: string | null | undefined): string {
  return (label || '').replace(/\s*\(.*?\)\s*/g, '').trim() || 'original language';
}
