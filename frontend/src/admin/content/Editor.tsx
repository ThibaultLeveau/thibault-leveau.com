import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from './Dialog'
import { fieldId, FieldControl, sectionFields } from './Fields'
import { Preview } from './Preview'
import { SimilarEntries } from './SimilarEntries'
import {
  defaults,
  sections,
  statusLabels,
  type Collection,
  type CollectionDefinition,
  type ContentRecord,
  type Draft,
  type DraftMemory,
  type FieldError,
  type Item,
  type NavigationGuard,
} from './types'

export function Editor({
  kind,
  definition,
  initial,
  memory,
  guardRef,
  session,
  onSessionEnd,
  onBack,
  onOpen,
  onRecord,
}: {
  kind: Collection
  definition: CollectionDefinition
  initial: ContentRecord | null
  memory: DraftMemory
  guardRef: NavigationGuard
  session: Session
  onSessionEnd: (message: string) => void
  onBack: () => void
  onOpen: (kind: Collection, id: number) => void
  onRecord: (record: ContentRecord) => void
}) {
  const [remembered] = useState(() => {
    const saved = memory.read()
    return saved?.kind === kind && saved.record?.id === initial?.id ? saved : null
  })
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState<Draft>(
    () => remembered?.draft ?? initial?.entry ?? defaults(definition.schema),
  )
  const [section, setSection] = useState(remembered?.section ?? 'essential')
  const [errors, setErrors] = useState<FieldError[]>([])
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [references, setReferences] = useState<Record<number, Item>>(initial?.references ?? {})
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | 'duplicate' | 'reload' | null>(null)
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(record?.entry ?? defaults(definition.schema))
  const summaryRef = useRef<HTMLDivElement>(null)
  const schema = definition.schema
  const available = sections.filter(
    ([name]) => name === 'review' || sectionFields(schema, name, kind, draft).length,
  )

  useEffect(() => {
    memory.write({ kind, record, draft, section })
  }, [memory, kind, record, draft, section])
  useEffect(() => {
    guardRef.current = (next) => {
      if (busy) return
      if (dirty) setPending(() => next)
      else {
        memory.write(null)
        next()
      }
    }
    return () => {
      guardRef.current = null
    }
  }, [guardRef, memory, dirty, busy])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  const focusError = useCallback(
    (error: FieldError) => {
      const key = error.path.split('.')[0]
      const nextSection = schema.properties?.[key]?.section ?? 'essential'
      setSection(nextSection)
      requestAnimationFrame(() => {
        const element =
          document.getElementById(fieldId(error.path)) ?? document.getElementById(fieldId(key))
        element?.focus()
        element?.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
    },
    [schema],
  )

  function failed(e: unknown) {
    setMessage(errorMessage(e))
    setNotice('')
    if (e instanceof ApiError) {
      setErrors(e.errors)
      setConflict(e.status === 409)
      if (e.errors.length) focusError(e.errors[0])
      if (e.status === 401)
        onSessionEnd(
          'Votre session a expiré. Reconnectez-vous : la saisie sera restaurée dans cet onglet.',
        )
    }
  }
  function accepted(next: ContentRecord) {
    setRecord(next)
    setDraft(next.entry)
    setReferences(next.references)
    setErrors([])
    setMessage('')
    setConflict(false)
    memory.write({ kind, record: next, draft: next.entry, section })
    onRecord(next)
  }
  async function save(asDraft = false): Promise<ContentRecord | null> {
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const next = await adminRequest<ContentRecord>(
        `/content/${kind}${record ? `/${record.id}` : ''}`,
        {
          method: record ? 'PUT' : 'POST',
          csrf: session.csrf_token,
          body: { entry: draft, version: record?.version, as_draft: asDraft },
        },
      )
      accepted(next)
      setNotice('Fiche enregistrée.')
      return next
    } catch (e) {
      failed(e)
      return null
    } finally {
      setBusy(false)
    }
  }
  async function check() {
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const result = await adminRequest<{ errors: FieldError[] }>(`/content/${kind}/validate`, {
        method: 'POST',
        csrf: session.csrf_token,
        body: { entry: draft },
      })
      setErrors(result.errors)
      if (result.errors.length) {
        setMessage('Quelques informations restent à compléter. Le brouillon peut être enregistré.')
        focusError(result.errors[0])
      } else
        setNotice(
          'La fiche est complète pour la relecture. Vous pouvez la marquer prête après enregistrement.',
        )
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }
  async function transition(status: Item['status']) {
    let current = record
    if (dirty || !current) current = await save()
    if (!current) return
    setBusy(true)
    try {
      const result = await adminRequest<ContentRecord>(
        `/content/${kind}/${current.id}/transition`,
        { method: 'POST', csrf: session.csrf_token, body: { version: current.version, status } },
      )
      accepted(result)
      setConfirm(null)
      setNotice(
        status === 'ready'
          ? result.entry.visibility === 'public'
            ? 'Fiche prête et publique. Les contenus autorisés sont visibles sur le site.'
            : 'Fiche prête. Sa visibilité confidentielle la conserve privée.'
          : status === 'archived'
            ? 'Fiche archivée, associations conservées.'
            : 'Fiche restaurée en brouillon.',
      )
    } catch (e) {
      setConfirm(null)
      failed(e)
    } finally {
      setBusy(false)
    }
  }
  async function confirmed() {
    if (!record) return
    if (confirm === 'archive') {
      await transition('archived')
      return
    }
    setBusy(true)
    try {
      if (confirm === 'delete') {
        await adminRequest(`/content/${kind}/${record.id}?version=${record.version}`, {
          method: 'DELETE',
          csrf: session.csrf_token,
        })
        memory.write(null)
        onBack()
      } else if (confirm === 'reload') {
        accepted(await adminRequest<ContentRecord>(`/content/${kind}/${record.id}`))
      } else if (confirm === 'duplicate') {
        const next = await adminRequest<ContentRecord>(`/content/${kind}/${record.id}/duplicate`, {
          method: 'POST',
          csrf: session.csrf_token,
          body: { version: record.version },
        })
        accepted(next)
        setNotice('Copie créée en brouillon. Les références ont été réutilisées.')
      }
      setConfirm(null)
    } catch (e) {
      setConfirm(null)
      failed(e)
    } finally {
      setBusy(false)
    }
  }
  function goBack() {
    if (guardRef.current) guardRef.current(onBack)
    else onBack()
  }
  const archived = record?.status === 'archived'
  const activeSection = available.find((s) => s[0] === section) ?? available[0]
  return (
    <div className="content-studio content-editor">
      {!record && <SimilarEntries kind={kind} title={String(draft.title ?? '')} onOpen={onOpen} />}
      <button className="text-button back-to-list" type="button" onClick={goBack}>
        ← {definition.label}
      </button>
      <header className="content-heading editor-heading">
        <div>
          <span className="eyebrow">{record ? 'VOTRE FICHE' : 'NOUVELLE FICHE'}</span>
          <h1>{String(draft.title || 'Une nouvelle histoire')}</h1>
          <div className="editor-state">
            {record?.derived?.expired && (
              <span className="content-status">Certification expirée</span>
            )}
            <span className={`content-status status-${record?.status ?? 'draft'}`}>
              {record ? statusLabels[record.status] : 'Brouillon'}
            </span>
            <span>
              {dirty
                ? 'Modifications non enregistrées'
                : record
                  ? 'Enregistré'
                  : 'Aucune sauvegarde pour le moment'}
            </span>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={() => setPreview(true)}>
          Aperçu
        </button>
      </header>
      <div className="editor-toolbar">
        <div className="editor-actions">
          {!archived && (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy
                ? 'Traitement…'
                : record?.status === 'ready'
                  ? 'Enregistrer'
                  : 'Enregistrer le brouillon'}
            </button>
          )}
          {!archived && (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void check()}
            >
              Vérifier la fiche
            </button>
          )}
          {record?.status === 'ready' && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Enregistrer en brouillon
            </button>
          )}
          {archived && (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => void transition('draft')}
            >
              Restaurer en brouillon
            </button>
          )}
        </div>
        <p className="muted">Sauvegarde explicite · fermer l’onglet peut perdre la saisie.</p>
      </div>
      {message && (
        <div className="error-summary" ref={summaryRef} tabIndex={-1} role="alert">
          <p>{message}</p>
          {errors.length > 0 && (
            <ul>
              {errors.map((e, i) => (
                <li key={`${e.path}-${i}`}>
                  <button type="button" onClick={() => focusError(e)}>
                    {e.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {conflict && record && (
            <button type="button" className="secondary-button" onClick={() => setConfirm('reload')}>
              Recharger la version enregistrée
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="form-success">
          ✓ {notice}
        </p>
      )}
      <nav className="editor-sections" aria-label="Sections de la fiche">
        {available.map(([name, label], index) => (
          <button
            key={name}
            type="button"
            className={activeSection[0] === name ? 'active' : ''}
            aria-current={activeSection[0] === name ? 'step' : undefined}
            onClick={() => setSection(name)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {label}
          </button>
        ))}
      </nav>
      <section className="editor-section" aria-labelledby="editor-section-title">
        <div className="section-intro">
          <div>
            <span className="eyebrow">
              {String(available.indexOf(activeSection) + 1).padStart(2, '0')} /{' '}
              {String(available.length).padStart(2, '0')}
            </span>
            <h2 id="editor-section-title">{activeSection[1]}</h2>
            <p>{activeSection[2]}</p>
          </div>
        </div>
        {activeSection[0] === 'review' && (
          <div className="review-panel">
            <h3>Prêt et public : visible sur le site</h3>
            <p>
              La relecture vérifie les informations nécessaires. Marquer cette fiche prête la
              publie si sa visibilité est « Public ». Une fiche confidentielle reste privée.
              Les médias nécessitent aussi un usage public et les témoignages un consentement.
            </p>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || archived}
              onClick={() => void transition('ready')}
            >
              Enregistrer et marquer prêt
            </button>
          </div>
        )}
        {record?.file && activeSection[0] === 'essential' && (
          <div className="media-inspect">
            {record.file.mime.startsWith('image/') && (
              <img
                src={`/api/admin/content/media/${record.id}/file`}
                alt="Aperçu du fichier sélectionné"
              />
            )}
            <p>
              {record.file.original_name} · {(record.file.size / 1024).toFixed(1)} Kio
            </p>
            <a href={`/api/admin/content/media/${record.id}/file`} target="_blank" rel="noreferrer">
              Ouvrir le fichier privé
            </a>
          </div>
        )}
        <fieldset className="editor-fields-container" disabled={busy || archived}>
          <div className="content-fields">
            {sectionFields(schema, activeSection[0], kind, draft).map(([name, field]) => (
              <FieldControl
                key={name}
                name={name}
                schema={field}
                root={schema}
                value={draft[name]}
                onChange={(value) => {
                  setDraft((previous) => ({ ...previous, [name]: value }))
                  setNotice('')
                }}
                errors={errors}
                references={references}
                session={session}
                onSessionEnd={onSessionEnd}
                onReference={(item) =>
                  setReferences((current) => ({ ...current, [item.id]: item }))
                }
                onOpen={onOpen}
                disabled={busy || archived}
              />
            ))}
          </div>
        </fieldset>
        <div className="section-pagination">
          {available.indexOf(activeSection) > 0 && (
            <button
              className="text-button"
              type="button"
              onClick={() => setSection(available[available.indexOf(activeSection) - 1][0])}
            >
              ← Section précédente
            </button>
          )}
          {available.indexOf(activeSection) < available.length - 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSection(available[available.indexOf(activeSection) + 1][0])}
            >
              Section suivante →
            </button>
          )}
        </div>
      </section>
      {record && (
        <footer className="entry-footer">
          <details>
            <summary>
              Usages et gestion de la fiche
              {record.usages.length ? ` · ${record.usages.length} association(s)` : ''}
            </summary>
            <p>Les références partagées sont conservées lors d’un archivage.</p>
            {record.usages.length > 0 ? (
              <ul>
                {record.usages.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpen(item.kind, item.id)}
                    >
                      {item.title} · {statusLabels[item.status]}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucune autre fiche ne référence celle-ci.</p>
            )}
            <div className="editor-actions">
              {kind !== 'media' && kind !== 'profiles' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || dirty}
                  onClick={() => setConfirm('duplicate')}
                >
                  Dupliquer
                </button>
              )}
              {!archived && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || dirty}
                  onClick={() => setConfirm('archive')}
                >
                  Archiver
                </button>
              )}
              {archived && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy || record.usages.length > 0}
                  onClick={() => setConfirm('delete')}
                >
                  Supprimer définitivement
                </button>
              )}
            </div>
            {dirty && (
              <p className="muted">
                Enregistrez vos modifications pour dupliquer ou archiver la fiche.
              </p>
            )}
          </details>
        </footer>
      )}
      {preview && (
        <Preview
          draft={draft}
          schema={schema}
          references={references}
          onClose={() => setPreview(false)}
        />
      )}
      {pending && (
        <Dialog
          title="Conserver vos modifications ?"
          onClose={() => {
            if (!busy) setPending(null)
          }}
        >
          <p>Cette fiche contient des modifications non enregistrées.</p>
          <div className="dialog-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() =>
                void save().then((saved) => {
                  if (saved) {
                    const next = pending
                    setPending(null)
                    memory.write(null)
                    next()
                  }
                })
              }
            >
              Enregistrer et continuer
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Rester sur la fiche
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                const next = pending
                setPending(null)
                memory.write(null)
                next()
              }}
            >
              Abandonner les modifications
            </button>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={
            confirm === 'delete'
              ? 'Supprimer définitivement cette fiche ?'
              : confirm === 'archive'
                ? 'Archiver cette fiche ?'
                : confirm === 'reload'
                  ? 'Recharger la fiche ?'
                  : 'Dupliquer cette fiche ?'
          }
          onClose={() => {
            if (!busy) setConfirm(null)
          }}
        >
          <p>
            {confirm === 'delete'
              ? 'Cette action retire la fiche et ses sous-listes. Les médias et référentiels partagés sont conservés.'
              : confirm === 'archive'
                ? `La fiche et ses ${record?.usages.length ?? 0} usages seront conservés. Vous pourrez la restaurer en brouillon.`
                : confirm === 'reload'
                  ? 'La saisie locale sera abandonnée au profit de la version enregistrée. Vous pouvez fermer cette fenêtre pour copier votre texte auparavant.'
                  : 'Un nouveau brouillon sera créé avec un nouvel identifiant. Les médias et les fiches associées seront réutilisés.'}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className={confirm === 'delete' ? 'danger-button' : 'primary-button'}
              disabled={busy}
              onClick={() => void confirmed()}
            >
              Confirmer
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Annuler
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
