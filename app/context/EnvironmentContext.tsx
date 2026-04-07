'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type EnvironmentId = 'dev' | 'prod';

const STORAGE_KEY = 'courseforge_env';

export interface EnvironmentContextValue {
  environmentId: EnvironmentId;
  setEnvironmentId: (id: EnvironmentId) => void;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function isValidEnvironmentId(value: unknown): value is EnvironmentId {
  return value === 'dev' || value === 'prod';
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environmentId, setEnvironmentIdState] = useState<EnvironmentId>('dev');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidEnvironmentId(stored)) {
        setEnvironmentIdState(stored);
      }
    } catch {
      // localStorage may be unavailable (SSR, privacy mode)
    }
  }, []);

  function setEnvironmentId(id: EnvironmentId) {
    setEnvironmentIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage may be unavailable
    }
  }

  return (
    <EnvironmentContext.Provider value={{ environmentId, setEnvironmentId }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return ctx;
}
