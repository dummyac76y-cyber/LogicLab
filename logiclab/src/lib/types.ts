// ============ Shared type definitions for LogicLab ============

/** Supported boolean variables (fixed order: A is MSB). */
export const VARS = ['A', 'B', 'C', 'D'] as const
export type Var = (typeof VARS)[number]

/** A single literal, e.g. A or A' */
export interface Literal {
  variable: string
  negated: boolean
}

/** A product term (AND of literals) */
export interface ProductTerm {
  literals: Literal[]
}

/** Parsed expression in Sum-Of-Products form */
export interface Expression {
  outputName: string
  terms: ProductTerm[]
}

/** One row of the truth table */
export interface TruthRow {
  index: number // minterm number
  bits: number[] // value of each var in VARS order
  output: 0 | 1
}

/** A K-map group (implicant) */
export interface KMapGroup {
  id: number
  minterms: number[]
  /** fixed values per variable position; -1 = changing/don't-care within group */
  pattern: number[] // length 4, entries 0 | 1 | -1
  term: string // simplified SOP term text, e.g. "A'B'"
  essential: boolean
  colorIndex: number
}

/** Result of full analysis pipeline */
export interface AnalysisResult {
  outputName: string
  variables: string[] // variables actually used
  truthTable: TruthRow[]
  minterms: number[]
  kmapCells: (0 | 1)[][] // [row AB][col CD], gray order
  groups: KMapGroup[]
  simplifiedTerms: string[]
  simplifiedExpression: string
  verified: boolean
  verificationMismatch: number[] // minterms where original != simplified
}

// ============ Circuit model ============

export type GateType = 'INPUT' | 'NOT' | 'AND' | 'OR' | 'OUTPUT'

export interface CircuitNode {
  id: string
  type: GateType
  /** display name of the net produced at this node's output, e.g. "A", "B'", "X1" */
  net: string
  /** input nets (for gates) */
  inputs: string[]
  layer: number
  row: number
  x: number
  y: number
  /** gate label like AND1 */
  label?: string
}

export interface CircuitEdge {
  id: string
  from: string // node id
  to: string // node id
  toPort: number // which input port of target
  net: string
}

export interface NetLabelPair {
  net: string
  source: { x: number; y: number } // where the label attaches (end of short stub)
  targets: { nodeId: string; port: number; x: number; y: number }[]
}

export interface Circuit {
  outputName: string
  nodes: CircuitNode[]
  edges: CircuitEdge[]
  netLabels: NetLabelPair[]
  width: number
  height: number
  signalOrder: string[] // all net names in topo order for simulation
}
