import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { useAuth } from '@/src/context/AuthContext';
import { getErrorMessage, getMyLedger } from '@/src/lib/ledger';
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
  const user = session?.user ?? null;
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [checkingLedger, setCheckingLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadLedger = useCallback(async () => {
    setError(null);

    if (!user) {
      setLedger(null);
      return null;
    }

    setCheckingLedger(true);
    try {
      const nextLedger = await getMyLedger();
      if (!nextLedger) {
        setLedger(null);
        router.replace('/ledger');
        return null;
      }

      setLedger(nextLedger);
      return nextLedger;
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      return null;
    } finally {
      setCheckingLedger(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLedger(null);
      setCheckingLedger(false);
      router.replace('/auth');
      return;
    }

    reloadLedger();
  }, [authLoading, reloadLedger, user]);

  return useMemo(
    () => ({
      error,
      ledger,
      loading: authLoading || checkingLedger,
      reloadLedger,
      user
    }),
    [authLoading, checkingLedger, error, ledger, reloadLedger, user]
  );
}
