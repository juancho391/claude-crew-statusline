// Pure helpers shared by the terminal and the graphical pane.

import type { CrewStatus } from '../types'
import { NO_TIER, TIERS } from './sprites'
import type { Tier } from './sprites'

export const isLive = (status: CrewStatus) => status === 'running' || status === 'waiting'

export const tierOf = (effort?: string): Tier => (effort && TIERS[effort]) || NO_TIER

/** `claude-haiku-5-5` -> `Haiku 5.5`; anything else is shown as given. */
export const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  if (!m) return id
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

export const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const shortTool = (tool: string) => (tool.startsWith('mcp__') ? tool.split('__').pop() ?? tool : tool)
