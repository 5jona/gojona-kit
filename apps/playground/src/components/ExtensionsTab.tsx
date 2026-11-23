import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Slider,
  Switch,
  useToast,
} from '@gojona/ui';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { EdgeHotzoneCanvas } from './EdgeHotzoneCanvas.tsx';

interface ExtensionEntry {
  id: string;
  name: string;
  kind: string;
  targetPackages: readonly string[];
  approved: boolean;
}

const INITIAL_EXTENSIONS: ExtensionEntry[] = [
  {
    id: 'ext.notes-dock',
    name: '笔记悬浮窗',
    kind: '微前端扩展视图',
    targetPackages: ['com.example.reader', 'com.example.notes'],
    approved: true,
  },
  {
    id: 'ext.metrics-hud',
    name: '性能监控面板',
    kind: '系统遥测模块',
    targetPackages: ['com.example.media', 'com.example.browser'],
    approved: true,
  },
  {
    id: 'ext.quick-tools',
    name: '快捷工具集',
    kind: '外部业务面板',
    targetPackages: ['com.example.reader'],
    approved: false,
  },
];

export interface ExtensionsTabProps {
  onLog: (message: string) => void;
}

export function ExtensionsTab({ onLog }: ExtensionsTabProps) {
  const { pushToast } = useToast();
  const [extensions, setExtensions] = useState<ExtensionEntry[]>(INITIAL_EXTENSIONS);
  const [edge, setEdge] = useState<'left' | 'right'>('right');
  const [topPercent, setTopPercent] = useState(24);
  const [heightPercent, setHeightPercent] = useState(32);
  const [widthDp, setWidthDp] = useState(22);

  const toggleExtension = (id: string, checked: boolean) => {
    setExtensions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approved: checked } : item)),
    );
    const msg = `${id} 审批状态已更新为：${checked ? '已授权' : '待审批'}`;
    onLog(msg);
    pushToast(msg, checked ? 'success' : 'warning');
  };

  return (
    <div className="pochita-adaptive-grid">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-[var(--accent)]" />
              扩展注册表
            </CardTitle>
            <CardDescription>管理微前端扩展审批状态与前台包名作用域</CardDescription>
          </div>
          <Badge variant="accent" dot pulse>
            {extensions.filter((p) => p.approved).length}/{extensions.length} 已激活
          </Badge>
        </CardHeader>

        <CardContent>
          {extensions.map((ext) => (
            <div
              key={ext.id}
              className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {ext.name}
                    </span>
                    <Badge variant={ext.approved ? 'success' : 'warning'}>
                      {ext.approved ? '已授权' : '待审批'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {ext.id} · {ext.kind}
                  </p>
                </div>

                <Switch
                  checked={ext.approved}
                  aria-label={`切换扩展 ${ext.name}`}
                  onCheckedChange={(checked) => toggleExtension(ext.id, checked)}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ext.targetPackages.map((pkg) => (
                  <span
                    key={pkg}
                    className="rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]"
                  >
                    {pkg}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-4 text-[var(--accent)]" />
              边缘触发区几何
            </CardTitle>
            <CardDescription>调节视觉提示条位置与手势拦截区域范围</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={edge === 'left' ? 'primary' : 'secondary'}
              onClick={() => {
                setEdge('left');
                onLog('触发热区停靠边切换为：左侧');
              }}
            >
              左侧
            </Button>
            <Button
              size="sm"
              variant={edge === 'right' ? 'primary' : 'secondary'}
              onClick={() => {
                setEdge('right');
                onLog('触发热区停靠边切换为：右侧');
              }}
            >
              右侧
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <EdgeHotzoneCanvas
            edge={edge}
            topPercent={topPercent}
            heightPercent={heightPercent}
            widthDp={widthDp}
          />

          <Slider
            label="垂直起始位置"
            value={topPercent}
            min={5}
            max={80}
            step={1}
            unit="%"
            onValueChange={setTopPercent}
          />
          <Slider
            label="热区高度占比"
            value={heightPercent}
            min={15}
            max={65}
            step={1}
            unit="%"
            onValueChange={setHeightPercent}
          />
          <Slider
            label="横向感应宽度"
            value={widthDp}
            min={12}
            max={40}
            step={2}
            unit="dp"
            onValueChange={setWidthDp}
          />
        </CardContent>
      </Card>
    </div>
  );
}
