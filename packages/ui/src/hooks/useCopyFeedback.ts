import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextWithFallback } from '../lib/clipboard.ts';

/**
 * Transient state of a clipboard copy operation.
 */
export type CopyFeedbackStatus = 'idle' | 'copied' | 'error';

/**
 * Options for `useCopyFeedback`.
 */
export interface UseCopyFeedbackOptions {
  /** Optional custom copy callback (e.g. host bridge clipboard handler). */
  onCopy?: (text: string) => boolean | Promise<boolean>;
  /** Duration in milliseconds before status resets to `'idle'` (defaults to `1500`). */
  resetDelayMs?: number;
}

/**
 * Return value of `useCopyFeedback`.
 */
export interface UseCopyFeedbackResult {
  copyStatus: CopyFeedbackStatus;
  copyText: (text: string) => Promise<boolean>;
  resetCopyStatus: () => void;
}

/**
 * Manages transient `'idle' | 'copied' | 'error'` copy-to-clipboard feedback
 * with automatic timeout reset and unmount timer cleanup.
 */
export function useCopyFeedback(options: UseCopyFeedbackOptions = {}): UseCopyFeedbackResult {
  const { onCopy, resetDelayMs = 1500 } = options;
  const [copyStatus, setCopyStatus] = useState<CopyFeedbackStatus>('idle');
  const timerRef = useRef<number | null>(null);
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const resetCopyStatus = useCallback(() => {
    clearTimer();
    setCopyStatus('idle');
  }, [clearTimer]);

  const copyText = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyTextWithFallback(text, onCopyRef.current);
      setCopyStatus(ok ? 'copied' : 'error');
      clearTimer();
      if (typeof window !== 'undefined') {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setCopyStatus('idle');
        }, resetDelayMs);
      }
      return ok;
    },
    [clearTimer, resetDelayMs],
  );

  return { copyStatus, copyText, resetCopyStatus };
}
