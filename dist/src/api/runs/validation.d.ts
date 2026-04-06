export interface RunsQueryParams {
    workflowId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    cursor?: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    parsed: RunsQueryParams;
}
export declare function isValidISODate(value: string): boolean;
export declare function clampLimit(value: number, max?: number): number;
export declare function encodeCursor(lastKey: Record<string, unknown>): string;
export declare function decodeCursor(cursor: string): Record<string, unknown> | null;
export declare function validateRunsQueryParams(raw: Record<string, string | undefined>): ValidationResult;
//# sourceMappingURL=validation.d.ts.map