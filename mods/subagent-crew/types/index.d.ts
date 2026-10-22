export type CrewStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'killed'

/** Progress read from the subagent's own todo list (TodoWrite or TaskCreate/TaskUpdate). */
export type CrewTodos = { done: number; total: number; current?: string }

export type CrewMember = {
  id: string
  description: string
  type: string
  model: string
  effort?: string
  status: CrewStatus
  startedAt: number
  endedAt?: number
  tools: number
  lastTool?: string
  /** Counted as Claude Code counts a subagent: its latest context plus all it wrote. */
  tokens: number
  /** The latest step's context: input plus cache reads and writes. */
  context?: number
  /** Output tokens summed over every step. */
  output?: number
  todos?: CrewTodos
}

declare module 'claude-code' {
  interface PluginState {
    'subagent-crew': { crew: CrewMember[]; frame: number; project: string }
  }
}
