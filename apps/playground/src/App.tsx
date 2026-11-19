import { Layers, LayoutPanelTop, Smartphone, Tablet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BridgeProvider, createBridge } from '@pochita/bridge';
import {
  AppShell,
  Badge,
  Button,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThemeProvider,
  ThemeSwitcher,
  ToastProvider,
  type AppShellVariant,
  type LogEntry,
  type SurfaceMode,
  type ThemeSyncPayload,
} from '@pochita/ui';
import { BridgeDiagTab } from './components/BridgeDiagTab.tsx';
import { ExtensionsTab } from './components/ExtensionsTab.tsx';
import { TelemetryTab } from './components/TelemetryTab.tsx';

function formatTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function createLogEntry(message: string, level: LogEntry['level'] = 'info'): LogEntry {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: formatTime(),
    level,
    message,
  };
}

export default function App() {
  const [viewportMode, setViewportMode] = useState<'manager' | 'sidebar'>('manager');
  const [shellVariant, setShellVariant] = useState<AppShellVariant>('floating');
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('standalone');
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    createLogEntry('工作台已就绪：可在上方实时切换主题、明暗模式与容器宽度'),
  ]);

  const appendLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    setLogs((prev) => [createLogEntry(message, level), ...prev.slice(0, 49)]);
  }, []);

  const bridge = useMemo(
    () =>
      createBridge({
        mockNamespace: 'playground',
        onMockContainerAction: (action) => {
          if (action.type !== 'syncTheme') {
            appendLog(`模拟容器动作: ${JSON.stringify(action)}`);
          }
        },
      }),
    [appendLog],
  );

  useEffect(() => () => bridge.dispose(), [bridge]);

  const handleThemeSync = useCallback(
    (payload: ThemeSyncPayload) => {
      void bridge.sendContainerAction({ type: 'syncTheme', payload });
    },
    [bridge],
  );

  return (
    <ThemeProvider surfaceMode={surfaceMode} onThemeSync={handleThemeSync}>
      <BridgeProvider client={bridge}>
        <ToastProvider>
          <div className="playground-backdrop min-h-dvh p-3 sm:p-5">
            <div className="mx-auto max-w-5xl space-y-4">
              <Card className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        Pochita WebUI Kit · 组件与主题联调工作台
                      </span>
                      <Badge variant="accent">React 19 · Tailwind v4</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      用于预览容器查询自适应（340px 抽屉 / 宽屏管理）、双主题皮肤与三态明暗切换
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={viewportMode === 'manager' && shellVariant === 'floating' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setViewportMode('manager');
                        setShellVariant('floating');
                      }}
                    >
                      <Tablet className="size-3.5" />
                      宽屏浮层
                    </Button>
                    <Button
                      size="sm"
                      variant={shellVariant === 'page' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setViewportMode('manager');
                        setShellVariant('page');
                      }}
                    >
                      <LayoutPanelTop className="size-3.5" />
                      单画布页面
                    </Button>
                    <Button
                      size="sm"
                      variant={viewportMode === 'sidebar' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setViewportMode('sidebar');
                        setShellVariant('drawer');
                      }}
                    >
                      <Smartphone className="size-3.5" />
                      340px 抽屉
                    </Button>
                    <Button
                      size="sm"
                      variant={surfaceMode === 'native-glass' ? 'pill' : 'secondary'}
                      onClick={() => {
                        const next: SurfaceMode =
                          surfaceMode === 'standalone' ? 'native-glass' : 'standalone';
                        setSurfaceMode(next);
                        appendLog(
                          `渲染表面模式切换为：${next === 'native-glass' ? '原生透底模式' : '独立渲染模式'}`,
                        );
                      }}
                    >
                      <Layers className="size-3.5" />
                      {surfaceMode === 'native-glass' ? '原生透底模式' : '独立渲染模式'}
                    </Button>
                  </div>
                </div>

                <ThemeSwitcher />
              </Card>

              <div
                className={
                  viewportMode === 'sidebar'
                    ? 'mx-auto w-full max-w-[340px] transition-[max-width] duration-200'
                    : 'w-full transition-[max-width] duration-200'
                }
              >
                <AppShell
                  variant={shellVariant}
                  title="自适应容器预览"
                  subtitle={
                    shellVariant === 'drawer'
                      ? undefined
                      : shellVariant === 'page'
                        ? '单层全屏画布模式 (variant="page")'
                        : '宽屏管理模式 (@container >= 480px)'
                  }
                  className={
                    shellVariant === 'drawer'
                      ? 'h-[620px] rounded-[var(--radius-panel)]'
                      : shellVariant === 'page'
                        ? 'min-h-[540px] rounded-[var(--radius-panel)] overflow-hidden'
                        : 'min-h-[540px]'
                  }
                  headerTrailing={
                    <Badge variant="success" dot>
                      环境: {bridge.env}
                    </Badge>
                  }
                  footer={
                    <div className="flex items-center justify-between gap-2">
                      <span>@pochita/ui · @pochita/bridge · @pochita/config</span>
                      <span className="tabular-nums">v0.1.0</span>
                    </div>
                  }
                >
                  <Tabs defaultValue="extensions">
                    <TabsList>
                      <TabsTrigger value="extensions">扩展管理</TabsTrigger>
                      <TabsTrigger value="telemetry">遥测与控件</TabsTrigger>
                      <TabsTrigger value="bridge">通信诊断</TabsTrigger>
                    </TabsList>

                    <TabsContent value="extensions">
                      <ExtensionsTab onLog={(m) => appendLog(m)} />
                    </TabsContent>

                    <TabsContent value="telemetry">
                      <TelemetryTab onLog={(m) => appendLog(m)} />
                    </TabsContent>

                    <TabsContent value="bridge">
                      <BridgeDiagTab
                        logs={logs}
                        onLog={appendLog}
                        onClearLogs={() => setLogs([])}
                      />
                    </TabsContent>
                  </Tabs>
                </AppShell>
              </div>
            </div>
          </div>
        </ToastProvider>
      </BridgeProvider>
    </ThemeProvider>
  );
}
