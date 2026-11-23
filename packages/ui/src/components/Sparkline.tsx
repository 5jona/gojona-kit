import { cn } from '../lib/cn.ts';

/**
 * Semantic color tone for `<Sparkline>`.
 */
export type SparklineTone = 'accent' | 'success' | 'warning' | 'danger';

/**
 * Props for `<Sparkline>`.
 */
export interface SparklineProps {
  values: readonly number[];
  width?: number;
  height?: number;
  tone?: SparklineTone;
  fill?: boolean;
  ariaLabel: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Precomputed SVG polyline points and closed area path returned by `buildSparklineGeometry`.
 */
export interface SparklineGeometry {
  linePoints: string;
  areaPath: string;
}

const TONE_TOKEN: Record<SparklineTone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

/**
 * Computes normalized SVG polyline points and closed area path for a numeric series.
 */
export function buildSparklineGeometry(
  values: readonly number[],
  width: number,
  height: number,
): SparklineGeometry {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0 || width <= 0 || height <= 0) {
    return { linePoints: '', areaPath: '' };
  }

  const padY = Math.min(2, height / 6);
  const usableHeight = Math.max(1, height - padY * 2);

  if (finite.length === 1) {
    const midY = Number((height / 2).toFixed(2));
    const linePoints = `0,${midY} ${width},${midY}`;
    const areaPath = `M 0 ${height} L 0 ${midY} L ${width} ${midY} L ${width} ${height} Z`;
    return { linePoints, areaPath };
  }

  let min = finite[0] ?? 0;
  let max = finite[0] ?? 0;
  for (const val of finite) {
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const span = max - min;
  const stepX = width / (finite.length - 1);

  const coords = finite.map((val, idx) => {
    const x = Number((idx * stepX).toFixed(2));
    const ratio = span === 0 ? 0.5 : (val - min) / span;
    const y = Number((padY + (1 - ratio) * usableHeight).toFixed(2));
    return { x, y };
  });

  const linePoints = coords.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const segments = coords.map((pt) => `L ${pt.x} ${pt.y}`).join(' ');
  const areaPath =
    first && last ? `M ${first.x} ${height} ${segments} L ${last.x} ${height} Z` : '';

  return { linePoints, areaPath };
}

/**
 * Lightweight pure-SVG inline sparkline bound exclusively to semantic CSS color tokens.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = 'accent',
  fill = false,
  ariaLabel,
  className,
  'data-testid': dataTestId,
}: SparklineProps) {
  const token = TONE_TOKEN[tone];
  const { linePoints, areaPath } = buildSparklineGeometry(values, width, height);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      data-pochita="sparkline"
      data-tone={tone}
      data-points={String(values.length)}
      data-testid={dataTestId}
      className={cn('block shrink-0 overflow-visible', className)}
    >
      {fill && areaPath ? (
        <path
          d={areaPath}
          style={{ fill: `color-mix(in oklab, ${token} 18%, transparent)` }}
          stroke="none"
        />
      ) : null}
      {linePoints ? (
        <polyline
          points={linePoints}
          fill="none"
          style={{ stroke: token }}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
