'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type EnvironmentId = 'dev' | 'prod';

interface EnvironmentContextValue {
  environmentId: EnvironmentId;
  setEnvironmentId: (environmentId: EnvironmentId) => void;
}

const STORAGE_KEY = 'courseforge_env';

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environmentId, setEnvironmentIdState] = useState<EnvironmentId>('dev');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dev' || stored === 'prod') {
      setEnvironmentIdState(stored);
    }
  }, []);

  const value = useMemo<EnvironmentContextValue>(
    () => ({
      environmentId,
      setEnvironmentId: (nextEnvironmentId) => {
        setEnvironmentIdState(nextEnvironmentId);
        window.localStorage.setItem(STORAGE_KEY, nextEnvironmentId);
      },
    }),
    [environmentId],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentContextValue {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within EnvironmentProvider');
  }

  return context;
}
