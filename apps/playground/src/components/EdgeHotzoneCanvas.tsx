import { colorWithAlpha, readThemeToken, useTheme } from '@pochita/ui';
import { useEffect, useRef } from 'react';

export interface EdgeHotzoneCanvasProps {
  edge: 'left' | 'right';
  topPercent: number;
  heightPercent: number;
  widthDp: number;
}

/**
 * Renders a schematic preview of an edge trigger region and non-touchable
 * visual handle based on configurable geometry parameters.
 */
export function EdgeHotzoneCanvas({
  edge,
  topPercent,
  heightPercent,
  widthDp,
}: EdgeHotzoneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedScheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const isDark = resolvedScheme === 'dark';
      const accent = readThemeToken('accent', resolvedScheme, isDark ? '#3b82f6' : '#0066ff');
      const textPrimary = readThemeToken(
        'text-primary',
        resolvedScheme,
        isDark ? '#f4f7fb' : '#121826',
      );
      const textSecondary = readThemeToken(
        'text-secondary',
        resolvedScheme,
        isDark ? '#a6b0c3' : '#4e5969',
      );

      const dpr = window.devicePixelRatio || 1;
      const width = 280;
      const height = 160;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const padX = 16;
      const padY = 12;
      const frameW = width - padX * 2;
      const frameH = height - padY * 2;

      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(padX, padY, frameW, frameH, 14);
      ctx.stroke();

      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(148, 163, 184, 0.1)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.roundRect(padX + 18 + i * 74, padY + 22, 62, 42, 8);
        ctx.fill();
      }

      const zoneH = Math.max(20, (frameH * heightPercent) / 100);
      const maxTop = frameH - zoneH;
      const zoneY = padY + (maxTop * topPercent) / 100;
      const zoneW = Math.max(8, Math.min(28, widthDp * 0.6));
      const zoneX = edge === 'right' ? padX + frameW - zoneW : padX;

      ctx.fillStyle = colorWithAlpha(accent, 0.22);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(zoneX, zoneY, zoneW, zoneH, 5);
      ctx.fill();
      ctx.stroke();

      const barW = 4;
      const barX = edge === 'right' ? padX + frameW - barW - 2 : padX + 2;
      ctx.fillStyle = isDark ? textPrimary : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(barX, zoneY + 4, barW, Math.max(12, zoneH - 8), 2);
      ctx.fill();

      ctx.fillStyle = textSecondary;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(
        `${edge === 'right' ? '右边缘' : '左边缘'} · ${widthDp}dp · 纵置 ${topPercent}%`,
        padX + 18,
        padY + frameH - 16,
      );
    };

    draw();

    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-color-scheme', 'class'],
    });

    return () => {
      observer.disconnect();
    };
  }, [edge, topPercent, heightPercent, widthDp, resolvedScheme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 280, height: 160 }}
      className="mx-auto block rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]"
      aria-label="边缘触发热区几何示意图"
    />
  );
}
