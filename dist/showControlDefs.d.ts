import { type CompanionActionDefinitions, type CompanionFeedbackDefinitions, type CompanionVariableDefinition, type CompanionPresetDefinitions } from '@companion-module/base';
import type { ShowControlConnection } from './showControlConnection.js';
import type { ShowControlDomain } from './types.js';
export interface ShowControlDefs {
    actions: CompanionActionDefinitions;
    feedbacks: CompanionFeedbackDefinitions;
    variables: CompanionVariableDefinition[];
    presets: CompanionPresetDefinitions;
}
/** Feedback ids to re-check when a show-control status event arrives */
export declare const SC_FEEDBACK_IDS: string[];
export declare function scVarId(domain: ShowControlDomain, name: string, field: string): string;
export declare function scVariableValuesFor(sc: ShowControlConnection, domain: ShowControlDomain, name: string): Record<string, string | number | boolean | undefined>;
export declare function scAllVariableValues(sc: ShowControlConnection): Record<string, string | number | boolean | undefined>;
export declare function buildShowControlDefs(sc: ShowControlConnection | null, label: string): ShowControlDefs;
