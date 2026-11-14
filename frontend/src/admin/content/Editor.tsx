import { number, t } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from './Dialog'
import { fieldId, FieldControl, sectionFields } from './Fields'
import { Preview } from './Preview'
import { SimilarEntries } from './SimilarEntries'
import {
  defaults,
  getSections,
  getStatusLabels,
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
  const [confirm, setConfirm] = useState<'archive' | 'delete' | 'duplicate' | 'reload' | null>(
    null,
  )
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(record?.entry ?? defaults(definition.schema))
  const summaryRef = useRef<HTMLDivElement>(null)
  const schema = definition.schema
  const available = getSections().filter(
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
      if (e.status === 401) onSessionEnd(t('editor.sessionExpired'))
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
      setNotice(t('editor.saved'))
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
        setMessage(t('editor.incomplete'))
        focusError(result.errors[0])
      } else setNotice(t('editor.complete'))
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
        {
          method: 'POST',
          csrf: session.csrf_token,
          body: { version: current.version, status },
        },
      )
      accepted(result)
      setConfirm(null)
      setNotice(
        status === 'ready'
          ? result.entry.visibility === 'public'
            ? t('editor.published')
            : t('editor.privateReady')
          : status === 'archived'
            ? t('editor.archived')
            : t('editor.restored'),
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
        const next = await adminRequest<ContentRecord>(
          `/content/${kind}/${record.id}/duplicate`,
          {
            method: 'POST',
            csrf: session.csrf_token,
            body: { version: record.version },
          },
        )
        accepted(next)
        setNotice(t('editor.duplicated'))
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
      {!record && (
        <SimilarEntries kind={kind} title={String(draft.title ?? '')} onOpen={onOpen} />
      )}
      <button className="text-button back-to-list" type="button" onClick={goBack}>
        ← {definition.label}
      </button>
      <header className="content-heading editor-heading">
        <div>
          <span className="eyebrow">
            {record ? t('editor.entryEyebrow') : t('editor.newEntryEyebrow')}
          </span>
          <h1>{String(draft.title || t('editor.newStory'))}</h1>
          <div className="editor-state">
            {record?.derived?.expired && (
              <span className="content-status">{t('editor.expiredCertification')}</span>
            )}
            <span className={`content-status status-${record?.status ?? 'draft'}`}>
              {record ? getStatusLabels()[record.status] : t('status.draft')}
            </span>
            <span>
              {dirty
                ? t('editor.unsaved')
                : record
                  ? t('editor.savedStatus')
                  : t('editor.neverSaved')}
            </span>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={() => setPreview(true)}>
          {t('editor.preview')}
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
                ? t('common.processing')
                : record?.status === 'ready'
                  ? t('common.save')
                  : t('editor.saveDraft')}
            </button>
          )}
          {!archived && (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void check()}
            >
              {t('editor.validate')}
            </button>
          )}
          {record?.status === 'ready' && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              {t('editor.saveAsDraft')}
            </button>
          )}
          {archived && (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => void transition('draft')}
            >
              {t('editor.restore')}
            </button>
          )}
        </div>
        <p className="muted">{t('editor.explicitSave')}</p>
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
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirm('reload')}
            >
              {t('editor.reload')}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="form-success">
          ✓ {notice}
        </p>
      )}
      <nav className="editor-sections" aria-label={t('editor.sections')}>
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
            <h3>{t('editor.publicReviewTitle')}</h3>
            <p>{t('editor.publicReviewHint')}</p>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || archived}
              onClick={() => void transition('ready')}
            >
              {t('editor.saveReady')}
            </button>
          </div>
        )}
        {record?.file && activeSection[0] === 'essential' && (
          <div className="media-inspect">
            {record.file.mime.startsWith('image/') && (
              <img
                src={`/api/admin/content/media/${record.id}/file`}
                alt={t('editor.filePreview')}
              />
            )}
            <p>
              {record.file.original_name} · {number(record.file.size / 1024, 1)}{' '}
              {t('upload.kib')}
            </p>
            <a
              href={`/api/admin/content/media/${record.id}/file`}
              target="_blank"
              rel="noreferrer"
            >
              {t('editor.privateFile')}
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
              {t('editor.previousSection')}
            </button>
          )}
          {available.indexOf(activeSection) < available.length - 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSection(available[available.indexOf(activeSection) + 1][0])}
            >
              {t('editor.nextSection')}
            </button>
          )}
        </div>
      </section>
      {record && (
        <footer className="entry-footer">
          <details>
            <summary>
              {t('editor.management')}
              {record.usages.length
                ? ` · ${t('editor.usageCount', { count: record.usages.length })}`
                : ''}
            </summary>
            <p>{t('editor.archiveHint')}</p>
            {record.usages.length > 0 ? (
              <ul>
                {record.usages.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpen(item.kind, item.id)}
                    >
                      {item.title} · {getStatusLabels()[item.status]}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('editor.noUsages')}</p>
            )}
            <div className="editor-actions">
              {kind !== 'media' && kind !== 'profiles' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || dirty}
                  onClick={() => setConfirm('duplicate')}
                >
                  {t('editor.duplicate')}
                </button>
              )}
              {!archived && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || dirty}
                  onClick={() => setConfirm('archive')}
                >
                  {t('editor.archive')}
                </button>
              )}
              {archived && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy || record.usages.length > 0}
                  onClick={() => setConfirm('delete')}
                >
                  {t('editor.delete')}
                </button>
              )}
            </div>
            {dirty && <p className="muted">{t('editor.saveBeforeAction')}</p>}
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
          title={t('editor.unsavedTitle')}
          onClose={() => {
            if (!busy) setPending(null)
          }}
        >
          <p>{t('editor.unsavedDescription')}</p>
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
              {t('editor.saveContinue')}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              {t('editor.stay')}
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
              {t('editor.discard')}
            </button>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={
            confirm === 'delete'
              ? t('editor.deleteTitle')
              : confirm === 'archive'
                ? t('editor.archiveTitle')
                : confirm === 'reload'
                  ? t('editor.reloadTitle')
                  : t('editor.duplicateTitle')
          }
          onClose={() => {
            if (!busy) setConfirm(null)
          }}
        >
          <p>
            {confirm === 'delete'
              ? t('editor.deleteDescription')
              : confirm === 'archive'
                ? t('editor.archiveDescription', { count: record?.usages.length ?? 0 })
                : confirm === 'reload'
                  ? t('editor.reloadDescription')
                  : t('editor.duplicateDescription')}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className={confirm === 'delete' ? 'danger-button' : 'primary-button'}
              disabled={busy}
              onClick={() => void confirmed()}
            >
              {t('common.confirm')}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
