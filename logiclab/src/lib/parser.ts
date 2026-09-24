// ============ Boolean expression parser ============
// Supports: F1 = A'B' + CB' + ADC + BC'D style input.
// Operators: ' (NOT, postfix), implicit AND (juxtaposition), · * . (AND), + | (OR), parentheses.
// Variables: A B C D (case-insensitive). Output name optional (F, F1, X, OUT...).

import type { Expression, Literal, ProductTerm } from './types'

export class ParseError extends Error {}

interface Token {
  type: 'VAR' | 'NOT' | 'OR' | 'AND' | 'LPAREN' | 'RPAREN'
  value: string
  pos: number
}

const VAR_SET = new Set(['A', 'B', 'C', 'D'])

/** Strip an "F1 =" prefix if present; returns [outputName, rest]. */
function stripAssignment(input: string): [string, string] {
  const m = input.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*(?:=|:=)\s*(.*)$/s)
  if (m) return [m[1].toUpperCase(), m[2]]
  return ['F1', input]
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      // whitespace between variables means AND — handled implicitly by juxtaposition
      i++
      continue
    }
    const upper = ch.toUpperCase()
    if (VAR_SET.has(upper)) {
      tokens.push({ type: 'VAR', value: upper, pos: i })
      i++
      continue
    }
    if (ch === "'" || ch === '!' || ch === '’') {
      tokens.push({ type: 'NOT', value: "'", pos: i })
      i++
      continue
    }
    if (ch === '+' || ch === '|') {
      tokens.push({ type: 'OR', value: '+', pos: i })
      i++
      continue
    }
    if (ch === '*' || ch === '·' || ch === '.' || ch === '&') {
      tokens.push({ type: 'AND', value: '*', pos: i })
      i++
      continue
    }
    if (ch === '(' || ch === '[') {
      tokens.push({ type: 'LPAREN', value: '(', pos: i })
      i++
      continue
    }
    if (ch === ')' || ch === ']') {
      tokens.push({ type: 'RPAREN', value: ')', pos: i })
      i++
      continue
    }
    if (/[0-9]/.test(ch)) {
      throw new ParseError(`Unexpected digit "${ch}" at position ${i + 1}. Digits are only allowed in the output name (e.g. "F1 = ...").`)
    }
    throw new ParseError(`Unexpected character "${ch}" at position ${i + 1}. Currently supported variables: A, B, C, D.`)
  }
  return tokens
}

/** Recursive-descent parser producing a normalized SOP expression. */
class Parser {
  private p = 0
  constructor(private tokens: Token[], private src: string) {}

  private peek(): Token | undefined {
    return this.tokens[this.p]
  }
  private next(): Token | undefined {
    return this.tokens[this.p++]
  }

  /** parse full expression -> list of product terms (SOP) */
  parseExpression(): ProductTerm[] {
    if (this.tokens.length === 0) throw new ParseError('Empty expression. Enter something like A\'B + C.')
    const terms = this.parseOr()
    if (this.p < this.tokens.length) {
      const t = this.peek()!
      throw new ParseError(`Unexpected "${t.value}" near position ${t.pos + 1}. Check parentheses and operators.`)
    }
    return terms
  }

  /** OrExpr := AndExpr ('+' AndExpr)* ; distributes to keep SOP form */
  private parseOr(): ProductTerm[] {
    let left = this.parseAndSequence()
    while (this.peek()?.type === 'OR') {
      this.next()
      const right = this.parseAndSequence()
      if (right.length === 0) throw new ParseError('Missing operand after "+" — nothing follows the OR operator.')
      left = [...left, ...right] // SOP union
    }
    return left
  }

  /** AndSequence := (Term | '(' OrExpr ')') with implicit AND via juxtaposition */
  private parseAndSequence(): ProductTerm[] {
    // result starts as one empty term (product of nothing); each factor multiplies in
    let acc: ProductTerm[] = [{ literals: [] }]
    let gotAny = false
    while (true) {
      const t = this.peek()
      if (!t) break
      if (t.type === 'OR' || t.type === 'RPAREN') break
      let factor: ProductTerm[]
      if (t.type === 'LPAREN') {
        this.next()
        factor = this.parseOrInParens()
        const close = this.next()
        if (!close || close.type !== 'RPAREN') {
          throw new ParseError('Missing closing parenthesis ")".')
        }
      } else if (t.type === 'AND') {
        this.next() // explicit AND operator: skip, next factor follows
        continue
      } else if (t.type === 'VAR') {
        factor = this.parseLiteralFactor()
      } else if (t.type === 'NOT') {
        throw new ParseError(`Complement "'" at position ${t.pos + 1} has no variable before it.`)
      } else {
        break
      }
      gotAny = true
      // distribute: acc × factor
      const out: ProductTerm[] = []
      for (const a of acc) {
        for (const b of factor) {
          out.push({ literals: [...a.literals, ...b.literals] })
        }
      }
      acc = out
    }
    if (!gotAny) return []
    return acc
  }

  private parseOrInParens(): ProductTerm[] {
    const terms = this.parseOr()
    if (terms.length === 0) throw new ParseError('Empty parentheses "()" found.')
    return terms
  }

  /** One or more literals possibly with trailing complements: A, A', AB, A'B... */
  private parseLiteralFactor(): ProductTerm[] {
    const lits: Literal[] = []
    while (true) {
      const t = this.peek()
      if (!t || t.type !== 'VAR') break
      this.next()
      let negated = false
      while (this.peek()?.type === 'NOT') {
        this.next()
        negated = !negated // double complement cancels
      }
      lits.push({ variable: t.value, negated })
    }
    return [{ literals: lits }]
  }
}

/** Normalize terms: dedupe vars within a term, drop duplicate terms, sort deterministically. */
function normalize(terms: ProductTerm[]): ProductTerm[] {
  const seen = new Set<string>()
  const out: ProductTerm[] = []
  for (const term of terms) {
    const map = new Map<string, boolean>()
    for (const lit of term.literals) {
      if (map.has(lit.variable) && map.get(lit.variable) !== lit.negated) {
        // X · X' = 0 → term is always false, drop it
        map.set(lit.variable, false) // mark contradiction with sentinel
        map.set(lit.variable + '\u0000contradiction', true)
      } else if (!map.has(lit.variable)) {
        map.set(lit.variable, lit.negated)
      }
    }
    if (map.has('\u0000') || [...map.keys()].some((k) => k.endsWith('\u0000contradiction'))) {
      continue // contradictory term evaluates to 0
    }
    const order = ['A', 'B', 'C', 'D']
    const literals: Literal[] = order
      .filter((v) => map.has(v))
      .map((v) => ({ variable: v, negated: map.get(v)! }))
    const key = literals.map((l) => l.variable + (l.negated ? "'" : '')).join('')
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ literals })
    }
  }
  return out
}

export interface ParseResult {
  ok: true
  expression: Expression
}
export interface ParseFailure {
  ok: false
  error: string
}

export function parseBoolean(inputRaw: string): ParseResult | ParseFailure {
  try {
    let input = inputRaw.trim()
    if (!input) return { ok: false, error: 'Please enter a Boolean expression.' }
    const [outputName, rest] = stripAssignment(input)
    if (!rest.trim()) return { ok: false, error: 'Missing expression after "=".' }
    // Validate output name characters
    if (!/^[A-Z][A-Z0-9_]*$/.test(outputName)) {
      return { ok: false, error: `Invalid output name "${outputName}". Use letters/digits like F1.` }
    }
    const tokens = tokenize(rest)
    const parser = new Parser(tokens, rest)
    const terms = normalize(parser.parseExpression())
    if (terms.length === 0) {
      return { ok: false, error: 'Expression simplifies to 0 (every term was contradictory or empty).' }
    }
    return { ok: true, expression: { outputName, terms } }
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message }
    return { ok: false, error: 'Invalid Boolean expression: ' + (e as Error).message }
  }
}

/** Render a parsed expression back to canonical text, e.g. "A'B' + B'C" */
export function expressionToText(terms: ProductTerm[]): string {
  return terms.map(termToString).join(' + ')
}

export function termToString(term: ProductTerm): string {
  if (term.literals.length === 0) return '1'
  return term.literals.map((l) => l.variable + (l.negated ? "'" : '')).join('')
}

/** Evaluate the SOP expression for a given assignment bits over A,B,C,D */
export function evaluateExpression(terms: ProductTerm[], bits: Record<string, number>): 0 | 1 {
  for (const term of terms) {
    let allTrue = true
    for (const lit of term.literals) {
      const v = bits[lit.variable] ?? 0
      if (lit.negated ? v === 1 : v === 0) {
        allFalse(term)
        allTrue = false
        break
      }
    }
    if (allTrue) return 1
  }
  return 0
}
function allFalse(_t: ProductTerm) {
  /* helper placeholder for clarity; contradictions already removed at normalize time */
}
