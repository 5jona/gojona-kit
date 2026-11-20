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

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: string;
  message: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timerId of timers) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId);
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
    timersRef.current.add(timerId);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-toast)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg backdrop-blur-md',
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
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { pushToast: () => {} };
  }
  return ctx;
}
