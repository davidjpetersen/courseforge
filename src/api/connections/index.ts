export {
  validateCredentials,
  mapConnectionToListItem,
  mapTestResultToStatus,
  filterDependentWorkflows,
  hasPublishedDependents,
  buildAuditEntry,
  buildNewConnectionRecord,
  buildSecretName,
  type ValidationResult,
  type NewConnectionInput,
  type NewConnectionOptions,
} from './logic';

export { connectorRegistry } from './registry';

export {
  createConnectionHandler,
  testConnectionHandler,
  listConnectionsHandler,
  getDependenciesHandler,
  rotateConnectionHandler,
  deleteConnectionHandler,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
  type ConnectionRepository,
  type WorkflowRepository,
  type SecretsService,
  type AuditRepository,
  type CreateConnectionRequest,
  type RotateConnectionRequest,
} from './handlers';
