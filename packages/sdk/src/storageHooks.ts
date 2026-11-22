import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';
import type { UsePluginStorageResult } from './types.ts';

/**
 * Reactive storage hook backed by jailed `/data/system/sideveil/data/<pluginId>/` storage.
 * Automatically parses and serializes JSON files.
 *
 * `initialValue` is stored in a ref so passing inline object/array literals (e.g. `{}`)
 * never invalidates `reload` or triggers an infinite `readFile` loop.
 */
export function usePluginStorage<T = string>(
  path: string,
  initialValue?: T,
): UsePluginStorageResult<T> {
  const { bridge } = useSideVeilPlugin();
  const cleanPath = useMemo(() => path.replace(/^\/+/, ''), [path]);
  const isJson = useMemo(() => cleanPath.endsWith('.json'), [cleanPath]);

  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [value, setValueState] = useState<T | null>(() => initialValue ?? null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await bridge.readFile(cleanPath);
      if (!mountedRef.current) return;
      if (raw === null || raw === undefined) {
        setValueState(initialValueRef.current ?? null);
      } else if (isJson) {
        try {
          setValueState(JSON.parse(raw) as T);
        } catch (parseErr) {
          throw new Error(
            `Failed parsing JSON in ${cleanPath}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          );
        }
      } else {
        setValueState(raw as unknown as T);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [bridge, cleanPath, isJson]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setValue = useCallback(
    async (next: T) => {
      setLoading(true);
      setError(null);
      try {
        const serialized = isJson ? JSON.stringify(next, null, 2) : String(next);
        const res = await bridge.writeFileAtomic(cleanPath, serialized);
        if (res.errno !== 0) {
          throw new Error(`Write failed with errno ${res.errno}: ${res.stderr}`);
        }
        if (mountedRef.current) {
          setValueState(next);
        }
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(errorObj);
        }
        throw errorObj;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [bridge, cleanPath, isJson],
  );

  return {
    value,
    setValue,
    loading,
    error,
    reload,
  };
}
