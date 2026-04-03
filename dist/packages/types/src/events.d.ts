export interface DomainEvent {
    tenantId: string;
    workflowId: string;
    eventType: string;
    payload: unknown;
    traceId: string;
    timestamp: string;
}
export declare const TRIGGER_EVENT_TYPES: {
    readonly WEBHOOK_RECEIVED: "WebhookReceived";
    readonly SCHEDULE_TRIGGERED: "ScheduleTriggered";
};
export type TriggerEventType = (typeof TRIGGER_EVENT_TYPES)[keyof typeof TRIGGER_EVENT_TYPES];
export type TriggerType = 'webhook' | 'scheduled' | 'manual';
export declare enum WorkflowStatus {
    DRAFT = "DRAFT",
    PUBLISHED = "PUBLISHED",
    PAUSED = "PAUSED",
    ARCHIVED = "ARCHIVED"
}
export declare enum RunStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    SUCCESS = "SUCCESS",
    FAILED = "FAILED",
    REPLAYING = "REPLAYING"
}
//# sourceMappingURL=events.d.ts.map