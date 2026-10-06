import { useState } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import type { ImportReport } from '../lib/types'

// The "Import CSV" panel on the Items page. The file is sent twice: first as
// a check (nothing is saved), then with commit=true when the user clicks Apply.
export function ItemsCsvImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function runImport(commit: boolean) {
    if (!file) return
    const body = new FormData()
    body.append('file', file)

    setBusy(true)
    setError('')
    try {
      const result = await apiPost<ImportReport>(`/items/import/?commit=${commit}`, body)
      setReport(result)
      if (result.committed) {
        setFile(null)
        onImported()
      }
    } catch (err) {
      setError(errorMessage(err))
      setReport(null)
    }
    setBusy(false)
  }

  return (
    <div className="card">
      <h2>Import items from CSV</h2>
      <p className="muted">
        Columns: sku, name, description, category_name, unit, unit_cost, currency_code,
        reorder_point, expiry_date (YYYY-MM-DD, optional), is_active. Stock cannot be set by import.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="row">
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ width: 'auto' }}
          onChange={(e) => {
            setFile(e.target.files ? e.target.files[0] : null)
            setReport(null)
          }}
        />
        <button className="secondary" disabled={!file || busy} onClick={() => runImport(false)}>
          Check file
        </button>
      </div>

      {report && (
        <div style={{ marginTop: 12 }}>
          <p>
            {report.created} to create, {report.updated} to update.
            {report.errors.length === 0 && ' No problems found.'}
          </p>

          {report.errors.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>SKU</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.map((row) => (
                  <tr key={row.row + '-' + row.sku}>
                    <td>{row.row}</td>
                    <td className="mono">{row.sku || '-'}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report.committed ? (
            <p className="success">
              Import applied: {report.created} created, {report.updated} updated.
            </p>
          ) : (
            <button
              disabled={!file || report.errors.length > 0 || busy}
              onClick={() => runImport(true)}
            >
              Apply {report.created + report.updated} change(s)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
