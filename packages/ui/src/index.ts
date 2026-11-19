export { cn } from './lib/cn.ts';

export {
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
  ThemeProvider,
  useTheme,
  type ThemeContextValue,
  type ThemeProviderProps,
} from './theme/ThemeProvider.tsx';
export { isValidThemeId, THEME_LIST, THEME_REGISTRY } from './theme/registry.ts';
export type {
  ColorMode,
  ResolvedColorScheme,
  SurfaceMode,
  ThemeDefinition,
  ThemeId,
  ThemeSyncPayload,
} from './theme/types.ts';

export { AppShell, type AppShellProps, type AppShellVariant } from './components/AppShell.tsx';
export { Badge, type BadgeProps } from './components/Badge.tsx';
export { Button, type ButtonProps } from './components/Button.tsx';
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/Card.tsx';
export { LogConsole, type LogConsoleProps, type LogEntry } from './components/LogConsole.tsx';
export { MetricTile, type MetricTileProps } from './components/MetricTile.tsx';
export { SettingRow, type SettingRowProps } from './components/SettingRow.tsx';
export { Slider, type SliderPreset, type SliderProps } from './components/Slider.tsx';
export { Switch, type SwitchProps } from './components/Switch.tsx';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/Tabs.tsx';
export { ThemeSwitcher, type ThemeSwitcherProps } from './components/ThemeSwitcher.tsx';
export { ToastProvider, useToast, type ToastItem } from './components/Toast.tsx';
