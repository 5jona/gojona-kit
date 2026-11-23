import type { ContainerBackdrop } from '@pochita/bridge';
import type { HudTextOverlay } from './generated/sideveilThemeHud.ts';

export {
  HUD_TEXT_ALIGN_VALUES,
  type HudTextAlign,
  type HudTextOverlay,
} from './generated/sideveilThemeHud.ts';

export type HudBackdropKind = ContainerBackdrop;

export type HudPrimitive =
  | {
      kind: 'roundedPill';
      x: number;
      y: number;
      w: number;
      h: number;
      radius?: number;
      fillArgb: number;
      strokeArgb?: number;
      strokeWidth?: number;
    }
  | {
      kind: 'progressBar';
      x: number;
      y: number;
      w: number;
      h: number;
      radius?: number;
      value: number;
      trackArgb: number;
      fillStartArgb: number;
      fillEndArgb?: number;
    }
  | {
      kind: 'sparkline';
      x: number;
      y: number;
      w: number;
      h: number;
      values: number[];
      min?: number;
      max?: number;
      strokeArgb: number;
      strokeWidth?: number;
      fillTopArgb?: number;
      fillBottomArgb?: number;
      smooth?: boolean;
    }
  | {
      kind: 'radialGauge';
      cx: number;
      cy: number;
      radius: number;
      thickness: number;
      value: number;
      startAngleDeg?: number;
      sweepAngleDeg?: number;
      trackArgb: number;
      fillStartArgb: number;
      fillEndArgb?: number;
    }
  | {
      kind: 'crosshair';
      cx: number;
      cy: number;
      size: number;
      gap?: number;
      thickness?: number;
      colorArgb: number;
      outlineArgb?: number;
    }
  | {
      kind: 'path';
      d: string;
      fillArgb?: number;
      strokeArgb?: number;
      strokeWidth?: number;
    };

export interface NativeHudScene {
  pluginId?: string;
  widthDp: number;
  heightDp: number;
  cornerRadiusDp?: number;
  backdrop?: HudBackdropKind;
  clickThrough?: boolean;
  anchorXPercent?: number;
  anchorYPercent?: number;
  primitives: HudPrimitive[];
  texts?: HudTextOverlay[];
}
