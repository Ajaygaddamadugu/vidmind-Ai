import { useEffect, useRef, useState } from 'react';
import { Download, Film, Languages, ListTree, MessageSquare, Music, ShieldCheck, X, Zap } from 'lucide-react';
import { extractVideoId, thumbnailUrl } from '../lib/youtube';
import { extractInstagramId } from '../lib/instagram';
import { getRecentVideos, removeRecentVideo } from '../lib/storage';
import { formatTime } from '../lib/format';
import type { Platform, RecentVideo } from '../types';
import { buttonStyles } from '../lib/styles';

const COPY = {
  youtube: {
    highlight: 'any YouTube video',
    lead: 'Download, understand & chat with ',
    intro: "Paste a link. Get the video or MP3, an English transcript (even if it's in another language), a summary with chapters, and answers to your questions.",
    placeholder: 'Paste a YouTube link…',
    hint: 'Works with youtube.com, youtu.be, Shorts and mobile links · videos up to 2.5 hours',
    empty: 'Paste a YouTube link to get started.',
    invalid: "That doesn't look like a YouTube video link. Try something like https://youtu.be/dQw4w9WgXcQ",
    features: [
      { icon: Download, title: 'Download in any quality', text: 'MP4 up to 4K, or MP3 audio — with optional English subtitles built in.' },
      { icon: Languages, title: 'English from any language', text: 'Hindi, Telugu, Spanish… captions are translated to English automatically.' },
      { icon: ListTree, title: 'Summary & chapters', text: 'Key takeaways and clickable chapters that jump the player to that moment.' },
      { icon: MessageSquare, title: 'Ask the video', text: 'Chat with the transcript and get answers with timestamps you can click.' },
    ],
  },
  instagram: {
    highlight: 'any Instagram reel',
    lead: 'Download ',
    intro: 'Paste a reel or video post link and save it as an MP4 in the best available quality, or grab just the audio as an MP3.',
    placeholder: 'Paste an Instagram reel link…',
    hint: 'Works with public reels and video posts · instagram.com/reel/… or /p/…',
    empty: 'Paste an Instagram reel link to get started.',
    invalid: "That doesn't look like an Instagram reel or video link. Try something like https://www.instagram.com/reel/ABC123/",
    features: [
      { icon: Film, title: 'Original quality', text: 'Save reels as MP4 in the best resolution Instagram offers.' },
      { icon: Music, title: 'Audio only', text: 'Turn any reel into an MP3, perfect for songs and voice-overs.' },
      { icon: Zap, title: 'Fast & simple', text: 'Paste the link and the download starts in a couple of clicks.' },
      { icon: ShieldCheck, title: 'No login needed', text: 'Works with public posts. Nothing to install, no account to create.' },
    ],
  },
} as const;

export function Landing({ platform, onOpen }: { platform: Platform; onOpen: (platform: Platform, id: string) => void }) {
  const copy = COPY[platform];
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentVideo[]>(() => getRecentVideos());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Either kind of link works on either tab — we open whichever platform it belongs to.
  const detect = (raw: string): { platform: Platform; id: string } | null => {
    const ig = extractInstagramId(raw);
    if (ig) return { platform: 'instagram', id: ig };
    const yt = extractVideoId(raw);
    return yt ? { platform: 'youtube', id: yt } : null;
  };

  const submit = (raw = value) => {
    if (!raw.trim()) return setError(copy.empty);
    const found = detect(raw);
    if (!found) return setError(copy.invalid);
    setError(null);
    onOpen(found.platform, found.id);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-16 pt-10 md:pt-20 animate-fade-in">
      <span className="rounded-full border border-indigo-900/60 bg-indigo-950/40 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-300">
        Free · No sign-up
      </span>
      <h1 className="mt-6 max-w-3xl text-center text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-6xl">
        {copy.lead}
        <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">{copy.highlight}</span>
      </h1>
      <p className="mt-5 max-w-xl text-center text-base leading-relaxed text-slate-400 md:text-lg">
        {copy.intro}
      </p>

      <form
        className="relative mt-10 w-full max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 opacity-40 blur transition focus-within:opacity-70" />
        <div className="relative flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 sm:flex-row sm:items-center">
          <label htmlFor="url" className="sr-only">{platform === 'instagram' ? 'Instagram link' : 'YouTube link'}</label>
          <input
            ref={inputRef}
            id="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (detect(text)) {
                e.preventDefault();
                setValue(text);
                submit(text);
              }
            }}
            placeholder={copy.placeholder}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-white placeholder-slate-500 outline-none"
          />
          <button type="submit" className={`${buttonStyles.primary} bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500`}>
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </form>
      <p className={`mt-3 min-h-5 text-center text-sm ${error ? 'text-rose-400' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>
        {error || copy.hint}
      </p>

      {platform === 'youtube' && recent.length > 0 && (
        <div className="mt-12 w-full">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Recently opened</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((v) => (
              <div key={v.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 transition hover:border-slate-600">
                <button type="button" onClick={() => onOpen('youtube', v.id)} className="block w-full text-left cursor-pointer">
                  <div className="relative aspect-video bg-slate-800">
                    <img src={thumbnailUrl(v.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">{formatTime(v.duration)}</span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-100">{v.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{v.channel}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeRecentVideo(v.id);
                    setRecent(getRecentVideos());
                  }}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-slate-300 opacity-0 transition hover:text-white group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  aria-label={`Remove ${v.title} from recent`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {copy.features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
