import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Landing } from './components/Landing';
import { Workspace } from './components/Workspace';
import { Toaster } from './components/ui';
import { extractVideoId } from './lib/youtube';

/** The open video lives in the URL (?v=ID) so refresh, back/forward and sharing all work. */
function videoIdFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  return extractVideoId(params.get('v') || '') || null;
}

export default function App() {
  const [videoId, setVideoId] = useState<string | null>(videoIdFromLocation);

  useEffect(() => {
    const onPop = () => setVideoId(videoIdFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((id: string) => {
    window.history.pushState({}, '', `?v=${id}`);
    setVideoId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    window.history.pushState({}, '', window.location.pathname);
    setVideoId(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
            className="flex items-center gap-2.5"
          >
            <span className="rounded-xl bg-gradient-to-tr from-rose-600 to-indigo-600 p-1.5 shadow-lg">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">VidMind AI</span>
          </a>
        </div>
      </header>

      <main className="flex-1">{videoId ? <Workspace key={videoId} videoId={videoId} onBack={goHome} /> : <Landing onOpen={open} />}</main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        <p>© {new Date().getFullYear()} VidMind AI · Not affiliated with YouTube or Google.</p>
      </footer>

      <Toaster />
    </div>
  );
}
