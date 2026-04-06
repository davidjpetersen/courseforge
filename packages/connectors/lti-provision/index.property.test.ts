import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createD2LSignature, parseLmsError } from './index.js';

const safeSegment = fc.string({ maxLength: 30 }).filter((value) => !value.includes('\u0000'));

describe('LTI provision properties', () => {
  it('property 6: createD2LSignature base64url-encodes apiKey, secret, and path', () => {
    fc.assert(
      fc.property(safeSegment, safeSegment, safeSegment, (apiKey, secret, path) => {
        expect(createD2LSignature(apiKey, secret, path)).toBe(
          Buffer.from(`${apiKey}:${secret}:${path}`).toString('base64url'),
        );
      }),
    );
  });

  it('property 7: parseLmsError normalizes structured and fallback LMS errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'canvas' | 'blackboard' | 'brightspace'>('canvas', 'blackboard', 'brightspace'),
        fc.integer({ min: 400, max: 599 }),
        fc.boolean(),
        safeSegment,
        safeSegment,
        async (lmsType, status, validJson, code, message) => {
          const response = validJson
            ? new Response(
                JSON.stringify(
                  lmsType === 'canvas'
                    ? { errors: [{ message }] }
                    : lmsType === 'blackboard'
                      ? { code, message, field: 'name' }
                      : { ErrorCode: code, Message: message },
                ),
                { status },
              )
            : new Response('not-json', {
                status,
                headers: { 'content-type': 'text/plain' },
              });

          const error = await parseLmsError(response, lmsType);

          if (lmsType === 'canvas') {
            expect(error.lmsErrorCode).toBe(String(status));
            expect(error.message).toBe(validJson && message ? message : 'Canvas validation failed');
          } else if (lmsType === 'blackboard') {
            expect(error.lmsErrorCode).toBe(validJson ? code : String(status));
            expect(error.message).toBe(validJson ? message : 'Blackboard provisioning failed');
            expect(error.field).toBe(validJson ? 'name' : undefined);
          } else {
            expect(error.lmsErrorCode).toBe(validJson ? code : String(status));
            expect(error.message).toBe(validJson ? message : 'Brightspace provisioning failed');
          }
        },
      ),
    );
  });
});
