const SENSITIVE_KEY_PATTERN = /password|token|secret|key|credential|auth/i;
const REDACTED = '••••••••';
export function maskSensitiveFields(obj) {
    if (Array.isArray(obj)) {
        return obj.map((item) => maskSensitiveFields(item));
    }
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            acc[key] = REDACTED;
            return acc;
        }
        acc[key] = maskSensitiveFields(value);
        return acc;
    }, {});
}
//# sourceMappingURL=mask-sensitive.js.map