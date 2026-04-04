'use client';

import { useEnvironment } from '../../context/EnvironmentContext';

export default function RecipesPage() {
  const { environmentId, setEnvironmentId } = useEnvironment();

  return (
    <div>
      <div>
        <button onClick={() => setEnvironmentId('dev')}>Dev</button>
        <button onClick={() => setEnvironmentId('prod')}>Prod</button>
      </div>
      <p>Recipes are global. Selected environment: {environmentId}</p>
    </div>
  );
}
