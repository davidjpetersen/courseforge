import { openApiSpec } from '../../../lib/openapi/spec.js';

export async function GET() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openApiSpec),
  };
}
