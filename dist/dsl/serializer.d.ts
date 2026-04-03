/**
 * DSL Serialization & Deserialization for the Recipe Library.
 *
 * Converts between WizardConfiguration (client-side state) and
 * WorkflowDSL (the persisted/published JSON representation).
 */
import type { WizardConfiguration, WorkflowDSL, WorkflowMetadata } from '../models/types.js';
export declare class DSLValidationError extends Error {
    readonly section: string;
    constructor(message: string, section: string);
}
/**
 * Converts a WizardConfiguration into a WorkflowDSL definition.
 *
 * The `name` parameter provides the user-chosen workflow name that
 * appears in the DSL output.
 */
export declare function serializeConfig(config: WizardConfiguration, name: string, metadata: WorkflowMetadata): WorkflowDSL;
/**
 * Converts a WorkflowDSL definition back into a WizardConfiguration.
 *
 * Throws `DSLValidationError` when the input is malformed, with a
 * descriptive message identifying the invalid section.
 */
export declare function deserializeConfig(dsl: WorkflowDSL): WizardConfiguration;
//# sourceMappingURL=serializer.d.ts.map