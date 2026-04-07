'use client';

import { useEnvironment } from '../context/EnvironmentContext';
import type { EnvironmentId } from '../context/EnvironmentContext';

const options: { id: EnvironmentId; label: string }[] = [
  { id: 'dev', label: 'Dev' },
  { id: 'prod', label: 'Prod' },
];

export function EnvironmentSelector() {
  const { environmentId, setEnvironmentId } = useEnvironment();

  return (
    <div
      role="group"
      aria-label="Environment selector"
      style={{
        display: 'inline-flex',
        borderRadius: '9999px',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
      }}
    >
      {options.map((opt) => {
        const active = environmentId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => setEnvironmentId(opt.id)}
            style={{
              padding: '6px 16px',
              fontSize: '14px',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: active ? '#2563eb' : '#f1f5f9',
              color: active ? '#ffffff' : '#334155',
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
