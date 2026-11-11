import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { getChatSessionId, setChatSessionId } from '../lib/storage';
import type { ChatMessage } from '../types';

export function useChat(videoId: string, enabled: boolean) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initializing, setInitializing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startSession = useCallback(
    async (forceNew = false) => {
      setInitializing(true);
      setError(null);
      try {
        const saved = forceNew ? null : getChatSessionId(videoId);
        if (saved) {
          try {
            const session = await api.getChatSession(saved);
            setSessionId(session.sessionId);
            setMessages(session.messages);
            return;
          } catch {
            setChatSessionId(videoId, null); // expired — fall through to a new one
          }
        }
        const session = await api.createChatSession(videoId);
        setChatSessionId(videoId, session.sessionId);
        setSessionId(session.sessionId);
        setMessages([]);
      } catch (err: any) {
        setError(err.message || 'Could not start the chat.');
      } finally {
        setInitializing(false);
      }
    },
    [videoId]
  );

  useEffect(() => {
    setSessionId(null);
    setMessages([]);
    if (enabled) startSession();
    return () => abortRef.current?.abort();
  }, [enabled, startSession]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || !sessionId || streaming) return;

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: question },
        { id: assistantId, role: 'assistant', content: '', pending: true },
      ]);
      setStreaming(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const update = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      try {
        await api.streamChat(
          sessionId,
          question,
          {
            onSources: (sources) => update((m) => ({ ...m, sources })),
            onToken: (t) => update((m) => ({ ...m, content: m.content + t })),
          },
          controller.signal
        );
        update((m) => ({ ...m, pending: false, content: m.content || (controller.signal.aborted ? '_Stopped._' : m.content) }));
      } catch (err: any) {
        update((m) => ({ ...m, pending: false, error: true, content: err.message || 'Something went wrong. Please try again.' }));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, streaming]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    startSession(true);
  }, [startSession]);

  return { messages, initializing, streaming, error, send, stop, newChat, ready: !!sessionId };
}
