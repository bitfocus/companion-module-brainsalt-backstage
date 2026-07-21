import net from 'node:net'
import {
	ALL_DOMAINS,
	type EntityStatus,
	type ShowControlDomain,
	type ShowControlEvent,
	type ShowControlResponse,
} from './types.js'

export interface ShowControlCallbacks {
	/** The set of known entities changed (added/removed) - definitions need a rebuild */
	onEntitiesChanged: () => void
	/** A single entity's status changed - variables/feedbacks need a refresh */
	onStatusUpdate: (domain: ShowControlDomain, name: string) => void
	onConnected: () => void
	onDisconnected: (reason: string) => void
	log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void
}

/**
 * Client for the Backstage show-control protocol: newline-delimited JSON over TCP.
 * Authenticates, lists all domains, subscribes for pushed status events, and keeps
 * a per-domain entity cache keyed by the entity's Backstage name.
 */
export class ShowControlConnection {
	private socket: net.Socket | null = null
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private relistTimer: ReturnType<typeof setInterval> | null = null
	private watchdogTimer: ReturnType<typeof setInterval> | null = null
	private entitiesChangedTimer: ReturnType<typeof setTimeout> | null = null
	private rxBuffer = ''
	private lastRx = 0
	private nextId = 1
	private pending = new Map<number, (resp: ShowControlResponse) => void>()
	private destroyed = false
	private connected = false
	private rejectReason: string | null = null

	/** Entity cache: domain -> (name -> latest status) */
	readonly entities = new Map<ShowControlDomain, Map<string, EntityStatus>>()

	constructor(
		private host: string,
		private port: number,
		private token: string,
		private callbacks: ShowControlCallbacks,
	) {
		for (const d of ALL_DOMAINS) this.entities.set(d, new Map())
	}

	isConnected(): boolean {
		return this.connected
	}

	connect(): void {
		this.cleanup()
		if (this.destroyed) return

		this.callbacks.log('info', `Show control: connecting to ${this.host}:${this.port}`)
		const socket = new net.Socket()
		this.socket = socket
		socket.setNoDelay(true)

		socket.on('connect', () => {
			this.connected = true
			this.lastRx = Date.now()
			this.callbacks.log('info', 'Show control: connected')
			this.handshake()
			this.callbacks.onConnected()

			// Events don't report removed entities - re-list periodically to stay in sync
			this.relistTimer = setInterval(() => this.listAll(), 30000)
			// Server heartbeats every ~3s once subscribed; silence means a dead connection
			this.watchdogTimer = setInterval(() => {
				if (Date.now() - this.lastRx > 15000) {
					this.callbacks.log('warn', 'Show control: heartbeat lost, reconnecting')
					socket.destroy()
				}
			}, 5000)
		})

		socket.on('data', (data) => {
			this.lastRx = Date.now()
			this.rxBuffer += data.toString('utf8')
			let idx: number
			while ((idx = this.rxBuffer.indexOf('\n')) >= 0) {
				const line = this.rxBuffer.slice(0, idx).replace(/\r$/, '')
				this.rxBuffer = this.rxBuffer.slice(idx + 1)
				if (line.trim().length > 0) this.handleLine(line)
			}
		})

		socket.on('error', (err) => {
			this.callbacks.log('error', `Show control: socket error: ${err.message}`)
		})

		socket.on('close', () => {
			const wasConnected = this.connected
			this.connected = false
			this.stopTimers()
			this.pending.clear()
			this.rxBuffer = ''
			this.callbacks.onDisconnected(this.rejectReason ?? (wasConnected ? 'connection closed' : 'connection refused'))
			this.rejectReason = null
			this.scheduleReconnect()
		})

		socket.connect(this.port, this.host)
	}

	updateConfig(host: string, port: number, token: string): void {
		this.host = host
		this.port = port
		this.token = token
		this.connect()
	}

	destroy(): void {
		this.destroyed = true
		this.cleanup()
	}

	// ─── Requests ───

	/** Fire a control action; response is logged but not awaited (truth arrives via events). */
	sendAction(domain: ShowControlDomain, action: string, target?: string, args?: Record<string, unknown>): void {
		this.request({ domain, action, ...(target !== undefined ? { target } : {}), ...(args ? { args } : {}) }, (resp) => {
			if (!resp.ok) {
				this.callbacks.log('warn', `Show control: ${domain}.${action} '${target ?? ''}' failed: ${resp.error?.message ?? 'unknown error'}`)
			}
		})
	}

	getStatus<T extends EntityStatus>(domain: ShowControlDomain, name: string): T | undefined {
		return this.entities.get(domain)?.get(name) as T | undefined
	}

	// ─── Connection bring-up ───

	private handshake(): void {
		// Identify as Companion first - Backstage can gate Companion via a settings sub-checkbox
		this.request({ domain: 'sys', action: 'client', args: { name: 'companion' } }, (resp) => {
			if (!resp.ok) {
				this.rejectReason = resp.error?.message ?? 'rejected by Backstage'
				this.callbacks.log('error', `Show control: ${this.rejectReason}`)
				this.socket?.destroy() // close triggers the reconnect backoff; re-enabling picks up in ~5s
				return
			}
			if (this.token) {
				this.request({ domain: 'sys', action: 'auth', args: { token: this.token } }, (authResp) => {
					if (!authResp.ok) {
						this.callbacks.log('error', 'Show control: authentication failed - check the auth token')
						return
					}
					this.listAll()
					this.subscribe()
				})
			} else {
				this.listAll()
				this.subscribe()
			}
		})
	}

	private listAll(): void {
		for (const domain of ALL_DOMAINS) {
			this.request({ domain, action: 'list' }, (resp) => {
				if (!resp.ok || !Array.isArray(resp.result?.items)) return
				const cache = this.entities.get(domain)!
				const fresh = new Map<string, EntityStatus>()
				for (const item of resp.result.items) {
					if (item && typeof item.name === 'string') fresh.set(item.name, item)
				}
				const setChanged =
					fresh.size !== cache.size || [...fresh.keys()].some((n) => !cache.has(n))
				this.entities.set(domain, fresh)
				if (setChanged) this.notifyEntitiesChanged()
				else for (const name of fresh.keys()) this.callbacks.onStatusUpdate(domain, name)
			})
		}
	}

	private subscribe(): void {
		this.request({ domain: 'sys', action: 'subscribe' }, (resp) => {
			if (!resp.ok) this.callbacks.log('warn', 'Show control: subscribe failed - no live feedback')
		})
	}

	// ─── Wire ───

	private request(payload: Record<string, unknown>, onResponse: (resp: ShowControlResponse) => void): void {
		if (!this.socket || !this.connected) return
		const id = this.nextId++
		this.pending.set(id, onResponse)
		this.socket.write(JSON.stringify({ id, ...payload }) + '\n')
	}

	private handleLine(line: string): void {
		let msg: unknown
		try {
			msg = JSON.parse(line)
		} catch {
			this.callbacks.log('warn', `Show control: unparseable line: ${line.slice(0, 200)}`)
			return
		}
		if (typeof msg !== 'object' || msg === null) return

		const obj = msg as Record<string, unknown>

		// Pushed status event (also serves as the heartbeat)
		if (obj.type === 'event') {
			const ev = obj as unknown as ShowControlEvent
			if (!ev.domain || !ev.status || typeof ev.status.name !== 'string') return
			const cache = this.entities.get(ev.domain)
			if (!cache) return
			const isNew = !cache.has(ev.status.name)
			// Merge over the cached entry: events may carry a partial shape (e.g. node
			// events have no 'dir'), and list results hold fields events don't re-send.
			cache.set(ev.status.name, { ...(cache.get(ev.status.name) ?? {}), ...ev.status } as typeof ev.status)
			if (isNew) this.notifyEntitiesChanged()
			else this.callbacks.onStatusUpdate(ev.domain, ev.status.name)
			return
		}

		// Response to one of our requests
		if (typeof obj.id === 'number') {
			const handler = this.pending.get(obj.id)
			if (handler) {
				this.pending.delete(obj.id)
				handler(obj as unknown as ShowControlResponse)
			}
		}
	}

	// ─── Housekeeping ───

	/** Debounced: a burst of appearing entities triggers one definitions rebuild */
	private notifyEntitiesChanged(): void {
		if (this.entitiesChangedTimer) return
		this.entitiesChangedTimer = setTimeout(() => {
			this.entitiesChangedTimer = null
			this.callbacks.onEntitiesChanged()
		}, 500)
	}

	private stopTimers(): void {
		if (this.relistTimer) {
			clearInterval(this.relistTimer)
			this.relistTimer = null
		}
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer)
			this.watchdogTimer = null
		}
		if (this.entitiesChangedTimer) {
			clearTimeout(this.entitiesChangedTimer)
			this.entitiesChangedTimer = null
		}
	}

	private cleanup(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		this.stopTimers()
		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.destroy()
			this.socket = null
		}
		this.connected = false
		this.pending.clear()
		this.rxBuffer = ''
	}

	private scheduleReconnect(): void {
		if (this.destroyed) return
		if (this.reconnectTimer) return
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.connect()
		}, 5000)
	}
}
