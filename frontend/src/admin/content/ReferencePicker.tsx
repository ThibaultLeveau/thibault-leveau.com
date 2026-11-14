import { t } from '../../i18n'
import { useEffect, useId, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from './Dialog'
import {
  getCollectionLabels,
  getStatusLabels,
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
              onSessionEnd(t('references.sessionExpired'))
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
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
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
        {value
          ? (item?.title ?? t('references.linkedEntry'))
          : t('fields.chooseReference', { label: getCollectionLabels()[target] })}
        <span aria-hidden="true">⌕</span>
      </button>
      {value && (
        <div className="reference-actions">
          <span>
            {item?.status === 'archived'
              ? t('references.archived')
              : item?.visibility === 'private'
                ? t('references.private')
                : t('references.selected')}
          </span>
          <button type="button" className="text-button" onClick={() => onOpen(target, value)}>
            {t('common.open')}
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={t('references.remove', { label })}
            onClick={() => {
              onChange(null)
              setChosen(undefined)
            }}
          >
            {t('common.remove')}
          </button>
        </div>
      )}
      {open && (
        <Dialog
          title={t('fields.chooseReference', { label: getCollectionLabels()[target] })}
          onClose={() => {
            if (!saving) setOpen(false)
          }}
        >
          <label className="content-field" htmlFor={searchId}>
            {t('references.search')}
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
            {t('references.showArchived')}
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">{t('content.searching')}</p>
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
                    {getStatusLabels()[result.status]}
                    {result.summary && ` · ${result.summary}`}
                  </span>
                </button>
              ))}
              {!items.length && <p>{t('references.noMatches')}</p>}
            </div>
          )}
          {total > 30 && (
            <p className="muted">{t('references.refineResults', { count: total })}</p>
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
              {t('references.createOrganization')}
            </button>
          )}
          {creating && (
            <div className="inline-create">
              <p>{t('references.reuseHint')}</p>
              <label className="content-field">
                {t('references.organizationName')}
                <input
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={!title.trim() || saving}
                onClick={() => void create()}
              >
                {saving ? t('references.creating') : t('references.createLink')}
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  )
}
