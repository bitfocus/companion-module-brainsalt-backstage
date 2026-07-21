import { type SomeCompanionConfigField } from '@companion-module/base';
export interface BackstageConfig {
    host: string;
    port: number;
    token: string;
}
export declare const DefaultConfig: BackstageConfig;
export declare function getConfigFields(): SomeCompanionConfigField[];
