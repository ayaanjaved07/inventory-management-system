import { useEffect, useState } from 'react'
import { apiGet, errorMessage } from './api'

// Loads data from the backend when the page opens, and again whenever `path`
// changes (for example when the search box changes the URL).
// Call reload() after saving something to fetch the data again.
// Pass null as the path to load nothing yet.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    if (path === null) {
      setData(null)
      setLoading(false)
      return
    }

    // If the path changes before this request finishes, `ignore` is set and
    // the old answer is thrown away, so it can't overwrite the new one.
    let ignore = false
    setLoading(true)
    apiGet<T>(path)
      .then((result) => {
        if (ignore) return
        setData(result)
        setError('')
      })
      .catch((err) => {
        if (!ignore) setError(errorMessage(err))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [path, reloadCount])

  function reload() {
    setReloadCount(reloadCount + 1)
  }

  return { data, error, loading, reload }
}
