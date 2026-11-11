import { useEffect, useRef, useState } from 'react';
import { Bot, MessageSquarePlus, Send, Square } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { Markdown, TimestampButton } from '../lib/markdown';
import { formatTime } from '../lib/format';
import { EmptyState, ErrorNote, Spinner } from './ui';
import { buttonStyles } from '../lib/styles';

const DEFAULT_QUESTIONS = ['What is this video about?', 'What are the main takeaways?', 'Does it give any practical tips?'];

interface Props {
  videoId: string;
  ready: boolean;
  suggestions: string[];
}

export function ChatPanel({ videoId, ready, suggestions }: Props) {
  const { messages, initializing, streaming, error, send, stop, newChat } = useChat(videoId, ready);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  // Follow the answer as it streams, unless the user scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim() || streaming) return;
    stickToBottom.current = true;
    send(text);
    setInput('');
  };

  const questions = (suggestions.length ? suggestions : DEFAULT_QUESTIONS).slice(0, 3);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {initializing ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <Spinner className="mr-2 h-4 w-4" /> Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon={<Bot className="h-6 w-6 text-indigo-300" />} title="Ask anything about this video">
            Answers come from the transcript, with timestamps you can click to jump to that moment.
            <div className="mt-5 flex flex-col gap-2">
              {questions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-left text-sm text-slate-200 transition hover:border-indigo-700 hover:bg-slate-900 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white">{m.content}</div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-indigo-300">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-200">
                    {m.error ? (
                      <ErrorNote>{m.content}</ErrorNote>
                    ) : m.pending && !m.content ? (
                      <div className="flex items-center gap-1.5 py-2" aria-label="Thinking">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    ) : (
                      <div className={m.pending ? 'streaming-caret' : ''}>
                        <Markdown text={m.content} />
                      </div>
                    )}
                    {!m.pending && !m.error && m.sources && m.sources.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>Sources:</span>
                        {m.sources.map((s) => (
                          <span key={s.start} title={s.text}>
                            <TimestampButton seconds={s.start} label={formatTime(s.start)} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-3">
        {error && <div className="mb-2"><ErrorNote>{error}</ErrorNote></div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          {messages.length > 0 && (
            <button type="button" onClick={newChat} disabled={streaming} className={`${buttonStyles.secondary} h-11 px-3`} title="Start a new chat">
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          )}
          <label htmlFor="chat-input" className="sr-only">Your question</label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={input}
            maxLength={1000}
            disabled={initializing}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask a question about the video…"
            className="scroll-thin min-h-11 flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          {streaming ? (
            <button type="button" onClick={stop} className={`${buttonStyles.secondary} h-11 px-3`} title="Stop generating">
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || initializing} className={`${buttonStyles.primary} h-11 px-3`} title="Send (Enter)">
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-slate-600">Enter to send · Shift+Enter for a new line · AI can make mistakes</p>
      </div>
    </div>
  );
}
