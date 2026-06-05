import { useCallback, useEffect, useReducer } from 'react';

import { compareMonthKeys } from '@/src/lib/stats';

export type HistoryFilterDropdownKey = 'user' | 'category' | 'startMonth' | 'endMonth';

type HistoryFilterState = {
  activeDropdown: HistoryFilterDropdownKey | null;
  debouncedSearchText: string;
  endMonth: string | null;
  filtersOpen: boolean;
  searchOpen: boolean;
  searchText: string;
  selectedCategories: Set<string>;
  selectedUserId: string | null;
  startMonth: string | null;
};

type HistoryFilterAction =
  | { type: 'clearCategories' }
  | { type: 'clearSearch' }
  | { type: 'closeDropdown' }
  | { type: 'reset' }
  | { type: 'selectEndMonth'; value: string | null }
  | { type: 'selectStartMonth'; value: string | null }
  | { type: 'selectUser'; value: string | null }
  | { type: 'setDebouncedSearchText'; value: string }
  | { type: 'setFiltersOpen'; value: boolean }
  | { type: 'setSearchOpen'; value: boolean }
  | { type: 'setSearchText'; value: string }
  | { type: 'toggleCategory'; value: string }
  | { type: 'toggleDropdown'; value: HistoryFilterDropdownKey };

const initialFilterState: HistoryFilterState = {
  activeDropdown: null,
  debouncedSearchText: '',
  endMonth: null,
  filtersOpen: true,
  searchOpen: false,
  searchText: '',
  selectedCategories: new Set(),
  selectedUserId: null,
  startMonth: null
};

export function useHistoryFilters() {
  const [state, dispatch] = useReducer(historyFilterReducer, initialFilterState);

  useEffect(() => {
    const timeout = setTimeout(() => {
      dispatch({ type: 'setDebouncedSearchText', value: state.searchText });
    }, 300);

    return () => clearTimeout(timeout);
  }, [state.searchText]);

  const selectUser = useCallback((value: string) => {
    dispatch({ type: 'selectUser', value: value || null });
  }, []);

  const selectStartMonth = useCallback((value: string) => {
    dispatch({ type: 'selectStartMonth', value: value || null });
  }, []);

  const selectEndMonth = useCallback((value: string) => {
    dispatch({ type: 'selectEndMonth', value: value || null });
  }, []);

  const clearCategories = useCallback(() => dispatch({ type: 'clearCategories' }), []);
  const clearSearch = useCallback(() => dispatch({ type: 'clearSearch' }), []);
  const closeDropdown = useCallback(() => dispatch({ type: 'closeDropdown' }), []);
  const resetFilters = useCallback(() => dispatch({ type: 'reset' }), []);
  const setFiltersOpen = useCallback((value: boolean) => dispatch({ type: 'setFiltersOpen', value }), []);
  const setSearchOpen = useCallback((value: boolean) => dispatch({ type: 'setSearchOpen', value }), []);
  const setSearchText = useCallback((value: string) => dispatch({ type: 'setSearchText', value }), []);
  const toggleCategory = useCallback((value: string) => dispatch({ type: 'toggleCategory', value }), []);
  const toggleDropdown = useCallback((value: HistoryFilterDropdownKey) => dispatch({ type: 'toggleDropdown', value }), []);

  return {
    ...state,
    clearCategories,
    clearSearch,
    closeDropdown,
    resetFilters,
    selectEndMonth,
    selectStartMonth,
    selectUser,
    setFiltersOpen,
    setSearchOpen,
    setSearchText,
    toggleCategory,
    toggleDropdown
  };
}

function historyFilterReducer(state: HistoryFilterState, action: HistoryFilterAction): HistoryFilterState {
  if (action.type === 'clearCategories') {
    return { ...state, selectedCategories: new Set() };
  }

  if (action.type === 'clearSearch') {
    return { ...state, debouncedSearchText: '', searchText: '' };
  }

  if (action.type === 'closeDropdown') {
    return { ...state, activeDropdown: null };
  }

  if (action.type === 'reset') {
    return {
      ...state,
      activeDropdown: null,
      debouncedSearchText: '',
      endMonth: null,
      searchText: '',
      selectedCategories: new Set(),
      selectedUserId: null,
      startMonth: null
    };
  }

  if (action.type === 'selectEndMonth') {
    const nextEndMonth = action.value;
    const nextStartMonth = nextEndMonth && state.startMonth && compareMonthKeys(nextEndMonth, state.startMonth) < 0
      ? nextEndMonth
      : state.startMonth;

    return {
      ...state,
      activeDropdown: null,
      endMonth: nextEndMonth,
      startMonth: nextStartMonth
    };
  }

  if (action.type === 'selectStartMonth') {
    const nextStartMonth = action.value;
    const nextEndMonth = nextStartMonth && state.endMonth && compareMonthKeys(nextStartMonth, state.endMonth) > 0
      ? nextStartMonth
      : state.endMonth;

    return {
      ...state,
      activeDropdown: null,
      endMonth: nextEndMonth,
      startMonth: nextStartMonth
    };
  }

  if (action.type === 'selectUser') {
    return {
      ...state,
      activeDropdown: null,
      selectedUserId: action.value
    };
  }

  if (action.type === 'setDebouncedSearchText') {
    return { ...state, debouncedSearchText: action.value };
  }

  if (action.type === 'setFiltersOpen') {
    return { ...state, activeDropdown: action.value ? state.activeDropdown : null, filtersOpen: action.value };
  }

  if (action.type === 'setSearchOpen') {
    return {
      ...state,
      debouncedSearchText: action.value ? state.debouncedSearchText : '',
      searchOpen: action.value,
      searchText: action.value ? state.searchText : ''
    };
  }

  if (action.type === 'setSearchText') {
    return { ...state, searchText: action.value };
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
      activeDropdown: state.activeDropdown === action.value ? null : action.value,
      filtersOpen: true
    };
  }

  return state;
}
