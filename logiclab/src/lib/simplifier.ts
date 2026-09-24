// ============ Boolean simplifier + verification ============

import type { AnalysisResult, Expression, KMapGroup } from './types'
import { generateTruthTable, mintermsFromTable, usedVariables, evalTerms } from './truthTable'
import { buildKMapCells, findGroups, patternToTerm } from './kmap'
import { expressionToText } from './parser'

/** Parse a simplified term text like "B'C" back into literals for verification */
export function termTextToLiterals(term: string): { variable: string; negated: boolean }[] {
  const lits: { variable: string; negated: boolean }[] = []
  let i = 0
  while (i < term.length) {
    const v = term[i]
    let neg = false
    if (term[i + 1] === "'") {
      neg = true
      i++
    }
    lits.push({ variable: v, negated: neg })
    i++
  }
  return lits
}

/** Verify two SOP expressions produce identical outputs on all 16 rows. Returns mismatching minterms. */
export function verifyEquivalence(
  original: Expression,
  groups: KMapGroup[],
): number[] {
  const table = generateTruthTable(original)
  const mismatches: number[] = []
  for (const row of table) {
    const origVal = row.output
    // simplified value: OR over group patterns
    let simpVal: 0 | 1 = 0
    for (const g of groups) {
      let match = true
      for (let i = 0; i < 4; i++) {
        if (g.pattern[i] !== -1 && g.pattern[i] !== row.bits[i]) {
          match = false
          break
        }
      }
      if (match) {
        simpVal = 1
        break
      }
    }
    if (origVal !== simpVal) mismatches.push(row.index)
  }
  return mismatches
}

/** Full analysis pipeline: truth table → minterms → k-map → groups → simplified SOP → verification */
export function analyzeExpression(expr: Expression): AnalysisResult {
  const truthTable = generateTruthTable(expr)
  const minterms = mintermsFromTable(truthTable)
  const kmapCells = buildKMapCells(minterms)
  const groups = findGroups(minterms)
  const simplifiedTerms = groups.map((g) => g.term)
  const simplifiedExpression =
    minterms.length === 0 ? expr.outputName + ' = 0' : `${expr.outputName} = ${simplifiedTerms.join(' + ')}`
  const mismatch = verifyEquivalence(expr, groups)
  return {
    outputName: expr.outputName,
    variables: usedVariables(expr),
    truthTable,
    minterms,
    kmapCells,
    groups,
    simplifiedTerms,
    simplifiedExpression,
    verified: mismatch.length === 0,
    verificationMismatch: mismatch,
  }
}

/** Evaluate the simplified (group-based) expression for given bits — used by circuit sim sanity checks */
export function evalSimplified(groups: KMapGroup[], bits: number[]): 0 | 1 {
  for (const g of groups) {
    let ok = true
    for (let i = 0; i < 4; i++) {
      if (g.pattern[i] !== -1 && g.pattern[i] !== bits[i]) {
        ok = false
        break
      }
    }
    if (ok) return 1
  }
  return 0
}

export { patternToTerm, expressionToText }
