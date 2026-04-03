export const TRIGGER_EVENT_TYPES = {
    WEBHOOK_RECEIVED: 'WebhookReceived',
    SCHEDULE_TRIGGERED: 'ScheduleTriggered',
};
export var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["DRAFT"] = "DRAFT";
    WorkflowStatus["PUBLISHED"] = "PUBLISHED";
    WorkflowStatus["PAUSED"] = "PAUSED";
    WorkflowStatus["ARCHIVED"] = "ARCHIVED";
})(WorkflowStatus || (WorkflowStatus = {}));
export var RunStatus;
(function (RunStatus) {
    RunStatus["PENDING"] = "PENDING";
    RunStatus["RUNNING"] = "RUNNING";
    RunStatus["SUCCESS"] = "SUCCESS";
    RunStatus["FAILED"] = "FAILED";
    RunStatus["REPLAYING"] = "REPLAYING";
})(RunStatus || (RunStatus = {}));
//# sourceMappingURL=events.js.map