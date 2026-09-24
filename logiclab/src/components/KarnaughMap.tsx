// ============ Interactive K-map with group overlays (shared group data) ============
import { useMemo } from 'react'
import type { AnalysisResult, KMapGroup } from '../lib/types'
import { GRAY2, mintermToCell } from '../lib/kmap'
import { groupExplanation } from '../lib/kmap'

export const GROUP_COLORS = [
  { stroke: '#2563eb', fill: 'rgba(37,99,235,0.10)' },
  { stroke: '#dc2626', fill: 'rgba(220,38,38,0.10)' },
  { stroke: '#16a34a', fill: 'rgba(22,163,74,0.10)' },
  { stroke: '#9333ea', fill: 'rgba(147,51,234,0.10)' },
  { stroke: '#ea580c', fill: 'rgba(234,88,12,0.10)' },
  { stroke: '#0891b2', fill: 'rgba(8,145,178,0.10)' },
  { stroke: '#ca8a04', fill: 'rgba(202,138,4,0.10)' },
  { stroke: '#db2777', fill: 'rgba(219,39,119,0.10)' },
]

const CELL = 64
const PAD = 8

interface Props {
  result: AnalysisResult
  selectedGroup: number | null
  onSelectGroup: (id: number | null) => void
}

/** Compute bounding rectangle(s) of a group in cell coordinates. Returns list of rects (wrap splits into up to 4). */
function groupRects(group: KMapGroup): { x: number; y: number; w: number; h: number }[] {
  const cells = group.minterms.map((m) => mintermToCell(m))
  const rows = [...new Set(cells.map(([r]) => r))].sort((a, b) => a - b)
  const cols = [...new Set(cells.map(([, c]) => c))].sort((a, b) => a - b)
  // groups are rectangular in gray space; detect wrap by checking contiguity
  const contiguous = <T extends number>(arr: T[]): boolean => arr.every((v, i) => i === 0 || v === arr[i - 1] + 1)
  const rowSpans: [number, number][] = contiguous(rows) ? [[rows[0], rows.length]] : [[0, 2], [3, 1]]
  const colSpans: [number, number][] = contiguous(cols) ? [[cols[0], cols.length]] : [[0, 2], [3, 1]]
  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (const [rs, rn] of rowSpans) {
    for (const [cs, cn] of colSpans) {
      if (rn === 0 || cn === 0) continue
      rects.push({
        x: PAD + cs * CELL + 3,
        y: PAD + rs * CELL + 3,
        w: cn * CELL - 6,
        h: rn * CELL - 6,
      })
    }
  }
  return rects
}

export default function KarnaughMap({ result, selectedGroup, onSelectGroup }: Props) {
  const gridW = 4 * CELL + PAD * 2
  const gridH = 4 * CELL + PAD * 2

  const cellMinterms = useMemo(() => {
    const t: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0))
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) t[r][c] = parseInt(GRAY2[r] + GRAY2[c], 2)
    return t
  }, [])

  return (
    <div className="flex flex-wrap gap-8">
      <div className="overflow-x-auto">
        <svg width={gridW + 90} height={gridH + 70} role="img" aria-label="Karnaugh map">
          {/* column header CD */}
          <text x={PAD + 2 * CELL} y={22} fontSize={14} fontWeight={700} fill="#334155">CD →</text>
          {GRAY2.map((cd, c) => (
            <text key={cd} x={PAD + c * CELL + CELL / 2} y={48} textAnchor="middle" fontSize={14} fontFamily="ui-monospace,monospace" fontWeight={600} fill="#475569">
              {cd}
            </text>
          ))}
          {/* row header AB */}
          <text x={20} y={PAD + 2 * CELL} fontSize={14} fontWeight={700} fill="#334155" transform={`rotate(-90 20 ${PAD + 2 * CELL})`} textAnchor="middle">AB ↓</text>
          {GRAY2.map((ab, r) => (
            <text key={ab} x={52} y={PAD + r * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={14} fontFamily="ui-monospace,monospace" fontWeight={600} fill="#475569">
              {ab}
            </text>
          ))}
          <g transform="translate(60,36)">
            {/* cells */}
            {result.kmapCells.map((rowArr, r) =>
              rowArr.map((val, c) => {
                const m = cellMinterms[r][c]
                const inSelected = selectedGroup != null && result.groups.find((g) => g.id === selectedGroup)?.minterms.includes(m)
                return (
                  <g key={`${r}-${c}`}>
                    <rect x={PAD + c * CELL} y={PAD + r * CELL} width={CELL} height={CELL} fill={inSelected ? '#fef9c3' : 'white'} stroke="#94a3b8" strokeWidth={1} />
                    <text x={PAD + c * CELL + CELL / 2} y={PAD + r * CELL + 30} textAnchor="middle" fontSize={22} fontWeight={800} fill={val ? '#1d4ed8' : '#94a3b8'}>
                      {val}
                    </text>
                    <text x={PAD + c * CELL + CELL / 2} y={PAD + r * CELL + 50} textAnchor="middle" fontSize={10} fill="#64748b">
                      m{m}
                    </text>
                  </g>
                )
              }),
            )}
            {/* group outlines — drawn from the SAME group data used by the simplifier */}
            {result.groups.map((g) => {
              const color = GROUP_COLORS[g.colorIndex % GROUP_COLORS.length]
              const dimmed = selectedGroup != null && selectedGroup !== g.id
              const rects = groupRects(g)
              const dashOffset = g.colorIndex * 3
              return (
                <g key={g.id} opacity={dimmed ? 0.18 : 1} style={{ cursor: 'pointer' }} onClick={() => onSelectGroup(selectedGroup === g.id ? null : g.id)}>
                  {rects.map((rc, i) => (
                    <rect
                      key={i}
                      x={rc.x}
                      y={rc.y}
                      width={rc.w}
                      height={rc.h}
                      rx={12}
                      fill={color.fill}
                      stroke={color.stroke}
                      strokeWidth={selectedGroup === g.id ? 3.5 : 2.5}
                      strokeDasharray={i > 0 || rects.length > 1 && isWrapSplit(g, rects) ? '6 4' : undefined}
                      pointerEvents="all"
                    />
                  ))}
                  {/* group number badge at first rect top-left */}
                  <g transform={`translate(${rects[0].x + 12},${rects[0].y + 12})`}>
                    <circle r={11} fill={color.stroke} />
                    <text textAnchor="middle" y={4} fontSize={12} fontWeight={800} fill="white">{g.id}</text>
                  </g>
                </g>
              )
            })}
          </g>
        </svg>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Click a colored group outline to highlight its cells. Dashed rectangles indicate wrap-around groups (edges of the map are adjacent).
        </p>
      </div>

      {/* group legend + explanation */}
      <div className="min-w-[280px] flex-1 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Groups</h3>
        {result.groups.map((g) => {
          const color = GROUP_COLORS[g.colorIndex % GROUP_COLORS.length]
          const active = selectedGroup === g.id
          return (
            <button
              key={g.id}
              onClick={() => onSelectGroup(active ? null : g.id)}
              className={`block w-full rounded-lg border p-3 text-left transition ${active ? 'border-slate-400 bg-slate-50 shadow' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color.stroke }}>
                  {g.id}
                </span>
                <span className="font-mono text-base font-bold" style={{ color: color.stroke }}>{g.term}</span>
                <span className="ml-auto text-xs text-slate-400">{g.essential ? 'essential' : 'selected'}</span>
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">Cells: m{g.minterms.join(', m')}</div>
              {active && <GroupExplain group={g} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function isWrapSplit(_g: KMapGroup, rects: { x: number }[]): boolean {
  return rects.length > 1
}

function GroupExplain({ group }: { group: KMapGroup }) {
  const ex = groupExplanation(group.pattern)
  return (
    <div className="mt-2 rounded-md bg-slate-100 p-2 text-xs leading-5 text-slate-700">
      {ex.map((e) => (
        <div key={e.variable} className="flex gap-2">
          <span className={`w-24 font-mono ${e.state === 'changes' ? 'text-slate-400' : 'font-bold text-slate-800'}`}>{e.symbol}</span>
          <span>{e.state === 'changes' ? '— eliminated from term' : '— kept in term'}</span>
        </div>
      ))}
      <div className="mt-1 font-mono font-bold text-slate-900">∴ term = {group.term}</div>
    </div>
  )
}
