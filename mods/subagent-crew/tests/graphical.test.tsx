import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const pane = (surface: string) =>
  ({
    plugin: 'subagent-crew',
    component: 'Pane',
    requestId: 'subagent-crew',
    surface,
    props: { title: 'Agents', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as never

type Mounted = {
  find: (q: Record<string, unknown>) => Promise<{ props?: Record<string, unknown>; text?: string } | undefined>
  findAll: (q: Record<string, unknown>) => Promise<{ props?: Record<string, unknown> }[]>
  unmount: () => Promise<unknown>
}

const stub = (on: On) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__subagent-crew__report_progress' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('clock.every', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

/** The pane's vector images, told apart by what they draw: the sprite is 9x10, a bar 1000 wide. */
async function images(ui: Mounted) {
  const all = (await ui.findAll({ type: 'Svg' })).map(el => ({ source: String(el.props?.source), alt: String(el.props?.alt) }))

  return {
    sprites: all.filter(i => i.source.includes('viewBox="0 0 9 10"')),
    bars: all.filter(i => i.source.includes('viewBox="0 0 1000 8"')),
  }
}

/** One running subagent (with a 1/2 progress report unless `progress` is false), mounted on `surface`. */
async function mounted($: Engine, surface: string, description = 'Research competitor launches', progress = true) {
  await $.session.start({ cwd: '/Users/me/launch-kit', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Research', description, subagentType: 'Explore' } as never)
  if (progress) await $.tool.call({ tool: 'mcp__subagent-crew__report_progress', agentId: 'a1', done: 1, total: 2, step: 'Pricing' } as never)

  return (await $.ui.mount(pane(surface))) as unknown as Mounted
}

for (const surface of ['desktop', 'vscode', 'mobile']) {
  test(`${surface}: no character-drawn bars, rules or sprite, since those break on a proportional font`, async ($, on) => {
    stub(on)
    const ui = await mounted($, surface)
    expect(await ui.find({ type: 'Text', text: /[▀━─]/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: the sprite and the progress bar are vector images`, async ($, on) => {
    stub(on)
    const ui = await mounted($, surface)
    const { sprites, bars } = await images(ui)
    expect(sprites).toHaveLength(1)
    expect(sprites[0]!.source).toMatch(/<rect /)
    expect(sprites[0]!.alt).toMatch(/Clawd/)
    expect(bars).toHaveLength(1)
    expect(bars[0]!.source).toMatch(/<rect[^>]*width="500"/) // 1 of 2 steps done
    await ui.unmount()
  })

  test(`${surface}: it still shows what the terminal pane shows`, async ($, on) => {
    stub(on)
    const ui = await mounted($, surface)
    expect(await ui.find({ type: 'Text', text: /RUNNING · 1/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Research competitor launches/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /1\/2 · Pricing/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Haiku 5\.5/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button' })).toBeTruthy() // the title still opens the transcript
    await ui.unmount()
  })
}

test('desktop: a long title is truncated by the surface, not cut by character count', async ($, on) => {
  stub(on)
  const long = 'Audit every dependency in the monorepo and report which ones are unmaintained or vulnerable'
  const ui = await mounted($, 'desktop', long)
  const title = await ui.find({ type: 'Text', text: new RegExp(long) })
  expect(title?.text).toBe(long) // whole text kept
  expect(title?.props?.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('desktop: a finished agent with no todo list shows a full bar', async ($, on) => {
  stub(on)
  const ui = await mounted($, 'desktop', 'Research competitor launches', false)
  await ui.unmount()
  await $.turn.complete({ agentId: 'a1', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const after = (await $.ui.mount(pane('desktop'))) as unknown as Mounted
  expect(await after.find({ type: 'Text', text: /DONE · 1/ })).toBeTruthy()
  const { bars } = await images(after)
  const full = bars[0]!.source.match(/<rect[^>]*width="1000"/g) ?? []
  expect(full.length).toBe(2) // the track and a fill as long as the track
  await after.unmount()
})
