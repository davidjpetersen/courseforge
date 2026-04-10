export {
  filterByCategory,
  detectMissingConnections,
  groupByCategory,
  toSummary,
  buildListResponse,
  buildDetailResponse,
  type TemplateSummary,
  type TemplateListResponse,
  type TemplateDetailResponse,
} from './logic';

export {
  createListTemplatesHandler,
  createGetTemplateHandler,
  type TemplateRepository,
  type TenantConnectionProvider,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from './handlers';
