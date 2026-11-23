import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { CopyFeedbackStatus } from '../hooks/useCopyFeedback.ts';
import { copyTextWithFallback } from '../lib/clipboard.ts';
import { cn } from '../lib/cn.ts';
import { Button } from './Button.tsx';

/**
 * Props for `<ErrorBoundary>`.
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  onCopy?: (text: string) => boolean | Promise<boolean>;
  className?: string;
  'data-testid'?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  showStack: boolean;
  copyStatus: CopyFeedbackStatus;
}

/**
 * React render error boundary styled as a semantic glass card so runtime failures
 * inside translucent drawers or floating panels never silently collapse to an empty window.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private copyTimer: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      componentStack: null,
      showStack: false,
      copyStatus: 'idle',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    this.props.onError?.(error, errorInfo);
  }

  override componentWillUnmount(): void {
    this.clearCopyTimer();
  }

  private clearCopyTimer(): void {
    if (this.copyTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  readonly handleReset = (): void => {
    this.clearCopyTimer();
    this.setState({
      error: null,
      componentStack: null,
      showStack: false,
      copyStatus: 'idle',
    });
    this.props.onReset?.();
  };

  readonly handleToggleStack = (): void => {
    this.setState((prev) => ({ showStack: !prev.showStack }));
  };

  readonly handleCopy = async (): Promise<void> => {
    const { error, componentStack } = this.state;
    if (!error) return;
    const details = [
      `${error.name || 'Error'}: ${error.message || '未知错误'}`,
      error.stack ?? '',
      componentStack ? `Component Stack:${componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const ok = await copyTextWithFallback(details, this.props.onCopy);
    this.setState({ copyStatus: ok ? 'copied' : 'error' });
    this.clearCopyTimer();
    if (typeof window !== 'undefined') {
      this.copyTimer = window.setTimeout(() => {
        this.copyTimer = null;
        this.setState({ copyStatus: 'idle' });
      }, 1500);
    }
  };

  override render(): ReactNode {
    const { error, componentStack, showStack, copyStatus } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(error, this.handleReset);
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const title = this.props.title ?? '界面渲染异常';
    const stackText = [error.stack, componentStack].filter(Boolean).join('\n');

    return (
      <div
        role="alert"
        data-pochita="error-boundary"
        data-state="error"
        data-testid={this.props['data-testid']}
        className={cn(
          'pochita-card flex flex-col gap-3 border border-[color-mix(in_oklab,var(--danger)_36%,transparent)] p-4 text-[var(--text-primary)]',
          this.props.className,
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]"
            aria-hidden="true"
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 break-words text-xs leading-relaxed text-[var(--text-secondary)]">
              {error.message || '发生未知渲染错误'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={this.handleReset} aria-label="重试渲染">
            <RotateCcw className="size-3.5" />
            重试
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void this.handleCopy()}
            aria-label="复制错误详情"
          >
            {copyStatus === 'copied' ? (
              <>
                <Check className="size-3.5 text-[var(--success)]" />
                已复制
              </>
            ) : copyStatus === 'error' ? (
              <>
                <AlertTriangle className="size-3.5 text-[var(--danger)]" />
                复制失败
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                复制详情
              </>
            )}
          </Button>
          {stackText ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={this.handleToggleStack}
              aria-expanded={showStack}
              aria-label={showStack ? '收起错误堆栈' : '展开错误堆栈'}
            >
              {showStack ? (
                <>
                  <ChevronUp className="size-3.5" />
                  收起堆栈
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  展开堆栈
                </>
              )}
            </Button>
          ) : null}
        </div>

        {showStack && stackText ? (
          <pre className="pochita-scroller max-h-48 overflow-auto rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {stackText}
          </pre>
        ) : null}
      </div>
    );
  }
}
