import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: Toast['tone'] = 'success') {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, tone === 'error' ? 6000 : 2800);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts
  );
}

export async function copyText(text: string, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Couldn't copy — your browser blocked clipboard access.", 'error');
  }
}
