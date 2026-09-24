// ============ SVG circuit renderer with zoom/pan, live simulation, trace mode ============
import { useMemo, useRef, useState, useCallback } from 'react'
import type { Circuit, CircuitNode } from '../lib/types'
import { simulateCircuit } from '../lib/circuit'
import {
  routeCircuit,
  portY,
  outX,
  inX,
  nodeWidth,
  GATE_W,
  GATE_H,
  NOT_W,
  NOT_H,
  INPUT_W,
  INPUT_H,
  OUTPUT_W,
  OUTPUT_H,
} from '../lib/routing'

interface Props {
  circuit: Circuit
  inputs: Record<string, number>
  onToggleInput: (v: string) => void
  traceMode: boolean
  tracedNet: string | null
  onTraceNode: (nodeId: string | null) => void
}

const HI = '#059669' // high signal color (emerald-600)
const LO = '#334155' // low signal color (slate-700)

export default function CircuitCanvas({ circuit, inputs, onToggleInput, traceMode, tracedNet, onTraceNode }: Props) {
  const values = useMemo(() => simulateCircuit(circuit, inputs), [circuit, inputs])
  const routing = useMemo(() => routeCircuit(circuit, values), [circuit, values])
  const byId = useMemo(() => new Map(circuit.nodes.map((n) => [n.id, n])), [circuit])

  // ---- trace path computation: which nets/nodes feed into the traced net ----
  const traceSets = useMemo(() => {
    if (!traceMode || !tracedNet) return null
    const upNodes = new Set<string>() // ancestors of traced net
    const downNodes = new Set<string>() // descendants
    const srcOf = new Map<string, string[]>() // net -> input nets
    for (const n of circuit.nodes) srcOf.set(n.net, n.inputs)
    const walkUp = (net: string) => {
      for (const p of srcOf.get(net) ?? []) {
        const pn = circuit.nodes.find((m) => m.net === p)
        if (pn && !upNodes.has(pn.id)) {
          upNodes.add(pn.id)
          walkUp(p)
        }
      }
    }
    const walkDown = (nodeId: string) => {
      for (const e of circuit.edges) {
        if (e.from === nodeId && !downNodes.has(e.to)) {
          downNodes.add(e.to)
          walkDown(e.to)
        }
      }
    }
    const tn = circuit.nodes.find((n) => n.net === tracedNet)
    if (tn) {
      upNodes.add(tn.id)
      walkUp(tracedNet)
      downNodes.add(tn.id)
      walkDown(tn.id)
    }
    return { up: upNodes, down: downNodes }
  }, [traceMode, tracedNet, circuit])

  const dimmed = (node: CircuitNode): boolean => {
    if (!traceSets) return false
    return !(traceSets.up.has(node.id) || traceSets.down.has(node.id))
  }
  const edgeDimmed = (fromId: string, toId: string): boolean => {
    if (!traceSets) return false
    return !(traceSets.up.has(fromId) && (traceSets.up.has(toId) || traceSets.down.has(toId))) &&
           !(traceSets.down.has(fromId) && traceSets.down.has(toId))
  }

  // ---- viewport pan/zoom ----
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.8 })
  const dragRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const fitToScreen = useCallback(() => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scale = Math.min(rect.width / circuit.width, rect.height / circuit.height, 1.2) * 0.95
    setView({ x: 0, y: 0, scale })
  }, [circuit.width, circuit.height])

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return
    setView((v) => ({ ...v, x: dragRef.current!.vx + (e.clientX - dragRef.current!.startX), y: dragRef.current!.vy + (e.clientY - dragRef.current!.startY) }))
  }
  const onMouseUp = () => (dragRef.current = null)
  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.2, v.scale * delta)) }))
  }

  const polyline = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

  const wireColor = (net: string) => ((values[net] ?? 0) === 1 ? HI : LO)

  return (
    <div className="relative h-full w-full">
      {/* toolbar */}
      <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 shadow">
        <button className="btn-tool" onClick={() => setView((v) => ({ ...v, scale: Math.min(2.5, v.scale * 1.2) }))}>＋</button>
        <button className="btn-tool" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.2, v.scale / 1.2) }))}>－</button>
        <button className="btn-tool" onClick={fitToScreen}>⤢ Fit</button>
        <button className="btn-tool" onClick={() => setView({ x: 0, y: 0, scale: 0.8 })}>⟲ Reset view</button>
        <span className="self-center px-2 text-xs text-slate-500">{Math.round(view.scale * 100)}%</span>
      </div>

      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab touch-none select-none bg-slate-50 active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={(e) => { if (e.target === svgRef.current) onTraceNode(null) }}
      >
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          <g transform="translate(20,20)">
            {/* wires */}
            {routing.edges.map((re) => {
              const real = circuit.edges.find((x) => x.id === re.id)
              const dim = real ? edgeDimmed(real.from, real.to) : false
              const c = wireColor(re.net)
              const midX = (re.points[0].x + re.points[1].x) / 2
              return (
                <g key={re.id} opacity={dim ? 0.15 : 1}>
                  <polyline points={polyline(re.points)} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" />
                  {re.junctions.map((j, i) => (
                    <circle key={i} cx={j.x} cy={j.y} r={4.5} fill={c} />
                  ))}
                  {/* signal label near the trunk of each real edge */}
                  {real && (
                    <text
                      x={midX}
                      y={re.points[0].y - 6}
                      fontSize={11}
                      fontFamily="ui-monospace, monospace"
                      fontWeight={600}
                      fill={c}
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="#f8fafc"
                      strokeWidth={3}
                    >
                      {re.net}
                    </text>
                  )}
                </g>
              )
            })}

            {/* net-label pairs (fan-out via labels) */}
            {routing.netLabels.map((nl) => {
              const srcNode = circuit.nodes.find((n) => n.net === nl.net)!
              const dim = dimmed(srcNode)
              const c = wireColor(nl.net)
              return (
                <g key={'lbl-' + nl.net} opacity={dim ? 0.15 : 1}>
                  {/* source stub + tag */}
                  <line x1={outX(srcNode)} y1={srcNode.y} x2={nl.sourceTag.x} y2={srcNode.y} stroke={c} strokeWidth={2.5} />
                  <g transform={`translate(${nl.sourceTag.x},${srcNode.y})`}>
                    <rect x={0} y={-11} width={nl.net.length * 8 + 26} height={22} rx={5} fill="#eef2ff" stroke={c} strokeWidth={1.5} />
                    <text x={6} y={4} fontSize={12} fontWeight={700} fontFamily="ui-monospace, monospace" fill={c}>
                      {nl.net}
                    </text>
                    <text x={nl.net.length * 8 + 12} y={4} fontSize={11} fontWeight={700} fill={c}>
                      {(values[nl.net] ?? 0)}
                    </text>
                  </g>
                  {/* target tags with short stubs into ports */}
                  {nl.targetTags.map((t) => {
                    const tgt = byId.get(t.nodeId)!
                    const py = portY(tgt, t.port)
                    return (
                      <g key={t.nodeId + ':' + t.port}>
                        <line x1={t.x} y1={py} x2={inX(tgt)} y2={py} stroke={c} strokeWidth={2.5} />
                        <g transform={`translate(${t.x - (nl.net.length * 8 + 26)},${py})`}>
                          <rect x={0} y={-11} width={nl.net.length * 8 + 26} height={22} rx={5} fill="#eef2ff" stroke={c} strokeWidth={1.5} />
                          <text x={6} y={4} fontSize={12} fontWeight={700} fontFamily="ui-monospace, monospace" fill={c}>
                            {nl.net}
                          </text>
                        </g>
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* nodes */}
            {circuit.nodes.map((n) => renderNode(n, values, dimmed(n), traceMode, tracedNet, onToggleInput, onTraceInputClick))}
          </g>
        </g>
      </svg>
    </div>
  )

  function onTraceInputClick(nodeId: string) {
    if (!traceMode) return
    const nd = byId.get(nodeId)
    if (nd) onTraceNode(nd.net === tracedNet ? null : nd.net)
  }
}

function renderNode(
  n: CircuitNode,
  values: Record<string, number>,
  dim: boolean,
  traceMode: boolean,
  tracedNet: string | null,
  onToggleInput: (v: string) => void,
  onTrace: (id: string) => void,
) {
  const v = values[n.net] ?? 0
  const isTraced = traceMode && tracedNet === n.net
  const stroke = isTraced ? '#7c3aed' : v === 1 ? HI : '#1e293b'
  const common = {
    style: { cursor: traceMode ? 'pointer' : undefined },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onTrace(n.id) },
  }
  const opacity = dim ? 0.18 : 1

  switch (n.type) {
    case 'INPUT': {
      const val = v
      return (
        <g key={n.id} opacity={opacity} {...common}>
          <rect x={n.x} y={n.y - INPUT_H / 2} width={INPUT_W} height={INPUT_H} rx={8}
            fill={val === 1 ? '#d1fae5' : '#f1f5f9'} stroke={stroke} strokeWidth={isTraced ? 3 : 2}
            onClick={(e) => { e.stopPropagation(); onToggleInput(n.net); if (traceMode) onTrace(n.id) }} />
          <text x={n.x + 12} y={n.y + 5} fontSize={16} fontWeight={800} fontFamily="ui-monospace, monospace" fill="#0f172a">{n.net}</text>
          <text x={n.x + INPUT_W - 12} y={n.y + 5} fontSize={15} fontWeight={800} textAnchor="end" fill={val === 1 ? HI : '#64748b'}>{val}</text>
        </g>
      )
    }
    case 'OUTPUT': {
      return (
        <g key={n.id} opacity={opacity} {...common}>
          <polygon points={`${n.x},${n.y - OUTPUT_H / 2} ${n.x + OUTPUT_W},${n.y} ${n.x},${n.y + OUTPUT_H / 2}`}
            fill={v === 1 ? '#d1fae5' : '#f8fafc'} stroke={stroke} strokeWidth={isTraced ? 3 : 2} />
          <text x={n.x + 14} y={n.y - 8} fontSize={14} fontWeight={800} fontFamily="ui-monospace, monospace" fill="#0f172a">{n.label ?? n.net}</text>
          <text x={n.x + 14} y={n.y + 18} fontSize={14} fontWeight={800} fill={v === 1 ? HI : '#64748b'}>= {v}</text>
        </g>
      )
    }
    case 'NOT': {
      return (
        <g key={n.id} opacity={opacity} {...common}>
          <polygon points={`${n.x},${n.y - NOT_H / 2} ${n.x + NOT_W - 12},${n.y} ${n.x},${n.y + NOT_H / 2}`}
            fill="#f8fafc" stroke={stroke} strokeWidth={isTraced ? 3 : 2} />
          <circle cx={n.x + NOT_W - 6} cy={n.y} r={5} fill="#f8fafc" stroke={stroke} strokeWidth={2} />
          <text x={n.x + 16} y={n.y + 5} fontSize={13} fontWeight={700} fontFamily="ui-monospace, monospace" fill="#0f172a">1</text>
          <text x={n.x - 4} y={n.y - NOT_H / 2 - 6} fontSize={12} fontWeight={700} fontFamily="ui-monospace, monospace" fill={v === 1 ? HI : '#475569'} textAnchor="start">{n.net}</text>
        </g>
      )
    }
    case 'AND': {
      const w = GATE_W, h = GATE_H
      const d = `M ${n.x} ${n.y - h / 2} L ${n.x + w / 2} ${n.y - h / 2} A ${h / 2} ${h / 2} 0 0 1 ${n.x + w / 2} ${n.y + h / 2} L ${n.x} ${n.y + h / 2} Z`
      return (
        <g key={n.id} opacity={opacity} {...common}>
          <path d={d} fill="#f8fafc" stroke={stroke} strokeWidth={isTraced ? 3 : 2} />
          <text x={n.x + w / 2 - 6} y={n.y + 5} fontSize={13} fontWeight={800} textAnchor="middle" fill="#0f172a">&amp;</text>
          {n.inputs.map((inp, i) => (
            <text key={i} x={n.x - 5} y={portY(n, i) + 4} fontSize={11} fontFamily="ui-monospace, monospace" fill="#64748b" textAnchor="end">{inp}</text>
          ))}
          <Ports node={n} values={values} />
        </g>
      )
    }
    case 'OR': {
      const w = GATE_W, h = GATE_H
      const d = `M ${n.x} ${n.y - h / 2} Q ${n.x + w * 0.55} ${n.y - h / 2} ${n.x + w} ${n.y} Q ${n.x + w * 0.55} ${n.y + h / 2} ${n.x} ${n.y + h / 2} Q ${n.x + w * 0.22} ${n.y} ${n.x} ${n.y - h / 2} Z`
      return (
        <g key={n.id} opacity={opacity} {...common}>
          <path d={d} fill="#f8fafc" stroke={stroke} strokeWidth={isTraced ? 3 : 2} />
          <text x={n.x + w / 2} y={n.y + 6} fontSize={15} fontWeight={800} textAnchor="middle" fill="#0f172a">≥1</text>
          {n.inputs.map((inp, i) => (
            <text key={i} x={n.x - 5} y={portY(n, i) + 4} fontSize={11} fontFamily="ui-monospace, monospace" fill="#64748b" textAnchor="end">{inp}</text>
          ))}
          <Ports node={n} values={values} />
        </g>
      )
    }
  }
}

function Ports({ node, values }: { node: CircuitNode; values: Record<string, number> }) {
  return (
    <>
      {node.inputs.map((inp, i) => {
        const iv = values[inp] ?? 0
        return <circle key={i} cx={node.x} cy={portY(node, i)} r={3.5} fill={iv === 1 ? HI : '#94a3b8'} />
      })}
      <circle cx={outX(node)} cy={node.y} r={3.5} fill={(values[node.net] ?? 0) === 1 ? HI : '#94a3b8'} />
    </>
  )
}
