import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RunRepository } from './handler.js';
export declare function createDynamoRunRepository(client: Pick<DynamoDBDocumentClient, 'send'>, tableName: string): RunRepository;
//# sourceMappingURL=repository.d.ts.map