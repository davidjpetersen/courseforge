/**
 * Recipe Wizard — Core Navigation & State Management.
 *
 * Pure TypeScript state machine for multi-step wizard:
 * - Create wizard state from a template
 * - Navigate forward/backward/to-step with data preservation
 * - Progress indicator
 * - Build step view models with field values and help text
 * - Session storage persistence
 */
// ── 7.1 RecipeWizard — State Creation & Navigation ──
/**
 * Creates initial wizard state from a template definition.
 * Each step gets an empty field map keyed by fieldId.
 */
export function createWizardState(template) {
    return {
        templateId: template.templateId,
        currentStepIndex: 0,
        totalSteps: template.steps.length,
        steps: template.steps.map((step) => ({
            stepIndex: step.stepIndex,
            fields: Object.fromEntries(step.fields.map((f) => [f.fieldId, null])),
        })),
    };
}
/**
 * Returns the progress indicator for the current wizard state.
 * currentStep is 1-based (human-friendly).
 */
export function getProgressIndicator(state) {
    return {
        currentStep: state.currentStepIndex + 1,
        totalSteps: state.totalSteps,
    };
}
export function canGoNext(state) {
    return state.currentStepIndex < state.totalSteps - 1;
}
export function canGoPrevious(state) {
    return state.currentStepIndex > 0;
}
/**
 * Publish is enabled when there is at least one step
 * (validation is handled separately in Task 8).
 */
export function canPublish(state) {
    return state.totalSteps > 0;
}
// ── 7.4 Navigation with Data Preservation ──
export function goToNextStep(state) {
    if (!canGoNext(state))
        return state;
    return { ...state, currentStepIndex: state.currentStepIndex + 1 };
}
export function goToPreviousStep(state) {
    if (!canGoPrevious(state))
        return state;
    return { ...state, currentStepIndex: state.currentStepIndex - 1 };
}
export function goToStep(state, stepIndex) {
    if (stepIndex < 0 || stepIndex >= state.totalSteps)
        return state;
    return { ...state, currentStepIndex: stepIndex };
}
/**
 * Sets a field value on a specific step, preserving all other data.
 */
export function setFieldValue(state, stepIndex, fieldId, value) {
    if (stepIndex < 0 || stepIndex >= state.totalSteps)
        return state;
    return {
        ...state,
        steps: state.steps.map((s) => s.stepIndex === stepIndex
            ? { ...s, fields: { ...s.fields, [fieldId]: value } }
            : s),
    };
}
// ── 7.2 WizardStep — Step View Model Builder ──
/**
 * Builds a view model for a single wizard step, combining the step
 * definition (schema) with the current field values.
 */
export function buildStepViewModel(step, fieldValues) {
    return {
        stepIndex: step.stepIndex,
        title: step.title,
        helpText: step.helpText,
        fields: step.fields.map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            type: f.type,
            required: f.required,
            helpText: f.helpText,
            value: fieldValues[f.fieldId] ?? null,
            connectedSystem: f.connectedSystem,
        })),
    };
}
/**
 * Returns the view model for the current step of the wizard.
 * Requires the template's step definitions to build the view.
 */
export function getCurrentStep(state, templateSteps) {
    const stepDef = templateSteps[state.currentStepIndex];
    const stepState = state.steps[state.currentStepIndex];
    return buildStepViewModel(stepDef, stepState.fields);
}
// ── 7.3 Session Storage Persistence ──
const WIZARD_STORAGE_KEY = 'recipe-library:wizard';
export function saveWizardState(storage, state) {
    storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
}
export function loadWizardState(storage) {
    const raw = storage.getItem(WIZARD_STORAGE_KEY);
    if (raw === null)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidWizardState(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export function clearWizardState(storage) {
    storage.removeItem(WIZARD_STORAGE_KEY);
}
function isValidWizardState(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const obj = value;
    return (typeof obj.templateId === 'string' &&
        typeof obj.currentStepIndex === 'number' &&
        typeof obj.totalSteps === 'number' &&
        Array.isArray(obj.steps));
}
//# sourceMappingURL=wizard.js.map