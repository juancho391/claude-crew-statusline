import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

/** Mounts the pane (starting a session first unless `start` is false); returns its root Box and title Text props. */
async function paneProps($: Engine, start = true) {
  if (start) await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const root = (await ui.find({ type: 'Box' }))?.props
  const title = (await ui.find({ type: 'Text', text: /^Agents$/ }))?.props
  await ui.unmount()

  return { root, title }
}

const stub = (on: On) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__subagent-crew__report_progress' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
}

test('the default theme keeps the pane colors it always had', async ($, on) => {
  stub(on)
  const { root, title } = await paneProps($)
  expect(root?.backgroundColor).toBe('#06171D')
  expect(title?.color).toBe('#E6EDF3')
})

test('a theme preset recolors the pane', { options: { theme: 'light' } }, async ($, on) => {
  stub(on)
  const { root, title } = await paneProps($)
  expect(root?.backgroundColor).toBe('#FAFAFA')
  expect(title?.color).toBe('#1F2328')
})

test('a background color overrides the theme background', { options: { background: '#112233' } }, async ($, on) => {
  stub(on)
  const { root, title } = await paneProps($)
  expect(root?.backgroundColor).toBe('#112233')
  expect(title?.color).toBe('#E6EDF3') // the rest of the theme is untouched
})

test('a background that is not #RRGGBB is ignored', { options: { background: 'red' } }, async ($, on) => {
  stub(on)
  const { root } = await paneProps($)
  expect(root?.backgroundColor).toBe('#06171D')
})

const run = ($: Engine, args: string) =>
  ($ as unknown as { command: { run: (e: { command: string; args: string }) => Promise<{ text?: string }> } }).command.run({
    command: 'crew',
    args,
  })

test('/crew theme <name> recolors the pane at once', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const out = await run($, 'theme mocha')
  expect(out.text).toMatch(/mocha/)
  const { root } = await paneProps($, false)
  expect(root?.backgroundColor).toBe('#1E1E2E')
})

test('/crew theme lists the themes and marks the current one', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const out = await run($, 'theme')
  for (const name of ['warp', 'midnight', 'mocha', 'light']) expect(out.text).toContain(name)
  expect(out.text).toMatch(/warp \(current\)/)
})

test('/crew theme with an unknown name changes nothing and lists the themes', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const out = await run($, 'theme neon')
  expect(out.text).toMatch(/unknown theme/i)
  expect(out.text).toContain('midnight')
  const { root } = await paneProps($, false)
  expect(root?.backgroundColor).toBe('#06171D')
})

test('/crew background sets a color, rejects a bad one, and reset goes back', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await run($, 'background #112233')
  expect((await paneProps($, false)).root?.backgroundColor).toBe('#112233')
  expect((await run($, 'background red')).text).toMatch(/#RRGGBB/)
  expect((await paneProps($, false)).root?.backgroundColor).toBe('#112233')
  await run($, 'background reset')
  expect((await paneProps($, false)).root?.backgroundColor).toBe('#06171D')
})

test('a theme chosen with /crew beats the configured one and survives a new session', { options: { theme: 'light' } }, async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await run($, 'theme midnight')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await paneProps($, false)).root?.backgroundColor).toBe('#0D1117')
  await run($, 'theme reset')
  expect((await paneProps($, false)).root?.backgroundColor).toBe('#FAFAFA') // back to the configured theme
})

test('/crew with no arguments still opens the pane', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await run($, '')).text).toBe('Agents pane opened.')
})
