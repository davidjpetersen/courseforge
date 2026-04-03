/**
 * Infrastructure configuration for the DynamoDB Streams → OpenSearch Serverless
 * index pipeline that keeps the search index in sync with template data.
 *
 * This module defines the pipeline configuration as code. It can be consumed
 * by CDK constructs, CloudFormation custom resources, or deployment scripts.
 */
export declare const COLLECTION_NAME = "recipe-library-search";
export declare const INDEX_NAME = "templates";
/** Fields indexed for full-text search. */
export declare const SEARCHABLE_FIELDS: readonly ["name", "description"];
/** Fields stored as keyword (filterable, not analyzed). */
export declare const KEYWORD_FIELDS: readonly ["templateId", "categories", "connectedSystems", "educationStandardTags"];
export declare const INDEX_MAPPING: {
    readonly mappings: {
        readonly properties: {
            readonly templateId: {
                readonly type: "keyword";
            };
            readonly name: {
                readonly type: "text";
                readonly analyzer: "standard";
            };
            readonly description: {
                readonly type: "text";
                readonly analyzer: "standard";
            };
            readonly categories: {
                readonly type: "keyword";
            };
            readonly connectedSystems: {
                readonly type: "keyword";
            };
            readonly timeToActivate: {
                readonly type: "keyword";
            };
            readonly educationStandardTags: {
                readonly type: "keyword";
            };
            readonly certified: {
                readonly type: "boolean";
            };
            readonly createdAt: {
                readonly type: "date";
            };
        };
    };
};
export interface PipelineConfig {
    /** Source DynamoDB table name. */
    sourceTable: string;
    /** OpenSearch Serverless collection name. */
    collectionName: string;
    /** Target index within the collection. */
    indexName: string;
    /** DynamoDB Streams event source configuration. */
    streamConfig: {
        /** Only process TEMPLATE# items (ignore Workflow records). */
        filterPattern: string;
        /** Batch size for stream processing. */
        batchSize: number;
        /** Maximum batching window in seconds. */
        maxBatchingWindowSeconds: number;
        /** Start from the latest records in the stream. */
        startingPosition: 'LATEST' | 'TRIM_HORIZON';
    };
    /** OpenSearch Serverless access policy. */
    accessPolicy: {
        /** IAM principal ARN that can write to the collection. */
        pipelineRoleArn: string;
    };
}
/**
 * Returns the pipeline configuration for the DynamoDB Streams → OpenSearch
 * Serverless ingestion pipeline.
 *
 * @param pipelineRoleArn - IAM role ARN for the pipeline Lambda/OSIS processor
 */
export declare function buildPipelineConfig(pipelineRoleArn: string): PipelineConfig;
/**
 * Transforms a DynamoDB Streams record into the OpenSearch document shape.
 * Used by the ingestion Lambda that sits between DynamoDB Streams and OpenSearch.
 */
export interface OpenSearchTemplateDocument {
    templateId: string;
    name: string;
    description: string;
    categories: string[];
    connectedSystems: string[];
    timeToActivate: string;
    educationStandardTags: string[];
    certified: boolean;
    createdAt: string;
}
/**
 * Extracts the searchable fields from a DynamoDB Streams new-image record.
 * Returns null if the record is a DELETE event (no new image).
 */
export declare function transformStreamRecord(newImage: Record<string, unknown> | undefined): OpenSearchTemplateDocument | null;
//# sourceMappingURL=search-pipeline.d.ts.map