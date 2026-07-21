import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { getConfigFields, DefaultConfig, type BackstageConfig } from './config.js'
import { ShowControlConnection } from './showControlConnection.js'
import { buildShowControlDefs, scAllVariableValues, scVariableValuesFor, SC_FEEDBACK_IDS } from './showControlDefs.js'

class BackstageModule extends InstanceBase<BackstageConfig> {
	private sc: ShowControlConnection | null = null

	async init(config: BackstageConfig): Promise<void> {
		this.updateStatus(InstanceStatus.Connecting)
		this.startConnection(config)
	}

	async destroy(): Promise<void> {
		this.sc?.destroy()
		this.sc = null
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return getConfigFields()
	}

	async configUpdated(config: BackstageConfig): Promise<void> {
		if (this.sc) {
			this.sc.updateConfig(config.host || DefaultConfig.host, config.port || DefaultConfig.port, config.token ?? '')
		} else {
			this.startConnection(config)
		}
	}

	// ─── Connection ───

	private startConnection(config: BackstageConfig): void {
		this.sc?.destroy()
		this.sc = new ShowControlConnection(
			config.host || DefaultConfig.host,
			config.port || DefaultConfig.port,
			config.token ?? '',
			{
				onEntitiesChanged: () => {
					this.rebuildDefinitions()
					if (this.sc) this.setVariableValues(scAllVariableValues(this.sc))
					this.checkFeedbacks(...SC_FEEDBACK_IDS)
				},
				onStatusUpdate: (domain, name) => {
					if (this.sc) this.setVariableValues(scVariableValuesFor(this.sc, domain, name))
					this.checkFeedbacks(...SC_FEEDBACK_IDS)
				},
				onConnected: () => this.updateStatus(InstanceStatus.Ok),
				onDisconnected: (reason) => {
					// A server-side rejection already explains itself; only generic failures get the setup hint
					const hint = reason.includes('disabled')
						? ''
						: ' - check that "Enable Show-Control Protocol" is on in Backstage Settings > Remote Control'
					this.updateStatus(InstanceStatus.Connecting, `${reason}${hint}`)
				},
				log: (level, msg) => this.log(level, msg),
			},
		)
		this.rebuildDefinitions()
		this.sc.connect()
	}

	private rebuildDefinitions(): void {
		const defs = buildShowControlDefs(this.sc, this.label)
		this.setActionDefinitions(defs.actions)
		this.setFeedbackDefinitions(defs.feedbacks)
		this.setVariableDefinitions(defs.variables)
		this.setPresetDefinitions(defs.presets)
	}
}

runEntrypoint(BackstageModule, [])
