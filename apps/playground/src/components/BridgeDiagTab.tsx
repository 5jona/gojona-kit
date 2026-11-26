import { useBridge } from '@gojona/bridge';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LogConsole,
  type LogEntry,
  useToast,
} from '@gojona/ui';
import { TerminalSquare } from 'lucide-react';

export interface BridgeDiagTabProps {
  logs: readonly LogEntry[];
  onLog: (message: string, level?: LogEntry['level']) => void;
  onClearLogs: () => void;
}

export function BridgeDiagTab({ logs, onLog, onClearLogs }: BridgeDiagTabProps) {
  const bridge = useBridge();
  const { pushToast } = useToast();

  const handleExecProbe = async () => {
    try {
      const res = await bridge.exec('status-daemon --json');
      onLog(`exec(errno=${res.errno}): ${res.stdout}`);
      if (res.errno !== 0) {
        pushToast(`命令探针执行失败 (errno=${res.errno})`, 'danger');
      } else {
        pushToast('命令探针已执行', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`exec 异常: ${msg}`, 'error');
      pushToast(`命令探针执行异常: ${msg}`, 'danger');
    }
  };

  const handleAtomicRoundtrip = async () => {
    try {
      const sample = JSON.stringify({ updatedAt: new Date().toISOString(), edge: 'right' });
      const writeRes = await bridge.writeFileAtomic('/etc/example/config.json', sample);
      if (writeRes.errno !== 0) {
        onLog(`writeFileAtomic 失败: errno=${writeRes.errno}`, 'error');
        pushToast(`写入配置失败 (errno=${writeRes.errno})`, 'danger');
        return;
      }
      const readBack = await bridge.readFile('/etc/example/config.json');
      onLog(`writeFileAtomic(errno=${writeRes.errno}) -> readFile: ${readBack}`);
      pushToast('原子写入与回读成功', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`原子读写异常: ${msg}`, 'error');
      pushToast(`原子读写异常: ${msg}`, 'danger');
    }
  };

  const handleRpcInvoke = async () => {
    try {
      const res = await bridge.invoke('service.echo', {
        module: 'telemetry',
        action: 'refresh',
      });
      onLog(`RPC invoke('service.echo'): ${JSON.stringify(res)}`);
      pushToast('RPC 回环测试成功', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`RPC invoke 失败: ${msg}`, 'error');
      pushToast(`RPC 回环测试失败: ${msg}`, 'danger');
    }
  };

  const handleContainerAction = async (
    type: 'dismiss' | 'requestImeFocus' | 'setPreferredSize',
  ) => {
    try {
      if (type === 'dismiss') {
        await bridge.sendContainerAction({ type: 'dismiss' });
        onLog('容器指令 -> dismiss');
      } else if (type === 'requestImeFocus') {
        await bridge.sendContainerAction({ type: 'requestImeFocus', focused: true });
        onLog('容器指令 -> requestImeFocus(focused=true)');
      } else {
        await bridge.sendContainerAction({ type: 'setPreferredSize', widthDp: 340, heightDp: 420 });
        onLog('容器指令 -> setPreferredSize(340x420 dp)');
      }
      pushToast(`已下发容器指令：${type}`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`容器指令失败: ${msg}`, 'error');
      pushToast(`下发指令失败: ${msg}`, 'danger');
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <TerminalSquare className="size-4 text-[var(--accent)]" />
              统一通信基座诊断 (@gojona/bridge)
            </CardTitle>
            <CardDescription>
              自动适配嵌入式 WebView 宿主、KernelSU WebUI 与浏览器模拟环境
            </CardDescription>
          </div>
          <Badge variant="accent" dot>
            运行环境: {bridge.env}
          </Badge>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => void handleExecProbe()}>
              执行命令探针
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleAtomicRoundtrip()}>
              原子读写配置
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleRpcInvoke()}>
              测试 RPC 回环
            </Button>
            <Button
              size="sm"
              variant="pill"
              onClick={() => void handleContainerAction('requestImeFocus')}
            >
              请求输入法焦点
            </Button>
            <Button
              size="sm"
              variant="pill"
              onClick={() => void handleContainerAction('setPreferredSize')}
            >
              调整容器尺寸
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => void handleContainerAction('dismiss')}
            >
              请求收起面板
            </Button>
          </div>
        </CardContent>
      </Card>

      <LogConsole entries={logs} onClear={onClearLogs} />
    </div>
  );
}
