import { createContext, use, useMemo, useState, type ReactNode } from 'react';

type TabChromeContextValue = {
  chromeHidden: boolean;
  setChromeHidden: (hidden: boolean) => void;
};

const TabChromeContext = createContext<TabChromeContextValue | null>(null);

export function TabChromeProvider({ children }: { children: ReactNode }) {
  const [chromeHidden, setChromeHidden] = useState(false);
  const value = useMemo(() => ({
    chromeHidden,
    setChromeHidden
  }), [chromeHidden]);

  return (
    <TabChromeContext.Provider value={value}>
      {children}
    </TabChromeContext.Provider>
  );
}

export function useTabChrome() {
  const context = use(TabChromeContext);

  if (!context) {
    throw new Error('useTabChrome must be used within TabChromeProvider');
  }

  return context;
}
