// The pane on the graphical surfaces (desktop, VS Code, mobile). Their text is proportional, so
// nothing here is drawn from repeated characters or measured in columns: the sprite, the progress
// bars and the rules are vector images that scale to their slot, and the surface truncates text.

import type { Elements } from 'claude-code'

import type { CrewMember } from '../types'
import { clock, isLive, modelName, shortTool, tierOf, tokens } from './format'
import { clawdSvg } from './sprites'
import type { Pose } from './sprites'
import type { Theme } from './themes'

export type GraphicalElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'>

export type GraphicalData = {
  members: CrewMember[]
  live: CrewMember[]
  finished: CrewMember[]
  totalTokens: number
  elapsed: string
  now: number
  frame: number
  where: string
  theme: Theme
  /** Opens a subagent's transcript. */
  view: (agentId: string) => void
}

const SPRITE_PX = 6
const BAR_W = 1000 // drawn at the slot's width: a width larger than the slot just scales down
const BAR_H = 8
const GLINT_STEP = 50 // bar units the glint moves per frame

const svgHead = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`

/** A progress track with its filled stretch from `from` to `to` (0..BAR_W). */
export function barSvg(track: string, fill: string, from: number, to: number): string {
  const r = BAR_H / 2
  const filled = to > from ? `<rect x="${from}" y="0" width="${to - from}" height="${BAR_H}" rx="${r}" fill="${fill}"/>` : ''

  return `${svgHead(BAR_W, BAR_H)}<rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${r}" fill="${track}"/>${filled}</svg>`
}

export const ruleSvg = (color: string) => `${svgHead(BAR_W, 2)}<rect x="0" y="0" width="${BAR_W}" height="2" fill="${color}"/></svg>`

export function graphicalPane({ Box, Text, Button, Svg }: GraphicalElements, d: GraphicalData) {
  const T = d.theme

  const card = (label: string, value: string, color = T.TEXT) => (
    <Box flexGrow={1} borderStyle="round" borderColor={T.EDGE} backgroundColor={T.CARD} paddingX={1}>
      <Text>
        <Text color={T.SUB}>{label} </Text>
        <Text weight="bold" color={color} tabular>
          {value}
        </Text>
      </Text>
    </Box>
  )

  const bar = (m: CrewMember, accent: string) => {
    let from = 0
    let to = BAR_W
    let fill = accent
    if (m.todos && m.todos.total > 0) {
      to = Math.round((m.todos.done / m.todos.total) * BAR_W)
    } else if (!isLive(m.status)) {
      fill = m.status === 'completed' ? accent : T.CORAL
    } else {
      // No todo list to measure: a glint sweeps along the track while it works.
      const glint = BAR_W / 5
      const at = ((d.frame * GLINT_STEP) % (BAR_W + glint)) - glint
      from = Math.max(0, Math.round(at))
      to = Math.min(BAR_W, Math.round(at + glint))
    }

    return (
      <Svg
        key={`bar-${m.id}`}
        source={barSvg(T.TRACK, fill, from, to)}
        alt={m.todos && m.todos.total > 0 ? `${m.todos.done} of ${m.todos.total} steps done` : isLive(m.status) ? 'working' : m.status}
      />
    )
  }

  const agent = (m: CrewMember) => {
    const isOn = isLive(m.status)
    const tier = tierOf(m.effort)
    const pose: Pose = !isOn ? 'rest' : d.frame % 2 ? 'wave' : 'stand'
    const step =
      m.todos && m.todos.total > 0
        ? `${m.todos.done}/${m.todos.total} · ${m.todos.current || (isOn ? 'working' : 'done')}`
        : isOn
          ? `${m.tools} · ${m.lastTool ? shortTool(m.lastTool) : 'thinking'}`
          : m.status === 'completed'
            ? `✓ done · ${m.tools} tools`
            : `✗ ${m.status}`
    const stats = `${tokens(m.tokens ?? 0)} tok · ${clock((m.endedAt ?? d.now) - m.startedAt)}`
    const dot = m.status === 'waiting' ? '◌' : isOn ? (d.frame % 4 < 2 ? '●' : '○') : '●'

    return (
      <Box key={m.id} flexDirection="column">
        <Box flexDirection="row" gap="md" alignItems="flex-start">
          <Svg key={`sprite-${m.id}`} source={clawdSvg(tier.hat, pose, SPRITE_PX)} alt={`Clawd, ${tier.word || 'a subagent'}${isOn ? ', working' : ', resting'}`} />
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
              <Box flexShrink={1} minWidth={0}>
                <Button key={m.id} plain onPress={() => d.view(m.id)}>
                  <Text weight="semibold" color={isOn ? T.TEXT : T.SUB} wrap="truncate-end">
                    {m.description}
                  </Text>
                </Button>
              </Box>
              <Text color={isOn ? tier.accent : T.MUTED}>{dot}</Text>
            </Box>
            <Text size="caption">
              {tier.word && <Text color={tier.accent}>{tier.word} </Text>}
              <Text color={T.SUB}>
                {modelName(m.model)}
                {m.effort ? ` · ${m.effort}` : ''}
              </Text>
            </Text>
            <Box flexDirection="row" justifyContent="space-between" gap="sm">
              <Box flexShrink={1} minWidth={0}>
                <Text size="caption" color={isOn ? T.TEXT : T.SUB} wrap="truncate-end">
                  {step}
                </Text>
              </Box>
              <Text size="caption" color={T.SUB} tabular>
                {stats}
              </Text>
            </Box>
            {bar(m, tier.accent)}
          </Box>
        </Box>
        <Box marginY="sm">
          <Svg key={`rule-${m.id}`} source={ruleSvg(T.EDGE)} alt="" />
        </Box>
      </Box>
    )
  }

  const section = (label: string) => (
    <Box marginTop="sm">
      <Text weight="bold" size="caption" color={T.MUTED}>
        {label}
      </Text>
    </Box>
  )

  return (
    <Box flexDirection="column" backgroundColor={T.BG} width="100%" minHeight="100%" paddingX={1}>
      <Text weight="bold" size="heading" color={T.TEXT}>
        Agents
      </Text>
      <Text size="caption" color={T.SUB}>
        {d.where || 'this session'}
      </Text>
      <Box flexDirection="row" columnGap="sm" marginTop="xs">
        {card('Tokens', tokens(d.totalTokens))}
        {card('Time', d.elapsed)}
        {card('Agents', `${d.members.length - d.live.length}/${d.members.length}`, d.live.length ? T.MINT : T.TEXT)}
      </Box>

      {d.members.length === 0 && (
        <Box marginTop="sm">
          <Text color={T.MUTED}>no subagents yet — they show up here as soon as one starts</Text>
        </Box>
      )}

      {d.live.length > 0 && section(`RUNNING · ${d.live.length}`)}
      {d.live.map(agent)}

      {d.finished.length > 0 && section(`DONE · ${d.finished.length}`)}
      {d.finished.map(agent)}

      {d.members.length > 0 && (
        <Box marginTop="sm">
          <Text size="caption" color={T.MUTED}>
            click a title to open its transcript
          </Text>
        </Box>
      )}
    </Box>
  )
}
