// ============ Orthogonal wire routing for the circuit renderer ============
// Strategy for MAXIMUM CLARITY (not minimum length):
//  - Nets with fan-out >= FANOUT_LABEL_THRESHOLD use NET LABELS instead of long wires.
//  - Other nets route as: short horizontal stub from gate output -> vertical segment in
//    a per-source channel BETWEEN the source layer and target layer -> horizontal into port.
//  - Each source gets its own vertical channel x-position so parallel wires never
//    overlap; junction dots mark fan-out branch points on the shared trunk.

import type { Circuit, CircuitNode } from './types'

export const GATE_W = 120
export const GATE_H = 64
export const NOT_W = 70
export const NOT_H = 48
export const INPUT_W = 90
export const INPUT_H = 52
export const OUTPUT_W = 90
export const OUTPUT_H = 52
export const LAYER_GAP = 250
export const PORT_STUB = 18

export function nodeHalfH(n: CircuitNode): number {
  switch (n.type) {
    case 'INPUT': return INPUT_H / 2
    case 'OUTPUT': return OUTPUT_H / 2
    case 'NOT': return NOT_H / 2
    default: return GATE_H / 2
  }
}
export function nodeWidth(n: CircuitNode): number {
  switch (n.type) {
    case 'INPUT': return INPUT_W
    case 'OUTPUT': return OUTPUT_W
    case 'NOT': return NOT_W
    default: return GATE_W
  }
}

/** Y position of an input port on a gate */
export function portY(node: CircuitNode, port: number): number {
  const count = Math.max(1, node.inputs.length)
  if (count === 1) return node.y
  const spread = Math.min(GATE_H - 16, count * 20)
  return node.y - spread / 2 + (spread * (port + 0.5)) / count
}

/** X position of a gate's output pin */
export function outX(node: CircuitNode): number {
  return node.x + nodeWidth(node)
}
/** X position of a gate's input edge */
export function inX(node: CircuitNode): number {
  return node.x
}

export interface RoutedEdge {
  id: string
  net: string
  points: { x: number; y: number }[] // polyline
  junctions: { x: number; y: number }[] // fan-out branch dots
  isNetLabel: boolean
}

export interface NetLabelRender {
  net: string
  sourceTag: { x: number; y: number; value: number | undefined }
  targetTags: { nodeId: string; port: number; x: number; y: number }[]
}

export interface RoutingResult {
  edges: RoutedEdge[]
  netLabels: NetLabelRender[]
}

export function routeCircuit(circuit: Circuit, values: Record<string, number>): RoutingResult {
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]))
  const labelNets = new Set(circuit.netLabels.map((l) => l.net))

  // group edges by source node to compute a shared trunk for fan-out
  const edgesBySource = new Map<string, typeof circuit.edges>()
  for (const e of circuit.edges) {
    if (!edgesBySource.has(e.from)) edgesBySource.set(e.from, [])
    edgesBySource.get(e.from)!.push(e)
  }

  // assign one vertical channel x per routed source (unique lanes -> no overlapping trunks)
  const sources = [...edgesBySource.keys()].filter((id) => {
    const n = byId.get(id)!
    return !labelNets.has(n.net)
  })
  const channels = new Map<string, number>()
  sources.forEach((srcId) => {
    const src = byId.get(srcId)!
    const minTx = Math.min(...edgesBySource.get(srcId)!.map((e) => inX(byId.get(e.to)!)))
    const sx = outX(src)
    const span = Math.max(40, minTx - sx - PORT_STUB * 2)
    const laneIdx = channels.size
    const laneCount = Math.max(1, Math.min(sources.length, 3))
    const frac = ((laneIdx % laneCount) + 0.5) / laneCount
    channels.set(srcId, sx + PORT_STUB + frac * span)
  })

  const routed: RoutedEdge[] = []
  const renderedLabels: NetLabelRender[] = []

  for (const [srcId, edges] of edgesBySource) {
    const src = byId.get(srcId)!
    if (labelNets.has(src.net)) {
      const tag: NetLabelRender = {
        net: src.net,
        sourceTag: { x: outX(src) + 10, y: src.y, value: values[src.net] },
        targetTags: [],
      }
      renderedLabels.push(tag)
      for (const e of edges) {
        const tgt = byId.get(e.to)!
        tag.targetTags.push({ nodeId: e.to, port: e.toPort, x: inX(tgt) - 10, y: portY(tgt, e.toPort) })
      }
      continue
    }
    const sx = outX(src)
    const sy = src.y
    const chanX = channels.get(srcId)!
    const multi = edges.length > 1
    for (const e of edges) {
      const tgt = byId.get(e.to)!
      const tx = inX(tgt)
      const ty = portY(tgt, e.toPort)
      let pts: { x: number; y: number }[]
      const junctions: { x: number; y: number }[] = []
      if (Math.abs(ty - sy) < 1) {
        pts = [{ x: sx, y: sy }, { x: tx, y: ty }]
        if (multi) junctions.push({ x: sx + 8, y: sy })
      } else {
        pts = [{ x: sx, y: sy }, { x: chanX, y: sy }, { x: chanX, y: ty }, { x: tx, y: ty }]
        junctions.push({ x: chanX, y: sy })
      }
      routed.push({ id: e.id, net: e.net, points: pts, junctions, isNetLabel: false })
    }
    if (multi) {
      // dot at the trunk start to make the fan-out explicit
      routed.push({ id: srcId + ':stub', net: src.net, points: [{ x: sx, y: sy }, { x: chanX, y: sy }], junctions: [{ x: sx + 6, y: sy }], isNetLabel: false })
    }
  }

  return { edges: routed, netLabels: renderedLabels }
}
