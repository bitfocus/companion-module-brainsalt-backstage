import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface BackstageConfig {
	host: string
	port: number
	token: string
}

export const DefaultConfig: BackstageConfig = {
	host: '127.0.0.1',
	port: 7400,
	token: '',
}

export function getConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Setup',
			value: 'Connects to the Backstage show-control protocol. In Backstage, check "Enable Show-Control Protocol" under Settings → Remote Control (and Apply / Restart Protocol Server). Steppers, sequencers, broadcast schedulers, calibrators, audio mixers, NDI inputs and remote-control nodes are discovered automatically — no graph nodes required. Add CompanionIO nodes (UI category) for custom typed controls: buttons, faders, toggles, enums and colors.',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Backstage IP / Hostname',
			tooltip: 'IP address or hostname of the machine running Backstage',
			default: DefaultConfig.host,
			width: 6,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Show-Control TCP Port',
			tooltip: 'TCP port of the Backstage show-control protocol (default 7400)',
			default: DefaultConfig.port,
			min: 1,
			max: 65535,
			width: 3,
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'Auth Token',
			tooltip: 'Show-control auth token configured in Backstage (leave empty if none)',
			default: DefaultConfig.token,
			width: 3,
		},
	]
}
