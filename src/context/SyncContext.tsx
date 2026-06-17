import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, theme } from '@/src/components/styles';
import { getLocalDb, isLocalDbUnavailableError } from '@/src/lib/localDb';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import {
  drainSyncQueue,
  getSyncQueueSummary,
  setLocalRepositoryOnline,
  setSyncDrainRequester
} from '@/src/lib/localRepository';

type SyncSummary = {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
};

type SyncContextState = SyncSummary & {
  online: boolean;
  refresh: () => Promise<void>;
  requestDrain: () => void;
  hasUnsyncedChanges: boolean;
};

const SyncContext = createContext<SyncContextState>({
  online: true,
  pending: 0,
  syncing: 0,
  failed: 0,
  conflict: 0,
  refresh: async () => {},
  requestDrain: () => {},
  hasUnsyncedChanges: false
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState<SyncSummary>({
    pending: 0,
    syncing: 0,
    failed: 0,
    conflict: 0
  });

  const refresh = useCallback(async () => {
    try {
      await getLocalDb();
      setSummary(await getSyncQueueSummary());
    } catch (error) {
      if (!isLocalDbUnavailableError(error)) {
        throw error;
      }
      setSummary({
        pending: 0,
        syncing: 0,
        failed: 0,
        conflict: 0
      });
    }
  }, []);

  const requestDrain = useCallback(() => {
    void drainSyncQueue()
      .catch((error) => {
        if (!isLocalDbUnavailableError(error)) {
          console.warn('Could not drain sync queue:', error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        void refresh();
      });
  }, [refresh]);

  useEffect(() => {
    setSyncDrainRequester(requestDrain);
    void refresh();

    return () => {
      setSyncDrainRequester(null);
    };
  }, [refresh, requestDrain]);

  useEffect(() => subscribeToLedgerData(null, () => {
    void refresh();
  }), [refresh]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const nextOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(nextOnline);
      setLocalRepositoryOnline(nextOnline);
      if (nextOnline) {
        requestDrain();
      }
    });

    return unsubscribe;
  }, [requestDrain]);

  const value = useMemo<SyncContextState>(() => ({
    online,
    ...summary,
    refresh,
    requestDrain,
    hasUnsyncedChanges: summary.pending + summary.syncing + summary.failed + summary.conflict > 0
  }), [online, refresh, requestDrain, summary]);

  return (
    <SyncContext.Provider value={value}>
      {children}
      <SyncStatusBanner />
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  return useContext(SyncContext);
}

function SyncStatusBanner() {
  const { conflict } = useSyncContext();
  const insets = useSafeAreaInsets();

  if (conflict <= 0) {
    return null;
  }

  const label = `${conflict} sync conflict${conflict === 1 ? '' : 's'}`;

  return (
    <View pointerEvents="box-none" style={[syncStyles.overlay, { top: insets.top + 8 }]}>
      <Pressable
        onPress={() => router.push('/settings/sync')}
        style={[syncStyles.banner, syncStyles.conflict]}
      >
        <Text style={syncStyles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const syncStyles = StyleSheet.create({
  overlay: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1000,
    alignItems: 'center'
  },
  banner: {
    backgroundColor: colors.primaryDark,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18
  },
  conflict: {
    backgroundColor: colors.danger
  },
  text: {
    color: '#fff',
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600'
  }
});
