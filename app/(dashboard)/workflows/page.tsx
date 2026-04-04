'use client';

import { useEffect, useState } from 'react';
import { useEnvironment } from '../../context/EnvironmentContext';

export default function WorkflowsPage() {
  const { environmentId, setEnvironmentId } = useEnvironment();
  const [workflows, setWorkflows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void fetch(`/api/environments/${environmentId}/workflows`)
      .then((res) => res.json())
      .then((payload) => setWorkflows(payload.workflows ?? []));
  }, [environmentId]);

  return (
    <div>
      <div>
        <button onClick={() => setEnvironmentId('dev')}>Dev</button>
        <button onClick={() => setEnvironmentId('prod')}>Prod</button>
      </div>
      <pre>{JSON.stringify(workflows, null, 2)}</pre>
    </div>
  );
}
