// Pixel-art Clawd: 9 x 10 pixels drawn as 9 x 5 text cells. Each cell is an
// upper half block whose foreground is the top pixel and background the bottom
// one, so plain Text draws it in exact colors. Pure data and functions only.

export const SPRITE_COLUMNS = 9
export const SPRITE_ROWS = 5

/** What the hat says about the agent: its effort level, as a word and a color. */
export type Tier = { word: string; accent: string; hat: HatName }
type HatName = 'flag' | 'sailor' | 'hardhat' | 'beanie' | 'wizard' | 'none'

export const TIERS: Record<string, Tier> = {
  low: { word: 'light', accent: '#7EE0B5', hat: 'flag' },
  medium: { word: 'medium', accent: '#7AA2F7', hat: 'sailor' },
  high: { word: 'careful', accent: '#E0A84F', hat: 'hardhat' },
  xhigh: { word: 'thorough', accent: '#B4BEFE', hat: 'beanie' },
  max: { word: 'deep', accent: '#FF6B81', hat: 'wizard' },
}
export const NO_TIER: Tier = { word: '', accent: '#D77757', hat: 'none' }

const PALETTE: Record<string, string> = {
  o: '#D77757', // Clawd's clay
  O: '#A9563A', // shade: feet, closed eyes
  k: '#10161C', // eyes
  w: '#F2F2F2',
  K: '#2B2B2B',
  p: '#9AA4B2', // flag pole
  g: '#4FBF8F',
  G: '#2F8F66',
  b: '#3B6FD8',
  y: '#F2C94C',
  Y: '#C99A1E',
  l: '#FFF6C2', // hard-hat lamp
  q: '#E6E9FF', // beanie pompom
  v: '#9D8CF2',
  V: '#6F5FD0',
  u: '#6C5CE7',
  U: '#4A3DB8',
  s: '#FFE066', // wizard star
}

const HATS: Record<HatName, string[]> = {
  flag: ['......pKw', '..gggg.p.', '.ggggggGG'],
  sailor: ['...www...', '..wwwww..', '.bbbbbbb.'],
  hardhat: ['....l....', '..yyyyy..', 'YYYYYYYYY'],
  beanie: ['....q....', '..vvvvv..', '.VVVVVVV.'],
  wizard: ['....u....', '...usu...', '.UUUUUUU.'],
  none: ['.........', '.........', '.........'],
}

const BODY = {
  // Arms out, standing.
  stand: ['.ooooooo.', '.okoooko.', 'ooooooooo', '.ooooooo.', '.ooooooo.', '.O.O.O.O.', '.O.O.O.O.'],
  // Arms up, mid-step.
  wave: ['.ooooooo.', 'ookoookoo', '.ooooooo.', '.ooooooo.', '.ooooooo.', '.O.O.O.O.', 'O..O.O..O'],
  // Eyes shut: the job is done.
  rest: ['.ooooooo.', '.oOoooOo.', 'ooooooooo', '.ooooooo.', '.ooooooo.', '.O.O.O.O.', '.O.O.O.O.'],
}

export type Pose = keyof typeof BODY

/** One run of identical cells: `text` drawn in `fg` over `bg`. */
export type Run = { text: string; fg: string; bg: string }

/** Clawd as rows of runs, hat on top, `background` behind the empty pixels. */
export function clawdRows(hat: HatName, pose: Pose, background: string): Run[][] {
  const pixels = [...HATS[hat], ...BODY[pose]]
  const rows: Run[][] = []
  for (let row = 0; row < SPRITE_ROWS; row++) {
    const runs: Run[] = []
    for (let col = 0; col < SPRITE_COLUMNS; col++) {
      const top = PALETTE[pixels[row * 2]?.[col] ?? '.']
      const bottom = PALETTE[pixels[row * 2 + 1]?.[col] ?? '.']
      const cell: Run =
        top === undefined && bottom === undefined
          ? { text: ' ', fg: background, bg: background }
          : { text: '▀', fg: top ?? background, bg: bottom ?? background }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.text[0] === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }

  return rows
}
