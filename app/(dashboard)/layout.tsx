'use client';

import { EnvironmentProvider } from '../context/EnvironmentContext';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <EnvironmentProvider>
      {children}
    </EnvironmentProvider>
  );
}
