// ============ LogicLab — main application shell ============
import { useEffect, useMemo, useState } from 'react'
import { parseBoolean, expressionToText } from './lib/parser'
import { analyzeExpression } from './lib/simplifier'
import { buildCircuit, simulateCircuit, type CircuitMode } from './lib/circuit'
import { VARS } from './lib/types'
import type { AnalysisResult, Circuit } from './lib/types'
import { SAMPLES } from './lib/samples'
import TruthTable from './components/TruthTable'
import KarnaughMap from './components/KarnaughMap'
import CircuitCanvas from './components/CircuitCanvas'

type Tab = 'expression' | 'truth' | 'kmap' | 'simplify' | 'circuit' | 'verify' | 'settings'

const TABS: { id: Tab; label: string; step?: number }[] = [
  { id: 'expression', label: 'Boolean Expression', step: 1 },
  { id: 'truth', label: 'Truth Table', step: 2 },
  { id: 'kmap', label: 'Karnaugh Map', step: 3 },
  { id: 'simplify', label: 'Simplification', step: 4 },
  { id: 'circuit', label: 'Logic Circuit', step: 5 },
  { id: 'verify', label: 'Verification', step: 6 },
  { id: 'settings', label: 'Settings' },
]

const DEFAULT_EXPR = "F1 = A'B' + CB' + ADC + BC'D"

export default function App() {
  const [exprText, setExprText] = useState(DEFAULT_EXPR)
  const [tab, setTab] = useState<Tab>('expression')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [originalTerms, setOriginalTerms] = useState<string>('')
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [liveParse, setLiveParse] = useState<{ ok: boolean; message: string }>({ ok: true, message: '' })
  const [circuitReady, setCircuitReady] = useState(false)
  const [mode, setMode] = useState<CircuitMode>('beginner')
  const [showNetLabels, setShowNetLabels] = useState(true)
  const [traceMode, setTraceMode] = useState(false)
  const [tracedNet, setTracedNet] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [inputs, setInputs] = useState<Record<string, number>>({ A: 0, B: 0, C: 0, D: 0 })

  // live validation as the user types
  useEffect(() => {
    const t = setTimeout(() => {
      const r = parseBoolean(exprText)
      if (r.ok) {
        setLiveParse({ ok: true, message: `✓ Valid Boolean expression → ${r.expression.outputName} = ${expressionToText(r.expression.terms)}` })
        setAnalyzeError(null)
      } else {
        setLiveParse({ ok: false, message: '✕ ' + r.error })
      }
    }, 250)
    return () => clearTimeout(t)
  }, [exprText])

  const circuit = useMemo(() => {
    if (!result || !circuitReady) return null
    return buildCircuit(result, mode)
  }, [result, circuitReady, mode])

  const values = useMemo(() => (circuit ? simulateCircuit(circuit, inputs) : {}), [circuit, inputs])

  const handleAnalyze = () => {
    const parsed = parseBoolean(exprText)
    if (!parsed.ok) {
      setAnalyzeError(parsed.error)
      setResult(null)
      setCircuitReady(false)
      setTab('expression')
      return
    }
    const res = analyzeExpression(parsed.expression)
    setResult(res)
    setOriginalTerms(expressionToText(parsed.expression.terms))
    setCircuitReady(false)
    setSelectedGroup(null)
    setTracedNet(null)
    setAnalyzeError(null)
    setTab('truth')
  }

  const handleGenerateCircuit = () => {
    if (!result) return
    setCircuitReady(true)
    setTab('circuit')
  }

  const handleReset = () => {
    setResult(null)
    setCircuitReady(false)
    setSelectedGroup(null)
    setTracedNet(null)
    setAnalyzeError(null)
    setInputs({ A: 0, B: 0, C: 0, D: 0 })
    setTab('expression')
  }

  const handleClear = () => {
    setExprText('')
    handleReset()
  }

  const toggleInput = (v: string) => setInputs((prev) => ({ ...prev, [v]: prev[v] === 1 ? 0 : 1 }))

  const needAnalysis = (target: Tab) => {
    if (!result && target !== 'expression' && target !== 'settings') {
      setTab('expression')
      setAnalyzeError('Please enter a valid expression and click "Analyze & Simplify" first.')
      return
    }
    setTab(target)
  }

  const outputNet = result ? result.outputName + '(F)' : null
  const fVal = outputNet ? values[outputNet] ?? 0 : 0

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      {/* ===== HEADER ===== */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight text-blue-700">
          Logic<span className="text-slate-800">Lab</span>
        </h1>
        <p className="text-sm text-slate-500">Boolean Logic • K-Map • Circuit Designer</p>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ===== SIDEBAR ===== */}
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 border-b border-slate-200 bg-white p-3 lg:w-60 lg:flex-col lg:border-b-0 lg:border-r">
          {TABS.map((t) => {
            const locked = !result && t.id !== 'expression' && t.id !== 'settings'
            return (
              <button
                key={t.id}
                onClick={() => needAnalysis(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  tab === t.id ? 'bg-blue-600 text-white shadow' : locked ? 'text-slate-300 hover:bg-slate-50' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.step && (
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${tab === t.id ? 'bg-white/25' : 'bg-slate-200 text-slate-500'}`}>
                    {t.step}
                  </span>
                )}
                {t.label}
                {locked && <span className="ml-auto text-xs">🔒</span>}
              </button>
            )
          })}
          <div className="mt-auto hidden space-y-1 pt-4 text-xs text-slate-400 lg:block">
            <p>Pipeline:</p>
            <p>Expression → Truth Table → K-Map → Groups → Simplified SOP → Circuit → Verification</p>
          </div>
        </nav>

        {/* ===== MAIN ===== */}
        <main className="flex-1 overflow-x-hidden p-4 md:p-6">
          {/* -------- EXPRESSION -------- */}
          {tab === 'expression' && (
            <section className="mx-auto max-w-3xl space-y-4">
              <Card title="Boolean Expression">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Enter an expression over A, B, C, D</label>
                <textarea
                  value={exprText}
                  onChange={(e) => setExprText(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 p-4 font-mono text-lg focus:border-blue-500 focus:outline-none"
                  placeholder={"F1 = A'B' + CB' + ADC + BC'D"}
                />
                <div className={`mt-2 rounded-lg px-3 py-2 font-mono text-sm ${liveParse.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {liveParse.message || 'Type an expression…'}
                </div>
                {analyzeError && <div className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">✕ {analyzeError}</div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={handleAnalyze} className="rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg transition hover:bg-blue-700 active:scale-95">
                    ⚡ Analyze &amp; Simplify
                  </button>
                  <button onClick={handleClear} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    Clear Expression
                  </button>
                  <button onClick={handleReset} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    Reset
                  </button>
                </div>
              </Card>

              <Card title="Sample Expressions">
                <div className="grid gap-2 sm:grid-cols-2">
                  {SAMPLES.map((s) => (
                    <button key={s.label} onClick={() => setExprText(s.expression)} className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50">
                      <div className="text-sm font-bold text-slate-700">{s.label}</div>
                      <div className="font-mono text-xs text-blue-700">{s.expression}</div>
                      <div className="mt-1 text-xs text-slate-400">{s.description}</div>
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="Supported Syntax">
                <ul className="space-y-1 text-sm text-slate-600">
                  <li>• Variables: <span className="chip">A</span> <span className="chip">B</span> <span className="chip">C</span> <span className="chip">D</span> (case-insensitive)</li>
                  <li>• NOT: <span className="chip">A'</span> or <span className="chip">!A</span></li>
                  <li>• AND: juxtaposition <span className="chip">AB</span>, spaces <span className="chip">A B</span>, or <span className="chip">A·B</span> / <span className="chip">A*B</span></li>
                  <li>• OR: <span className="chip">+</span></li>
                  <li>• Parentheses: <span className="chip">(A+B)C</span></li>
                  <li>• Optional output name: <span className="chip">F1 = …</span> (defaults to F1)</li>
                </ul>
              </Card>
            </section>
          )}

          {/* -------- TRUTH TABLE -------- */}
          {tab === 'truth' && result && (
            <section className="mx-auto max-w-3xl">
              <Card title={`Truth Table — ${result.outputName}`}>
                <TruthTable result={result} />
                <NextStep onClick={() => setTab('kmap')} label="Next: Karnaugh Map →" />
              </Card>
            </section>
          )}

          {/* -------- K-MAP -------- */}
          {tab === 'kmap' && result && (
            <section className="mx-auto max-w-5xl">
              <Card title={`Karnaugh Map — ${result.outputName} (Gray-code ordering)`}>
                <KarnaughMap result={result} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} />
                <NextStep onClick={() => setTab('simplify')} label="Next: Simplification →" />
              </Card>
            </section>
          )}

          {/* -------- SIMPLIFICATION -------- */}
          {tab === 'simplify' && result && (
            <section className="mx-auto max-w-3xl space-y-4">
              <Card title="Final Simplified Expression">
                <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center">
                  <div className="text-xs font-bold uppercase tracking-widest text-blue-200">{result.outputName} = simplified SOP</div>
                  <div className="mt-2 font-mono text-3xl font-black text-white">{result.simplifiedExpression}</div>
                  <div className={`mt-3 inline-block rounded-full px-4 py-1 text-sm font-bold ${result.verified ? 'bg-emerald-400 text-emerald-950' : 'bg-red-500 text-white'}`}>
                    {result.verified ? '✓ Equivalent to original expression' : '✕ Not equivalent — see Verification'}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs font-bold uppercase text-slate-400">Original (normalized)</div>
                    <div className="font-mono text-base font-bold">{result.outputName} = {originalTerms}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs font-bold uppercase text-slate-400">Simplified terms</div>
                    <div className="font-mono text-base font-bold">{result.simplifiedTerms.join(' + ')}</div>
                  </div>
                </div>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">K-map Grouping Explanation</h3>
                <div className="mt-2 space-y-3">
                  {result.groups.map((g) => (
                    <div key={g.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="font-bold">
                        Group {g.id}: <span className="font-mono text-blue-700">m{g.minterms.join(', m')}</span> → <span className="font-mono text-emerald-700">{g.term}</span>
                        <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{g.minterms.length} cell{g.minterms.length > 1 ? 's' : ''}{g.essential ? ', essential' : ''}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-6 font-mono text-xs text-slate-600 sm:grid-cols-4">
                        {VARS.map((v, i) => (
                          <span key={v} className={g.pattern[i] === -1 ? 'text-slate-400 line-through' : 'font-bold text-slate-800'}>
                            {v} = {g.pattern[i] === -1 ? 'changes' : g.pattern[i]}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Variables that change inside the group cancel (X + X&apos; = 1); the constant variables form the product term{' '}
                        <span className="font-mono font-bold">{g.term}</span>.
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button onClick={handleGenerateCircuit} className="rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-lg transition hover:bg-emerald-700 active:scale-95">
                    🔧 Generate Logic Circuit
                  </button>
                  <button onClick={() => setTab('kmap')} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    ← Back to K-map
                  </button>
                </div>
              </Card>
            </section>
          )}

          {/* -------- CIRCUIT -------- */}
          {tab === 'circuit' && result && (
            <section className="space-y-4">
              {!circuit || !circuitReady ? (
                <Card title="Logic Circuit">
                  <p className="text-sm text-slate-600">The circuit is generated from the <b>simplified</b> expression produced by the K-map engine.</p>
                  <div className="my-4 rounded-lg bg-slate-50 p-4 text-center font-mono text-lg font-bold">{result.simplifiedExpression}</div>
                  <button onClick={handleGenerateCircuit} className="rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-lg hover:bg-emerald-700">
                    🔧 Generate Logic Circuit
                  </button>
                </Card>
              ) : (
                <>
                  <Card title={`Logic Circuit — ${mode === 'beginner' ? 'Beginner / Breadboard Friendly (2-input gates only)' : 'Simple Logic'}`}>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      {/* input toggles */}
                      <div className="flex items-center gap-2">
                        {VARS.filter((v) => circuit.nodes.some((n) => n.type === 'INPUT' && n.net === v)).map((v) => (
                          <button key={v} onClick={() => toggleInput(v)} className={`toggle-input ${inputs[v] === 1 ? 'on' : ''}`}>
                            {v} = {inputs[v]}
                          </button>
                        ))}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`rounded-lg px-4 py-1.5 font-mono text-lg font-black ${fVal === 1 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {result.outputName} = {fVal}
                        </span>
                      </div>
                      <label className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-600">
                        <input type="checkbox" checked={traceMode} onChange={(e) => { setTraceMode(e.target.checked); if (!e.target.checked) setTracedNet(null) }} className="h-4 w-4 accent-violet-600" />
                        Trace Signal
                      </label>
                      <select value={mode} onChange={(e) => setMode(e.target.value as CircuitMode)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700">
                        <option value="beginner">Beginner / Breadboard Friendly</option>
                        <option value="simple">Simple Logic</option>
                      </select>
                    </div>
                    {traceMode && (
                      <div className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
                        {tracedNet ? (
                          <TraceSummary circuit={circuit} tracedNet={tracedNet} values={values} outputName={result.outputName} />
                        ) : (
                          <span>Click any gate or signal in the schematic to trace its path through the circuit.</span>
                        )}
                      </div>
                    )}
                    <div className="h-[560px] overflow-hidden rounded-xl border border-slate-200">
                      <CircuitCanvas
                        circuit={showNetLabels ? circuit : { ...circuit, netLabels: [] }}
                        inputs={inputs}
                        onToggleInput={toggleInput}
                        traceMode={traceMode}
                        tracedNet={tracedNet}
                        onTraceNode={setTracedNet}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Scroll to zoom, drag to pan. Green wires = logic 1, dark wires = logic 0. Junction dots mark fan-out branch points.
                      Signals with ≥3 consumers are carried by named net labels (e.g. <span className="chip">A</span>) instead of long crossing wires — each label pair is the same electrical net.
                      There is exactly ONE input source per variable.
                    </p>
                  </Card>
                  <Card title="Netlist (structured circuit data)">
                    <div className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-5 text-slate-200">
                      {circuit.nodes.map((n) => (
                        <div key={n.id}>
                          <span className="text-amber-300">{n.type.padEnd(6)}</span> {n.inputs.length ? `${n.inputs.join(', ')} → ` : ''}
                          <span className="font-bold text-emerald-300">{n.net}</span>
                          <span className="text-slate-500"> (layer {n.layer})</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </section>
          )}

          {/* -------- VERIFICATION -------- */}
          {tab === 'verify' && result && (
            <section className="mx-auto max-w-3xl space-y-4">
              <Card title="Verification — Original vs Simplified">
                {result.verified ? (
                  <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5">
                    <div className="text-lg font-black text-emerald-800">✓ Verified — Original and Simplified expressions are equivalent.</div>
                    <p className="mt-1 text-sm text-emerald-700">Both expressions were evaluated for all 16 input combinations; every row matches.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5">
                    <div className="text-lg font-black text-red-800">✕ Verification failed</div>
                    <p className="mt-1 text-sm text-red-700">Mismatches at minterms: {result.verificationMismatch.join(', ')}. The simplified expression is NOT shown as verified.</p>
                  </div>
                )}
                <table className="mt-4 w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      {[...VARS, 'Original', 'Simplified', 'Match'].map((h) => (
                        <th key={h} className="border border-slate-300 px-3 py-1.5 font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verificationRows(result).map((r) => (
                      <tr key={r.i} className={r.match ? '' : 'bg-red-50'}>
                        {r.bits.map((b, j) => <td key={j} className="border border-slate-200 px-3 py-1 text-center font-mono">{b}</td>)}
                        <td className="border border-slate-200 px-3 py-1 text-center font-mono font-bold">{r.orig}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center font-mono font-bold">{r.simp}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{r.match ? '✓' : '✕'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleGenerateCircuit} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                    🔧 Generate Logic Circuit
                  </button>
                </div>
              </Card>
            </section>
          )}

          {/* -------- SETTINGS -------- */}
          {tab === 'settings' && (
            <section className="mx-auto max-w-2xl space-y-4">
              <Card title="Circuit Settings">
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-bold text-slate-700">Circuit generation mode</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button onClick={() => setMode('beginner')} className={`rounded-lg border-2 p-3 text-left ${mode === 'beginner' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                        <div className="font-bold">Beginner / Breadboard Friendly</div>
                        <div className="text-xs text-slate-500">Only 2-input AND/OR + NOT gates. One input source per variable, fan-out branches, net labels for clarity. (Default)</div>
                      </button>
                      <button onClick={() => setMode('simple')} className={`rounded-lg border-2 p-3 text-left ${mode === 'simple' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                        <div className="font-bold">Simple Logic</div>
                        <div className="text-xs text-slate-500">Standard gates; multi-input AND allowed for compact product terms.</div>
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={showNetLabels} onChange={(e) => setShowNetLabels(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                    Use net labels for high fan-out signals (recommended)
                  </label>
                </div>
              </Card>
              <Card title="About">
                <p className="text-sm text-slate-600">
                  LogicLab parses a Boolean expression, builds the truth table and minterms, maps them onto a Gray-code Karnaugh map,
                  finds prime-implicant groups, produces a minimal SOP, verifies equivalence exhaustively, and generates an interactive
                  gate-level schematic from the same simplified expression — one pipeline, one source of truth.
                </p>
              </Card>
            </section>
          )}

          {result && tab !== 'expression' && tab !== 'settings' && (
            <div className="mx-auto mt-4 max-w-5xl text-right">
              <button onClick={handleReset} className="text-sm font-semibold text-slate-400 underline hover:text-slate-600">Reset everything</button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-slate-800">{title}</h2>
      {children}
    </div>
  )
}

function NextStep({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
      {label}
    </button>
  )
}

/** Per-row comparison used by the verification table */
function verificationRows(result: AnalysisResult) {
  return result.truthTable.map((row) => {
    let simp: 0 | 1 = 0
    for (const g of result.groups) {
      let ok = true
      for (let i = 0; i < 4; i++) if (g.pattern[i] !== -1 && g.pattern[i] !== row.bits[i]) { ok = false; break }
      if (ok) { simp = 1; break }
    }
    if (result.minterms.length === 0) simp = 0
    return { i: row.index, bits: row.bits, orig: row.output, simp, match: row.output === simp }
  })
}

/** Textual trace summary: feeding inputs → traced net → downstream path → output */
function TraceSummary({ circuit, tracedNet, values, outputName }: { circuit: Circuit; tracedNet: string; values: Record<string, number>; outputName: string }) {
  const node = circuit.nodes.find((n) => n.net === tracedNet)
  if (!node) return null
  const ups: string[] = []
  const walkUp = (net: string) => {
    const n = circuit.nodes.find((m) => m.net === net)
    if (!n) return
    if (n.type === 'INPUT') { ups.push(`${net}=${values[net] ?? 0}`); return }
    for (const inp of n.inputs) walkUp(inp)
  }
  walkUp(tracedNet)
  const chain: string[] = []
  const walkDown = (net: string) => {
    chain.push(net)
    if (net === outputName + '(F)' || net === outputName) return
    const consumers = circuit.edges.filter((e) => e.net === net).map((e) => circuit.nodes.find((n) => n.id === e.to)?.net).filter(Boolean) as string[]
    for (const c of consumers) if (!chain.includes(c)) walkDown(c)
  }
  walkDown(tracedNet)
  return (
    <div className="font-mono text-sm">
      <b>Trace {tracedNet} = {values[tracedNet] ?? 0}</b>
      <div className="mt-1 text-xs text-violet-600">feeding inputs: {ups.join(', ') || '(none)'}</div>
      <div className="mt-1">→ {chain.join(' → ')}</div>
    </div>
  )
}
