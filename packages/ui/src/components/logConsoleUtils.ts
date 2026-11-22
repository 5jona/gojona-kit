export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogFilterLevel = 'all' | LogLevel;

export interface LogEntry {
  id: string;
  timestamp: string;
  level?: LogLevel;
  source?: string;
  tag?: string;
  message: string;
}

export const LOG_FILTER_OPTIONS: ReadonlyArray<{ value: LogFilterLevel; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' },
];

export interface LogFilterCriteria {
  level?: LogFilterLevel;
  query?: string;
}

export function filterLogEntries(
  entries: readonly LogEntry[],
  criteria: LogFilterCriteria = {},
): LogEntry[] {
  const level = criteria.level ?? 'all';
  const normalizedQuery = criteria.query?.trim().toLowerCase() ?? '';

  return entries.filter((entry) => {
    const entryLevel: LogLevel = entry.level ?? 'info';
    if (level !== 'all' && entryLevel !== level) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [entry.message, entry.source, entry.tag]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function formatLogEntriesText(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      const meta = [entry.source, entry.tag].filter(Boolean).join('/');
      return meta
        ? `[${entry.timestamp}] [${meta}] ${entry.message}`
        : `[${entry.timestamp}] ${entry.message}`;
    })
    .join('\n');
}
