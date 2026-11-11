import { useSyncExternalStore } from 'react';
import { watchUrl } from './youtube';

/**
 * Tiny global store around the embedded YouTube player, so any panel can
 * seek the video (timestamps in summary, chat, transcript) and read the time.
 */

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: any) => YTPlayer; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let player: YTPlayer | null = null;
let currentVideoId: string | null = null;
let currentTime = 0;
const listeners = new Set<() => void>();
let ticker: number | null = null;

function emit() {
  listeners.forEach((l) => l());
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  });
  return apiPromise;
}

export async function mountPlayer(el: HTMLElement, videoId: string) {
  await loadApi();
  unmountPlayer();
  currentVideoId = videoId;
  currentTime = 0;
  player = new window.YT!.Player(el, {
    videoId,
    width: '100%',
    height: '100%',
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
  });
  ticker = window.setInterval(() => {
    try {
      const t = player?.getCurrentTime?.();
      if (typeof t === 'number' && Math.abs(t - currentTime) >= 0.25) {
        currentTime = t;
        emit();
      }
    } catch {
      /* player not ready yet */
    }
  }, 400);
}

export function unmountPlayer() {
  if (ticker) window.clearInterval(ticker);
  ticker = null;
  try {
    player?.destroy();
  } catch {
    /* ignore */
  }
  player = null;
}

/** Jumps the embedded player to a time (falls back to opening YouTube). */
export function seekTo(seconds: number) {
  if (player?.seekTo) {
    player.seekTo(seconds, true);
    player.playVideo();
    currentTime = seconds;
    emit();
    // Bring the player into view on small screens.
    document.getElementById('video-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (currentVideoId) {
    window.open(watchUrl(currentVideoId, seconds), '_blank', 'noopener');
  }
}

export function usePlayerTime(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentTime
  );
}
