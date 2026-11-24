import type { BridgeClient, ContainerEdgeStatus } from '@gojona/bridge/core';

export interface EdgeStatusController {
  setStatus: (status: ContainerEdgeStatus) => Promise<void>;
  clearStatus: () => Promise<void>;
  cleanupOnUnmount: () => void;
}

/**
 * Tracks whether a specific caller owns an active edge status so unmount cleanup
 * only clears status if this controller actually set a non-null, non-clear status.
 */
export function createEdgeStatusController(
  bridge: Pick<BridgeClient, 'sendContainerAction'>,
): EdgeStatusController {
  let hasActiveStatus = false;

  const setStatus = async (status: ContainerEdgeStatus): Promise<void> => {
    hasActiveStatus = !status.clear;
    await bridge.sendContainerAction({ type: 'setEdgeStatus', status });
  };

  const clearStatus = async (): Promise<void> => {
    hasActiveStatus = false;
    await bridge.sendContainerAction({ type: 'setEdgeStatus', status: { clear: true } });
  };

  const cleanupOnUnmount = (): void => {
    if (!hasActiveStatus) return;
    hasActiveStatus = false;
    void bridge
      .sendContainerAction({ type: 'setEdgeStatus', status: { clear: true } })
      .catch(() => {});
  };

  return { setStatus, clearStatus, cleanupOnUnmount };
}
