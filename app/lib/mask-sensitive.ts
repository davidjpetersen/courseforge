const SENSITIVE_KEY_PATTERN = /password|token|secret|key|credential|auth/i;
const REDACTED = '••••••••';

export function maskSensitiveFields(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item));
  }

  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  return Object.entries(obj as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        acc[key] = REDACTED;
        return acc;
      }

      acc[key] = maskSensitiveFields(value);
      return acc;
    },
    {},
  );
}
