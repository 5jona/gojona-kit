import type {
    ContainerBackdrop,
    ContainerEdgeStatus,
    ContainerPinnedBounds,
    ContainerPresentationMode,
    ContainerThemeSyncPayload,
} from '@pochita/bridge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSideveilPlugin } from './PluginContext.ts';
import type {
    NativeHudScene,
    PluginBackendState,
    PluginRpcState,
    UseContainerActionApi,
    UsePluginStorageResult,
} from './types.ts';

/**
 * Access container control actions for the host window overlay.
 */
export function useContainerAction(): UseContainerActionApi {
    const { bridge } = useSideveilPlugin();

    const dismiss = useCallback(async () => {
        await bridge.sendContainerAction({ type: 'dismiss' });
    }, [bridge]);

    const requestImeFocus = useCallback(
        async (focused: boolean) => {
            await bridge.sendContainerAction({ type: 'requestImeFocus', focused });
        },
        [bridge],
    );

    const setPreferredSize = useCallback(
        async (size: { widthDp?: number; heightDp?: number; heightPercent?: number }) => {
            await bridge.sendContainerAction({ type: 'setPreferredSize', ...size });
        },
        [bridge],
    );

    const setBackIntercept = useCallback(
        async (enabled: boolean) => {
            await bridge.sendContainerAction({ type: 'setBackIntercept', enabled });
        },
        [bridge],
    );

    const setSurfaceBackdrop = useCallback(
        async (backdrop: ContainerBackdrop) => {
            await bridge.sendContainerAction({ type: 'setSurfaceBackdrop', backdrop });
        },
        [bridge],
    );

    const setPresentationMode = useCallback(
        async (mode: ContainerPresentationMode) => {
            await bridge.sendContainerAction({ type: 'setPresentationMode', mode });
        },
        [bridge],
    );

    const setPinnedBounds = useCallback(
        async (bounds: ContainerPinnedBounds) => {
            await bridge.sendContainerAction({ type: 'setPinnedBounds', ...bounds });
        },
        [bridge],
    );

    const setEdgeStatus = useCallback(
        async (status: ContainerEdgeStatus | null) => {
            await bridge.sendContainerAction({ type: 'setEdgeStatus', status });
        },
        [bridge],
    );

    const syncTheme = useCallback(
        async (payload: ContainerThemeSyncPayload) => {
            await bridge.sendContainerAction({ type: 'syncTheme', payload });
        },
        [bridge],
    );

    return useMemo(
        () => ({
            dismiss,
            requestImeFocus,
            setPreferredSize,
            setBackIntercept,
            setSurfaceBackdrop,
            setPresentationMode,
            setPinnedBounds,
            setEdgeStatus,
            syncTheme,
        }),
        [
            dismiss,
            requestImeFocus,
            setPreferredSize,
            setBackIntercept,
            setSurfaceBackdrop,
            setPresentationMode,
            setPinnedBounds,
            setEdgeStatus,
            syncTheme,
        ],
    );
}

/**
 * Intercept hardware back button / back gesture in the host window.
 * When enabled, the host delegates back presses to this callback instead of dismissing the panel.
 */
export function useBackPress(handler: () => void, enabled = true): void {
    const { bridge } = useSideveilPlugin();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!enabled) return;

        void bridge.sendContainerAction({ type: 'setBackIntercept', enabled: true }).catch(() => { });

        const unsubscribe = bridge.onBackPressed(() => {
            handlerRef.current();
        });

        return () => {
            unsubscribe();
            void bridge.sendContainerAction({ type: 'setBackIntercept', enabled: false }).catch(() => { });
        };
    }, [bridge, enabled]);
}

/**
 * Perform type-safe JSON-RPC calls against the plugin's dedicated native/app UDS backend.
 */
export function usePluginRpc<TParams = unknown, TResult = unknown>(method: string) {
    const { bridge } = useSideveilPlugin();
    const [state, setState] = useState<PluginRpcState<TResult>>({
        data: null,
        loading: false,
        error: null,
    });

    const invoke = useCallback(
        async (params?: TParams): Promise<TResult> => {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            try {
                const res = await bridge.invokePlugin<TResult>(method, params);
                setState({ data: res, loading: false, error: null });
                return res;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setState({ data: null, loading: false, error });
                throw error;
            }
        },
        [bridge, method],
    );

    return {
        invoke,
        data: state.data,
        loading: state.loading,
        error: state.error,
    };
}

/**
 * Reactive storage hook backed by jailed `/data/system/sideveil/data/<pluginId>/` storage.
 * Automatically parses and serializes JSON files.
 */
export function usePluginStorage<T = string>(
    path: string,
    initialValue?: T,
): UsePluginStorageResult<T> {
    const { bridge } = useSideveilPlugin();
    const cleanPath = useMemo(() => path.replace(/^\/+/, ''), [path]);
    const isJson = useMemo(() => cleanPath.endsWith('.json'), [cleanPath]);

    const [value, setValueState] = useState<T | null>(initialValue ?? null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const raw = await bridge.readFile(cleanPath);
            if (raw === null || raw === undefined) {
                setValueState(initialValue ?? null);
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
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setLoading(false);
        }
    }, [bridge, cleanPath, initialValue, isJson]);

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
                setValueState(next);
            } catch (err) {
                const errorObj = err instanceof Error ? err : new Error(String(err));
                setError(errorObj);
                throw errorObj;
            } finally {
                setLoading(false);
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

/**
 * Subscribe to plugin-scoped events pushed by daemon or UDS backend.
 */
export function usePluginEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
    const { bridge } = useSideveilPlugin();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        return bridge.onPluginEvent<T>(event, (payload) => {
            handlerRef.current(payload);
        });
    }, [bridge, event]);
}

/**
 * Returns the current backend connection status of this plugin.
 */
export function usePluginBackendState(): PluginBackendState {
    const { backendState } = useSideveilPlugin();
    return backendState;
}

/**
 * Updates live micro-status badges/progress displayed on the Sideveil edge handle,
 * automatically clearing status when the component unmounts.
 */
export function useEdgeStatus(): {
    setStatus: (status: ContainerEdgeStatus) => Promise<void>;
    clearStatus: () => Promise<void>;
} {
    const { bridge } = useSideveilPlugin();

    const setStatus = useCallback(
        async (status: ContainerEdgeStatus) => {
            await bridge.sendContainerAction({ type: 'setEdgeStatus', status });
        },
        [bridge],
    );

    const clearStatus = useCallback(async () => {
        await bridge.sendContainerAction({ type: 'setEdgeStatus', status: { clear: true } });
    }, [bridge]);

    useEffect(() => {
        return () => {
            void bridge
                .sendContainerAction({ type: 'setEdgeStatus', status: { clear: true } })
                .catch(() => { });
        };
    }, [bridge]);

    return useMemo(() => ({ setStatus, clearStatus }), [setStatus, clearStatus]);
}

/**
 * Pushes declarative `NativeHudScene` updates to the zero-WebView `vello_cpu` NEON native HUD
 * (requires `native-hud` capability in `manifest.json`).
 */
export function useNativeHud(): {
    updateScene: (scene: NativeHudScene) => Promise<void>;
    dismiss: () => Promise<void>;
} {
    const { bridge, pluginId } = useSideveilPlugin();

    const updateScene = useCallback(
        async (scene: NativeHudScene) => {
            await bridge.invoke('hud.updateScene', {
                ...scene,
                pluginId: scene.pluginId ?? pluginId,
            });
        },
        [bridge, pluginId],
    );

    const dismiss = useCallback(async () => {
        await bridge.invoke('hud.dismiss', { pluginId });
    }, [bridge, pluginId]);

    return useMemo(() => ({ updateScene, dismiss }), [updateScene, dismiss]);
}

/**
 * Applies host-synthesized Material You `Oklch` CSS custom properties (`theme.paletteUpdated`)
 * directly to `document.documentElement`, cleaning up injected overrides on unmount.
 */
export function useDynamicThemeTokens(enabled = true): void {
    const { bridge } = useSideveilPlugin();

    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return;
        const appliedKeys = new Set<string>();
        const unsubscribe = bridge.onThemePalette((palette) => {
            const root = document.documentElement;
            for (const [key, value] of Object.entries(palette.cssTokens)) {
                if (key.startsWith('--') && typeof value === 'string' && value.trim().length > 0) {
                    root.style.setProperty(key, value.trim());
                    appliedKeys.add(key);
                }
            }
        });
        return () => {
            unsubscribe();
            const root = document.documentElement;
            for (const key of appliedKeys) {
                root.style.removeProperty(key);
            }
        };
    }, [bridge, enabled]);
}
