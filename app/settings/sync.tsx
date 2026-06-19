import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import { useSyncContext } from '@/src/context/SyncContext';
import {
  discardLocalSyncQueueItem,
  forceLocalSyncQueueItem,
  getSyncQueueItems,
  retrySyncQueueItem
} from '@/src/lib/localRepository';
import { isLocalDbUnavailableError, retryLocalDbOpen } from '@/src/lib/localDb';
import type { SyncQueueRecord } from '@/src/lib/syncQueue';

export default function SyncStatusScreen() {
  const sync = useSyncContext();
  const { refresh } = sync;
  const [items, setItems] = useState<SyncQueueRecord[]>([]);
  const [localDbError, setLocalDbError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLocalDbError(null);
      setItems(await getSyncQueueItems());
      await refresh();
    } catch (loadError) {
      if (!isLocalDbUnavailableError(loadError)) {
        throw loadError;
      }
      setItems([]);
      setLocalDbError(loadError.message);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(sequence: number) {
    await retrySyncQueueItem(sequence);
    await load();
  }

  async function retryLocalDatabase() {
    setLoading(true);
    try {
      await retryLocalDbOpen();
      await load();
    } catch (retryError) {
      if (!isLocalDbUnavailableError(retryError)) {
        Alert.alert('Retry Failed', retryError instanceof Error ? retryError.message : String(retryError));
      }
      setLocalDbError(retryError instanceof Error ? retryError.message : String(retryError));
    } finally {
      setLoading(false);
    }
  }

  function forceLocal(sequence: number) {
    Alert.alert(
      'Use Local Version',
      'This will retry the sync without the original conflict check and may overwrite the remote version.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Local',
          style: 'destructive',
          onPress: async () => {
            await forceLocalSyncQueueItem(sequence);
            await load();
          }
        }
      ]
    );
  }

  function discardLocal(sequence: number) {
    Alert.alert(
      'Discard Local Change',
      'This removes the pending local change and refreshes from the remote database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await discardLocalSyncQueueItem(sequence);
            await load();
          }
        }
      ]
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>Sync Status</Text>
        <Text style={styles.muted}>
          {sync.online ? 'Online' : 'Offline'} · {sync.pending} pending · {sync.failed} failed · {sync.conflict} conflicts
        </Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}

      {localDbError && !loading ? (
        <BentoCard>
          <Text style={styles.h2}>Local database unavailable</Text>
          <Text style={styles.muted}>
            The app is using the remote database directly. Retry if browser storage support has changed.
          </Text>
          <Pressable onPress={retryLocalDatabase} style={[styles.button, syncStyles.retryLocalDbButton]}>
            <Text style={styles.buttonText}>Retry local database</Text>
          </Pressable>
        </BentoCard>
      ) : null}

      {items.length === 0 && !loading && !localDbError ? (
        <BentoCard>
          <Text style={styles.h2}>All synced</Text>
          <Text style={styles.muted}>There are no pending offline changes.</Text>
        </BentoCard>
      ) : null}

      {items.map((item) => (
        <BentoCard key={item.sequence} variant="list">
          <View style={styles.between}>
            <View style={syncStyles.itemText}>
              <Text style={styles.h2}>{labelFor(item)}</Text>
              <Text style={styles.muted}>
                #{item.sequence} · {item.status}
              </Text>
            </View>
            <View style={[syncStyles.statusPill, pillStyle(item.status)]}>
              <Text style={syncStyles.statusText}>{item.status}</Text>
            </View>
          </View>

          {item.error ? <Text style={styles.error}>{item.error}</Text> : null}

          <View style={styles.row}>
            <Pressable onPress={() => retry(item.sequence)} style={[styles.button, syncStyles.action]}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
            {item.status === 'conflict' ? (
              <Pressable onPress={() => forceLocal(item.sequence)} style={[styles.button, styles.dangerButton, syncStyles.action]}>
                <Text style={styles.buttonText}>Use Local</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => discardLocal(item.sequence)} style={[styles.button, styles.secondaryButton, syncStyles.action]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Discard</Text>
            </Pressable>
          </View>
        </BentoCard>
      ))}
    </ScrollView>
  );
}

function labelFor(item: SyncQueueRecord) {
  return `${item.action} ${item.entity_type}`;
}

function pillStyle(status: string) {
  if (status === 'conflict') {
    return { backgroundColor: colors.danger };
  }

  if (status === 'failed') {
    return { backgroundColor: colors.warning };
  }

  return { backgroundColor: colors.success };
}

const syncStyles = StyleSheet.create({
  itemText: {
    flex: 1,
    gap: 4
  },
  statusPill: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusText: {
    color: '#fff',
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  action: {
    flex: 1,
    minHeight: 42
  },
  retryLocalDbButton: {
    marginTop: 12,
    minHeight: 42
  }
});
