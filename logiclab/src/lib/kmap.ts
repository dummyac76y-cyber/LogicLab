// ============ Karnaugh map engine (4 variables, Gray-code layout) ============
// Rows: AB in order 00 01 11 10 ; Cols: CD in order 00 01 11 10.

import type { KMapGroup } from './types'

export const GRAY2 = ['00', '01', '11', '10'] as const

/** minterm index -> [row, col] in the gray-coded K-map */
export function mintermToCell(m: number): [number, number] {
  const a = (m >> 3) & 1
  const b = (m >> 2) & 1
  const c = (m >> 1) & 1
  const d = m & 1
  const row = GRAY2.indexOf(((a << 1) | b).toString(2).padStart(2, '0') as (typeof GRAY2)[number])
  const col = GRAY2.indexOf(((c << 1) | d).toString(2).padStart(2, '0') as (typeof GRAY2)[number])
  return [row, col]
}

/** [row, col] -> minterm index */
export function cellToMinterm(row: number, col: number): number {
  const ab = parseInt(GRAY2[row], 2)
  const cd = parseInt(GRAY2[col], 2)
  return ((ab >> 1) << 3) | ((ab & 1) << 2) | ((cd >> 1) << 1) | (cd & 1)
}

/** Build the 4x4 cell matrix of F values from minterms */
export function buildKMapCells(minterms: number[]): (0 | 1)[][] {
  const cells: (0 | 1)[][] = Array.from({ length: 4 }, () => Array(4).fill(0) as (0 | 1)[])
  for (const m of minterms) {
    const [r, c] = mintermToCell(m)
    cells[r][c] = 1
  }
  return cells
}

// ---- Implicant enumeration over hypercube patterns (length-4 arrays over {0,1,-1}) ----

function patternMatches(pattern: number[], m: number): boolean {
  const bits = [(m >> 3) & 1, (m >> 2) & 1, (m >> 1) & 1, m & 1]
  for (let i = 0; i < 4; i++) {
    if (pattern[i] !== -1 && pattern[i] !== bits[i]) return false
  }
  return true
}

function coversSet(pattern: number[], ones: Set<number>): number[] {
  const covered: number[] = []
  for (const m of ones) if (patternMatches(pattern, m)) covered.push(m)
  return covered.sort((x, y) => x - y)
}

/** All valid implicants: patterns whose covered minterms are all 1s and non-empty. */
function allImplicants(ones: Set<number>): { pattern: number[]; covered: number[] }[] {
  const result: { pattern: number[]; covered: number[] }[] = []
  // iterate over fixed-mask combinations: each var is 0, 1 or -1 → 3^4 = 81 patterns
  for (let code = 0; code < 81; code++) {
    let x = code
    const pattern: number[] = []
    for (let i = 0; i < 4; i++) {
      pattern.push(x % 3) // digits 0,1,2
      x = Math.floor(x / 3)
    }
    // normalize mapping: digit 0→0, 1→1, 2→-1 (variable changes within group)
    const p = pattern.map((v) => (v === 2 ? -1 : v))
    const dashes = p.filter((v) => v === -1).length
    const covered = coversSet(p, ones)
    if (covered.length === 0) continue
    // A pattern with k "-" positions matches exactly 2^k minterms; it is a valid
    // implicant iff ALL of them are 1s (never invent 1s, never group a 0).
    if (covered.length !== 1 << dashes) continue
    result.push({ pattern: p, covered })
  }
  return result
}

/** Pattern -> simplified term text; empty pattern means constant 1 */
export function patternToTerm(pattern: number[]): string {
  const names = ['A', 'B', 'C', 'D']
  const parts: string[] = []
  for (let i = 0; i < 4; i++) {
    if (pattern[i] === 0) parts.push(names[i] + "'")
    else if (pattern[i] === 1) parts.push(names[i])
  }
  return parts.length ? parts.join('') : '1'
}

/** Explanation lines for a group: which vars are constant vs changing */
export function groupExplanation(pattern: number[]): { variable: string; state: 'constant-0' | 'constant-1' | 'changes'; symbol: string }[] {
  const names = ['A', 'B', 'C', 'D']
  return names.map((n, i) => ({
    variable: n,
    state: pattern[i] === -1 ? ('changes' as const) : pattern[i] === 0 ? ('constant-0' as const) : ('constant-1' as const),
    symbol: pattern[i] === -1 ? `${n} changes` : pattern[i] === 0 ? `${n} = 0 → ${n}'` : `${n} = 1 → ${n}`,
  }))
}

interface PI {
  pattern: number[]
  covered: number[]
}

const keyOf = (p: number[]) => p.map((v) => (v === -1 ? 'x' : v)).join('')
const literalsOf = (p: number[]) => p.filter((v) => v !== -1).length
/** gap penalty: literal indices should form a contiguous block (ACD preferred over ABD) */
const spreadOf = (p: number[]) => {
  const idx = p.map((v, i) => (v === -1 ? -1 : i)).filter((i) => i >= 0)
  if (idx.length <= 1) return 0
  return idx[idx.length - 1] - idx[0] + 1 - idx.length
}

/**
 * Minimal SOP cover via classic essential-prime-implicant method:
 * 1. find prime implicants (maximal implicants)
 * 2. take all essential PIs
 * 3. solve the remaining cyclic cover EXHAUSTIVELY (only ≤16 PIs exist for 4 vars),
 *    minimizing (term count, total literals, literal-spread) so ties resolve to the
 *    canonical textbook grouping (e.g. ACD rather than ABD for m11+m15).
 */
export function findGroups(minterms: number[]): KMapGroup[] {
  const ones = new Set(minterms)
  if (ones.size === 0) return []
  const implicants = allImplicants(ones)
  const primes: PI[] = []
  for (const imp of implicants) {
    const isMaximal = !implicants.some(
      (other) => other.covered.length > imp.covered.length && imp.covered.every((m) => other.covered.includes(m)),
    )
    if (isMaximal) primes.push(imp)
  }
  // Essential prime implicants: cover a minterm nobody else covers
  const selected: PI[] = []
  const coveredSet = new Set<number>()
  for (const m of ones) {
    const covering = primes.filter((p) => p.covered.includes(m))
    if (covering.length === 1) {
      const pi = covering[0]
      if (!selected.includes(pi)) {
        selected.push(pi)
        pi.covered.forEach((x) => coveredSet.add(x))
      }
    }
  }
  const essentialKeys = new Set(selected.map((s) => keyOf(s.pattern)))
  const candidates = primes.filter((p) => !essentialKeys.has(keyOf(p.pattern)))
  const uncovered = [...ones].filter((m) => !coveredSet.has(m))

  // Exhaustive minimum cover of `uncovered` using `candidates`.
  if (uncovered.length > 0) {
    let best: PI[] | null = null
    let bestCost: [number, number, number] = [Infinity, Infinity, Infinity]
    const usable = candidates.filter((p) => p.covered.some((m) => uncovered.includes(m)))
    const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    const rec = (startIdx: number, chosen: PI[], stillMissing: number[]) => {
      if (stillMissing.length === 0) {
        const cost: [number, number, number] = [chosen.length, chosen.reduce((s, p) => s + literalsOf(p.pattern), 0), chosen.reduce((s, p) => s + spreadOf(p.pattern), 0)]
        if (!best || cmp(cost, bestCost) < 0 || (cmp(cost, bestCost) === 0)) {
          if (!best || cmp(cost, bestCost) < 0) {
            best = [...chosen]
            bestCost = cost
          } else {
            // equal cost — pick lexicographically smallest key set for determinism
            const keysNow = chosen.map((p) => keyOf(p.pattern)).sort().join('|')
            const keysBest = best.map((p) => keyOf(p.pattern)).sort().join('|')
            if (keysNow < keysBest) best = [...chosen]
          }
        }
        return
      }
      if (best && chosen.length >= bestCost[0]) return // prune
      for (let i = startIdx; i < usable.length; i++) {
        const p = usable[i]
        const nextMissing = stillMissing.filter((m) => !p.covered.includes(m))
        if (nextMissing.length === stillMissing.length) continue // contributes nothing
        chosen.push(p)
        rec(i + 1, chosen, nextMissing)
        chosen.pop()
      }
    }
    rec(0, [], uncovered)
    if (best) selected.push(...(best as PI[]))
  }

  // Order groups: by first minterm ascending, assign ids/colors
  selected.sort((a, b) => a.covered[0] - b.covered[0] || a.covered.length - b.covered.length)
  return selected.map((g, idx) => ({
    id: idx + 1,
    minterms: g.covered,
    pattern: g.pattern,
    term: patternToTerm(g.pattern),
    essential: essentialKeys.has(keyOf(g.pattern)),
    colorIndex: idx % 8,
  }))
}
