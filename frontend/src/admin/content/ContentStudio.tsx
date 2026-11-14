import { t, locale, number } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Editor } from './Editor'
import { uploadFile } from './upload'
import { ReferencePicker } from './ReferencePicker'
import {
  getCollectionLabels,
  getOptionLabels,
  resolve,
  getStatusLabels,
  type Catalog,
  type Collection,
  type ContentRecord,
  type DraftMemory,
  type Listing,
  type Item,
  type NavigationGuard,
} from './types'

export function ContentStudio({
  kind,
  initialId,
  memory,
  guardRef,
  session,
  onSessionEnd,
  onOpen,
}: {
  kind: Collection
  initialId?: number
  memory: DraftMemory
  guardRef: NavigationGuard
  session: Session
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
}) {
  const [remembered] = useState(() => {
    const saved = memory.read()
    return saved?.kind === kind ? saved : null
  })
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selection, setSelection] = useState<number | 'new' | null>(
    initialId ?? (remembered ? (remembered.record?.id ?? 'new') : null),
  )
  const [record, setRecord] = useState<ContentRecord | null>(remembered?.record ?? null)
  const [list, setList] = useState<Listing | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [nature, setNature] = useState('')
  const [sort, setSort] = useState('updated')
  const [filterTarget, setFilterTarget] = useState<'skills' | 'organizations'>('skills')
  const [related, setRelated] = useState<Item | undefined>()
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [quota, setQuota] = useState<{ used: number; quota: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const upload = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    adminRequest<Catalog>('/content/catalog', { signal: controller.signal })
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e))
          if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
        }
      })
    return () => controller.abort()
  }, [onSessionEnd, refresh])
  useEffect(() => {
    if (selection !== null) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      const params = new URLSearchParams({ q: query, status, sort, page: String(page), nature })
      if (related) params.set('related', String(related.id))
      adminRequest<Listing>(`/content/${kind}?${params}`, { signal: controller.signal })
        .then((data) => {
          setList(data)
          setError('')
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(errorMessage(e))
            if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
      if (kind === 'media')
        adminRequest<{ used: number; quota: number }>('/content/media/usage', {
          signal: controller.signal,
        })
          .then(setQuota)
          .catch(() => {})
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [kind, selection, query, status, sort, page, nature, related, refresh, onSessionEnd])
  useEffect(() => {
    if (typeof selection !== 'number' || record?.id === selection) return
    const controller = new AbortController()
    adminRequest<ContentRecord>(`/content/${kind}/${selection}`, { signal: controller.signal })
      .then((data) => {
        setRecord(data)
        setError('')
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e))
          if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
        }
      })
    return () => controller.abort()
  }, [kind, selection, record?.id, refresh, onSessionEnd])
  useEffect(() => () => upload.current?.abort(), [])
  useEffect(() => {
    if (!uploading) return
    guardRef.current = () => {
      setError(t('upload.navigationBlocked'))
    }
    return () => {
      guardRef.current = null
    }
  }, [uploading, guardRef])

  function back() {
    memory.write(null)
    setSelection(null)
    setRecord(null)
    setError('')
    setRefresh((r) => r + 1)
  }
  async function handleUpload(file: File) {
    const controller = new AbortController()
    upload.current = controller
    setUploading(true)
    setProgress(0)
    setError('')
    try {
      const saved = await uploadFile(file, session.csrf_token, setProgress, controller.signal)
      setRecord(saved)
      setSelection(saved.id)
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('upload.sessionExpired'))
    } finally {
      setUploading(false)
      upload.current = null
    }
  }
  const definition = catalog?.[kind]
  if (
    definition &&
    (selection === 'new' || (typeof selection === 'number' && record?.id === selection))
  )
    return (
      <Editor
        key={kind}
        kind={kind}
        definition={definition}
        initial={selection === 'new' ? null : record}
        memory={memory}
        guardRef={guardRef}
        session={session}
        onSessionEnd={onSessionEnd}
        onBack={back}
        onOpen={onOpen}
        onRecord={(saved) => {
          setRecord(saved)
          setSelection(saved.id)
        }}
      />
    )
  const natureField = definition?.schema.properties?.nature
  const natures = natureField ? resolve(natureField, definition!.schema).enum : undefined
  return (
    <div className="content-studio">
      <header className="content-heading">
        <div>
          <span className="eyebrow">{t('content.libraryEyebrow')}</span>
          <h1>
            {getCollectionLabels()[kind]}
            <span className="accent-dot">.</span>
          </h1>
          <p>{definition?.description ?? t('content.loading')}</p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={!definition || uploading || (kind === 'profiles' && Boolean(list?.total))}
          onClick={() => {
            memory.write(null)
            setRecord(null)
            setSelection('new')
          }}
        >
          +{' '}
          {kind === 'media'
            ? t('content.addLink')
            : kind === 'profiles'
              ? t('content.createProfile')
              : t('content.newEntry')}
        </button>
      </header>
      <p className="collection-privacy">
        <span aria-hidden="true">◌</span> {t('content.publicationHint')}
      </p>
      {error && (
        <div className="error-summary" role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setRefresh((r) => r + 1)}
          >
            {t('common.retry')}
          </button>
          {selection !== null && (
            <button className="text-button" type="button" onClick={back}>
              {t('content.backToList')}
            </button>
          )}
        </div>
      )}
      {kind === 'media' && selection === null && (
        <div className="media-upload">
          <div>
            <h2>{t('upload.title')}</h2>
            <p>{t('upload.limits')}</p>
            {quota && (
              <p>
                {t('upload.usage', {
                  used: number(quota.used / 1024 / 1024, 1),
                  quota: number(quota.quota / 1024 / 1024, 0),
                })}
              </p>
            )}
          </div>
          <label className={`secondary-button upload-label ${uploading ? 'disabled' : ''}`}>
            {t('upload.file')}
            <input
              type="file"
              aria-label={t('upload.file')}
              accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ''
              }}
            />
          </label>
          {uploading && (
            <div className="upload-progress" role="status">
              <progress value={progress} max={100} aria-label={t('upload.progress')} />
              <span>
                {progress < 100 ? t('upload.sending', { progress }) : t('upload.checking')}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => upload.current?.abort()}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
      {selection === null && (
        <>
          <div className="collection-filters">
            <label className="content-field search-field">
              {t('common.search')}
              <input
                type="search"
                value={query}
                placeholder={t('content.searchPlaceholder')}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="content-field">
              {t('content.status')}
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{t('status.active')}</option>
                <option value="draft">{t('status.drafts')}</option>
                <option value="ready">{t('status.readyPlural')}</option>
                <option value="archived">{t('status.archivedPlural')}</option>
              </select>
            </label>
            {natures && (
              <label className="content-field">
                {t('content.nature')}
                <select
                  value={nature}
                  onChange={(e) => {
                    setNature(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  {natures.filter(Boolean).map((n) => (
                    <option key={n} value={n}>
                      {getOptionLabels()[n] ?? n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="content-field">
              {t('content.sortBy')}
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value)
                  setPage(1)
                }}
              >
                <option value="updated">{t('content.sortModified')}</option>
                <option value="title">{t('content.title')}</option>
                <option value="order">{t('content.sortOrder')}</option>
                <option value="chronology">{t('content.sortChronological')}</option>
              </select>
            </label>
          </div>
          <details className="collection-related">
            <summary>{t('content.filterReference')}</summary>
            <div className="content-fields">
              <label className="content-field">
                {t('content.referenceType')}
                <select
                  value={filterTarget}
                  onChange={(e) => {
                    setFilterTarget(e.target.value as 'skills' | 'organizations')
                    setRelated(undefined)
                    setPage(1)
                  }}
                >
                  <option value="skills">{t('collections.skill')}</option>
                  <option value="organizations">{t('collections.organization')}</option>
                </select>
              </label>
              <ReferencePicker
                key={filterTarget}
                target={filterTarget}
                value={related?.id ?? null}
                selected={related}
                label={t('content.referenceFilter')}
                id="content-related-filter"
                session={session}
                onChange={(_id, item) => {
                  setRelated(item)
                  setPage(1)
                }}
                onSessionEnd={onSessionEnd}
                onOpen={onOpen}
              />
            </div>
          </details>
          {list && (
            <div className="collection-count" role="status">
              {searching ? t('content.searching') : t('content.count', { count: list.total })}
            </div>
          )}
          {list && list.items.length > 0 && (
            <div className="collection-list">
              {list.items.map((item) => (
                <button
                  type="button"
                  className="collection-row"
                  key={item.id}
                  onClick={() => {
                    memory.write(null)
                    setRecord(null)
                    setSelection(item.id)
                  }}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.summary || t('content.draftSummary')}</p>
                  </div>
                  <span className={`content-status status-${item.status}`}>
                    {getStatusLabels()[item.status]}
                  </span>
                  <time dateTime={item.updated_at}>
                    {item.updated_at
                      ? new Intl.DateTimeFormat(locale(), {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }).format(new Date(item.updated_at))
                      : ''}
                  </time>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          )}
          {list?.total === 0 && !searching && (
            <div className="collection-empty">
              <span className="empty-mark" aria-hidden="true">
                +
              </span>
              <h2>
                {query || status || nature || related
                  ? t('content.noMatches')
                  : t('content.emptyTitle')}
              </h2>
              <p>
                {query || status || nature || related
                  ? t('content.filterHint')
                  : t('content.emptyHint')}
              </p>
              <button
                className="secondary-button"
                type="button"
                disabled={!definition || uploading}
                onClick={() => {
                  if (query || status || nature || related) {
                    setQuery('')
                    setStatus('')
                    setNature('')
                    setRelated(undefined)
                  } else {
                    setRecord(null)
                    setSelection('new')
                  }
                }}
              >
                {query || status || nature || related
                  ? t('content.resetFilters')
                  : t('content.createEntry')}
              </button>
            </div>
          )}
          {list && list.total > list.limit && (
            <div className="collection-pagination">
              <button
                className="secondary-button"
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('common.previous')}
              </button>
              <span>
                {t('public.pageOf', { page, total: Math.ceil(list.total / list.limit) })}
              </span>
              <button
                className="secondary-button"
                type="button"
                disabled={page * list.limit >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
      {(!definition || !list || selection !== null) && !error && (
        <p className="loading-state" role="status">
          {t('public.loadingContent')}
        </p>
      )}
    </div>
  )
}
