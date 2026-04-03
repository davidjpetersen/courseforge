import { createHash, randomBytes } from 'node:crypto';

import { tenantPK, webhookSecretSK } from '../../models/schema.js';
import {
  jsonResponse,
  resolveTenantId,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from './shared.js';

export interface DynamoWriteClient {
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
}

export interface WebhookSecretHandlerDeps {
  dynamoClient: DynamoWriteClient;
  mainTableName: string;
}

export function createWebhookSecretHandler(deps: WebhookSecretHandlerDeps) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    const workflowId = event.pathParameters?.workflowId;
    if (!workflowId) {
      return jsonResponse(400, { message: 'workflowId path parameter is required' });
    }

    const tenantId = resolveTenantId(event);
    if (!tenantId) {
      return jsonResponse(400, { message: 'tenantId is required' });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: {
        PK: tenantPK(tenantId),
        SK: webhookSecretSK(workflowId),
        tenantId,
        workflowId,
        tokenHash,
        createdAt: now,
        updatedAt: now,
      },
    });

    return jsonResponse(200, { workflowId, token });
  };
}
