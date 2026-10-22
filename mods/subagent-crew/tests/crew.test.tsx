import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'subagent-crew',
  component: 'Pane',
  requestId: 'subagent-crew',
  surface: 'terminal',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const text = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<{ text?: string } | undefined> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

test('a subagent shows its effort, tokens and todo progress, then rests when done', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__subagent-crew__report_progress' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
    usage: { model: e.model, input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0 },
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))

  await $.session.start({ cwd: '/Users/me/launch-kit', surface: 'terminal', isInteractive: true })

  const empty = await $.ui.mount(PANE)
  expect(await text(empty, /launch-kit/)).toBe('launch-kit')
  expect(await text(empty, /no subagents yet/)).toBeTruthy()
  await empty.unmount()

  await $.agent.spawn({ prompt: 'Research', description: 'Research competitor launches', subagentType: 'Explore' })
  // Two steps: the context counts once (its latest size), the output adds up.
  for (const index of [0, 1]) {
    // A streaming event runs as its stream is read.
    const step = $.turn.step({ turnId: 't1', index, model: 'claude-haiku-5-5', effort: 'high', messageCount: 1, agentId: 'a1' })
    for await (const _ of step) {
      // no chunks in this test
    }
  }
  await $.tool.call({
    tool: 'TodoWrite',
    agentId: 'a1',
    todos: [
      { content: 'Collect', status: 'completed', activeForm: 'Collecting' },
      { content: 'Summarize', status: 'in_progress', activeForm: 'Summarizing' },
    ],
  })

  const ui = await $.ui.mount(PANE)
  expect(await text(ui, /RUNNING · 1/)).toBeTruthy()
  expect(await text(ui, /Research competitor launches/)).toBeTruthy()
  expect(await text(ui, /^careful $/)).toBeTruthy()
  expect(await text(ui, /Haiku 5\.5 · high/)).toBeTruthy()
  expect(await text(ui, /^1\/2 · Summarizing$/)).toBeTruthy()
  expect(await text(ui, /^12k tok · /)).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /▀/ })).toBeTruthy() // Clawd's pixels
  await ui.unmount()

  await $.turn.complete({ agentId: 'a1', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })

  const after = await $.ui.mount(PANE)
  expect(await text(after, /DONE · 1/)).toBeTruthy()
  expect(await text(after, /^1\/1$/)).toBeTruthy()
  expect(await text(after, /^12k$/)).toBeTruthy()
  expect(await text(after, /^Tokens $/)).toBeTruthy()
  expect(await after.find({ type: 'Button' })).toBeTruthy()
  await after.unmount()
})

test('a subagent fills its bar through the report_progress tool', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__subagent-crew__report_progress' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a2' }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Build', description: 'Build the landing page', subagentType: 'general-purpose' })
  const answer = await $.tool.call({ tool: 'mcp__subagent-crew__report_progress', agentId: 'a2', done: 4, total: 5, step: 'Pricing' })
  expect(answer.result).toBe('Progress noted: 4/5 · Pricing.')

  const ui = await $.ui.mount(PANE)
  expect(await text(ui, /^4\/5 · Pricing$/)).toBeTruthy()
  // The progress call is bookkeeping, not one of the agent's tools.
  expect(await text(ui, /^0 · /)).toBeUndefined()
  await ui.unmount()
})
