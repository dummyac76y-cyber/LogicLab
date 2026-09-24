// ============ Truth table & minterm engine ============

import { VARS, type Expression, type TruthRow } from './types'
import { evaluateExpression } from './parser'

/** Generate all 16 rows in binary order 0000..1111 (A = MSB). */
export function generateTruthTable(expr: Expression): TruthRow[] {
  const rows: TruthRow[] = []
  for (let i = 0; i < 16; i++) {
    const bits = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]
    const map: Record<string, number> = {}
    VARS.forEach((v, idx) => (map[v] = bits[idx]))
    rows.push({ index: i, bits, output: evaluateExpression(expr.terms, map) })
  }
  return rows
}

/** Minterms where F = 1 */
export function mintermsFromTable(rows: TruthRow[]): number[] {
  return rows.filter((r) => r.output === 1).map((r) => r.index)
}

/** Variables actually used by the expression */
export function usedVariables(expr: Expression): string[] {
  const s = new Set<string>()
  for (const t of expr.terms) for (const l of t.literals) s.add(l.variable)
  return VARS.filter((v) => s.has(v))
}

/** Evaluate SOP terms for a single assignment given as bit array over VARS order */
export function evalTerms(terms: Expression['terms'], bits: number[]): 0 | 1 {
  const map: Record<string, number> = {}
  VARS.forEach((v, i) => (map[v] = bits[i]))
  return evaluateExpression(terms, map)
}
