async function runJsonGet(url, init) {
    try {
        const response = await fetch(url, init);
        if (response.ok) {
            return { success: true, message: 'Connection verified successfully' };
        }
        return {
            success: false,
            message: `Connection test failed with status ${response.status}`,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Connection test failed';
        return { success: false, message };
    }
}
function getBaseUrl(credentials, fallback) {
    const candidate = fallback ??
        (typeof credentials.baseUrl === 'string' ? credentials.baseUrl : undefined);
    return typeof candidate === 'string' && candidate.trim() !== ''
        ? candidate.replace(/\/+$/, '')
        : null;
}
function getRequiredString(secret, key) {
    const value = secret[key];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
const oauthStub = async () => ({
    success: false,
    message: 'Not yet implemented',
});
export const connectorRegistry = new Map([
    [
        'canvas-lms',
        {
            key: 'canvas-lms',
            displayName: 'Canvas LMS',
            authType: 'apikey',
            credentialSchema: {
                type: 'object',
                required: ['baseUrl', 'apiKey'],
                additionalProperties: false,
                properties: {
                    baseUrl: { type: 'string', minLength: 1 },
                    apiKey: { type: 'string', minLength: 1 },
                },
            },
            testFn: async (credentials, baseUrl) => {
                const resolvedBaseUrl = getBaseUrl(credentials, baseUrl);
                const apiKey = getRequiredString(credentials, 'apiKey');
                if (!resolvedBaseUrl || !apiKey) {
                    return { success: false, message: 'Missing required credentials' };
                }
                return runJsonGet(`${resolvedBaseUrl}/api/v1/accounts`, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                });
            },
        },
    ],
    [
        'blackboard',
        {
            key: 'blackboard',
            displayName: 'Blackboard',
            authType: 'basic',
            credentialSchema: {
                type: 'object',
                required: ['baseUrl', 'username', 'password'],
                additionalProperties: false,
                properties: {
                    baseUrl: { type: 'string', minLength: 1 },
                    username: { type: 'string', minLength: 1 },
                    password: { type: 'string', minLength: 1 },
                },
            },
            testFn: async (credentials, baseUrl) => {
                const resolvedBaseUrl = getBaseUrl(credentials, baseUrl);
                const username = getRequiredString(credentials, 'username');
                const password = getRequiredString(credentials, 'password');
                if (!resolvedBaseUrl || !username || !password) {
                    return { success: false, message: 'Missing required credentials' };
                }
                const auth = Buffer.from(`${username}:${password}`).toString('base64');
                return runJsonGet(`${resolvedBaseUrl}/learn/api/public/v1/system/version`, {
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                });
            },
        },
    ],
    [
        'brightspace',
        {
            key: 'brightspace',
            displayName: 'Brightspace',
            authType: 'oauth2',
            credentialSchema: {
                type: 'object',
                required: ['baseUrl'],
                additionalProperties: false,
                properties: {
                    baseUrl: { type: 'string', minLength: 1 },
                },
            },
            testFn: oauthStub,
        },
    ],
    [
        'slack',
        {
            key: 'slack',
            displayName: 'Slack',
            authType: 'oauth2',
            credentialSchema: {
                type: 'object',
                required: ['workspace'],
                additionalProperties: false,
                properties: {
                    workspace: { type: 'string', minLength: 1 },
                },
            },
            testFn: oauthStub,
        },
    ],
    [
        'smtp-email',
        {
            key: 'smtp-email',
            displayName: 'SMTP Email',
            authType: 'basic',
            credentialSchema: {
                type: 'object',
                required: ['host', 'port', 'username', 'password'],
                additionalProperties: false,
                properties: {
                    host: { type: 'string', minLength: 1 },
                    port: { type: 'number' },
                    username: { type: 'string', minLength: 1 },
                    password: { type: 'string', minLength: 1 },
                },
            },
            testFn: async () => ({
                success: false,
                message: 'Not yet implemented',
            }),
        },
    ],
    [
        'generic-http',
        {
            key: 'generic-http',
            displayName: 'Generic HTTP',
            authType: 'apikey',
            credentialSchema: {
                type: 'object',
                required: ['baseUrl'],
                additionalProperties: false,
                properties: {
                    baseUrl: { type: 'string', minLength: 1 },
                    apiKey: { type: 'string', minLength: 1 },
                },
            },
            testFn: async (credentials, baseUrl) => {
                const resolvedBaseUrl = getBaseUrl(credentials, baseUrl);
                if (!resolvedBaseUrl) {
                    return { success: false, message: 'Missing required credentials' };
                }
                const apiKey = getRequiredString(credentials, 'apiKey');
                return runJsonGet(resolvedBaseUrl, {
                    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
                });
            },
        },
    ],
]);
//# sourceMappingURL=registry.js.map