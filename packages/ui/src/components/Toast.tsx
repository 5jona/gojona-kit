import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn.ts';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'warning';
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
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
              'pointer-events-auto rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg backdrop-blur-md',
              item.tone === 'success' && 'border-[color-mix(in_srgb,var(--success)_40%,transparent)]',
              item.tone === 'warning' && 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)]',
            )}
          >
            {item.message}
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
