import { useCallback, useReducer } from 'react';

import { currentMonthKey } from '@/src/lib/stats';

export type HistoryFilterDropdownKey = 'user' | 'category' | 'month';

type HistoryFilterState = {
  activeDropdown: HistoryFilterDropdownKey | null;
  selectedCategories: Set<string>;
  selectedMonth: string;
  selectedUserId: string | null;
};

type HistoryFilterAction =
  | { type: 'clearCategories' }
  | { type: 'closeDropdown' }
  | { type: 'reset' }
  | { type: 'selectMonth'; value: string }
  | { type: 'selectUser'; value: string | null }
  | { type: 'toggleCategory'; value: string }
  | { type: 'toggleDropdown'; value: HistoryFilterDropdownKey };

function createInitialFilterState(): HistoryFilterState {
  return {
    activeDropdown: null,
    selectedCategories: new Set(),
    selectedMonth: currentMonthKey(),
    selectedUserId: null
  };
}

export function useHistoryFilters() {
  const [state, dispatch] = useReducer(historyFilterReducer, undefined, createInitialFilterState);

  const selectUser = useCallback((value: string) => {
    dispatch({ type: 'selectUser', value: value || null });
  }, []);

  const selectMonth = useCallback((value: string) => {
    dispatch({ type: 'selectMonth', value: value || currentMonthKey() });
  }, []);

  const clearCategories = useCallback(() => dispatch({ type: 'clearCategories' }), []);
  const closeDropdown = useCallback(() => dispatch({ type: 'closeDropdown' }), []);
  const resetFilters = useCallback(() => dispatch({ type: 'reset' }), []);
  const toggleCategory = useCallback((value: string) => dispatch({ type: 'toggleCategory', value }), []);
  const toggleDropdown = useCallback((value: HistoryFilterDropdownKey) => dispatch({ type: 'toggleDropdown', value }), []);

  return {
    ...state,
    clearCategories,
    closeDropdown,
    resetFilters,
    selectMonth,
    selectUser,
    toggleCategory,
    toggleDropdown
  };
}

function historyFilterReducer(state: HistoryFilterState, action: HistoryFilterAction): HistoryFilterState {
  if (action.type === 'clearCategories') {
    return { ...state, selectedCategories: new Set() };
  }

  if (action.type === 'closeDropdown') {
    return { ...state, activeDropdown: null };
  }

  if (action.type === 'reset') {
    return createInitialFilterState();
  }

  if (action.type === 'selectMonth') {
    return {
      ...state,
      activeDropdown: null,
      selectedMonth: action.value || currentMonthKey()
    };
  }

  if (action.type === 'selectUser') {
    return {
      ...state,
      activeDropdown: null,
      selectedUserId: action.value
    };
  }

  if (action.type === 'toggleCategory') {
    const nextSelectedCategories = new Set(state.selectedCategories);
    if (nextSelectedCategories.has(action.value)) {
      nextSelectedCategories.delete(action.value);
    } else {
      nextSelectedCategories.add(action.value);
    }

    return { ...state, selectedCategories: nextSelectedCategories };
  }

  if (action.type === 'toggleDropdown') {
    return {
      ...state,
      activeDropdown: state.activeDropdown === action.value ? null : action.value
    };
  }

  return state;
}
