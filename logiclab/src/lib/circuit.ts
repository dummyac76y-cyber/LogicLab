// ============ Circuit generator + layout engine ============
// Builds a gate-level netlist from the SIMPLIFIED expression (K-map groups).
// Rules enforced:
//  - EXACTLY ONE input node per variable — fan-out via multiple edges or net labels.
//  - One shared NOT gate per complemented variable.
//  - Beginner mode: only 2-input AND/OR gates. N-ary products fold as
//    left-associated chains; the OR tree is pairwise (X1, X2, ... then final F).
//  - Simple mode: multi-input AND/OR allowed for compact product terms.
//  - Every net name is unique in the graph (collision-safe renaming).

import type { AnalysisResult, Circuit, CircuitEdge, CircuitNode } from './types'
import { VARS } from './types'

export type CircuitMode = 'beginner' | 'simple'

const LAYER_GAP = 250
const ROW_GAP = 96
const MARGIN_X = 90
const MARGIN_Y = 80

interface BuildState {
  nodes: CircuitNode[]
  edges: CircuitEdge[]
  byNet: Map<string, CircuitNode>
}

function addNode(s: BuildState, id: string, type: CircuitNode['type'], net: string, inputs: string[], label?: string): CircuitNode {
  const node: CircuitNode = { id, type, net, inputs, layer: 0, row: 0, x: 0, y: 0, label }
  s.nodes.push(node)
  s.byNet.set(net, node)
  return node
}

/** Make a proposed net name unique within the circuit (A'B', A'B'(2), ...). */
function uniqueNet(s: BuildState, base: string): string {
  if (!s.byNet.has(base)) return base
  let i = 2
  while (s.byNet.has(`${base}(${i})`)) i++
  return `${base}(${i})`
}

/** Fan-out threshold: nets used by >= this many consumers switch to net-label routing */
export const FANOUT_LABEL_THRESHOLD = 3

export function buildCircuit(result: AnalysisResult, mode: CircuitMode): Circuit {
  const s: BuildState = { nodes: [], edges: [], byNet: new Map() }
  const usedVars = result.variables.length ? result.variables : [...VARS]

  // ---- Layer 0: one INPUT node per used variable (single source each) ----
  for (const v of usedVars) {
    addNode(s, 'in-' + v, 'INPUT', v, [], v)
  }

  // ---- Shared NOT gates for complemented literals ----
  const neededComplements = new Set<string>()
  for (const g of result.groups) {
    for (let i = 0; i < 4; i++) if (g.pattern[i] === 0) neededComplements.add(VARS[i])
  }
  let notIdx = 0
  for (const v of usedVars) {
    if (neededComplements.has(v)) {
      addNode(s, 'not' + ++notIdx, 'NOT', v + "'", [v], v + "'")
    }
  }

  // ---- Product terms: AND trees (2-input folding in beginner mode) ----
  const termNets: string[] = []
  let andIdx = 0
  for (const g of result.groups) {
    const literals = [0, 1, 2, 3]
      .filter((i) => g.pattern[i] !== -1)
      .map((i) => VARS[i] + (g.pattern[i] === 0 ? "'" : ''))
    if (literals.length === 0) continue // constant-1 group handled upstream (no circuit)
    if (mode === 'simple' && literals.length > 2) {
      const net = uniqueNet(s, literals.join(''))
      addNode(s, 'and' + ++andIdx, 'AND', net, literals, net)
      termNets.push(net)
    } else {
      let acc = literals[0]
      for (let i = 1; i < literals.length; i++) {
        const out = uniqueNet(s, acc + literals[i])
        addNode(s, 'and' + ++andIdx, 'AND', out, [acc, literals[i]], out)
        acc = out
      }
      termNets.push(acc) // single-literal term feeds straight through
    }
  }

  // ---- OR tree over product terms (pairwise: X1, X2, ..., final output) ----
  let orIdx = 0
  let outputSource: string | null = null
  if (termNets.length === 0) {
    outputSource = null // F = 0
  } else if (termNets.length === 1) {
    outputSource = termNets[0]
  } else {
    let level = termNets
    let xCounter = 0
    while (level.length > 2) {
      const nextLevel: string[] = []
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 < level.length) {
          const net = 'X' + ++xCounter
          addNode(s, 'or' + ++orIdx, 'OR', net, [level[i], level[i + 1]], net)
          nextLevel.push(net)
        } else {
          nextLevel.push(level[i])
        }
      }
      level = nextLevel
    }
    outputSource = uniqueNet(s, result.outputName)
    addNode(s, 'or' + ++orIdx, 'OR', outputSource, [level[0], level[1]], outputSource)
  }

  // ---- OUTPUT node (terminal marker; mirrors its input net value) ----
  addNode(s, 'out', 'OUTPUT', result.outputName + '(F)', outputSource ? [outputSource] : [], result.outputName)

  // ---- Edges from input references (fan-out = multiple edges from one source) ----
  for (const n of s.nodes) {
    n.inputs.forEach((netRef, port) => {
      const src = s.byNet.get(netRef)
      if (!src) return
      s.edges.push({ id: `${src.id}->${n.id}:${port}`, from: src.id, to: n.id, toPort: port, net: netRef })
    })
  }

  // ---- Layout ----
  assignLayout(s)

  // ---- Net labels for high fan-out signals ----
  const netLabels = computeNetLabels(s)

  const width = Math.max(...s.nodes.map((n) => n.x)) + 300
  const height = Math.max(...s.nodes.map((n) => n.y)) + 140
  const signalOrder = s.nodes.map((n) => n.net)

  return { outputName: result.outputName, nodes: s.nodes, edges: s.edges, netLabels, width, height, signalOrder }
}

function assignLayout(s: BuildState) {
  const depthOf = (n: CircuitNode, seen: Set<string>): number => {
    if (seen.has(n.id)) return 0
    seen.add(n.id)
    if (n.type === 'INPUT') return 0
    if (n.inputs.length === 0) return 1
    const parentDepths = n.inputs.map((net) => {
      const p = s.byNet.get(net)
      return p ? depthOf(p, seen) : 0
    })
    return 1 + Math.max(...parentDepths)
  }
  for (const n of s.nodes) n.layer = depthOf(n, new Set())
  const out = s.nodes.find((n) => n.type === 'OUTPUT')!
  const maxLayer = Math.max(...s.nodes.filter((n) => n.type !== 'OUTPUT').map((n) => n.layer))
  out.layer = maxLayer + 1

  const layers = new Map<number, CircuitNode[]>()
  for (const n of s.nodes) {
    if (!layers.has(n.layer)) layers.set(n.layer, [])
    layers.get(n.layer)!.push(n)
  }
  for (const [layer, nodes] of layers) {
    nodes.sort((a, b) => a.row - b.row)
    nodes.forEach((n, idx) => {
      n.row = idx
      n.x = MARGIN_X + layer * LAYER_GAP
      n.y = MARGIN_Y + idx * ROW_GAP
    })
  }
  // barycenter vertical refinement (inputs fixed at their initial order)
  for (let pass = 0; pass < 4; pass++) {
    const sortedByLayer = [...s.nodes].sort((a, b) => a.layer - b.layer)
    for (const n of sortedByLayer) {
      if (n.type === 'INPUT') continue
      const parents = n.inputs.map((net) => s.byNet.get(net)).filter(Boolean) as CircuitNode[]
      if (!parents.length) continue
      n.y = parents.reduce((sum, p) => sum + p.y, 0) / parents.length
    }
    for (const [, nodes] of layers) {
      nodes.sort((a, b) => a.y - b.y)
      for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].y - nodes[i - 1].y < ROW_GAP) nodes[i].y = nodes[i - 1].y + ROW_GAP
      }
    }
  }
  const minY = Math.min(...s.nodes.map((n) => n.y))
  const shift = MARGIN_Y - minY
  for (const n of s.nodes) n.y += shift
}

function computeNetLabels(s: BuildState): Circuit['netLabels'] {
  const consumers = new Map<string, { nodeId: string; port: number }[]>()
  for (const e of s.edges) {
    const src = s.nodes.find((n) => n.id === e.from)!
    if (!consumers.has(src.net)) consumers.set(src.net, [])
    consumers.get(src.net)!.push({ nodeId: e.to, port: e.toPort })
  }
  const labels: Circuit['netLabels'] = []
  for (const [net, cons] of consumers) {
    if (cons.length >= FANOUT_LABEL_THRESHOLD) {
      const src = s.byNet.get(net)!
      labels.push({ net, source: { x: src.x, y: src.y }, targets: cons.map((c) => ({ nodeId: c.nodeId, port: c.port, x: 0, y: 0 })) })
    }
  }
  return labels
}

/** Simulate the circuit for given input values; returns map net -> 0|1 */
export function simulateCircuit(circuit: Circuit, inputs: Record<string, number>): Record<string, number> {
  const val: Record<string, number> = {}
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]))
  const inputsByNode = new Map<string, CircuitNode[]>()
  for (const e of circuit.edges) {
    if (!inputsByNode.has(e.to)) inputsByNode.set(e.to, [])
    inputsByNode.get(e.to)!.push(byId.get(e.from)!)
  }
  const valueOf = (n: CircuitNode): number => {
    if (val[n.net] !== undefined) return val[n.net]
    const preds = inputsByNode.get(n.id) ?? []
    let v = 0
    switch (n.type) {
      case 'INPUT':
        v = inputs[n.net] ?? 0
        break
      case 'NOT':
        v = preds.length ? 1 - valueOf(preds[0]) : 0
        break
      case 'AND':
        v = preds.length ? 1 : 0
        for (const p of preds) if (valueOf(p) !== 1) v = 0
        break
      case 'OR':
      case 'OUTPUT': {
        v = 0
        for (const p of preds) if (valueOf(p) === 1) v = 1
        break
      }
    }
    val[n.net] = v
    return v
  }
  for (const n of circuit.nodes) valueOf(n)
  return val
}
