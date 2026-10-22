import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CrewMember, CrewStatus, CrewTodos } from '../types'
import { clock, isLive, modelName, shortTool, tierOf, tokens } from './format'
import { graphicalPane } from './graphical'
import type { GraphicalElements } from './graphical'
import { clawdRows, SPRITE_COLUMNS } from './sprites'
import type { Pose } from './sprites'
import { isHexColor, THEME_NAMES, THEMES, themeFrom, themeName } from './themes'
import type { Theme } from './themes'

const PANE = 'subagent-crew'
const PROGRESS = 'report_progress'
const PROGRESS_TOOL = `mcp__subagent-crew__${PROGRESS}`
const crew = atom({ plugin: 'subagent-crew', key: 'crew' } as const, [])
const frame = atom({ plugin: 'subagent-crew', key: 'frame' } as const, 0)
const project = atom({ plugin: 'subagent-crew', key: 'project' } as const, '')

// Set from the plugin's userConfig when it registers.
let T: Theme = THEMES.warp!
let configured: Readonly<Record<string, unknown>> = {}
let current = 'warp'

/** Colors come from userConfig; what `/crew theme` and `/crew background` saved in the store wins. */
async function applyTheme($: EngineInterface) {
  let saved: { theme?: unknown; background?: unknown } = {}
  try {
    saved = { theme: await $.store.get('theme'), background: await $.store.get('background') }
  } catch {
    // No store: the configured colors stand, and the pane still starts.
  }
  const options = {
    ...configured,
    ...(saved.theme == null ? {} : { theme: saved.theme }),
    ...(saved.background == null ? {} : { background: saved.background }),
  }
  T = themeFrom(options)
  current = themeName(options)
  $.ui.invalidate('ui.render')
}

const themeList = () => THEME_NAMES.map(name => `  ${name}${name === current ? ' (current)' : ''}`).join('\n')

async function crewCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const [sub, value, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!sub) {
    await $.ui.open({ id: PANE, title: 'Agents' })

    return { text: 'Agents pane opened.' }
  }
  if (sub === 'theme') {
    if (!value) return { text: `Pane themes (/crew theme <name>, /crew theme reset):\n${themeList()}` }
    if (value === 'reset') {
      await $.store.delete('theme')
      await applyTheme($)

      return { text: `Theme reset to ${current}.` }
    }
    if (rest.length === 0 && THEME_NAMES.includes(value)) {
      await $.store.set('theme', value)
      await applyTheme($)

      return { text: `Theme set to ${value}.` }
    }

    return { text: `Unknown theme "${[value, ...rest].join(' ')}". Available:\n${themeList()}` }
  }
  if (sub === 'background') {
    if (value === 'reset' && rest.length === 0) {
      await $.store.delete('background')
      await applyTheme($)

      return { text: 'Background reset.' }
    }
    if (rest.length === 0 && isHexColor(value)) {
      await $.store.set('background', value)
      await applyTheme($)

      return { text: `Background set to ${value}.` }
    }

    return { text: 'Background must be #RRGGBB, or "reset".' }
  }

  return { text: 'Usage: /crew | /crew theme [name|reset] | /crew background <#RRGGBB|reset>' }
}

const TICK_MS = 300
const SYNC_EVERY = 4 // ticks between $.agent.list() syncs
const ROWS_PER_AGENT = 6 // a 5-row sprite beside 4 text lines, and a rule

const fit = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text

const fromAgentStatus = (status: string): CrewStatus | undefined => {
  if (status === 'running' || status === 'pending') return 'running'
  if (status === 'waiting' || status === 'idle') return 'waiting'
  if (status === 'completed' || status === 'failed' || status === 'killed') return status
  return undefined
}

/** A todo-list tool call, read as progress; undefined for any other tool. */
function todosAfter(before: CrewTodos | undefined, tool: string, input: Record<string, unknown>): CrewTodos | undefined {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos = input.todos as { content?: string; status?: string; activeForm?: string }[]
    const active = todos.find(t => t.status === 'in_progress')
    return {
      done: todos.filter(t => t.status === 'completed').length,
      total: todos.length,
      current: active?.activeForm || active?.content,
    }
  }
  const base = before ?? { done: 0, total: 0 }
  if (tool === 'TaskCreate') return { ...base, total: base.total + 1 }
  if (tool === 'TaskUpdate') {
    if (input.status === 'completed') return { ...base, done: Math.min(base.total, base.done + 1) }
    if (input.status === 'in_progress') {
      return { ...base, current: String(input.activeForm || input.subject || base.current || '') }
    }
  }

  return undefined
}

let timer: { cancel: () => void } | undefined
let ticks = 0

function startTicking($: EngineInterface) {
  if (timer) return
  timer = $.clock.every(TICK_MS, () => {
    void (async () => {
      ticks++
      await update($, frame, n => n + 1)
      if (ticks % SYNC_EVERY !== 0) return
      // Catch up on anything the events missed (a killed agent, a resumed one).
      const agents = await $.agent.list()
      const byId = new Map(agents.map(a => [a.id, a]))
      const list = await update($, crew, members =>
        members.map(m => {
          const status = byId.has(m.id) ? fromAgentStatus(byId.get(m.id)!.status) : undefined
          if (!status || status === m.status) return m
          return { ...m, status, endedAt: isLive(status) ? undefined : m.endedAt ?? Date.now() }
        }),
      )
      if (!list.some(m => isLive(m.status))) {
        timer?.cancel()
        timer = undefined
      }
    })().catch(() => {
      // A missed tick only skips one frame or sync; the next one catches up.
    })
  })
}

export const register: Register = (on, options) => {
  configured = options
  T = themeFrom(options)
  current = themeName(options)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'crew',
      description: 'Show the subagent crew pane; /crew theme <name> changes its colors',
    })
    // Subagents get no todo tools, so the pane offers its own: one call per step.
    await $.tool.register({
      name: PROGRESS,
      description:
        'Report your progress on the task to the Agents pane. Call it when you start each step ' +
        'and once more when you finish: done = steps completed so far, total = all steps, ' +
        'step = a short label for the step in progress (or "done" at the end).',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0 },
          total: { type: 'integer', minimum: 1 },
          step: { type: 'string' },
        },
        required: ['done', 'total'],
      },
      isDeferred: false,
    })
    await applyTheme($)
    await update($, project, () => e.cwd.split('/').filter(Boolean).pop() ?? '')
    void $.ui.open({ id: PANE, title: 'Agents' })
    if ((await read($, crew)).some(m => isLive(m.status))) startTicking($)

    return next(e)
  })

  on('command.run', { command: 'crew' }, ($, e) => crewCommand($, e.args)).catch(($, e, next) =>
    next.called ? next(e) : { text: 'Could not change the pane colors.' },
  )

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if ('agentId' in result && result.agentId) {
        const member: CrewMember = {
          id: result.agentId,
          description: e.description || 'subagent',
          type: e.subagentType || 'general-purpose',
          model: result.model,
          status: 'running',
          startedAt: Date.now(),
          tools: 0,
          tokens: 0,
        }
        await update($, crew, list => [...list.filter(m => m.id !== member.id), member].slice(-30))
        startTicking($)
      }
    } catch {
      // The pane is decoration: its bookkeeping never gets in the spawn's way.
    }

    return result
  }).catch(($, e, next) => next(e)) // fail open: a broken pane never blocks a spawn

  on('tool.call', async ($, e, next) => {
    if (e.tool === PROGRESS_TOOL) {
      const input = e as unknown as { done?: unknown; total?: unknown; step?: unknown }
      const total = Math.max(1, Math.floor(Number(input.total) || 1))
      const done = Math.min(total, Math.max(0, Math.floor(Number(input.done) || 0)))
      const current = typeof input.step === 'string' ? input.step.slice(0, 80) : undefined
      const id = e.agentId
      try {
        if (id) await update($, crew, list => list.map(m => (m.id === id ? { ...m, todos: { done, total, current } } : m)))
      } catch {
        // The answer below still reaches the subagent.
      }

      return { result: `Progress noted: ${done}/${total}${current ? ` · ${current}` : ''}.` }
    }
    try {
      if (e.agentId) {
        const id = e.agentId
        const input = e as unknown as Record<string, unknown>
        await update($, crew, list =>
          list.map((m): CrewMember => {
            if (m.id !== id) return m
            const todos = todosAfter(m.todos, e.tool, input) ?? m.todos
            return { ...m, tools: m.tools + 1, lastTool: e.tool, status: 'running', todos }
          }),
        )
      }
    } catch {
      // Same as above: a failed update must not block the tool call.
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // fail open, as above

  // turn.step streams: pass every chunk through untouched, then read the step's usage.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (e.agentId) {
        const id = e.agentId
        const u = result?.usage
        await update($, crew, list =>
          list.map(m => {
            if (m.id !== id) return m
            // Context is re-read from cache every step, so only its latest size counts.
            const context = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : m.context ?? 0
            const output = (m.output ?? 0) + (u?.output_tokens ?? 0)
            return {
              ...m,
              context,
              output,
              tokens: context + output,
              model: e.model || m.model,
              effort: e.effort === undefined ? m.effort : String(e.effort),
            }
          }),
        )
      }
    } catch {
      // Same as above.
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (e.agentId) {
        const id = e.agentId
        const status: CrewStatus = e.isAborted ? 'killed' : e.reason === 'error' ? 'failed' : 'completed'
        await update($, crew, list => list.map(m => (m.id === id ? { ...m, status, endedAt: Date.now() } : m)))
      }
    } catch {
      // Same as above.
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const members = await read($, crew)
    const n = await read($, frame)
    const where = await read($, project)
    const now = Date.now()
    const width = Math.max(30, e.props.bodyColumns)
    const height = Math.max(12, e.props.scroll.bodyRows)
    const inner = width - 2 // paddingX
    const textWidth = Math.max(10, inner - SPRITE_COLUMNS - 2)

    const live = members.filter(m => isLive(m.status))
    const finished = members.filter(m => !isLive(m.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    const totalTokens = members.reduce((sum, m) => sum + (m.tokens ?? 0), 0)
    const firstStart = Math.min(...(live.length ? live : members).map(m => m.startedAt))
    const lastEnd = live.length ? now : Math.max(...members.map(m => m.endedAt ?? now))
    const elapsed = members.length ? clock(lastEnd - firstStart) : '0:00'

    // Proportional-font surfaces get vector drawings: character-drawn bars and sprites break there.
    if (e.surface !== 'terminal') {
      return graphicalPane($.ui.resolve(e) as unknown as GraphicalElements, {
        members,
        live,
        finished,
        totalTokens,
        elapsed,
        now,
        frame: n,
        where,
        theme: T,
        view: id => void $.ui.view({ agentId: id }),
      })
    }

    const room = Math.max(1, Math.floor((height - 7) / ROWS_PER_AGENT))
    const shownLive = live.slice(0, room)
    const shownDone = finished.slice(0, Math.max(0, room - shownLive.length))

    const card = (label: string, value: string, color = T.TEXT) => (
      <Box flexGrow={1} borderStyle="round" borderColor={T.EDGE} backgroundColor={T.CARD} paddingX={1}>
        <Text>
          <Text color={T.SUB}>{label} </Text>
          <Text bold color={color}>
            {value}
          </Text>
        </Text>
      </Box>
    )

    const bar = (m: CrewMember, accent: string) => {
      const cells = textWidth
      if (m.todos && m.todos.total > 0) {
        const filled = Math.round((m.todos.done / m.todos.total) * cells)
        return [<Text color={accent}>{'━'.repeat(filled)}</Text>, <Text color={T.TRACK}>{'━'.repeat(cells - filled)}</Text>]
      }
      if (!isLive(m.status)) return [<Text color={m.status === 'completed' ? accent : T.CORAL}>{'━'.repeat(cells)}</Text>]
      // No todo list to measure: a glint sweeps along the track while it works.
      const glint = Math.max(4, Math.floor(cells / 5))
      const at = (n * 2) % (cells + glint) - glint
      const start = Math.max(0, at)
      const end = Math.min(cells, at + glint)
      return [
        <Text color={T.TRACK}>{'━'.repeat(start)}</Text>,
        <Text color={accent}>{'━'.repeat(Math.max(0, end - start))}</Text>,
        <Text color={T.TRACK}>{'━'.repeat(cells - Math.max(end, start))}</Text>,
      ]
    }

    const agent = (m: CrewMember) => {
      const isOn = isLive(m.status)
      const tier = tierOf(m.effort)
      const pose: Pose = !isOn ? 'rest' : n % 2 ? 'wave' : 'stand'
      const step = m.todos && m.todos.total > 0
        ? `${m.todos.done}/${m.todos.total} · ${m.todos.current || (isOn ? 'working' : 'done')}`
        : isOn
          ? `${m.tools} · ${m.lastTool ? shortTool(m.lastTool) : 'thinking'}`
          : m.status === 'completed'
            ? `✓ done · ${m.tools} tools`
            : `✗ ${m.status}`
      const stats = `${tokens(m.tokens ?? 0)} tok · ${clock((m.endedAt ?? now) - m.startedAt)}`
      const dot = m.status === 'waiting' ? '◌' : isOn ? (n % 4 < 2 ? '●' : '○') : '●'

      return (
        <Box key={m.id} flexDirection="column">
          <Box flexDirection="row">
            <Box flexDirection="column" marginRight={2}>
              {clawdRows(tier.hat, pose, T.BG).map(runs => (
                <Text>
                  {runs.map(run => (
                    <Text color={run.fg} backgroundColor={run.bg}>
                      {run.text}
                    </Text>
                  ))}
                </Text>
              ))}
            </Box>
            <Box flexDirection="column" width={textWidth}>
              <Box flexDirection="row" justifyContent="space-between">
                <Button key={m.id} plain onPress={() => void $.ui.view({ agentId: m.id })}>
                  <Text bold color={isOn ? T.TEXT : T.SUB}>
                    {fit(m.description, textWidth - 2)}
                  </Text>
                </Button>
                <Text color={isOn ? tier.accent : T.MUTED}>{dot}</Text>
              </Box>
              <Text>
                {tier.word && <Text color={tier.accent}>{tier.word} </Text>}
                <Text color={T.SUB}>
                  {modelName(m.model)}
                  {m.effort ? ` · ${m.effort}` : ''}
                </Text>
              </Text>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={isOn ? T.TEXT : T.SUB}>{fit(step, Math.max(4, textWidth - stats.length - 1))}</Text>
                <Text color={T.SUB}>{stats}</Text>
              </Box>
              <Text>{bar(m, tier.accent)}</Text>
            </Box>
          </Box>
          <Text color={T.EDGE}>{'─'.repeat(inner)}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={T.BG} width={width} minHeight={height} paddingX={1}>
        <Text bold color={T.TEXT}>
          Agents
        </Text>
        <Text color={T.SUB}>{where || 'this session'}</Text>
        <Box flexDirection="row" columnGap={1}>
          {card('Tokens', tokens(totalTokens))}
          {card('Time', elapsed)}
          {card('Agents', `${members.length - live.length}/${members.length}`, live.length ? T.MINT : T.TEXT)}
        </Box>

        {members.length === 0 && (
          <Box marginTop={1}>
            <Text color={T.MUTED}>no subagents yet — they show up here as soon as one starts</Text>
          </Box>
        )}

        {shownLive.length > 0 && (
          <Box marginTop={1}>
            <Text bold color={T.MUTED}>
              RUNNING · {live.length}
            </Text>
          </Box>
        )}
        {shownLive.map(agent)}

        {shownDone.length > 0 && (
          <Box marginTop={1}>
            <Text bold color={T.MUTED}>
              DONE · {finished.length}
            </Text>
          </Box>
        )}
        {shownDone.map(agent)}

        {members.length > 0 && (
          <Box marginTop={1}>
            <Text color={T.MUTED}>enter on a title opens its transcript</Text>
          </Box>
        )}
      </Box>
    )
  })
}
