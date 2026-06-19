export type SyncEntityType = 'expense' | 'category' | 'recurring_rule';
export type SyncAction = 'create' | 'edit' | 'delete';
type SyncStatus = 'queued' | 'syncing' | 'failed' | 'conflict';

export type SyncQueueRecord<TPayload = unknown> = {
  sequence: number;
  entity_type: SyncEntityType;
  entity_id: string;
  ledger_id: string;
  action: SyncAction;
  payload: TPayload;
  base_updated_at: string | null;
  status: SyncStatus;
  error: string | null;
  retry_count: number;
  next_attempt_at: number;
  created_at: string;
  updated_at: string;
};

export type QueueMergeDecision =
  | { kind: 'insert'; action: SyncAction }
  | { kind: 'update'; sequence: number; action: SyncAction }
  | { kind: 'drop'; sequence: number | null };

const MAX_SYNC_RETRIES = 5;

export function mergeQueueAction(
  existing: Pick<SyncQueueRecord, 'sequence' | 'action'> | null,
  nextAction: SyncAction
): QueueMergeDecision {
  if (!existing) {
    return { kind: 'insert', action: nextAction };
  }

  if (existing.action === 'create' && nextAction === 'delete') {
    return { kind: 'drop', sequence: existing.sequence };
  }

  if (existing.action === 'create' && nextAction === 'edit') {
    return { kind: 'update', sequence: existing.sequence, action: 'create' };
  }

  if (existing.action === 'edit' && nextAction === 'edit') {
    return { kind: 'update', sequence: existing.sequence, action: 'edit' };
  }

  if (existing.action === 'edit' && nextAction === 'delete') {
    return { kind: 'update', sequence: existing.sequence, action: 'delete' };
  }

  if (existing.action === 'delete') {
    return { kind: 'update', sequence: existing.sequence, action: 'delete' };
  }

  return { kind: 'update', sequence: existing.sequence, action: nextAction };
}

function retryDelayMs(retryCount: number) {
  const baseDelay = Math.min(60_000, 1_000 * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * 400);
  return baseDelay + jitter;
}

export function classifySyncError(error: unknown): 'conflict' | 'failed' | 'retry' {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (code === 'PT409' || code === '409') {
    return 'conflict';
  }

  if (
    code === 'PGRST301' ||
    code === '42501' ||
    code === 'PGRST116' ||
    code.startsWith('22') ||
    code.startsWith('23')
  ) {
    return 'failed';
  }

  if (
    lowerMessage.includes('sync_conflict') ||
    lowerMessage.includes('conflict') ||
    lowerMessage.includes('remote row changed')
  ) {
    return 'conflict';
  }

  if (
    lowerMessage.includes('not authenticated') ||
    lowerMessage.includes('jwt') ||
    lowerMessage.includes('permission') ||
    lowerMessage.includes('not a ledger member') ||
    lowerMessage.includes('not found') ||
    lowerMessage.includes('must') ||
    lowerMessage.includes('invalid')
  ) {
    return 'failed';
  }

  return 'retry';
}

export function nextFailureState(error: unknown, retryCount: number) {
  const classification = classifySyncError(error);

  if (classification === 'conflict') {
    return {
      status: 'conflict' as const,
      retryCount,
      nextAttemptAt: 0
    };
  }

  if (classification === 'failed' || retryCount + 1 >= MAX_SYNC_RETRIES) {
    return {
      status: 'failed' as const,
      retryCount: retryCount + 1,
      nextAttemptAt: 0
    };
  }

  return {
    status: 'failed' as const,
    retryCount: retryCount + 1,
    nextAttemptAt: Date.now() + retryDelayMs(retryCount)
  };
}
