import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
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

/** Mounts the pane; returns its root Box and title Text props. */
async function paneProps($: Engine) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const root = (await ui.find({ type: 'Box' }))?.props
  const title = (await ui.find({ type: 'Text', text: /^Agents$/ }))?.props
  await ui.unmount()

  return { root, title }
}

const stub = (on: On) => {
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
