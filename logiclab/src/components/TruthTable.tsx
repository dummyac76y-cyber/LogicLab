// ============ Truth table view ============
import { VARS } from '../lib/types'
import type { AnalysisResult } from '../lib/types'

export default function TruthTable({ result }: { result: AnalysisResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            {VARS.map((v) => (
              <th key={v} className="border border-slate-300 px-4 py-2 font-mono font-bold">{v}</th>
            ))}
            <th className="border border-slate-300 px-4 py-2 font-mono font-bold text-blue-700">{result.outputName}</th>
            <th className="border border-slate-300 px-4 py-2 font-semibold">Minterm</th>
          </tr>
        </thead>
        <tbody>
          {result.truthTable.map((row) => (
            <tr key={row.index} className={row.output === 1 ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-slate-500'}>
              {row.bits.map((b, i) => (
                <td key={i} className="border border-slate-300 px-4 py-1.5 text-center font-mono">{b}</td>
              ))}
              <td className={`border border-slate-300 px-4 py-1.5 text-center font-mono text-base ${row.output === 1 ? 'text-emerald-700' : ''}`}>{row.output}</td>
              <td className="border border-slate-300 px-4 py-1.5 text-center font-mono">m{row.index}{row.output === 1 ? ' ✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-slate-600">
        Minterms (rows where {result.outputName} = 1):{' '}
        <span className="font-mono font-bold text-blue-700">Σm({result.minterms.join(', ')})</span>
      </p>
    </div>
  )
}
