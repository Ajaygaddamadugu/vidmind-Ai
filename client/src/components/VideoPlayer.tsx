import { useEffect, useRef } from 'react';
import { mountPlayer, unmountPlayer } from '../lib/player';
import { thumbnailUrl } from '../lib/youtube';

export function VideoPlayer({ videoId, title }: { videoId: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The YouTube API replaces this element with an iframe.
    const target = document.createElement('div');
    host.appendChild(target);
    mountPlayer(target, videoId);
    return () => {
      unmountPlayer();
      host.innerHTML = '';
    };
  }, [videoId]);

  return (
    <div id="video-player" className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl shadow-black/40 scroll-mt-20">
      {/* Thumbnail shows instantly while the player loads */}
      <img src={thumbnailUrl(videoId)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" title={title} />
    </div>
  );
}
