/**
 * Infrastructure configuration for the DynamoDB Streams → OpenSearch Serverless
 * index pipeline that keeps the search index in sync with template data.
 *
 * This module defines the pipeline configuration as code. It can be consumed
 * by CDK constructs, CloudFormation custom resources, or deployment scripts.
 */

import { TABLE_NAME } from '../models/schema';

// ── OpenSearch Serverless Collection ──

export const COLLECTION_NAME = 'recipe-library-search';
export const INDEX_NAME = 'templates';

/** Fields indexed for full-text search. */
export const SEARCHABLE_FIELDS = ['name', 'description'] as const;

/** Fields stored as keyword (filterable, not analyzed). */
export const KEYWORD_FIELDS = ['templateId', 'categories', 'connectedSystems', 'educationStandardTags'] as const;

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
} as const;

// ── DynamoDB Streams → OpenSearch Ingestion Pipeline ──

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
export function buildPipelineConfig(pipelineRoleArn: string): PipelineConfig {
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

// ── Stream Record Transformer ──

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
export function transformStreamRecord(
  newImage: Record<string, unknown> | undefined,
): OpenSearchTemplateDocument | null {
  if (!newImage) return null;

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
