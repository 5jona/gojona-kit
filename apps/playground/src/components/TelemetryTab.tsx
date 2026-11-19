import { Activity, BatteryCharging, Cpu, Flame } from 'lucide-react';
import { useState } from 'react';
import { useBridge } from '@pochita/bridge';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricTile,
  SettingRow,
  Slider,
  Switch,
  useToast,
} from '@pochita/ui';

const CEILING_PRESETS = [
  { label: '80%', value: 80 },
  { label: '85%', value: 85 },
  { label: '90%', value: 90 },
  { label: '95%', value: 95 },
  { label: '100%', value: 100 },
] as const;

export interface TelemetryTabProps {
  onLog: (message: string) => void;
}

export function TelemetryTab({ onLog }: TelemetryTabProps) {
  const bridge = useBridge();
  const { pushToast } = useToast();

  const [governorEnabled, setGovernorEnabled] = useState(true);
  const [foregroundBoost, setForegroundBoost] = useState(true);
  const [chargeCeilingEnabled, setChargeCeilingEnabled] = useState(true);
  const [chargeCeilingPercent, setChargeCeilingPercent] = useState(80);

  const handleSave = async () => {
    const payload = JSON.stringify(
      {
        governorEnabled,
        foregroundBoost,
        chargeCeilingEnabled,
        chargeCeilingPercent,
      },
      null,
      2,
    );
    const res = await bridge.writeFileAtomic('/etc/example/profile.json', payload);
    const msg = `保存遥测策略配置 (上限 ${chargeCeilingPercent}%) -> errno=${res.errno}`;
    onLog(msg);
    pushToast('配置已保存', 'success');
  };

  const handleReset = () => {
    setGovernorEnabled(true);
    setForegroundBoost(true);
    setChargeCeilingEnabled(true);
    setChargeCeilingPercent(80);
    onLog('已恢复遥测与控件默认参数');
    pushToast('已恢复默认设置', 'info');
  };

  return (
    <div className="space-y-3.5">
      <div className="pochita-metrics-grid">
        <MetricTile
          label="功耗负载"
          value="18.4"
          unit="W"
          statusLabel="运行中"
          statusVariant="accent"
          hint="总线稳定供电负载"
          icon={<Activity className="size-3.5 text-[var(--accent)]" />}
        />
        <MetricTile
          label="核心温度"
          value="36.2"
          unit="°C"
          statusLabel="正常"
          statusVariant="success"
          hint="阈值 42.0°C · 回滞 4.0°C"
          icon={<Flame className="size-3.5 text-[var(--warning)]" />}
        />
        <MetricTile
          label="当前容量"
          value="82"
          unit="%"
          statusLabel="充电中"
          statusVariant="success"
          hint="目标保护上限 80%"
          icon={<BatteryCharging className="size-3.5 text-[var(--success)]" />}
        />
        <MetricTile
          label="调度档位"
          value="均衡"
          statusLabel="档位 1"
          statusVariant="neutral"
          hint="示例遥测预设模式"
          icon={<Cpu className="size-3.5 text-[var(--text-secondary)]" />}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>策略与控件示例</CardTitle>
            <CardDescription>验证窄屏抽屉与宽屏管理容器下的开关、行项及预设滑块表现</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <SettingRow
            title="动态性能调度"
            description="依据当前温控余量动态调节后台调度阈值"
            control={
              <Switch
                checked={governorEnabled}
                aria-label="切换动态性能调度"
                onCheckedChange={setGovernorEnabled}
              />
            }
          />

          <SettingRow
            title="前台加速优先"
            description="交互式前台任务活跃期间优先维持稳定响应吞吐"
            control={
              <Switch
                checked={foregroundBoost}
                aria-label="切换前台加速优先"
                onCheckedChange={setForegroundBoost}
              />
            }
          />

          <SettingRow
            title="充电上限保护"
            description="在长时供电会话下限制最高充电百分比以保护电池"
            control={
              <Switch
                checked={chargeCeilingEnabled}
                aria-label="切换充电上限保护"
                onCheckedChange={setChargeCeilingEnabled}
              />
            }
          />

          <div className="rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-3.5">
            <Slider
              label="保护电量阈值"
              value={chargeCeilingPercent}
              min={80}
              max={100}
              step={5}
              unit="%"
              disabled={!chargeCeilingEnabled}
              presets={CEILING_PRESETS}
              onValueChange={setChargeCeilingPercent}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={handleReset}>
              恢复默认
            </Button>
            <Button variant="primary" onClick={() => void handleSave()}>
              保存配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
