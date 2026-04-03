/**
 * Infrastructure configuration for the DynamoDB Streams → OpenSearch Serverless
 * index pipeline that keeps the search index in sync with template data.
 *
 * This module defines the pipeline configuration as code. It can be consumed
 * by CDK constructs, CloudFormation custom resources, or deployment scripts.
 */
import { TABLE_NAME } from '../models/schema.js';
// ── OpenSearch Serverless Collection ──
export const COLLECTION_NAME = 'recipe-library-search';
export const INDEX_NAME = 'templates';
/** Fields indexed for full-text search. */
export const SEARCHABLE_FIELDS = ['name', 'description'];
/** Fields stored as keyword (filterable, not analyzed). */
export const KEYWORD_FIELDS = ['templateId', 'categories', 'connectedSystems', 'educationStandardTags'];
// ── Index Mapping ──
export const INDEX_MAPPING = {
    mappings: {
        properties: {
            templateId: { type: 'keyword' },
            name: { type: 'text', analyzer: 'standard' },
            description: { type: 'text', analyzer: 'standard' },
            categories: { type: 'keyword' },
            connectedSystems: { type: 'keyword' },
            timeToActivate: { type: 'keyword' },
            educationStandardTags: { type: 'keyword' },
            certified: { type: 'boolean' },
            createdAt: { type: 'date' },
        },
    },
};
/**
 * Returns the pipeline configuration for the DynamoDB Streams → OpenSearch
 * Serverless ingestion pipeline.
 *
 * @param pipelineRoleArn - IAM role ARN for the pipeline Lambda/OSIS processor
 */
export function buildPipelineConfig(pipelineRoleArn) {
    return {
        sourceTable: TABLE_NAME,
        collectionName: COLLECTION_NAME,
        indexName: INDEX_NAME,
        streamConfig: {
            filterPattern: '{ "dynamodb": { "Keys": { "PK": { "S": [{ "prefix": "TEMPLATE#" }] } } } }',
            batchSize: 25,
            maxBatchingWindowSeconds: 5,
            startingPosition: 'TRIM_HORIZON',
        },
        accessPolicy: {
            pipelineRoleArn,
        },
    };
}
/**
 * Extracts the searchable fields from a DynamoDB Streams new-image record.
 * Returns null if the record is a DELETE event (no new image).
 */
export function transformStreamRecord(newImage) {
    if (!newImage)
        return null;
    return {
        templateId: String(newImage['templateId'] ?? ''),
        name: String(newImage['name'] ?? ''),
        description: String(newImage['description'] ?? ''),
        categories: Array.isArray(newImage['categories']) ? newImage['categories'].map(String) : [],
        connectedSystems: Array.isArray(newImage['connectedSystems']) ? newImage['connectedSystems'].map(String) : [],
        timeToActivate: String(newImage['timeToActivate'] ?? ''),
        educationStandardTags: Array.isArray(newImage['educationStandardTags']) ? newImage['educationStandardTags'].map(String) : [],
        certified: Boolean(newImage['certified']),
        createdAt: String(newImage['createdAt'] ?? ''),
    };
}
//# sourceMappingURL=search-pipeline.js.map