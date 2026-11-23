/**
 * Severity level of a diagnostic log entry.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Filter selection value for `<LogConsole>`.
 */
export type LogFilterLevel = 'all' | LogLevel;

/**
 * Structured diagnostic log entry displayed in `<LogConsole>`.
 */
export interface LogEntry {
  id: string;
  timestamp: string;
  level?: LogLevel;
  source?: string;
  tag?: string;
  message: string;
}

/**
 * Built-in filter chip definitions for `<LogConsole>`.
 */
export const LOG_FILTER_OPTIONS: ReadonlyArray<{ value: LogFilterLevel; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' },
];

/**
 * Filtering criteria for `filterLogEntries`.
 */
export interface LogFilterCriteria {
  level?: LogFilterLevel;
  query?: string;
}

/**
 * Filters diagnostic log entries by severity level and case-insensitive message/source/tag substring.
 */
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

/**
 * Formats log entries as newline-delimited plain text for clipboard copy or file export.
 */
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
