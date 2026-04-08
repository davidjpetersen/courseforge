'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { EnvironmentProvider } from '../context/EnvironmentContext';

const NAV_LINKS = [
  { href: '/recipes', label: 'Recipes' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/connections', label: 'Connections' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <EnvironmentProvider>
      <div className="flex min-h-screen">
        {/* Sidebar navigation */}
        <nav
          aria-label="Dashboard sidebar"
          className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-6"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Main content */}
        <main className="flex-1">{children}</main>
      </div>
    </EnvironmentProvider>
  );
}
