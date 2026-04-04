import { describe, expect, it } from 'vitest';

import {
  CompilationError,
  compilePlan,
  type Connection,
  type Recipe,
} from './compile-plan.js';

const baseRecipe: Recipe = {
  recipeId: 'recipe-1',
  steps: [
    {
      stepId: 'step-1',
      name: 'Send Notification',
      type: 'action',
      requiredParams: ['studentId'],
      params: {
        endpoint: 'https://api.example.com/students/{{studentId}}',
        auth: {
          connectionKey: 'conn-active',
        },
      },
    },
  ],
};

const activeConnections: Connection[] = [
  {
    connectionId: 'conn-active',
    tenantId: 'tenant-1',
    status: 'active',
    secretRef: 'arn:aws:secretsmanager:us-east-1:123:secret:conn-active',
  },
];

describe('compilePlan', () => {
  it('throws CompilationError when a required param is missing', () => {
    expect(() =>
      compilePlan(baseRecipe, {}, activeConnections),
    ).toThrowError(CompilationError);

    try {
      compilePlan(baseRecipe, {}, activeConnections);
    } catch (error) {
      expect(error).toBeInstanceOf(CompilationError);
      expect((error as CompilationError).field).toBe('studentId');
    }
  });

  it('throws CompilationError for unknown connectionKey', () => {
    const missingConnectionRecipe: Recipe = {
      ...baseRecipe,
      steps: [
        {
          ...baseRecipe.steps[0],
          params: {
            auth: { connectionKey: 'conn-missing' },
          },
        },
      ],
    };

    expect(() =>
      compilePlan(missingConnectionRecipe, { studentId: 'abc' }, activeConnections),
    ).toThrowError(CompilationError);
  });

  it('successfully compiles with param substitution', () => {
    const result = compilePlan(
      baseRecipe,
      { studentId: 's-100' },
      activeConnections,
    );

    expect(result[0]?.params.endpoint).toBe('https://api.example.com/students/s-100');
  });

  it('successfully resolves connectionKey to secretRef', () => {
    const result = compilePlan(
      baseRecipe,
      { studentId: 's-100' },
      activeConnections,
    );

    expect(result[0]?.params.auth).toEqual({
      connectionKey: 'conn-active',
      secretRef: activeConnections[0]?.secretRef,
    });
  });
});
