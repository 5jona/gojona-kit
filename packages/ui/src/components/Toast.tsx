import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Semantic tone of a toast notification.
 */
export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * Active toast notification item rendered by `<ToastProvider>`.
 */
export interface ToastItem {
  id: string;
  message: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const FALLBACK_TOAST_CONTEXT: ToastContextValue = Object.freeze({
  pushToast: () => {},
});

/**
 * Floating toast notification provider binding `--surface-toast` with automatic dismissal.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    const clear =
      typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
        ? window.clearTimeout
        : clearTimeout;
    return () => {
      for (const timerId of timers) {
        clear(timerId);
      }
      timers.clear();
    };
  }, []);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    const schedule =
      typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout
        : setTimeout;
    const timerId = schedule(() => {
      timersRef.current.delete(timerId);
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600) as unknown as number;
    timersRef.current.add(timerId);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-pochita="toast-viewport"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            data-pochita="toast"
            data-toast-tone={item.tone ?? 'info'}
            className={cn(
              'pochita-toast pointer-events-auto flex max-w-full items-center gap-2 break-words rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-toast)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg',
              item.tone === 'success' &&
                'border-[color-mix(in_oklab,var(--success)_40%,transparent)]',
              item.tone === 'warning' &&
                'border-[color-mix(in_oklab,var(--warning)_40%,transparent)]',
              item.tone === 'danger' && 'border-[var(--danger)] text-[var(--text-primary)]',
            )}
          >
            {item.tone ? (
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  item.tone === 'info' && 'bg-[var(--accent)]',
                  item.tone === 'success' && 'bg-[var(--success)]',
                  item.tone === 'warning' && 'bg-[var(--warning)]',
                  item.tone === 'danger' && 'bg-[var(--danger)]',
                )}
                aria-hidden="true"
              />
            ) : null}
            <span className="min-w-0 break-words">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns the nearest toast dispatcher (`pushToast`), falling back to a referentially
 * stable no-op dispatcher when called outside `<ToastProvider>`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? FALLBACK_TOAST_CONTEXT;
}
