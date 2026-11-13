import { useId } from 'react';

const STRIPES = [10.6, 15.4, 20.2];
const stripe = (x: number, top: number, bottom: number) =>
  `${x},${top} ${x + 1.9},${top} ${x + 0.7},${bottom} ${x - 1.2},${bottom}`;

/** VidMind clapperboard mark. Keep in sync with public/favicon.svg. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  const gradientId = useId();
  const brand = `url(#${gradientId})`;
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="VidMind AI">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e11d48" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={brand} />
      {/* Clapper arm, tilted open */}
      <g transform="rotate(-16 7.4 13)">
        <rect x="7" y="10.8" width="18" height="2.2" rx="0.8" fill="#fff" />
        {STRIPES.map((x) => (
          <polygon key={x} points={stripe(x, 10.8, 13)} fill={brand} />
        ))}
      </g>
      {/* Fixed striped bar */}
      <rect x="7" y="13.4" width="18" height="2.2" rx="0.8" fill="#fff" />
      {STRIPES.map((x) => (
        <polygon key={x} points={stripe(x, 13.4, 15.6)} fill={brand} />
      ))}
      {/* Board with a play cut-out */}
      <rect x="7" y="16.2" width="18" height="9.6" rx="2" fill="#fff" />
      <path d="M14.3 18.6v4.8l4.1-2.4z" fill={brand} />
    </svg>
  );
}
