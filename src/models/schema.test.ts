import { describe, it, expect } from 'vitest';
import {
  templatePK,
  templateSK,
  categoryGSI1PK,
  categoryGSI1SK,
  tenantPK,
  workflowSK,
  workflowPK,
  workflowMetaSK,
  connectionSK,
  auditSK,
  webhookSecretSK,
  runSK,
  schedulePK,
  scheduleSK,
  buildSecretName,
  buildCategoryIndexKeys,
  TABLE_DEFINITION,
  CATEGORY_INDEX,
  runPK,
  stepSK,
  userPK,
  notificationSK,
  GSI_WORKFLOW_RUNS,
  GSI_TENANT_STATUS,
} from './schema';

describe('DynamoDB key builders', () => {
  it('builds template PK', () => {
    expect(templatePK('abc-123')).toBe('TEMPLATE#abc-123');
  });

  it('builds template SK as METADATA', () => {
    expect(templateSK()).toBe('METADATA');
  });

  it('builds category GSI1PK', () => {
    expect(categoryGSI1PK('Roster Ops')).toBe('CATEGORY#Roster Ops');
  });

  it('builds category GSI1SK', () => {
    expect(categoryGSI1SK('abc-123')).toBe('TEMPLATE#abc-123');
  });

  it('builds tenant PK', () => {
    expect(tenantPK('tenant-1')).toBe('TENANT#tenant-1');
  });

  it('builds workflow SK', () => {
    expect(workflowSK('wf-001')).toBe('WORKFLOW#wf-001');
  });

  it('builds workflow PK for workflow entities', () => {
    expect(workflowPK('wf-001')).toBe('WF#wf-001');
  });

  it('builds workflow metadata SK', () => {
    expect(workflowMetaSK()).toBe('META');
  });

  it('builds connection SK', () => {
    expect(connectionSK('conn-001')).toBe('CONNECTION#conn-001');
  });

  it('builds audit SK', () => {
    expect(auditSK('2024-01-01T00:00:00Z', 'abc')).toBe(
      'AUDIT#2024-01-01T00:00:00Z#abc',
    );
  });

  it('builds secret names', () => {
    expect(buildSecretName('tenant-1', 'conn-001')).toBe(
      'courseforge/tenant/tenant-1/connection/conn-001',
    );
  });

  it('builds webhook secret SK', () => {
    expect(webhookSecretSK('wf-001')).toBe('WEBHOOK_SECRET#wf-001');
  });

  it('builds run SK', () => {
    expect(runSK('2024-01-01T00:00:00Z', 'run-1')).toBe(
      'RUN#2024-01-01T00:00:00Z#run-1',
    );
  });

  it('builds schedule PK/SK', () => {
    expect(schedulePK('wf-001')).toBe('WORKFLOW#wf-001');
    expect(scheduleSK('sched-1')).toBe('SCHEDULE#sched-1');
  });
});

describe('run-history-observability key builders', () => {
  it('builds run PK', () => {
    expect(runPK('run-1')).toBe('RUN#run-1');
  });

  it('builds step SK with zero-padded index', () => {
    expect(stepSK(0, 'step-1')).toBe('STEP#0000#step-1');
  });

  it('builds step SK with non-zero index', () => {
    expect(stepSK(42, 'step-x')).toBe('STEP#0042#step-x');
  });

  it('builds user PK', () => {
    expect(userPK('user-1')).toBe('USER#user-1');
  });

  it('builds notification SK', () => {
    expect(notificationSK('2024-01-01T00:00:00Z', 'notif-1')).toBe(
      'NOTIFICATION#2024-01-01T00:00:00Z#notif-1',
    );
  });

  it('exports GSI_WORKFLOW_RUNS constant', () => {
    expect(GSI_WORKFLOW_RUNS).toBe('GSI_WORKFLOW_RUNS');
  });

  it('exports GSI_TENANT_STATUS constant', () => {
    expect(GSI_TENANT_STATUS).toBe('GSI_TENANT_STATUS');
  });
});

describe('buildCategoryIndexKeys', () => {
  it('returns one entry per category', () => {
    const keys = buildCategoryIndexKeys('tpl-1', ['Roster Ops', 'Analytics']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual({ GSI1PK: 'CATEGORY#Roster Ops', GSI1SK: 'TEMPLATE#tpl-1' });
    expect(keys[1]).toEqual({ GSI1PK: 'CATEGORY#Analytics', GSI1SK: 'TEMPLATE#tpl-1' });
  });

  it('returns empty array for no categories', () => {
    expect(buildCategoryIndexKeys('tpl-1', [])).toEqual([]);
  });
});

describe('TABLE_DEFINITION', () => {
  it('has PK/SK key schema', () => {
    expect(TABLE_DEFINITION.KeySchema).toEqual([
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ]);
  });

  it('defines CategoryIndex GSI', () => {
    const gsi = TABLE_DEFINITION.GlobalSecondaryIndexes[0];
    expect(gsi.IndexName).toBe(CATEGORY_INDEX);
    expect(gsi.KeySchema).toEqual([
      { AttributeName: 'GSI1PK', KeyType: 'HASH' },
      { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
    ]);
  });
});
