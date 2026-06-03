import { describe, expect, it } from 'vitest';

import { classifySyncError, mergeQueueAction, nextFailureState } from './syncQueue';

describe('mergeQueueAction', () => {
  it('coalesces create followed by edit into one create', () => {
    expect(mergeQueueAction({ sequence: 1, action: 'create' }, 'edit')).toEqual({
      kind: 'update',
      sequence: 1,
      action: 'create'
    });
  });

  it('drops create followed by delete', () => {
    expect(mergeQueueAction({ sequence: 1, action: 'create' }, 'delete')).toEqual({
      kind: 'drop',
      sequence: 1
    });
  });

  it('coalesces edit followed by delete into delete', () => {
    expect(mergeQueueAction({ sequence: 2, action: 'edit' }, 'delete')).toEqual({
      kind: 'update',
      sequence: 2,
      action: 'delete'
    });
  });

  it('inserts when no active queue row exists', () => {
    expect(mergeQueueAction(null, 'edit')).toEqual({
      kind: 'insert',
      action: 'edit'
    });
  });
});

describe('classifySyncError', () => {
  it('classifies optimistic concurrency errors as conflicts', () => {
    expect(classifySyncError(new Error('sync_conflict: remote row changed'))).toBe('conflict');
  });

  it('classifies SQLSTATE PT409 as a conflict', () => {
    expect(classifySyncError({ code: 'PT409', message: 'concurrent update detected' })).toBe('conflict');
  });

  it('classifies validation errors as terminal failures', () => {
    expect(classifySyncError(new Error('amount_yen must be positive'))).toBe('failed');
  });

  it('classifies transient errors as retryable', () => {
    expect(classifySyncError(new Error('network request failed'))).toBe('retry');
  });
});

describe('nextFailureState', () => {
  it('marks retryable errors as failed with a future retry time', () => {
    const state = nextFailureState(new Error('network request failed'), 0);
    expect(state.status).toBe('failed');
    expect(state.retryCount).toBe(1);
    expect(state.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('stops retrying after the max retry count', () => {
    const state = nextFailureState(new Error('network request failed'), 4);
    expect(state.status).toBe('failed');
    expect(state.retryCount).toBe(5);
    expect(state.nextAttemptAt).toBe(0);
  });
});
