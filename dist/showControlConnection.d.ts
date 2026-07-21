import { type EntityStatus, type ShowControlDomain } from './types.js';
export interface ShowControlCallbacks {
    /** The set of known entities changed (added/removed) - definitions need a rebuild */
    onEntitiesChanged: () => void;
    /** A single entity's status changed - variables/feedbacks need a refresh */
    onStatusUpdate: (domain: ShowControlDomain, name: string) => void;
    onConnected: () => void;
    onDisconnected: (reason: string) => void;
    log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;
}
/**
 * Client for the Backstage show-control protocol: newline-delimited JSON over TCP.
 * Authenticates, lists all domains, subscribes for pushed status events, and keeps
 * a per-domain entity cache keyed by the entity's Backstage name.
 */
export declare class ShowControlConnection {
    private host;
    private port;
    private token;
    private callbacks;
    private socket;
    private reconnectTimer;
    private relistTimer;
    private watchdogTimer;
    private entitiesChangedTimer;
    private rxBuffer;
    private lastRx;
    private nextId;
    private pending;
    private destroyed;
    private connected;
    private rejectReason;
    /** Entity cache: domain -> (name -> latest status) */
    readonly entities: Map<ShowControlDomain, Map<string, EntityStatus>>;
    constructor(host: string, port: number, token: string, callbacks: ShowControlCallbacks);
    isConnected(): boolean;
    connect(): void;
    updateConfig(host: string, port: number, token: string): void;
    destroy(): void;
    /** Fire a control action; response is logged but not awaited (truth arrives via events). */
    sendAction(domain: ShowControlDomain, action: string, target?: string, args?: Record<string, unknown>): void;
    getStatus<T extends EntityStatus>(domain: ShowControlDomain, name: string): T | undefined;
    private handshake;
    private listAll;
    private subscribe;
    private request;
    private handleLine;
    /** Debounced: a burst of appearing entities triggers one definitions rebuild */
    private notifyEntitiesChanged;
    private stopTimers;
    private cleanup;
    private scheduleReconnect;
}
