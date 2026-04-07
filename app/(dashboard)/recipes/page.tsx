'use client';

import { EnvironmentSelector } from '../../components/EnvironmentSelector';

export default function RecipesPage() {
  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="flex items-center justify-between">
        <div />
        <EnvironmentSelector />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recipes</h1>
        <p className="text-sm text-slate-600">
          Browse workflow templates. Recipes are global and available in all environments.
        </p>
      </div>

      <p className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-600 shadow-sm">
        No recipes available yet.
      </p>
    </main>
  );
}
