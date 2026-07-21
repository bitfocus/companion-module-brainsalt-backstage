import {
	combineRgb,
	type CompanionActionDefinitions,
	type CompanionFeedbackDefinitions,
	type CompanionVariableDefinition,
	type CompanionPresetDefinitions,
	type DropdownChoice,
} from '@companion-module/base'
import type { ShowControlConnection } from './showControlConnection.js'
import type {
	BroadcastStatus,
	CalibratorStatus,
	MixerStatus,
	NdiInputStatus,
	NodeEndpoint,
	SequencerStatus,
	ShowControlDomain,
	StepperStatus,
} from './types.js'

export interface ShowControlDefs {
	actions: CompanionActionDefinitions
	feedbacks: CompanionFeedbackDefinitions
	variables: CompanionVariableDefinition[]
	presets: CompanionPresetDefinitions
}

/** Feedback ids to re-check when a show-control status event arrives */
export const SC_FEEDBACK_IDS = [
	'sc_step_state',
	'sc_step_at',
	'sc_seq_state',
	'sc_seq_pos_above',
	'sc_bcast_enabled',
	'sc_bcast_active',
	'sc_cal_state',
	'sc_output_muted',
	'sc_mixer_muted',
	'sc_output_vol_above',
	'sc_mixer_vol_above',
	'sc_input_source',
	'sc_node_equals',
	'sc_node_bool_on',
	'sc_node_enum_matches',
	'sc_node_above',
	'sc_node_color_preview',
]

function san(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function scVarId(domain: ShowControlDomain, name: string, field: string): string {
	return `sc_${domain}_${san(name)}_${field}`
}

function fmtTime(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds))
	const m = Math.floor(s / 60)
	return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ─── Node-endpoint helpers (typed CompanionIO endpoints carry meta; others are plain strings) ───

function nodeEndpoints(sc: ShowControlConnection, filter: (ep: NodeEndpoint) => boolean): NodeEndpoint[] {
	const out: NodeEndpoint[] = []
	for (const e of sc.entities.get('node')?.values() ?? []) {
		const ep = e as NodeEndpoint
		if (filter(ep)) out.push(ep)
	}
	return out
}

function nodeTargetOption(sc: ShowControlConnection, filter: (ep: NodeEndpoint) => boolean) {
	const choices: DropdownChoice[] = nodeEndpoints(sc, filter).map((ep) => ({
		id: ep.name,
		label: ep.group ? `${ep.group}: ${ep.name}` : ep.name,
	}))
	return {
		type: 'dropdown' as const,
		id: 'target',
		label: 'Control',
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
	}
}

function nodeNum(ep: NodeEndpoint | undefined): number {
	const n = parseFloat(ep?.value ?? '')
	return Number.isFinite(n) ? n : 0
}

function nodeBool(ep: NodeEndpoint | undefined): boolean {
	return ep?.value === '1' || ep?.value === 'true'
}

function parseColor(value: string | undefined): { r: number; g: number; b: number; a: number } | null {
	if (!value) return null
	const parts = value.split(',').map((p) => parseFloat(p))
	if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null
	return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

function clampToMeta(ep: NodeEndpoint | undefined, v: number): number {
	if (ep?.min !== undefined) v = Math.max(ep.min, v)
	if (ep?.max !== undefined) v = Math.min(ep.max, v)
	return v
}

function targetChoices(
	sc: ShowControlConnection,
	domain: ShowControlDomain,
	filter?: (e: never) => boolean,
): DropdownChoice[] {
	const out: DropdownChoice[] = []
	for (const name of sc.entities.get(domain)?.keys() ?? []) {
		if (filter && !filter(sc.entities.get(domain)!.get(name) as never)) continue
		out.push({ id: name, label: name })
	}
	return out
}

function targetOption(
	sc: ShowControlConnection,
	domain: ShowControlDomain,
	label: string,
	filter?: (e: never) => boolean,
) {
	const choices = targetChoices(sc, domain, filter)
	return {
		type: 'dropdown' as const,
		id: 'target',
		label,
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
	}
}

// ─── Variable values ───

export function scVariableValuesFor(
	sc: ShowControlConnection,
	domain: ShowControlDomain,
	name: string,
): Record<string, string | number | boolean | undefined> {
	const vals: Record<string, string | number | boolean | undefined> = {}
	const v = (field: string, value: string | number | boolean | undefined) => {
		vals[scVarId(domain, name, field)] = value
	}

	switch (domain) {
		case 'step': {
			const s = sc.getStatus<StepperStatus>('step', name)
			if (!s) break
			v('state', s.state)
			v('step', s.step)
			v('stepcount', s.stepCount)
			v('stepname', s.stepName)
			break
		}
		case 'seq': {
			const s = sc.getStatus<SequencerStatus>('seq', name)
			if (!s) break
			v('state', s.state)
			v('time', Number(s.time.toFixed(1)))
			v('time_fmt', fmtTime(s.time))
			v('duration', Number(s.duration.toFixed(1)))
			v('tempo', s.tempo)
			v('fade', Number(s.fade.toFixed(2)))
			break
		}
		case 'bcast': {
			const s = sc.getStatus<BroadcastStatus>('bcast', name)
			if (!s) break
			v('enabled', s.enabled ? 'ON' : 'OFF')
			v('active', s.activeEntry)
			v('next', s.nextEntry)
			break
		}
		case 'cal': {
			const s = sc.getStatus<CalibratorStatus>('cal', name)
			if (!s) break
			v('state', s.state)
			v('progress', Math.round(s.progress * 100))
			v('message', s.message)
			break
		}
		case 'output':
		case 'mixer': {
			const s = sc.getStatus<MixerStatus>(domain, name)
			if (!s) break
			v('volume', Number(s.volume.toFixed(2)))
			v('muted', s.muted ? 'MUTED' : 'ON')
			break
		}
		case 'input': {
			const s = sc.getStatus<NdiInputStatus>('input', name)
			if (!s) break
			v('source', s.source || '(unrouted)')
			break
		}
		case 'node': {
			const s = sc.getStatus<NodeEndpoint>('node', name)
			if (!s || s.dir === 'in') break
			// Typed endpoints render human-friendly values (choice label, ON/OFF, r,g,b)
			switch (s.type) {
				case 'bool':
					v('value', nodeBool(s) ? 'ON' : 'OFF')
					break
				case 'enum':
					v('value', s.choices?.[nodeNum(s)] ?? s.value ?? '')
					break
				case 'color': {
					const c = parseColor(s.value)
					v('value', c ? `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}` : '')
					break
				}
				case 'float':
					v('value', Number(nodeNum(s).toFixed(3)))
					break
				default:
					v('value', s.value ?? '')
					break
			}
			break
		}
	}
	return vals
}

export function scAllVariableValues(sc: ShowControlConnection): Record<string, string | number | boolean | undefined> {
	const vals: Record<string, string | number | boolean | undefined> = {}
	for (const [domain, cache] of sc.entities) {
		for (const name of cache.keys()) {
			Object.assign(vals, scVariableValuesFor(sc, domain, name))
		}
	}
	return vals
}

// ─── Definitions ───

export function buildShowControlDefs(sc: ShowControlConnection | null, label: string): ShowControlDefs {
	if (!sc) return { actions: {}, feedbacks: {}, variables: [], presets: {} }

	const actions = buildActions(sc)
	const feedbacks = buildFeedbacks(sc)
	const variables = buildVariables(sc)
	const presets = buildPresets(sc, label)
	return { actions, feedbacks, variables, presets }
}

function buildActions(sc: ShowControlConnection): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}

	// ── Stepper ──

	actions['sc_step_transport'] = {
		name: 'Stepper: Transport',
		description: 'Play / pause / stop / restart / bang / next on a Backstage stepper',
		options: [
			targetOption(sc, 'step', 'Stepper'),
			{
				type: 'dropdown',
				id: 'verb',
				label: 'Action',
				choices: [
					{ id: 'play', label: 'Play' },
					{ id: 'pause', label: 'Pause' },
					{ id: 'stop', label: 'Stop' },
					{ id: 'restart', label: 'Restart' },
					{ id: 'bang', label: 'Bang' },
					{ id: 'next', label: 'Next Step' },
				],
				default: 'play',
			},
		],
		callback: async (evt) => {
			sc.sendAction('step', String(evt.options.verb), String(evt.options.target))
		},
	}

	actions['sc_step_goto'] = {
		name: 'Stepper: Go To Step',
		description: 'Jump a stepper to a specific step (1-based)',
		options: [
			targetOption(sc, 'step', 'Stepper'),
			{ type: 'number', id: 'step', label: 'Step (1-based)', default: 1, min: 1, max: 9999, step: 1 },
		],
		callback: async (evt) => {
			sc.sendAction('step', 'goto', String(evt.options.target), { step: Number(evt.options.step) })
		},
	}

	// ── Sequencer ──

	actions['sc_seq_transport'] = {
		name: 'Sequencer: Transport',
		description: 'Transport / fade action on a Backstage sequencer',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{
				type: 'dropdown',
				id: 'verb',
				label: 'Action',
				choices: [
					{ id: 'play', label: 'Play' },
					{ id: 'pause', label: 'Pause' },
					{ id: 'stop', label: 'Stop' },
					{ id: 'restart', label: 'Restart' },
					{ id: 'bang', label: 'Bang' },
					{ id: 'fadein', label: 'Fade In' },
					{ id: 'fadeinplay', label: 'Fade In + Play' },
					{ id: 'fadeout', label: 'Fade Out' },
					{ id: 'fadeoutpause', label: 'Fade Out + Pause' },
					{ id: 'fadeoutstop', label: 'Fade Out + Stop' },
				],
				default: 'play',
			},
		],
		callback: async (evt) => {
			sc.sendAction('seq', String(evt.options.verb), String(evt.options.target))
		},
	}

	actions['sc_seq_seek'] = {
		name: 'Sequencer: Seek (fraction)',
		description: 'Seek to a fractional position (0 = start, 1 = end)',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'frac', label: 'Position 0..1', default: 0, min: 0, max: 1, step: 0.01 },
		],
		callback: async (evt) => {
			sc.sendAction('seq', 'seek', String(evt.options.target), { frac: Number(evt.options.frac) })
		},
	}

	actions['sc_seq_jump'] = {
		name: 'Sequencer: Jump (seconds)',
		description: 'Jump to an absolute time position in seconds',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'time', label: 'Time (seconds)', default: 0, min: 0, max: 999999, step: 0.1 },
		],
		callback: async (evt) => {
			sc.sendAction('seq', 'jump', String(evt.options.target), { time: Number(evt.options.time) })
		},
	}

	actions['sc_seq_tempo'] = {
		name: 'Sequencer: Set Tempo',
		description: 'Set playback speed (1 = normal, 0 = paused, 2 = double, negative = reverse)',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'value', label: 'Tempo', default: 1, min: -10, max: 10, step: 0.05 },
		],
		callback: async (evt) => {
			sc.sendAction('seq', 'tempo', String(evt.options.target), { value: Number(evt.options.value) })
		},
	}

	actions['sc_seq_tempo_adjust'] = {
		name: 'Sequencer: Adjust Tempo',
		description: 'Add to the current tempo. Use on encoder rotate_left/right with a negative/positive step.',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'step', label: 'Step', default: 0.05, min: -10, max: 10, step: 0.01 },
		],
		callback: async (evt) => {
			const s = sc.getStatus<SequencerStatus>('seq', String(evt.options.target))
			const current = s?.tempo ?? 1
			sc.sendAction('seq', 'tempo', String(evt.options.target), { value: current + Number(evt.options.step) })
		},
	}

	actions['sc_seq_fade'] = {
		name: 'Sequencer: Set Fade',
		description: 'Set the fade multiplier (0 = black/silent, 1 = full)',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'value', label: 'Fade 0..1', default: 1, min: 0, max: 1, step: 0.01 },
		],
		callback: async (evt) => {
			sc.sendAction('seq', 'fade', String(evt.options.target), { value: Number(evt.options.value) })
		},
	}

	actions['sc_seq_fade_adjust'] = {
		name: 'Sequencer: Adjust Fade',
		description: 'Add to the current fade multiplier (clamped 0..1). Encoder-friendly.',
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'step', label: 'Step', default: 0.05, min: -1, max: 1, step: 0.01 },
		],
		callback: async (evt) => {
			const s = sc.getStatus<SequencerStatus>('seq', String(evt.options.target))
			const current = s?.fade ?? 1
			const next = Math.min(1, Math.max(0, current + Number(evt.options.step)))
			sc.sendAction('seq', 'fade', String(evt.options.target), { value: next })
		},
	}

	// ── Broadcast scheduler ──

	actions['sc_bcast_enable'] = {
		name: 'Broadcast: Enable / Disable',
		description: 'Enable, disable or toggle a broadcast scheduler',
		options: [
			targetOption(sc, 'bcast', 'Broadcast Scheduler'),
			{
				type: 'dropdown',
				id: 'mode',
				label: 'Mode',
				choices: [
					{ id: 'on', label: 'Enable' },
					{ id: 'off', label: 'Disable' },
					{ id: 'toggle', label: 'Toggle' },
				],
				default: 'toggle',
			},
		],
		callback: async (evt) => {
			const target = String(evt.options.target)
			let enabled: boolean
			if (evt.options.mode === 'toggle') {
				const s = sc.getStatus<BroadcastStatus>('bcast', target)
				enabled = !(s?.enabled ?? false)
			} else {
				enabled = evt.options.mode === 'on'
			}
			sc.sendAction('bcast', 'enable', target, { enabled })
		},
	}

	actions['sc_bcast_force'] = {
		name: 'Broadcast: Force Entry',
		description: 'Force a named schedule entry to play now. Supports Companion variables.',
		options: [
			targetOption(sc, 'bcast', 'Broadcast Scheduler'),
			{ type: 'textinput', id: 'entry', label: 'Entry name', default: '', useVariables: true },
		],
		callback: async (evt, ctx) => {
			const entry = await ctx.parseVariablesInString(String(evt.options.entry))
			sc.sendAction('bcast', 'force', String(evt.options.target), { entry })
		},
	}

	actions['sc_bcast_clear'] = {
		name: 'Broadcast: Clear Forced Entry',
		description: 'Clear a forced entry and return to the schedule',
		options: [targetOption(sc, 'bcast', 'Broadcast Scheduler')],
		callback: async (evt) => {
			sc.sendAction('bcast', 'clear', String(evt.options.target))
		},
	}

	// ── Calibrator ──

	actions['sc_cal_command'] = {
		name: 'Calibrator: Run Command',
		description: 'Start alignment / black-level calibration or cancel a running one',
		options: [
			targetOption(sc, 'cal', 'Calibrator'),
			{
				type: 'dropdown',
				id: 'verb',
				label: 'Command',
				choices: [
					{ id: 'align', label: 'Align' },
					{ id: 'black', label: 'Black Level' },
					{ id: 'cancel', label: 'Cancel' },
				],
				default: 'align',
			},
		],
		callback: async (evt) => {
			sc.sendAction('cal', String(evt.options.verb), String(evt.options.target))
		},
	}

	actions['sc_cal_restore'] = {
		name: 'Calibrator: Restore Snapshot',
		description: 'Restore an alignment or black-level snapshot (index 0 = newest)',
		options: [
			targetOption(sc, 'cal', 'Calibrator'),
			{
				type: 'dropdown',
				id: 'kind',
				label: 'Kind',
				choices: [
					{ id: 'restorealign', label: 'Alignment' },
					{ id: 'restoreblack', label: 'Black Level' },
				],
				default: 'restorealign',
			},
			{ type: 'number', id: 'index', label: 'Snapshot index (0 = newest)', default: 0, min: 0, max: 99, step: 1 },
		],
		callback: async (evt) => {
			sc.sendAction('cal', String(evt.options.kind), String(evt.options.target), { index: Number(evt.options.index) })
		},
	}

	// ── Output / Matrix mixers (identical action set, different targets) ──

	for (const domain of ['output', 'mixer'] as const) {
		const label = domain === 'output' ? 'Output' : 'Matrix Mixer'

		actions[`sc_${domain}_volume`] = {
			name: `${label}: Set Volume`,
			description: `Set volume on an audio ${label.toLowerCase()} (1.0 = unity). Channel -1 = global.`,
			options: [
				targetOption(sc, domain, label),
				{ type: 'number', id: 'volume', label: 'Volume (linear)', default: 1, min: 0, max: 4, step: 0.01 },
				{ type: 'number', id: 'channel', label: 'Channel (-1 = global)', default: -1, min: -1, max: 255, step: 1 },
			],
			callback: async (evt) => {
				const channel = Number(evt.options.channel)
				const args: Record<string, unknown> = { volume: Number(evt.options.volume) }
				if (channel >= 0) args.channel = channel
				sc.sendAction(domain, 'volume', String(evt.options.target), args)
			},
		}

		actions[`sc_${domain}_volume_adjust`] = {
			name: `${label}: Adjust Volume`,
			description: 'Add to the current volume. Use on encoder rotate_left/right with a negative/positive step.',
			options: [
				targetOption(sc, domain, label),
				{ type: 'number', id: 'step', label: 'Step', default: 0.05, min: -4, max: 4, step: 0.01 },
				{ type: 'number', id: 'channel', label: 'Channel (-1 = global)', default: -1, min: -1, max: 255, step: 1 },
			],
			callback: async (evt) => {
				const target = String(evt.options.target)
				const channel = Number(evt.options.channel)
				const s = sc.getStatus<MixerStatus>(domain, target)
				const current = channel >= 0 ? (s?.channelVolumes?.[channel] ?? 1) : (s?.volume ?? 1)
				const next = Math.max(0, current + Number(evt.options.step))
				const args: Record<string, unknown> = { volume: next }
				if (channel >= 0) args.channel = channel
				sc.sendAction(domain, 'volume', target, args)
			},
		}

		actions[`sc_${domain}_mute`] = {
			name: `${label}: Mute`,
			description: `Mute, unmute or toggle an audio ${label.toLowerCase()}`,
			options: [
				targetOption(sc, domain, label),
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: [
						{ id: 'on', label: 'Mute' },
						{ id: 'off', label: 'Unmute' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
				},
			],
			callback: async (evt) => {
				const target = String(evt.options.target)
				let mute: boolean
				if (evt.options.mode === 'toggle') {
					const s = sc.getStatus<MixerStatus>(domain, target)
					mute = !(s?.muted ?? false)
				} else {
					mute = evt.options.mode === 'on'
				}
				sc.sendAction(domain, 'mute', target, { mute })
			},
		}
	}

	// ── NDI inputs ──

	{
		// One shared source list: every slot sees the same NDI sources on the network
		const sources = new Set<string>()
		for (const e of sc.entities.get('input')?.values() ?? []) {
			for (const s of (e as NdiInputStatus).sources ?? []) sources.add(s)
		}
		const sourceChoices: DropdownChoice[] = [
			{ id: '', label: '(unroute)' },
			...[...sources].sort().map((s) => ({ id: s, label: s })),
		]

		actions['sc_input_route'] = {
			name: 'NDI Input: Route Source',
			description: 'Route an NDI source to an input slot (empty = unroute)',
			options: [
				targetOption(sc, 'input', 'Input Slot'),
				{
					type: 'dropdown',
					id: 'source',
					label: 'NDI Source',
					choices: sourceChoices,
					default: '',
					allowCustom: true,
				},
			],
			callback: async (evt) => {
				sc.sendAction('input', 'route', String(evt.options.target), { source: String(evt.options.source ?? '') })
			},
		}
	}

	// ── Node endpoints (generic) ──

	actions['sc_node_send'] = {
		name: 'Node: Send Value',
		description:
			'Send a raw value to any settable node endpoint (Remote Control In, labelled datatype node, CompanionIO). Supports Companion variables.',
		options: [
			nodeTargetOption(sc, (ep) => ep.dir !== 'out'),
			{ type: 'textinput', id: 'value', label: 'Value', default: '', useVariables: true },
		],
		callback: async (evt, ctx) => {
			const value = await ctx.parseVariablesInString(String(evt.options.value))
			sc.sendAction('node', 'send', String(evt.options.target), { value })
		},
	}

	// ── Node endpoints (typed - CompanionIO nodes with metadata) ──

	const sendNode = (target: string, value: string) => sc.sendAction('node', 'send', target, { value })
	const nodeEp = (target: string) => sc.getStatus<NodeEndpoint>('node', target)

	actions['sc_node_bang'] = {
		name: 'Control: Trigger Bang',
		description: 'Send a trigger pulse to a Bang-type control',
		options: [nodeTargetOption(sc, (ep) => ep.type === 'bang')],
		callback: async (evt) => {
			sendNode(String(evt.options.target), '')
		},
	}

	actions['sc_node_number_set'] = {
		name: 'Control: Set Number',
		description: 'Set the value of a Float- or Int-type control',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'float' || ep.type === 'int'),
			{ type: 'number', id: 'value', label: 'Value', default: 0, min: -99999, max: 99999, step: 0.01 },
		],
		callback: async (evt) => {
			const target = String(evt.options.target)
			const ep = nodeEp(target)
			let v = clampToMeta(ep, Number(evt.options.value))
			if (ep?.type === 'int') v = Math.round(v)
			sendNode(target, String(v))
		},
	}

	actions['sc_node_number_adjust'] = {
		name: 'Control: Adjust Number',
		description:
			"Add a step to a Float/Int control (clamped to its min/max). Use on buttons or encoder rotate_left/right. Step 0 uses the control's own step size (negate with direction).",
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'float' || ep.type === 'int'),
			{
				type: 'number',
				id: 'step',
				label: 'Step (0 = use control step)',
				default: 0,
				min: -99999,
				max: 99999,
				step: 0.001,
			},
			{
				type: 'dropdown',
				id: 'direction',
				label: 'Direction',
				choices: [
					{ id: 'up', label: 'Increase' },
					{ id: 'down', label: 'Decrease' },
				],
				default: 'up',
			},
		],
		callback: async (evt) => {
			const target = String(evt.options.target)
			const ep = nodeEp(target)
			let step = Number(evt.options.step) || ep?.step || (ep?.type === 'int' ? 1 : 0.1)
			if (evt.options.direction === 'down') step = -step
			let v = clampToMeta(ep, nodeNum(ep) + step)
			if (ep?.type === 'int') v = Math.round(v)
			sendNode(target, String(v))
		},
	}

	actions['sc_node_bool_set'] = {
		name: 'Control: Set Bool',
		description: 'Turn a Bool-type control on/off or toggle it',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'bool'),
			{
				type: 'dropdown',
				id: 'mode',
				label: 'Mode',
				choices: [
					{ id: 'on', label: 'On' },
					{ id: 'off', label: 'Off' },
					{ id: 'toggle', label: 'Toggle' },
				],
				default: 'toggle',
			},
		],
		callback: async (evt) => {
			const target = String(evt.options.target)
			const on = evt.options.mode === 'toggle' ? !nodeBool(nodeEp(target)) : evt.options.mode === 'on'
			sendNode(target, on ? '1' : '0')
		},
	}

	actions['sc_node_enum_set'] = {
		name: 'Control: Set Enum Choice',
		description: 'Select a choice by index on an Enum-type control',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'enum'),
			{ type: 'number', id: 'index', label: 'Choice index (0-based)', default: 0, min: 0, max: 999, step: 1 },
		],
		callback: async (evt) => {
			sendNode(String(evt.options.target), String(Number(evt.options.index)))
		},
	}

	actions['sc_node_enum_step'] = {
		name: 'Control: Enum Next / Previous',
		description: 'Step through the choices of an Enum-type control, wrapping around',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'enum'),
			{
				type: 'dropdown',
				id: 'direction',
				label: 'Direction',
				choices: [
					{ id: 'next', label: 'Next' },
					{ id: 'prev', label: 'Previous' },
				],
				default: 'next',
			},
		],
		callback: async (evt) => {
			const target = String(evt.options.target)
			const ep = nodeEp(target)
			const count = ep?.choices?.length ?? 0
			if (count === 0) return
			const delta = evt.options.direction === 'prev' ? -1 : 1
			const next = (nodeNum(ep) + delta + count) % count
			sendNode(target, String(next))
		},
	}

	actions['sc_node_string_set'] = {
		name: 'Control: Set String',
		description: 'Set the text of a String-type control. Supports Companion variables.',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'string'),
			{ type: 'textinput', id: 'value', label: 'Value', default: '', useVariables: true },
		],
		callback: async (evt, ctx) => {
			const value = await ctx.parseVariablesInString(String(evt.options.value))
			sendNode(String(evt.options.target), value)
		},
	}

	actions['sc_node_color_set'] = {
		name: 'Control: Set Color',
		description: 'Set the color (RGBA) of a Color-type control',
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'color'),
			{
				type: 'colorpicker',
				id: 'value',
				label: 'Color',
				default: combineRgb(255, 255, 255),
				enableAlpha: true,
				returnType: 'number',
			},
		],
		callback: async (evt) => {
			const c = Number(evt.options.value)
			const r = ((c >> 16) & 0xff) / 255.0
			const g = ((c >> 8) & 0xff) / 255.0
			const b = (c & 0xff) / 255.0
			const t = (c >> 24) & 0xff
			const a = (255 - t) / 255.0
			sendNode(String(evt.options.target), `${r},${g},${b},${a}`)
		},
	}

	return actions
}

function buildFeedbacks(sc: ShowControlConnection): CompanionFeedbackDefinitions {
	const feedbacks: CompanionFeedbackDefinitions = {}

	const onStyle = { bgcolor: combineRgb(0, 200, 0), color: combineRgb(255, 255, 255) }

	feedbacks['sc_step_state'] = {
		type: 'boolean',
		name: 'Stepper: state is',
		description: 'Active while a stepper is in the selected state',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'step', 'Stepper'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 'Playing', label: 'Playing' },
					{ id: 'Paused', label: 'Paused' },
					{ id: 'Stopped', label: 'Stopped' },
				],
				default: 'Playing',
			},
		],
		callback: (evt) => {
			const s = sc.getStatus<StepperStatus>('step', String(evt.options.target))
			return s?.state === evt.options.state
		},
	}

	feedbacks['sc_step_at'] = {
		type: 'boolean',
		name: 'Stepper: at step',
		description: 'Active while a stepper is on the given step (1-based)',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'step', 'Stepper'),
			{ type: 'number', id: 'step', label: 'Step (1-based)', default: 1, min: 1, max: 9999, step: 1 },
		],
		callback: (evt) => {
			const s = sc.getStatus<StepperStatus>('step', String(evt.options.target))
			return s?.step === Number(evt.options.step)
		},
	}

	feedbacks['sc_seq_state'] = {
		type: 'boolean',
		name: 'Sequencer: state is',
		description: 'Active while a sequencer is in the selected state',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 'Playing', label: 'Playing' },
					{ id: 'Paused', label: 'Paused' },
					{ id: 'Stopped', label: 'Stopped' },
				],
				default: 'Playing',
			},
		],
		callback: (evt) => {
			const s = sc.getStatus<SequencerStatus>('seq', String(evt.options.target))
			return s?.state === evt.options.state
		},
	}

	feedbacks['sc_seq_pos_above'] = {
		type: 'boolean',
		name: 'Sequencer: position above',
		description: 'Active while the playback position is above a fraction of the duration',
		defaultStyle: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
		options: [
			targetOption(sc, 'seq', 'Sequencer'),
			{ type: 'number', id: 'frac', label: 'Fraction 0..1', default: 0.9, min: 0, max: 1, step: 0.01 },
		],
		callback: (evt) => {
			const s = sc.getStatus<SequencerStatus>('seq', String(evt.options.target))
			if (!s || s.duration <= 0) return false
			return s.time / s.duration > Number(evt.options.frac)
		},
	}

	feedbacks['sc_bcast_enabled'] = {
		type: 'boolean',
		name: 'Broadcast: enabled',
		description: 'Active while a broadcast scheduler is enabled',
		defaultStyle: onStyle,
		options: [targetOption(sc, 'bcast', 'Broadcast Scheduler')],
		callback: (evt) => {
			const s = sc.getStatus<BroadcastStatus>('bcast', String(evt.options.target))
			return s?.enabled === true
		},
	}

	feedbacks['sc_bcast_active'] = {
		type: 'boolean',
		name: 'Broadcast: active entry is',
		description: 'Active while the named schedule entry is playing',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'bcast', 'Broadcast Scheduler'),
			{ type: 'textinput', id: 'entry', label: 'Entry name', default: '' },
		],
		callback: (evt) => {
			const s = sc.getStatus<BroadcastStatus>('bcast', String(evt.options.target))
			return s?.activeEntry === String(evt.options.entry)
		},
	}

	feedbacks['sc_cal_state'] = {
		type: 'boolean',
		name: 'Calibrator: state is',
		description: 'Active while a calibrator is in the selected state',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'cal', 'Calibrator'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 'Idle', label: 'Idle' },
					{ id: 'Aligning', label: 'Aligning' },
					{ id: 'BlackLevel', label: 'Black Level' },
					{ id: 'Complete', label: 'Complete' },
					{ id: 'Error', label: 'Error' },
				],
				default: 'Aligning',
			},
		],
		callback: (evt) => {
			const s = sc.getStatus<CalibratorStatus>('cal', String(evt.options.target))
			return s?.state === evt.options.state
		},
	}

	for (const domain of ['output', 'mixer'] as const) {
		const label = domain === 'output' ? 'Output' : 'Matrix Mixer'

		feedbacks[`sc_${domain}_muted`] = {
			type: 'boolean',
			name: `${label}: muted`,
			description: `Active while the ${label.toLowerCase()} is muted`,
			defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
			options: [targetOption(sc, domain, label)],
			callback: (evt) => {
				const s = sc.getStatus<MixerStatus>(domain, String(evt.options.target))
				return s?.muted === true
			},
		}

		feedbacks[`sc_${domain}_vol_above`] = {
			type: 'boolean',
			name: `${label}: volume above`,
			description: 'Active while the global volume is above a threshold',
			defaultStyle: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
			options: [
				targetOption(sc, domain, label),
				{ type: 'number', id: 'threshold', label: 'Threshold (linear)', default: 1, min: 0, max: 4, step: 0.01 },
			],
			callback: (evt) => {
				const s = sc.getStatus<MixerStatus>(domain, String(evt.options.target))
				if (!s) return false
				return s.volume > Number(evt.options.threshold)
			},
		}
	}

	feedbacks['sc_input_source'] = {
		type: 'boolean',
		name: 'NDI Input: routed source is',
		description: 'Active while the input slot carries the named NDI source',
		defaultStyle: onStyle,
		options: [
			targetOption(sc, 'input', 'Input Slot'),
			{ type: 'textinput', id: 'source', label: 'NDI source name', default: '' },
		],
		callback: (evt) => {
			const s = sc.getStatus<NdiInputStatus>('input', String(evt.options.target))
			return s?.source === String(evt.options.source)
		},
	}

	feedbacks['sc_node_equals'] = {
		type: 'boolean',
		name: 'Node: value equals',
		description: 'Active while a readable node endpoint has the given value',
		defaultStyle: onStyle,
		options: [
			nodeTargetOption(sc, (ep) => ep.dir !== 'in'),
			{ type: 'textinput', id: 'value', label: 'Match value', default: '' },
		],
		callback: (evt) => {
			const s = sc.getStatus<NodeEndpoint>('node', String(evt.options.target))
			return s !== undefined && s.value === String(evt.options.value)
		},
	}

	feedbacks['sc_node_bool_on'] = {
		type: 'boolean',
		name: 'Control: Bool is ON',
		description: 'Active while a Bool-type control is on',
		defaultStyle: onStyle,
		options: [nodeTargetOption(sc, (ep) => ep.type === 'bool')],
		callback: (evt) => {
			return nodeBool(sc.getStatus<NodeEndpoint>('node', String(evt.options.target)))
		},
	}

	feedbacks['sc_node_enum_matches'] = {
		type: 'boolean',
		name: 'Control: Enum choice is',
		description: 'Active while an Enum-type control is on the given choice index',
		defaultStyle: onStyle,
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'enum'),
			{ type: 'number', id: 'index', label: 'Choice index (0-based)', default: 0, min: 0, max: 999, step: 1 },
		],
		callback: (evt) => {
			const ep = sc.getStatus<NodeEndpoint>('node', String(evt.options.target))
			return ep !== undefined && nodeNum(ep) === Number(evt.options.index)
		},
	}

	feedbacks['sc_node_above'] = {
		type: 'boolean',
		name: 'Control: number above threshold',
		description: 'Active while a Float/Int-type control is above a threshold',
		defaultStyle: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
		options: [
			nodeTargetOption(sc, (ep) => ep.type === 'float' || ep.type === 'int'),
			{ type: 'number', id: 'threshold', label: 'Threshold', default: 0.5, min: -99999, max: 99999, step: 0.01 },
		],
		callback: (evt) => {
			const ep = sc.getStatus<NodeEndpoint>('node', String(evt.options.target))
			return ep !== undefined && nodeNum(ep) > Number(evt.options.threshold)
		},
	}

	feedbacks['sc_node_color_preview'] = {
		type: 'advanced',
		name: 'Control: color preview',
		description: 'Sets the button background to the current color of a Color-type control',
		options: [nodeTargetOption(sc, (ep) => ep.type === 'color')],
		callback: (evt) => {
			const ep = sc.getStatus<NodeEndpoint>('node', String(evt.options.target))
			const c = parseColor(ep?.value)
			if (!c) return {}
			return {
				bgcolor: combineRgb(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)),
			}
		},
	}

	return feedbacks
}

function buildVariables(sc: ShowControlConnection): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = []
	const add = (domain: ShowControlDomain, name: string, field: string, label: string) => {
		defs.push({ variableId: scVarId(domain, name, field), name: label })
	}

	for (const name of sc.entities.get('step')?.keys() ?? []) {
		add('step', name, 'state', `Stepper ${name}: state`)
		add('step', name, 'step', `Stepper ${name}: current step`)
		add('step', name, 'stepcount', `Stepper ${name}: step count`)
		add('step', name, 'stepname', `Stepper ${name}: step name`)
	}
	for (const name of sc.entities.get('seq')?.keys() ?? []) {
		add('seq', name, 'state', `Sequencer ${name}: state`)
		add('seq', name, 'time', `Sequencer ${name}: time (s)`)
		add('seq', name, 'time_fmt', `Sequencer ${name}: time (m:ss)`)
		add('seq', name, 'duration', `Sequencer ${name}: duration (s)`)
		add('seq', name, 'tempo', `Sequencer ${name}: tempo`)
		add('seq', name, 'fade', `Sequencer ${name}: fade`)
	}
	for (const name of sc.entities.get('bcast')?.keys() ?? []) {
		add('bcast', name, 'enabled', `Broadcast ${name}: enabled`)
		add('bcast', name, 'active', `Broadcast ${name}: active entry`)
		add('bcast', name, 'next', `Broadcast ${name}: next entry`)
	}
	for (const name of sc.entities.get('cal')?.keys() ?? []) {
		add('cal', name, 'state', `Calibrator ${name}: state`)
		add('cal', name, 'progress', `Calibrator ${name}: progress %`)
		add('cal', name, 'message', `Calibrator ${name}: message`)
	}
	for (const name of sc.entities.get('output')?.keys() ?? []) {
		add('output', name, 'volume', `Output ${name}: volume`)
		add('output', name, 'muted', `Output ${name}: mute state`)
	}
	for (const name of sc.entities.get('mixer')?.keys() ?? []) {
		add('mixer', name, 'volume', `Matrix Mixer ${name}: volume`)
		add('mixer', name, 'muted', `Matrix Mixer ${name}: mute state`)
	}
	for (const name of sc.entities.get('input')?.keys() ?? []) {
		add('input', name, 'source', `NDI Input ${name}: routed source`)
	}
	for (const [name, e] of sc.entities.get('node') ?? []) {
		const ep = e as NodeEndpoint
		if (ep.dir === 'in') continue
		add('node', name, 'value', ep.group ? `${ep.group}: ${name}` : `Node ${name}: value`)
	}
	return defs
}

function buildPresets(sc: ShowControlConnection, LBL: string): CompanionPresetDefinitions {
	const presets: CompanionPresetDefinitions = {}
	const white = combineRgb(255, 255, 255)
	const pid = (domain: string, name: string, suffix: string) => `sc_${domain}_${san(name)}_${suffix}`
	const varRef = (domain: ShowControlDomain, name: string, field: string, label: string) =>
		`$(${label}:${scVarId(domain, name, field)})`

	for (const name of sc.entities.get('step')?.keys() ?? []) {
		const transport = (verb: string, text: string, bg: number, feedbackState?: string) => {
			presets[pid('step', name, verb)] = {
				type: 'button',
				category: 'Show Control: Steppers',
				name: `${name} ${text}`,
				style: { text: `${name}\\n${text}`, size: 'auto', color: white, bgcolor: bg },
				steps: [{ down: [{ actionId: 'sc_step_transport', options: { target: name, verb } }], up: [] }],
				feedbacks: feedbackState
					? [
							{
								feedbackId: 'sc_step_state',
								options: { target: name, state: feedbackState },
								style: { bgcolor: combineRgb(0, 200, 0) },
							},
						]
					: [],
			}
		}
		transport('play', 'Play', combineRgb(0, 60, 0), 'Playing')
		transport('pause', 'Pause', combineRgb(60, 60, 0), 'Paused')
		transport('stop', 'Stop', combineRgb(60, 0, 0), 'Stopped')
		transport('next', 'Next', combineRgb(0, 0, 60))

		presets[pid('step', name, 'display')] = {
			type: 'button',
			category: 'Show Control: Steppers',
			name: `${name} status`,
			style: {
				text: `${name}\\n${varRef('step', name, 'step', LBL)}/${varRef('step', name, 'stepcount', LBL)}\\n${varRef('step', name, 'stepname', LBL)}`,
				size: 'auto',
				color: white,
				bgcolor: combineRgb(0, 0, 80),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}
	}

	for (const name of sc.entities.get('seq')?.keys() ?? []) {
		const transport = (verb: string, text: string, bg: number, feedbackState?: string) => {
			presets[pid('seq', name, verb)] = {
				type: 'button',
				category: 'Show Control: Sequencers',
				name: `${name} ${text}`,
				style: { text: `${name}\\n${text}`, size: 'auto', color: white, bgcolor: bg },
				steps: [{ down: [{ actionId: 'sc_seq_transport', options: { target: name, verb } }], up: [] }],
				feedbacks: feedbackState
					? [
							{
								feedbackId: 'sc_seq_state',
								options: { target: name, state: feedbackState },
								style: { bgcolor: combineRgb(0, 200, 0) },
							},
						]
					: [],
			}
		}
		transport('play', 'Play', combineRgb(0, 60, 0), 'Playing')
		transport('pause', 'Pause', combineRgb(60, 60, 0), 'Paused')
		transport('stop', 'Stop', combineRgb(60, 0, 0), 'Stopped')
		transport('fadeinplay', 'Fade In', combineRgb(0, 60, 60))
		transport('fadeoutstop', 'Fade Out', combineRgb(60, 0, 60))

		presets[pid('seq', name, 'display')] = {
			type: 'button',
			category: 'Show Control: Sequencers',
			name: `${name} status`,
			style: {
				text: `${name}\\n${varRef('seq', name, 'time_fmt', LBL)}\\n${varRef('seq', name, 'state', LBL)}`,
				size: 'auto',
				color: white,
				bgcolor: combineRgb(0, 0, 80),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}
	}

	for (const name of sc.entities.get('bcast')?.keys() ?? []) {
		presets[pid('bcast', name, 'toggle')] = {
			type: 'button',
			category: 'Show Control: Broadcast',
			name: `${name} enable toggle`,
			style: {
				text: `${name}\\n${varRef('bcast', name, 'enabled', LBL)}\\n${varRef('bcast', name, 'active', LBL)}`,
				size: 'auto',
				color: white,
				bgcolor: combineRgb(80, 0, 0),
			},
			steps: [{ down: [{ actionId: 'sc_bcast_enable', options: { target: name, mode: 'toggle' } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'sc_bcast_enabled', options: { target: name }, style: { bgcolor: combineRgb(0, 200, 0) } },
			],
		}
	}

	for (const name of sc.entities.get('cal')?.keys() ?? []) {
		presets[pid('cal', name, 'align')] = {
			type: 'button',
			category: 'Show Control: Calibrators',
			name: `${name} align`,
			style: { text: `${name}\\nAlign`, size: 'auto', color: white, bgcolor: combineRgb(0, 60, 0) },
			steps: [{ down: [{ actionId: 'sc_cal_command', options: { target: name, verb: 'align' } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'sc_cal_state',
					options: { target: name, state: 'Aligning' },
					style: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
				},
			],
		}
		presets[pid('cal', name, 'cancel')] = {
			type: 'button',
			category: 'Show Control: Calibrators',
			name: `${name} cancel`,
			style: { text: `${name}\\nCancel`, size: 'auto', color: white, bgcolor: combineRgb(60, 0, 0) },
			steps: [{ down: [{ actionId: 'sc_cal_command', options: { target: name, verb: 'cancel' } }], up: [] }],
			feedbacks: [],
		}
		presets[pid('cal', name, 'display')] = {
			type: 'button',
			category: 'Show Control: Calibrators',
			name: `${name} status`,
			style: {
				text: `${name}\\n${varRef('cal', name, 'state', LBL)}\\n${varRef('cal', name, 'progress', LBL)}%`,
				size: 'auto',
				color: white,
				bgcolor: combineRgb(0, 0, 80),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}
	}

	for (const domain of ['output', 'mixer'] as const) {
		const category = domain === 'output' ? 'Show Control: Outputs' : 'Show Control: Matrix Mixers'
		for (const name of sc.entities.get(domain)?.keys() ?? []) {
			presets[pid(domain, name, 'mute')] = {
				type: 'button',
				category,
				name: `${name} mute toggle`,
				style: {
					text: `${name}\\n${varRef(domain, name, 'muted', LBL)}`,
					size: 'auto',
					color: white,
					bgcolor: combineRgb(40, 40, 40),
				},
				steps: [{ down: [{ actionId: `sc_${domain}_mute`, options: { target: name, mode: 'toggle' } }], up: [] }],
				feedbacks: [
					{ feedbackId: `sc_${domain}_muted`, options: { target: name }, style: { bgcolor: combineRgb(200, 0, 0) } },
				],
			}
			presets[pid(domain, name, 'volup')] = {
				type: 'button',
				category,
				name: `${name} volume +`,
				style: { text: `${name}\\nVol +`, size: 'auto', color: white, bgcolor: combineRgb(0, 60, 0) },
				steps: [
					{
						down: [{ actionId: `sc_${domain}_volume_adjust`, options: { target: name, step: 0.05, channel: -1 } }],
						up: [],
					},
				],
				feedbacks: [],
			}
			presets[pid(domain, name, 'voldown')] = {
				type: 'button',
				category,
				name: `${name} volume -`,
				style: { text: `${name}\\nVol -`, size: 'auto', color: white, bgcolor: combineRgb(60, 0, 0) },
				steps: [
					{
						down: [{ actionId: `sc_${domain}_volume_adjust`, options: { target: name, step: -0.05, channel: -1 } }],
						up: [],
					},
				],
				feedbacks: [],
			}
			presets[pid(domain, name, 'display')] = {
				type: 'button',
				category,
				name: `${name} volume display`,
				style: {
					text: `${name}\\n${varRef(domain, name, 'volume', LBL)}`,
					size: 'auto',
					color: white,
					bgcolor: combineRgb(0, 0, 80),
				},
				steps: [{ down: [], up: [] }],
				feedbacks: [],
			}
		}
	}

	for (const name of sc.entities.get('input')?.keys() ?? []) {
		presets[pid('input', name, 'display')] = {
			type: 'button',
			category: 'Show Control: NDI Inputs',
			name: `${name} routed source`,
			style: {
				text: `${name}\\n${varRef('input', name, 'source', LBL)}`,
				size: 'auto',
				color: white,
				bgcolor: combineRgb(40, 40, 40),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}
	}

	// Typed node endpoints (CompanionIO): ready-made buttons per control, grouped by graph
	for (const e of sc.entities.get('node')?.values() ?? []) {
		const ep = e as NodeEndpoint
		if (!ep.type) continue
		const name = ep.name
		const category = `Controls: ${ep.group || 'Nodes'}`
		const valueRef = varRef('node', name, 'value', LBL)

		switch (ep.type) {
			case 'bang':
				presets[pid('node', name, 'bang')] = {
					type: 'button',
					category,
					name,
					style: { text: name, size: 'auto', color: white, bgcolor: combineRgb(80, 0, 0) },
					steps: [{ down: [{ actionId: 'sc_node_bang', options: { target: name } }], up: [] }],
					feedbacks: [],
				}
				break

			case 'float':
			case 'int': {
				presets[pid('node', name, 'display')] = {
					type: 'button',
					category,
					name,
					style: { text: `${name}\\n${valueRef}`, size: 'auto', color: white, bgcolor: combineRgb(0, 0, 80) },
					steps: [{ down: [], up: [] }],
					feedbacks: [],
				}
				presets[pid('node', name, 'inc')] = {
					type: 'button',
					category,
					name: `${name} +`,
					style: { text: `${name}\\n+`, size: 'auto', color: white, bgcolor: combineRgb(0, 60, 0) },
					steps: [
						{
							down: [{ actionId: 'sc_node_number_adjust', options: { target: name, step: 0, direction: 'up' } }],
							up: [],
						},
					],
					feedbacks: [],
				}
				presets[pid('node', name, 'dec')] = {
					type: 'button',
					category,
					name: `${name} -`,
					style: { text: `${name}\\n-`, size: 'auto', color: white, bgcolor: combineRgb(60, 0, 0) },
					steps: [
						{
							down: [{ actionId: 'sc_node_number_adjust', options: { target: name, step: 0, direction: 'down' } }],
							up: [],
						},
					],
					feedbacks: [],
				}
				break
			}

			case 'bool':
				presets[pid('node', name, 'toggle')] = {
					type: 'button',
					category,
					name,
					style: { text: `${name}\\n${valueRef}`, size: 'auto', color: white, bgcolor: combineRgb(80, 0, 0) },
					steps: [{ down: [{ actionId: 'sc_node_bool_set', options: { target: name, mode: 'toggle' } }], up: [] }],
					feedbacks: [
						{ feedbackId: 'sc_node_bool_on', options: { target: name }, style: { bgcolor: combineRgb(0, 200, 0) } },
					],
				}
				break

			case 'enum': {
				presets[pid('node', name, 'display')] = {
					type: 'button',
					category,
					name,
					style: { text: `${name}\\n${valueRef}`, size: 'auto', color: white, bgcolor: combineRgb(60, 0, 60) },
					steps: [{ down: [], up: [] }],
					feedbacks: [],
				}
				presets[pid('node', name, 'next')] = {
					type: 'button',
					category,
					name: `${name} next`,
					style: { text: `${name}\\n>>`, size: 'auto', color: white, bgcolor: combineRgb(0, 60, 0) },
					steps: [{ down: [{ actionId: 'sc_node_enum_step', options: { target: name, direction: 'next' } }], up: [] }],
					feedbacks: [],
				}
				presets[pid('node', name, 'prev')] = {
					type: 'button',
					category,
					name: `${name} prev`,
					style: { text: `${name}\\n<<`, size: 'auto', color: white, bgcolor: combineRgb(60, 0, 0) },
					steps: [{ down: [{ actionId: 'sc_node_enum_step', options: { target: name, direction: 'prev' } }], up: [] }],
					feedbacks: [],
				}
				for (let i = 0; i < (ep.choices?.length ?? 0); i++) {
					presets[pid('node', name, `choice_${i}`)] = {
						type: 'button',
						category,
						name: `${name}: ${ep.choices![i]}`,
						style: { text: ep.choices![i], size: 'auto', color: white, bgcolor: combineRgb(60, 0, 60) },
						steps: [{ down: [{ actionId: 'sc_node_enum_set', options: { target: name, index: i } }], up: [] }],
						feedbacks: [
							{
								feedbackId: 'sc_node_enum_matches',
								options: { target: name, index: i },
								style: { bgcolor: combineRgb(0, 200, 0) },
							},
						],
					}
				}
				break
			}

			case 'string':
				presets[pid('node', name, 'display')] = {
					type: 'button',
					category,
					name,
					style: { text: `${name}\\n${valueRef}`, size: 'auto', color: white, bgcolor: combineRgb(40, 40, 40) },
					steps: [{ down: [], up: [] }],
					feedbacks: [],
				}
				break

			case 'color':
				presets[pid('node', name, 'display')] = {
					type: 'button',
					category,
					name,
					style: { text: name, size: 'auto', color: white, bgcolor: combineRgb(40, 40, 40) },
					steps: [{ down: [], up: [] }],
					feedbacks: [{ feedbackId: 'sc_node_color_preview', options: { target: name } }],
				}
				break
		}
	}

	return presets
}
