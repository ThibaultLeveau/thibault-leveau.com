import { useEffect, useState } from 'react'
import { adminRequest } from '../api'
import type { Collection, Item, Listing } from './types'

export function SimilarEntries({
  kind,
  title,
  onOpen,
}: {
  kind: Collection
  title: string
  onOpen: (kind: Collection, id: number) => void
}) {
  const [result, setResult] = useState<{ query: string; items: Item[] }>({ query: '', items: [] })
  useEffect(() => {
    if (title.trim().length < 3) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      adminRequest<Listing>(`/content/${kind}?q=${encodeURIComponent(title.trim())}&limit=4`, {
        signal: controller.signal,
      })
        .then((data) => setResult({ query: title, items: data.items }))
        .catch(() => {})
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [kind, title])
  if (result.query !== title || !result.items.length) return null
  return (
    <div className="similar-entries">
      <p>Ces fiches existent déjà. Vérifiez si vous pouvez les réutiliser :</p>
      {result.items.map((item) => (
        <button
          type="button"
          className="text-button"
          key={item.id}
          onClick={() => onOpen(kind, item.id)}
        >
          {item.title}
        </button>
      ))}
    </div>
  )
}
