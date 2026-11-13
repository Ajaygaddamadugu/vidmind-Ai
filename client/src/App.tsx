import { useCallback, useEffect, useState } from 'react';
import { Instagram, Youtube } from 'lucide-react';
import { LogoMark } from './components/Logo';
import { Landing } from './components/Landing';
import { Workspace } from './components/Workspace';
import { InstagramWorkspace } from './components/InstagramWorkspace';
import { Toaster } from './components/ui';
import { extractVideoId } from './lib/youtube';
import { isInstagramId } from './lib/instagram';
import type { Platform } from './types';

type Route = { view: 'home'; platform: Platform } | { view: 'youtube'; id: string } | { view: 'instagram'; id: string };

/**
 * The current page lives in the URL so refresh, back/forward and sharing all work:
 * ?v=ID (YouTube video), ?ig=CODE (Instagram reel), ?p=instagram (Instagram home tab).
 */
function routeFromLocation(): Route {
  const params = new URLSearchParams(window.location.search);
  const yt = extractVideoId(params.get('v') || '');
  if (yt) return { view: 'youtube', id: yt };
  const ig = params.get('ig') || '';
  if (isInstagramId(ig)) return { view: 'instagram', id: ig };
  return { view: 'home', platform: params.get('p') === 'instagram' ? 'instagram' : 'youtube' };
}

function urlForRoute(route: Route): string {
  if (route.view === 'youtube') return `?v=${route.id}`;
  if (route.view === 'instagram') return `?ig=${route.id}`;
  return route.platform === 'instagram' ? '?p=instagram' : window.location.pathname;
}

const PLATFORMS: { id: Platform; label: string; icon: typeof Youtube; active: string }[] = [
  { id: 'youtube', label: 'YouTube', icon: Youtube, active: 'text-rose-400' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, active: 'text-fuchsia-400' },
];

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.history.pushState({}, '', urlForRoute(next));
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  const platform: Platform = route.view === 'home' ? route.platform : route.view;
  const goHome = useCallback(() => navigate({ view: 'home', platform }), [navigate, platform]);
  const open = useCallback((p: Platform, id: string) => navigate({ view: p, id }), [navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
            className="flex flex-shrink-0 items-center gap-2.5"
          >
            <LogoMark className="h-8 w-8 rounded-lg shadow-lg shadow-indigo-950/50" />
            <span className="hidden text-lg font-bold tracking-tight text-white min-[400px]:inline">VidMind AI</span>
          </a>

          <nav aria-label="Platform" className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
            {PLATFORMS.map(({ id, label, icon: Icon, active }) => {
              const selected = platform === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => navigate({ view: 'home', platform: id })}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                    selected ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? active : ''}`} />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {route.view === 'youtube' ? (
          <Workspace key={route.id} videoId={route.id} onBack={goHome} />
        ) : route.view === 'instagram' ? (
          <InstagramWorkspace key={route.id} code={route.id} onBack={goHome} />
        ) : (
          <Landing key={route.platform} platform={route.platform} onOpen={open} />
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        <p>© {new Date().getFullYear()} VidMind AI · Not affiliated with YouTube, Google, Instagram or Meta.</p>
      </footer>

      <Toaster />
    </div>
  );
}
