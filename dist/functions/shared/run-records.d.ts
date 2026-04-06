export interface QueryableDynamoClient {
    query(params: {
        TableName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        FilterExpression?: string;
        Limit?: number;
    }): Promise<{
        Items?: Array<Record<string, unknown>>;
    }>;
}
export declare function findRunRecordById(dynamoClient: QueryableDynamoClient, tableName: string, tenantId: string, runId: string): Promise<Record<string, unknown> | undefined>;
//# sourceMappingURL=run-records.d.ts.map