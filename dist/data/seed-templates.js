/**
 * Education-certified starter templates shipped with the Recipe Library at launch.
 *
 * Each template has realistic steps, fields, connected systems,
 * education standard tags, and time-to-activate estimates.
 */
export const ROSTER_OPS_TEMPLATE = {
    templateId: 'tpl-roster-sync-001',
    name: 'Automated Roster Sync',
    description: 'Synchronizes student and staff rosters between your SIS and LMS on a configurable schedule. ' +
        'Detects new enrollments, drops, and section changes, then applies them automatically.',
    categories: ['Roster Ops'],
    connectedSystems: ['PowerSchool SIS', 'Canvas LMS'],
    requiredParameters: [
        { fieldId: 'sisConnection', label: 'SIS Connection', type: 'connection', required: true, helpText: 'Select your configured SIS integration.', validation: {}, connectedSystem: 'PowerSchool SIS' },
        { fieldId: 'lmsConnection', label: 'LMS Connection', type: 'connection', required: true, helpText: 'Select your configured LMS integration.', validation: {}, connectedSystem: 'Canvas LMS' },
        { fieldId: 'syncFrequency', label: 'Sync Frequency', type: 'select', required: true, helpText: 'How often should the sync run?', validation: { options: ['Every 15 min', 'Hourly', 'Daily', 'Weekly'] }, connectedSystem: null },
        { fieldId: 'workflowName', label: 'Workflow Name', type: 'text', required: true, helpText: 'A short, descriptive name.', validation: { min: 3, max: 100 }, connectedSystem: null },
    ],
    timeToActivate: '5 min',
    educationStandardTags: ['OneRoster', 'SIS'],
    certified: true,
    createdAt: '2024-01-15T00:00:00Z',
    steps: [
        {
            stepIndex: 0,
            title: 'Select SIS Connection',
            helpText: 'Choose the Student Information System that holds your authoritative roster data.',
            fields: [
                {
                    fieldId: 'sisConnection',
                    label: 'SIS Connection',
                    type: 'connection',
                    required: true,
                    helpText: 'Select your configured SIS integration (e.g., PowerSchool).',
                    validation: {},
                    connectedSystem: 'PowerSchool SIS',
                },
            ],
        },
        {
            stepIndex: 1,
            title: 'Select LMS Connection',
            helpText: 'Choose the Learning Management System where roster changes will be applied.',
            fields: [
                {
                    fieldId: 'lmsConnection',
                    label: 'LMS Connection',
                    type: 'connection',
                    required: true,
                    helpText: 'Select your configured LMS integration (e.g., Canvas).',
                    validation: {},
                    connectedSystem: 'Canvas LMS',
                },
            ],
        },
        {
            stepIndex: 2,
            title: 'Configure Sync Schedule',
            helpText: 'Set how often the roster sync should run and which changes to propagate.',
            fields: [
                {
                    fieldId: 'syncFrequency',
                    label: 'Sync Frequency',
                    type: 'select',
                    required: true,
                    helpText: 'How often should the sync run?',
                    validation: { options: ['Every 15 min', 'Hourly', 'Daily', 'Weekly'] },
                    connectedSystem: null,
                },
                {
                    fieldId: 'includeDrops',
                    label: 'Include Enrollment Drops',
                    type: 'boolean',
                    required: false,
                    helpText: 'When enabled, students removed from the SIS will be un-enrolled in the LMS.',
                    validation: {},
                    connectedSystem: null,
                },
            ],
        },
        {
            stepIndex: 3,
            title: 'Name Your Workflow',
            helpText: 'Give this workflow a descriptive name so you can find it later.',
            fields: [
                {
                    fieldId: 'workflowName',
                    label: 'Workflow Name',
                    type: 'text',
                    required: true,
                    helpText: 'A short, descriptive name (e.g., "Fall 2024 Roster Sync").',
                    validation: { min: 3, max: 100 },
                    connectedSystem: null,
                },
            ],
        },
    ],
};
export const COURSE_LIFECYCLE_TEMPLATE = {
    templateId: 'tpl-course-lifecycle-001',
    name: 'Course Lifecycle Manager',
    description: 'Automates course creation, enrollment periods, and archival based on your academic calendar. ' +
        'Integrates with your SIS term dates and LMS course settings to keep everything in sync.',
    categories: ['Course Lifecycle'],
    connectedSystems: ['Canvas LMS', 'PowerSchool SIS'],
    requiredParameters: [
        { fieldId: 'lmsConnection', label: 'LMS Connection', type: 'connection', required: true, helpText: 'Select your configured LMS integration.', validation: {}, connectedSystem: 'Canvas LMS' },
        { fieldId: 'termStart', label: 'Term Start Date', type: 'text', required: true, helpText: 'ISO 8601 date.', validation: { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, connectedSystem: null },
        { fieldId: 'termEnd', label: 'Term End Date', type: 'text', required: true, helpText: 'ISO 8601 date.', validation: { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, connectedSystem: null },
        { fieldId: 'archiveDaysAfterEnd', label: 'Days After Term End to Archive', type: 'number', required: true, helpText: 'Days after term ends.', validation: { min: 0, max: 365 }, connectedSystem: null },
        { fieldId: 'courseNamePattern', label: 'Course Name Pattern', type: 'text', required: true, helpText: 'Pattern for course names.', validation: { min: 1, max: 200 }, connectedSystem: null },
        { fieldId: 'workflowName', label: 'Workflow Name', type: 'text', required: true, helpText: 'A short, descriptive name.', validation: { min: 3, max: 100 }, connectedSystem: null },
    ],
    timeToActivate: '8 min',
    educationStandardTags: ['LTI', 'SIS', 'OneRoster'],
    certified: true,
    createdAt: '2024-01-15T00:00:00Z',
    steps: [
        {
            stepIndex: 0,
            title: 'Select LMS Connection',
            helpText: 'Choose the LMS where courses will be created and managed.',
            fields: [
                {
                    fieldId: 'lmsConnection',
                    label: 'LMS Connection',
                    type: 'connection',
                    required: true,
                    helpText: 'Select your configured LMS integration.',
                    validation: {},
                    connectedSystem: 'Canvas LMS',
                },
            ],
        },
        {
            stepIndex: 1,
            title: 'Academic Calendar Settings',
            helpText: 'Define the term dates that drive course creation and archival.',
            fields: [
                {
                    fieldId: 'termStart',
                    label: 'Term Start Date',
                    type: 'text',
                    required: true,
                    helpText: 'ISO 8601 date for the start of the term (e.g., 2024-08-19).',
                    validation: { pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                    connectedSystem: null,
                },
                {
                    fieldId: 'termEnd',
                    label: 'Term End Date',
                    type: 'text',
                    required: true,
                    helpText: 'ISO 8601 date for the end of the term (e.g., 2024-12-13).',
                    validation: { pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                    connectedSystem: null,
                },
                {
                    fieldId: 'archiveDaysAfterEnd',
                    label: 'Days After Term End to Archive',
                    type: 'number',
                    required: true,
                    helpText: 'Number of days after the term ends before courses are archived.',
                    validation: { min: 0, max: 365 },
                    connectedSystem: null,
                },
            ],
        },
        {
            stepIndex: 2,
            title: 'Course Creation Rules',
            helpText: 'Configure how courses are created from SIS sections.',
            fields: [
                {
                    fieldId: 'autoCreateCourses',
                    label: 'Auto-Create Courses',
                    type: 'boolean',
                    required: false,
                    helpText: 'Automatically create LMS courses for new SIS sections.',
                    validation: {},
                    connectedSystem: null,
                },
                {
                    fieldId: 'courseNamePattern',
                    label: 'Course Name Pattern',
                    type: 'text',
                    required: true,
                    helpText: 'Pattern for generated course names. Use {section}, {term}, {instructor}.',
                    validation: { min: 1, max: 200 },
                    connectedSystem: null,
                },
            ],
        },
        {
            stepIndex: 3,
            title: 'Name Your Workflow',
            helpText: 'Give this workflow a descriptive name.',
            fields: [
                {
                    fieldId: 'workflowName',
                    label: 'Workflow Name',
                    type: 'text',
                    required: true,
                    helpText: 'A short, descriptive name (e.g., "Fall 2024 Course Setup").',
                    validation: { min: 3, max: 100 },
                    connectedSystem: null,
                },
            ],
        },
    ],
};
export const NOTIFICATIONS_TEMPLATE = {
    templateId: 'tpl-notifications-001',
    name: 'Smart Notification Dispatcher',
    description: 'Sends targeted notifications to students, instructors, or admins based on LMS events. ' +
        'Supports email, SMS, and in-app channels with configurable triggers and templates.',
    categories: ['Notifications'],
    connectedSystems: ['Canvas LMS', 'SendGrid Email', 'Twilio SMS'],
    requiredParameters: [
        { fieldId: 'lmsConnection', label: 'LMS Connection', type: 'connection', required: true, helpText: 'Select your configured LMS integration.', validation: {}, connectedSystem: 'Canvas LMS' },
        { fieldId: 'triggerEvent', label: 'Trigger Event', type: 'select', required: true, helpText: 'The LMS event that triggers a notification.', validation: { options: ['Assignment Due Soon', 'Grade Posted', 'Course Enrollment', 'Announcement Published'] }, connectedSystem: null },
        { fieldId: 'recipientRole', label: 'Recipient Role', type: 'select', required: true, helpText: 'Who should receive the notification?', validation: { options: ['Students', 'Instructors', 'Admins', 'All'] }, connectedSystem: null },
        { fieldId: 'messageTemplate', label: 'Message Template', type: 'text', required: true, helpText: 'Notification message body.', validation: { min: 10, max: 500 }, connectedSystem: null },
        { fieldId: 'workflowName', label: 'Workflow Name', type: 'text', required: true, helpText: 'A short, descriptive name.', validation: { min: 3, max: 100 }, connectedSystem: null },
    ],
    timeToActivate: '6 min',
    educationStandardTags: ['xAPI', 'LTI'],
    certified: true,
    createdAt: '2024-01-15T00:00:00Z',
    steps: [
        {
            stepIndex: 0,
            title: 'Select LMS Connection',
            helpText: 'Choose the LMS that will generate the events triggering notifications.',
            fields: [
                {
                    fieldId: 'lmsConnection',
                    label: 'LMS Connection',
                    type: 'connection',
                    required: true,
                    helpText: 'Select your configured LMS integration.',
                    validation: {},
                    connectedSystem: 'Canvas LMS',
                },
            ],
        },
        {
            stepIndex: 1,
            title: 'Notification Channels',
            helpText: 'Select which channels to use for sending notifications.',
            fields: [
                {
                    fieldId: 'emailEnabled',
                    label: 'Enable Email Notifications',
                    type: 'boolean',
                    required: false,
                    helpText: 'Send notifications via email using SendGrid.',
                    validation: {},
                    connectedSystem: 'SendGrid Email',
                },
                {
                    fieldId: 'smsEnabled',
                    label: 'Enable SMS Notifications',
                    type: 'boolean',
                    required: false,
                    helpText: 'Send notifications via SMS using Twilio.',
                    validation: {},
                    connectedSystem: 'Twilio SMS',
                },
            ],
        },
        {
            stepIndex: 2,
            title: 'Trigger Configuration',
            helpText: 'Define which LMS events should trigger notifications.',
            fields: [
                {
                    fieldId: 'triggerEvent',
                    label: 'Trigger Event',
                    type: 'select',
                    required: true,
                    helpText: 'The LMS event that triggers a notification.',
                    validation: {
                        options: [
                            'Assignment Due Soon',
                            'Grade Posted',
                            'Course Enrollment',
                            'Announcement Published',
                        ],
                    },
                    connectedSystem: null,
                },
                {
                    fieldId: 'recipientRole',
                    label: 'Recipient Role',
                    type: 'select',
                    required: true,
                    helpText: 'Who should receive the notification?',
                    validation: { options: ['Students', 'Instructors', 'Admins', 'All'] },
                    connectedSystem: null,
                },
                {
                    fieldId: 'messageTemplate',
                    label: 'Message Template',
                    type: 'text',
                    required: true,
                    helpText: 'Notification message body. Use {studentName}, {courseName}, {eventDetail}.',
                    validation: { min: 10, max: 500 },
                    connectedSystem: null,
                },
            ],
        },
        {
            stepIndex: 3,
            title: 'Name Your Workflow',
            helpText: 'Give this workflow a descriptive name.',
            fields: [
                {
                    fieldId: 'workflowName',
                    label: 'Workflow Name',
                    type: 'text',
                    required: true,
                    helpText: 'A short, descriptive name (e.g., "Assignment Reminders").',
                    validation: { min: 3, max: 100 },
                    connectedSystem: null,
                },
            ],
        },
    ],
};
/** All seed templates shipped at launch. */
export const SEED_TEMPLATES = [
    ROSTER_OPS_TEMPLATE,
    COURSE_LIFECYCLE_TEMPLATE,
    NOTIFICATIONS_TEMPLATE,
];
//# sourceMappingURL=seed-templates.js.map