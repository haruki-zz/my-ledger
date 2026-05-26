import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';

import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import type { Ledger } from '@/src/types/database';

type RequiredLedgerState = {
  error: string | null;
  ledger: Ledger | null;
  loading: boolean;
  reloadLedger: () => Promise<Ledger | null>;
  user: User | null;
};

export function useRequiredLedger(): RequiredLedgerState {
  const { loading: authLoading, session } = useAuth();
  const {
    activeLedger,
    error,
    ledgers,
    loading: ledgerLoading,
    reloadLedgers
  } = useLedgerContext();
  const user = session?.user ?? null;
  const ledger = activeLedger?.ledger || null;

  const reloadLedger = useCallback(async () => {
    const nextLedger = await reloadLedgers();
    return nextLedger?.ledger || null;
  }, [reloadLedgers]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.replace('/auth');
      return;
    }

    if (!ledgerLoading && !ledger && ledgers.length === 0) {
      router.replace('/ledger');
    }
  }, [authLoading, ledger, ledgerLoading, ledgers.length, user]);

  return useMemo(
    () => ({
      error,
      ledger,
      loading: authLoading || ledgerLoading,
      reloadLedger,
      user
    }),
    [authLoading, ledgerLoading, error, ledger, reloadLedger, user]
  );
}
