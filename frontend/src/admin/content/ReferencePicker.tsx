import { useEffect, useId, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from './Dialog'
import {
  collectionLabels,
  statusLabels,
  type Collection,
  type Item,
  type Listing,
  type ContentRecord,
} from './types'

export function ReferencePicker({
  target,
  value,
  label,
  id,
  selected,
  session,
  onChange,
  onSessionEnd,
  onOpen,
  invalid,
}: {
  target: Collection
  value: number | null
  label: string
  id: string
  selected?: Item
  session: Session
  onChange: (id: number | null, item?: Item) => void
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const searchId = useId()
  const [chosen, setChosen] = useState<Item | undefined>()
  const item = chosen?.id === value ? chosen : selected

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      adminRequest<Listing>(
        `/content/${target}?limit=30&q=${encodeURIComponent(query)}${archived ? '&status=archived' : ''}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setItems(data.items)
          setTotal(data.total)
          setError('')
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(errorMessage(e))
            if (e instanceof ApiError && e.status === 401)
              onSessionEnd('Votre session a expiré. La saisie est conservée dans cet onglet.')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query, archived, target, onSessionEnd])

  async function create() {
    setSaving(true)
    setError('')
    try {
      const data = await adminRequest<ContentRecord>(`/content/${target}`, {
        method: 'POST',
        csrf: session.csrf_token,
        body: { entry: { title } },
      })
      const entry: Item = {
        id: data.id,
        kind: target,
        title: String(data.entry.title),
        visibility: 'private',
        status: 'draft',
      }
      setChosen(entry)
      onChange(entry.id, entry)
      setOpen(false)
      setCreating(false)
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError && e.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="reference-picker">
      <button
        type="button"
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="reference-button"
        onClick={() => setOpen(true)}
      >
        {value ? (item?.title ?? 'Fiche associée') : `Choisir · ${collectionLabels[target]}`}
        <span aria-hidden="true">⌕</span>
      </button>
      {value && (
        <div className="reference-actions">
          <span>
            {item?.status === 'archived'
              ? 'Archivé · association conservée'
              : item?.visibility === 'private'
                ? 'Référence confidentielle'
                : 'Référence sélectionnée'}
          </span>
          <button type="button" className="text-button" onClick={() => onOpen(target, value)}>
            Ouvrir
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={`Retirer ${label}`}
            onClick={() => {
              onChange(null)
              setChosen(undefined)
            }}
          >
            Retirer
          </button>
        </div>
      )}
      {open && (
        <Dialog
          title={`Choisir · ${collectionLabels[target]}`}
          onClose={() => {
            if (!saving) setOpen(false)
          }}
        >
          <label className="content-field" htmlFor={searchId}>
            Rechercher une fiche
            <input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              autoComplete="off"
            />
          </label>
          <label className="content-checkbox">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Voir les fiches archivées
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">Recherche…</p>
          ) : (
            <div className="reference-results">
              {items.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={() => {
                    setChosen(result)
                    onChange(result.id, result)
                    setOpen(false)
                  }}
                >
                  <strong>{result.title}</strong>
                  <span>
                    {statusLabels[result.status]}
                    {result.summary && ` · ${result.summary}`}
                  </span>
                </button>
              ))}
              {!items.length && <p>Aucune fiche correspondante.</p>}
            </div>
          )}
          {total > 30 && (
            <p className="muted">
              {total} résultats. Précisez la recherche pour retrouver la fiche souhaitée.
            </p>
          )}
          {target === 'organizations' && !creating && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setCreating(true)
                setTitle(query)
              }}
            >
              Créer une organisation
            </button>
          )}
          {creating && (
            <div className="inline-create">
              <p>Vérifiez les résultats ci-dessus pour réutiliser une organisation existante.</p>
              <label className="content-field">
                Nom de l’organisation
                <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={!title.trim() || saving}
                onClick={() => void create()}
              >
                {saving ? 'Création…' : 'Créer et associer le brouillon'}
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  )
}
