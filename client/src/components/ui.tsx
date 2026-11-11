import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useToasts } from '../lib/toast';

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-xl shadow-black/20 ${className}`}>{children}</section>;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center animate-fade-in">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-300">{icon}</div>
      <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
      {children && <div className="max-w-sm text-sm leading-relaxed text-slate-400">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-300">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl animate-fade-in ${
            t.tone === 'error'
              ? 'border-rose-800 bg-rose-950 text-rose-200'
              : t.tone === 'info'
                ? 'border-slate-700 bg-slate-900 text-slate-200'
                : 'border-emerald-800 bg-emerald-950 text-emerald-200'
          }`}
        >
          {t.tone === 'error' ? <AlertCircle className="h-4 w-4" /> : t.tone === 'info' ? <Info className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
