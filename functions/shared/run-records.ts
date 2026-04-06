export interface QueryableDynamoClient {
  query(params: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    FilterExpression?: string;
    Limit?: number;
  }): Promise<{ Items?: Array<Record<string, unknown>> }>;
}

export async function findRunRecordById(
  dynamoClient: QueryableDynamoClient,
  tableName: string,
  tenantId: string,
  runId: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await dynamoClient.query({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'runId = :runId',
    ExpressionAttributeValues: {
      ':pk': `TENANT#${tenantId}`,
      ':skPrefix': 'RUN#',
      ':runId': runId,
    },
    Limit: 1,
  });

  return result.Items?.[0];
}
