import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/context/AuthContext';
import {
  createLedger,
  deleteLedger as deleteLedgerById,
  getErrorMessage,
  getMyLedgerMemberships,
  joinLedger,
  leaveLedger as leaveLedgerById,
  type LedgerMembership
} from '@/src/lib/ledger';
import {
  isLocalRepositoryOnline,
  refreshExpenses,
  refreshLedgerCategories,
  refreshLedgerLocalData,
  refreshMemberships
} from '@/src/lib/localRepository';
import { emitLedgerDataChanged } from '@/src/lib/localEvents';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

const ACTIVE_LEDGER_STORAGE_KEY = 'my-ledger.activeLedgerId';

type LedgerContextState = {
  activeLedger: LedgerMembership | null;
  createAndSelect: (name: string) => Promise<LedgerMembership | null>;
  deleteLedger: (ledgerId: string) => Promise<LedgerMembership | null>;
  error: string | null;
  joinAndSelect: (inviteCode: string) => Promise<LedgerMembership | null>;
  leaveLedger: (ledgerId: string) => Promise<LedgerMembership | null>;
  ledgers: LedgerMembership[];
  loading: boolean;
  reloadLedgers: (preferredLedgerId?: string | null) => Promise<LedgerMembership | null>;
  selectLedger: (ledgerId: string) => Promise<LedgerMembership | null>;
};

const LedgerContext = createContext<LedgerContextState | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user.id || null;
  const [activeLedger, setActiveLedger] = useState<LedgerMembership | null>(null);
  const [ledgers, setLedgers] = useState<LedgerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const membershipRefreshRef = useRef<Promise<void> | null>(null);

  const reloadLedgers = useCallback(async (preferredLedgerId?: string | null, refreshRemote = true) => {
    const loadSequence = ++loadSequenceRef.current;

    if (authLoading || !isSupabaseConfigured) {
      return null;
    }

    if (!userId) {
      if (loadSequence === loadSequenceRef.current) {
        await AsyncStorage.removeItem(ACTIVE_LEDGER_STORAGE_KEY);
        setLedgers([]);
        setActiveLedger(null);
        setError(null);
        setLoading(false);
      }
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const storedLedgerId = preferredLedgerId === undefined
        ? await AsyncStorage.getItem(ACTIVE_LEDGER_STORAGE_KEY)
        : preferredLedgerId;
      const nextLedgers = await getMyLedgerMemberships(userId);
      const nextActiveLedger = nextLedgers.find((membership) => membership.ledger.id === storedLedgerId)
        || nextLedgers[0]
        || null;

      if (loadSequence === loadSequenceRef.current) {
        if (nextActiveLedger) {
          await AsyncStorage.setItem(ACTIVE_LEDGER_STORAGE_KEY, nextActiveLedger.ledger.id);
        } else {
          await AsyncStorage.removeItem(ACTIVE_LEDGER_STORAGE_KEY);
        }

        setLedgers(nextLedgers);
        setActiveLedger(nextActiveLedger);
      }

      if (refreshRemote && isLocalRepositoryOnline() && !membershipRefreshRef.current) {
        membershipRefreshRef.current = refreshMemberships(userId)
          .then(async () => {
            const refreshedLedgers = await getMyLedgerMemberships(userId);
            const refreshedActiveLedger = refreshedLedgers.find((membership) => membership.ledger.id === storedLedgerId)
              || refreshedLedgers[0]
              || null;

            if (loadSequence !== loadSequenceRef.current) {
              return;
            }

            if (refreshedActiveLedger) {
              await AsyncStorage.setItem(ACTIVE_LEDGER_STORAGE_KEY, refreshedActiveLedger.ledger.id);
            } else {
              await AsyncStorage.removeItem(ACTIVE_LEDGER_STORAGE_KEY);
            }

            setLedgers(refreshedLedgers);
            setActiveLedger(refreshedActiveLedger);
          })
          .catch((refreshError) => {
            console.warn('Could not refresh ledger memberships:', getErrorMessage(refreshError));
          })
          .finally(() => {
            membershipRefreshRef.current = null;
          });
      }

      return nextActiveLedger;
    } catch (loadError) {
      const message = getErrorMessage(loadError);
      if (loadSequence === loadSequenceRef.current) {
        setError(message);
      }
      return null;
    } finally {
      if (loadSequence === loadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, userId]);

  useEffect(() => {
    if (authLoading || !isSupabaseConfigured) {
      setLoading(true);
      return;
    }

    void reloadLedgers();
  }, [authLoading, reloadLedgers, userId]);

  useEffect(() => {
    const ledgerId = activeLedger?.ledger.id;
    if (!ledgerId) {
      return undefined;
    }

    void refreshLedgerLocalData(ledgerId);

    const channel = supabase
      .channel(`ledger-local-refresh-${ledgerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          void refreshExpenses(ledgerId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_categories',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          void refreshLedgerCategories(ledgerId);
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
          void refreshExpenses(ledgerId);
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
          emitLedgerDataChanged(ledgerId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeLedger?.ledger.id]);

  const selectLedger = useCallback(async (ledgerId: string) => {
    const selectedLedger = ledgers.find((membership) => membership.ledger.id === ledgerId);
    if (selectedLedger) {
      await AsyncStorage.setItem(ACTIVE_LEDGER_STORAGE_KEY, ledgerId);
      setActiveLedger(selectedLedger);
      return selectedLedger;
    }

    return reloadLedgers(ledgerId);
  }, [ledgers, reloadLedgers]);

  const createAndSelect = useCallback(async (name: string) => {
    const ledger = await createLedger(name);
    return reloadLedgers(ledger.id);
  }, [reloadLedgers]);

  const joinAndSelect = useCallback(async (inviteCode: string) => {
    const ledger = await joinLedger(inviteCode);
    return reloadLedgers(ledger.id);
  }, [reloadLedgers]);

  const leaveLedger = useCallback(async (ledgerId: string) => {
    await leaveLedgerById(ledgerId);
    return reloadLedgers(activeLedger?.ledger.id === ledgerId ? null : activeLedger?.ledger.id);
  }, [activeLedger?.ledger.id, reloadLedgers]);

  const deleteLedger = useCallback(async (ledgerId: string) => {
    await deleteLedgerById(ledgerId);
    return reloadLedgers(activeLedger?.ledger.id === ledgerId ? null : activeLedger?.ledger.id);
  }, [activeLedger?.ledger.id, reloadLedgers]);

  const value = useMemo(
    () => ({
      activeLedger,
      createAndSelect,
      deleteLedger,
      error,
      joinAndSelect,
      leaveLedger,
      ledgers,
      loading,
      reloadLedgers,
      selectLedger
    }),
    [
      activeLedger,
      createAndSelect,
      deleteLedger,
      error,
      joinAndSelect,
      leaveLedger,
      ledgers,
      loading,
      reloadLedgers,
      selectLedger
    ]
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedgerContext() {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedgerContext must be used within LedgerProvider');
  }

  return context;
}
