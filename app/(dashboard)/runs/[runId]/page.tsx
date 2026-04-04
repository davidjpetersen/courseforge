'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { Run, RunStep } from '../../../../packages/types/src/runs';
import { maskSensitiveFields } from '../../../lib/mask-sensitive';

const ERROR_LOOKUP: Record<string, string> = {
  AUTH_INVALID: 'Authentication credentials are invalid or expired.',
  RATE_LIMITED: 'The provider rate limit was exceeded. Retry later.',
  TIMEOUT: 'The step timed out before receiving a response.',
};

export default function RunDetailPage({ params }: { params: { runId: string } }) {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [notFound, setNotFound] = useState(false);

  const isRunning = useMemo(() => run?.status === 'RUNNING', [run]);

  async function fetchDetail() {
    const res = await fetch(`/api/runs/${params.runId}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }

    const data = (await res.json()) as { run: Run; steps: RunStep[] };
    setRun(data.run);
    setSteps(data.steps);
  }

  useEffect(() => {
    void fetchDetail();
  }, [params.runId]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => void fetchDetail(), 5_000);
    return () => clearInterval(id);
  }, [isRunning]);

  async function replayRun() {
    const response = await fetch(`/api/runs/${params.runId}/replay`, { method: 'POST' });
    const data = (await response.json()) as { newRunId: string };
    window.location.assign(`/runs/${data.newRunId}`);
  }

  if (notFound) {
    return <div className="p-6">Run not found.</div>;
  }

  if (!run) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <main className="space-y-4 p-6">
      <Link href={`/workflows/${run.workflowId}`} className="text-sm text-blue-700 hover:underline">Back to workflow</Link>
      <section className="rounded border p-4">
        <h1 className="text-lg font-semibold">{run.workflowName}</h1>
        <p>Trigger: {run.triggerType}</p>
        <p>Started: {new Date(run.startedAt).toLocaleString()}</p>
        <p>Duration: {run.durationMs ?? '—'} ms</p>
        <p>Status: {run.status}</p>
        <p>Version: {run.versionId}</p>
        {run.parentRunId ? <Link href={`/runs/${run.parentRunId}`} className="inline-flex rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">Replay of run #{run.parentRunId}</Link> : null}
      </section>

      {run.status === 'FAILED' ? (
        <section className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-4 text-red-900">
          <p>This run failed. You can replay it after resolving configuration issues.</p>
          <button className="rounded bg-red-600 px-3 py-2 text-white" onClick={() => void replayRun()}>Replay this run</button>
        </section>
      ) : null}

      <section className="space-y-3">
        {steps.map((step) => (
          <article key={step.stepId} className="rounded border p-4">
            <header className="flex justify-between">
              <h2 className="font-medium">{step.stepIndex}. {step.label} ({step.connectorKey})</h2>
              <span>{step.status}</span>
            </header>
            <p className="text-sm text-gray-600">{new Date(step.startedAt).toLocaleString()}</p>
            <details>
              <summary>Input summary</summary>
              <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(maskSensitiveFields(step.inputSummary), null, 2)}</pre>
            </details>
            <details>
              <summary>{step.errorMessage ? 'Error details' : 'Output summary'}</summary>
              <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs">{step.errorMessage ?? JSON.stringify(maskSensitiveFields(step.outputSummary), null, 2)}</pre>
            </details>
            {step.errorCode ? (
              <p className="text-sm text-red-700">
                {step.errorCode}: {step.errorMessage}
                <span className="ml-2" title={ERROR_LOOKUP[step.errorCode] ?? 'Unknown error, inspect connector logs.'}>What does this mean?</span>
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
