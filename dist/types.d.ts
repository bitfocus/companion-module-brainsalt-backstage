export type ShowControlDomain = 'step' | 'seq' | 'bcast' | 'cal' | 'output' | 'mixer' | 'input' | 'node';
export declare const ALL_DOMAINS: ShowControlDomain[];
export interface StepperStatus {
    name: string;
    state: string;
    step: number;
    stepCount: number;
    stepName: string;
    activeTime: number;
}
export interface SequencerStatus {
    name: string;
    state: string;
    time: number;
    duration: number;
    looped: boolean;
    tempo: number;
    fade: number;
}
export interface BroadcastStatus {
    name: string;
    enabled: boolean;
    state: string;
    activeEntry: string;
    nextEntry: string;
    currentTime: string;
}
export interface CalibratorStatus {
    name: string;
    state: string;
    progress: number;
    message: string;
    alignSnapshots: string[];
    blackSnapshots: string[];
}
export interface MixerStatus {
    name: string;
    inputs: number;
    outputs: number;
    volume: number;
    channelVolumes: number[];
    muted: boolean;
}
export interface NdiInputStatus {
    name: string;
    source: string;
    sources: string[];
}
export type NodeEndpointType = 'bang' | 'float' | 'int' | 'bool' | 'enum' | 'string' | 'color';
/**
 * A `node` domain endpoint. Remote Control In/Out and labelled datatype nodes are plain
 * string values; CompanionIO nodes additionally carry typed-control metadata (type,
 * min/max/step, enum choices, group) so we can render proper widgets.
 */
export interface NodeEndpoint {
    name: string;
    dir: 'in' | 'out' | 'inout';
    value?: string;
    type?: NodeEndpointType;
    min?: number;
    max?: number;
    step?: number;
    choices?: string[];
    group?: string;
}
/** Any entity status, keyed by its `name` */
export type EntityStatus = StepperStatus | SequencerStatus | BroadcastStatus | CalibratorStatus | MixerStatus | NdiInputStatus | NodeEndpoint;
export interface ShowControlEvent {
    type: 'event';
    domain: ShowControlDomain;
    status: EntityStatus;
}
export interface ShowControlResponse {
    id?: number;
    ok: boolean;
    result?: {
        items?: EntityStatus[];
    } & Record<string, unknown>;
    error?: {
        code: number;
        message: string;
    };
}
