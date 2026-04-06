function buildUrl(baseUrl, path) {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
}
export async function parseLmsError(response, lmsType) {
    let payload;
    try {
        payload = (await response.json());
    }
    catch {
        payload = undefined;
    }
    if (lmsType === 'canvas') {
        const errors = payload?.errors ?? [];
        return {
            lmsErrorCode: String(response.status),
            message: errors.map((e) => e.message).filter(Boolean).join('; ') || 'Canvas validation failed',
        };
    }
    if (lmsType === 'blackboard') {
        return {
            lmsErrorCode: String(payload?.code ?? response.status),
            message: String(payload?.message ?? 'Blackboard provisioning failed'),
            field: typeof payload?.field === 'string' ? payload.field : undefined,
        };
    }
    return {
        lmsErrorCode: String(payload?.ErrorCode ?? response.status),
        message: String(payload?.Message ?? 'Brightspace provisioning failed'),
    };
}
export function createD2LSignature(apiKey, secret, path) {
    const raw = `${apiKey}:${secret}:${path}`;
    return Buffer.from(raw).toString('base64url');
}
async function provisionCanvas(params) {
    const response = await fetch(buildUrl(String(params.baseUrl), `/api/v1/courses/${params.courseId}/external_tools`), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            name: params.toolName,
            url: params.launchUrl,
            consumer_key: params.toolClientId,
            shared_secret: params.deploymentId ?? 'auto-generated-shared-secret',
            course_navigation: { enabled: true },
        }),
    });
    if (response.status === 422) {
        const error = await parseLmsError(response, 'canvas');
        return {
            success: false,
            deploymentId: params.deploymentId ?? '',
            launchUrl: params.launchUrl,
            lmsToolId: '',
            message: `${error.lmsErrorCode}: ${error.message}`,
        };
    }
    if (!response.ok) {
        const error = await parseLmsError(response, 'canvas');
        throw new Error(`${error.lmsErrorCode}: ${error.message}`);
    }
    const payload = (await response.json());
    return {
        success: true,
        deploymentId: params.deploymentId ?? `canvas-deploy-${params.courseId}`,
        launchUrl: params.launchUrl,
        lmsToolId: String(payload.id ?? ''),
        message: 'Canvas LTI tool provisioned',
    };
}
async function provisionBlackboard(params) {
    const response = await fetch(buildUrl(String(params.baseUrl), '/learn/api/public/v1/lti/placements'), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            name: params.toolName,
            description: `${params.toolName} placement`,
            iconUrl: `${params.launchUrl}/icon.png`,
            launchLink: params.launchUrl,
            customParameters: params.customParams ?? {},
        }),
    });
    if (!response.ok) {
        const error = await parseLmsError(response, 'blackboard');
        throw new Error(`${error.lmsErrorCode}: ${error.message}`);
    }
    const payload = (await response.json());
    return {
        success: true,
        deploymentId: params.deploymentId ?? `bb-deploy-${params.courseId}`,
        launchUrl: params.launchUrl,
        lmsToolId: String(payload.id ?? ''),
        message: 'Blackboard LTI placement created',
    };
}
async function provisionBrightspace(params) {
    const version = '1.47';
    const path = `/d2l/api/lp/${version}/lti/link/${params.courseId}`;
    const signature = createD2LSignature(String(params.apiKey), params.toolClientId, path);
    const url = new URL(buildUrl(String(params.baseUrl), path));
    url.searchParams.set('x_a', String(params.apiKey));
    url.searchParams.set('x_b', signature);
    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            Title: params.toolName,
            Url: params.launchUrl,
            Description: `${params.toolName} LTI launch`,
            CustomParameters: params.customParams ?? {},
        }),
    });
    if (!response.ok) {
        const error = await parseLmsError(response, 'brightspace');
        throw new Error(`${error.lmsErrorCode}: ${error.message}`);
    }
    const payload = (await response.json());
    return {
        success: true,
        deploymentId: params.deploymentId ?? `d2l-deploy-${params.courseId}`,
        launchUrl: params.launchUrl,
        lmsToolId: String(payload.LinkId ?? ''),
        message: 'Brightspace LTI link created',
    };
}
export const ltiProvisionConnector = {
    key: 'lti-provision',
    displayName: 'LTI 1.3 Tool Provisioning',
    authType: 'apikey',
    credentialSchema: {
        type: 'object',
        properties: {
            lmsType: { type: 'string', enum: ['canvas', 'blackboard', 'brightspace'] },
            baseUrl: { type: 'string' },
            apiKey: { type: 'string' },
        },
        required: ['lmsType', 'baseUrl', 'apiKey'],
        additionalProperties: false,
    },
    async testFn(credentials) {
        const lmsType = String(credentials.lmsType ?? '');
        const baseUrl = String(credentials.baseUrl ?? '');
        const apiKey = String(credentials.apiKey ?? '');
        const pathByType = {
            canvas: '/api/v1/accounts',
            blackboard: '/learn/api/public/v1/system/version',
            brightspace: '/d2l/api/versions/',
        };
        const path = pathByType[lmsType];
        if (!path)
            return false;
        const response = await fetch(buildUrl(baseUrl, path), {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        return response.status === 200;
    },
    async run(params) {
        switch (params.lmsType) {
            case 'canvas':
                return provisionCanvas(params);
            case 'blackboard':
                return provisionBlackboard(params);
            case 'brightspace':
                return provisionBrightspace(params);
            default:
                throw new Error(`Unsupported LMS type: ${params.lmsType}`);
        }
    },
};
export default ltiProvisionConnector;
//# sourceMappingURL=index.js.map