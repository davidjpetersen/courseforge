'use client';

import { useEnvironment } from '../../context/EnvironmentContext';

export default function RunsPage() {
  const { environmentId, setEnvironmentId } = useEnvironment();

  return (
    <div>
      <div>
        <button onClick={() => setEnvironmentId('dev')}>Dev</button>
        <button onClick={() => setEnvironmentId('prod')}>Prod</button>
      </div>
      <p>Showing runs for {environmentId} workflows.</p>
    </div>
  );
}
