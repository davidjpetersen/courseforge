'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface FieldErrors {
  email?: string;
  password?: string;
  tenantName?: string;
}

function validateEmail(email: string): string | undefined {
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required';
  if (password.length < 12) return 'Password must be at least 12 characters';
  return undefined;
}

function validateTenantName(name: string): string | undefined {
  if (!name.trim()) return 'Organization name is required';
  return undefined;
}

type PasswordStrength = 'weak' | 'fair' | 'strong';

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 12) return 'weak';
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  if (variety >= 3 && password.length >= 16) return 'strong';
  if (variety >= 2) return 'fair';
  return 'weak';
}

const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' },
  fair: { label: 'Fair', color: 'bg-yellow-500', width: 'w-2/3' },
  strong: { label: 'Strong', color: 'bg-green-500', width: 'w-full' },
};

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = password ? getPasswordStrength(password) : null;

  function validate(): boolean {
    const fieldErrors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      tenantName: validateTenantName(tenantName),
    };
    setErrors(fieldErrors);
    return !fieldErrors.email && !fieldErrors.password && !fieldErrors.tenantName;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setToast(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantName }),
      });

      if (!res.ok) {
        const data = await res.json();
        setToast(data.error ?? 'Registration failed');
        return;
      }

      router.push('/recipes');
    } catch {
      setToast('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create account</h1>
          <p className="text-sm text-slate-500">Set up your organization to get started</p>
        </div>

        {toast && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {toast}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: validateEmail(e.target.value) }));
              }}
              onBlur={() => setErrors((prev) => ({ ...prev, email: validateEmail(email) }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/40 ${
                errors.email ? 'border-red-400' : 'border-slate-300'
              }`}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: validatePassword(e.target.value) }));
              }}
              onBlur={() => setErrors((prev) => ({ ...prev, password: validatePassword(password) }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/40 ${
                errors.password ? 'border-red-400' : 'border-slate-300'
              }`}
              placeholder="Minimum 12 characters"
              autoComplete="new-password"
            />
            {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
            {strength && (
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full rounded-full bg-slate-200">
                  <div
                    className={`h-1.5 rounded-full transition-all ${STRENGTH_CONFIG[strength].color} ${STRENGTH_CONFIG[strength].width}`}
                    role="progressbar"
                    aria-valuenow={strength === 'weak' ? 33 : strength === 'fair' ? 66 : 100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Password strength"
                  />
                </div>
                <p className="text-xs text-slate-500">Strength: {STRENGTH_CONFIG[strength].label}</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="tenantName" className="block text-sm font-medium text-slate-700">
              Organization name
            </label>
            <input
              id="tenantName"
              type="text"
              value={tenantName}
              onChange={(e) => {
                setTenantName(e.target.value);
                if (errors.tenantName) setErrors((prev) => ({ ...prev, tenantName: validateTenantName(e.target.value) }));
              }}
              onBlur={() => setErrors((prev) => ({ ...prev, tenantName: validateTenantName(tenantName) }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/40 ${
                errors.tenantName ? 'border-red-400' : 'border-slate-300'
              }`}
              placeholder="Your company or team name"
            />
            {errors.tenantName && <p className="text-xs text-red-600">{errors.tenantName}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-sky-600 hover:text-sky-700">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
