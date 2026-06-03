import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies } from '@/src/components/styles';
import { getLocalDb } from '@/src/lib/localDb';
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
    await getLocalDb();
    setSummary(await getSyncQueueSummary());
  }, []);

  const requestDrain = useCallback(() => {
    void drainSyncQueue().finally(refresh);
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
  const { conflict, failed, online, pending, syncing } = useSyncContext();
  const insets = useSafeAreaInsets();
  const visible = !online || conflict > 0 || failed > 0 || pending > 0 || syncing > 0;

  if (!visible) {
    return null;
  }

  const label = !online
    ? 'Offline'
    : conflict > 0
      ? `${conflict} sync conflict${conflict === 1 ? '' : 's'}`
      : failed > 0
        ? `${failed} sync failed`
        : syncing > 0
          ? 'Syncing'
          : `${pending} pending sync`;

  return (
    <View pointerEvents="box-none" style={[syncStyles.overlay, { top: insets.top + 8 }]}>
      <Pressable
        onPress={() => router.push('/settings/sync')}
        style={[
          syncStyles.banner,
          !online && syncStyles.offline,
          conflict > 0 && syncStyles.conflict,
          failed > 0 && syncStyles.failed
        ]}
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
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18
  },
  offline: {
    backgroundColor: colors.ink
  },
  conflict: {
    backgroundColor: colors.danger
  },
  failed: {
    backgroundColor: colors.accent
  },
  text: {
    color: '#fff',
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700'
  }
});
