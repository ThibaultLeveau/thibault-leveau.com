import { useEffect, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Editor } from './Editor'
import { uploadFile } from './upload'
import { ReferencePicker } from './ReferencePicker'
import {
  collectionLabels,
  optionLabels,
  resolve,
  statusLabels,
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
          if (e instanceof ApiError && e.status === 401)
            onSessionEnd('Votre session a expiré. Reconnectez-vous.')
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
            if (e instanceof ApiError && e.status === 401)
              onSessionEnd('Votre session a expiré. Reconnectez-vous.')
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
          if (e instanceof ApiError && e.status === 401)
            onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        }
      })
    return () => controller.abort()
  }, [kind, selection, record?.id, refresh, onSessionEnd])
  useEffect(() => () => upload.current?.abort(), [])
  useEffect(() => {
    if (!uploading) return
    guardRef.current = () => {
      setError('Terminez ou annulez le téléversement avant de changer de rubrique.')
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
      if (e instanceof ApiError && e.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous avant de téléverser.')
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
          <span className="eyebrow">VOTRE BIBLIOTHÈQUE</span>
          <h1>
            {collectionLabels[kind]}
            <span className="accent-dot">.</span>
          </h1>
          <p>{definition?.description ?? 'Chargement de votre espace de contenus…'}</p>
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
            ? 'Ajouter un lien'
            : kind === 'profiles'
              ? 'Créer mon profil'
              : 'Nouvelle fiche'}
        </button>
      </header>
      <p className="collection-privacy">
        <span aria-hidden="true">◌</span> Publication · Une fiche « Prêt » avec la visibilité « Public » apparaît sur le site.
        Les brouillons et les fiches confidentielles restent privés.
      </p>
      {error && (
        <div className="error-summary" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => setRefresh((r) => r + 1)}>
            Réessayer
          </button>
          {selection !== null && (
            <button className="text-button" type="button" onClick={back}>
              Revenir à la liste
            </button>
          )}
        </div>
      )}
      {kind === 'media' && selection === null && (
        <div className="media-upload">
          <div>
            <h2>Vos fichiers, au même endroit</h2>
            <p>JPEG, PNG, WebP : 10 Mio · PDF : 20 Mio · MP4, WebM : 100 Mio.</p>
            {quota && (
              <p>
                {(quota.used / 1024 / 1024).toFixed(1)} Mio utilisés sur{' '}
                {(quota.quota / 1024 / 1024).toFixed(0)} Mio.
              </p>
            )}
          </div>
          <label className={`secondary-button upload-label ${uploading ? 'disabled' : ''}`}>
            Téléverser un fichier
            <input
              type="file"
              aria-label="Téléverser un fichier"
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
              <progress value={progress} max={100} aria-label="Progression du téléversement" />
              <span>{progress < 100 ? `Envoi : ${progress} %` : 'Vérification du fichier…'}</span>
              <button type="button" className="text-button" onClick={() => upload.current?.abort()}>
                Annuler
              </button>
            </div>
          )}
        </div>
      )}
      {selection === null && (
        <>
          <div className="collection-filters">
            <label className="content-field search-field">
              Rechercher
              <input
                type="search"
                value={query}
                placeholder="Titre ou résumé…"
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="content-field">
              État
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Actifs</option>
                <option value="draft">Brouillons</option>
                <option value="ready">Prêts</option>
                <option value="archived">Archivés</option>
              </select>
            </label>
            {natures && (
              <label className="content-field">
                Nature
                <select
                  value={nature}
                  onChange={(e) => {
                    setNature(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Toutes</option>
                  {natures.filter(Boolean).map((n) => (
                    <option key={n} value={n}>
                      {optionLabels[n] ?? n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="content-field">
              Trier par
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value)
                  setPage(1)
                }}
              >
                <option value="updated">Modification récente</option>
                <option value="title">Titre</option>
                <option value="order">Ordre de présentation</option>
                <option value="chronology">Chronologie récente</option>
              </select>
            </label>
          </div>
          <details className="collection-related">
            <summary>Filtrer par une référence associée</summary>
            <div className="content-fields">
              <label className="content-field">
                Type de référence
                <select
                  value={filterTarget}
                  onChange={(e) => {
                    setFilterTarget(e.target.value as 'skills' | 'organizations')
                    setRelated(undefined)
                    setPage(1)
                  }}
                >
                  <option value="skills">Compétence</option>
                  <option value="organizations">Organisation</option>
                </select>
              </label>
              <ReferencePicker
                key={filterTarget}
                target={filterTarget}
                value={related?.id ?? null}
                selected={related}
                label="le filtre de référence"
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
              {searching ? 'Recherche…' : `${list.total} fiche${list.total === 1 ? '' : 's'}`}
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
                    <p>{item.summary || 'Un brouillon à compléter.'}</p>
                  </div>
                  <span className={`content-status status-${item.status}`}>
                    {statusLabels[item.status]}
                  </span>
                  <time dateTime={item.updated_at}>
                    {item.updated_at
                      ? new Intl.DateTimeFormat('fr-FR', {
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
                  ? 'Aucune fiche correspondante'
                  : 'Tout commence par une première fiche'}
              </h2>
              <p>
                {query || status || nature || related
                  ? 'Essayez un autre terme ou modifiez les filtres.'
                  : 'Un titre suffit pour enregistrer un brouillon. Vous pourrez enrichir les détails au fil du temps.'}
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
                  ? 'Réinitialiser les filtres'
                  : 'Créer une fiche'}
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
                Précédent
              </button>
              <span>
                Page {page} / {Math.ceil(list.total / list.limit)}
              </span>
              <button
                className="secondary-button"
                type="button"
                disabled={page * list.limit >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
      {(!definition || !list || selection !== null) && !error && (
        <p className="loading-state" role="status">
          Chargement des contenus…
        </p>
      )}
    </div>
  )
}
