// Pane color themes. Pure data and functions only.

export type Theme = {
  BG: string
  CARD: string
  EDGE: string
  TRACK: string
  TEXT: string
  SUB: string
  MUTED: string
  MINT: string
  CORAL: string
}

export const THEMES: Record<string, Theme> = {
  // Warp's own background (sampled from its gradient), with the status line's colors.
  warp: { BG: '#06171D', CARD: '#0B2129', EDGE: '#163038', TRACK: '#17323C', TEXT: '#E6EDF3', SUB: '#9AA7B4', MUTED: '#6C7086', MINT: '#7EE0B5', CORAL: '#FF6B81' },
  midnight: { BG: '#0D1117', CARD: '#161B22', EDGE: '#30363D', TRACK: '#21262D', TEXT: '#E6EDF3', SUB: '#8B949E', MUTED: '#6E7681', MINT: '#56D364', CORAL: '#FF7B72' },
  mocha: { BG: '#1E1E2E', CARD: '#181825', EDGE: '#45475A', TRACK: '#313244', TEXT: '#CDD6F4', SUB: '#A6ADC8', MUTED: '#6C7086', MINT: '#A6E3A1', CORAL: '#F38BA8' },
  light: { BG: '#FAFAFA', CARD: '#F0F1F3', EDGE: '#D0D7DE', TRACK: '#DDE1E6', TEXT: '#1F2328', SUB: '#57606A', MUTED: '#8C959F', MINT: '#1A9E6B', CORAL: '#D1365A' },
}

export const THEME_NAMES = Object.keys(THEMES)

const HEX = /^#[0-9a-fA-F]{6}$/

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

/** The name of the theme the options pick; an unknown or missing one is `warp`. */
export const themeName = (options: Readonly<Record<string, unknown>>): string =>
  typeof options.theme === 'string' && options.theme in THEMES ? options.theme : 'warp'

/** The theme the options pick; a malformed background keeps the theme's own. */
export function themeFrom(options: Readonly<Record<string, unknown>>): Theme {
  const base = THEMES[themeName(options)]!

  return isHexColor(options.background) ? { ...base, BG: options.background } : base
}
