export async function findRunRecordById(dynamoClient, tableName, tenantId, runId) {
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
//# sourceMappingURL=run-records.js.map