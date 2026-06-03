type LedgerListener = () => void;

const listenersByLedger = new Map<string, Set<LedgerListener>>();
const globalListeners = new Set<LedgerListener>();

export function subscribeToLedgerData(ledgerId: string | null | undefined, listener: LedgerListener) {
  if (!ledgerId) {
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }

  const listeners = listenersByLedger.get(ledgerId) || new Set<LedgerListener>();
  listeners.add(listener);
  listenersByLedger.set(ledgerId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByLedger.delete(ledgerId);
    }
  };
}

export function emitLedgerDataChanged(ledgerId?: string | null) {
  for (const listener of globalListeners) {
    notifyListener(listener);
  }

  if (!ledgerId) {
    return;
  }

  const listeners = listenersByLedger.get(ledgerId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    notifyListener(listener);
  }
}

function notifyListener(listener: LedgerListener) {
  queueMicrotask(() => {
    try {
      listener();
    } catch (error) {
      console.warn('Ledger data listener failed:', error);
    }
  });
}
