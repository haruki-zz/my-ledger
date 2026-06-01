import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getOpenTransferItems,
  setTransferConfirmations,
  type TransferConfirmationUpdate
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { TransferChecklistItemRow } from '@/src/types/database';

let transferChecklistSubscriptionSequence = 0;
const REALTIME_RELOAD_DEBOUNCE_MS = 250;

export function useTransferChecklist(ledgerId: string | null) {
  const [items, setItems] = useState<TransferChecklistItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const hasLoadedData = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!ledgerId) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const shouldKeepCurrentData = hasLoadedData.current;

    setError(null);
    setLoading(!shouldKeepCurrentData);
    setRefreshing(shouldKeepCurrentData);

    try {
      const nextItems = await getOpenTransferItems(ledgerId);

      if (requestSequence.current !== requestId) {
        return;
      }

      setItems(nextItems);
      hasLoadedData.current = true;
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load transfers');
      }
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [ledgerId]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }

    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void loadRef.current();
    }, REALTIME_RELOAD_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    requestSequence.current += 1;
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
    }

    hasLoadedData.current = false;
    setItems([]);
    setError(null);
    setLoading(Boolean(ledgerId));
    setRefreshing(false);
  }, [ledgerId]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++transferChecklistSubscriptionSequence;
    const channel = supabase
      .channel(`ledger-transfers-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          scheduleReload();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expense_splits'
        },
        () => {
          scheduleReload();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transfer_checklist_completions'
        },
        () => {
          scheduleReload();
        }
      )
      .subscribe();

    return () => {
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [ledgerId, scheduleReload]);

  const setConfirmations = useCallback(async (updates: TransferConfirmationUpdate[]) => {
    if (updates.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await setTransferConfirmations(updates);
      scheduleReload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update transfers');
    } finally {
      setSaving(false);
    }
  }, [scheduleReload]);

  return {
    items,
    loading,
    refreshing,
    saving,
    error,
    reload: load,
    setConfirmations
  };
}
