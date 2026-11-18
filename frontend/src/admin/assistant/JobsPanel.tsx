import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { language, languageName, number, t, type MessageKey } from '../../i18n'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from '../content/Dialog'
import type { Catalog, Collection } from '../content/types'
import { ProposalCard } from './ProposalCard'
import type { AssistantJob, JobBatch, JobPage, JobStatus } from './types'

const statusKeys: Record<JobStatus, MessageKey> = {
  queued: 'jobs.queued',
  running: 'jobs.running',
  review: 'jobs.review',
  needs_input: 'jobs.needsInput',
  paused: 'jobs.paused',
  failed: 'jobs.failed',
  completed: 'jobs.completed',
  cancelled: 'jobs.cancelled',
}

type CommonProps = {
  session: Session
  catalog: Catalog | null
  onOpen: (kind: Collection, id: number) => void
  onSessionEnd: (message: string) => void
  onGuardChange: (value: boolean) => void
}

function Pagination({
  page,
  limit,
  total,
  busy,
  batches = false,
  onChange,
}: {
  page: number
  limit: number
  total: number
  busy: boolean
  batches?: boolean
  onChange: (page: number) => void
}) {
  if (total <= limit) return null
  return (
    <nav className="jobs-pagination" aria-label={t(batches ? 'jobs.batches' : 'jobs.title')}>
      <button
        type="button"
        className="text-button"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t(batches ? 'jobs.previousBatches' : 'jobs.previousJobs')}
      </button>
      <span>{t('jobs.page', { page: number(page), total: number(Math.ceil(total / limit)) })}</span>
      <button
        type="button"
        className="text-button"
        disabled={busy || page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        {t(batches ? 'jobs.nextBatches' : 'jobs.nextJobs')}
      </button>
    </nav>
  )
}

export function JobsPanel({ initialJob, ...props }: CommonProps & { initialJob: AssistantJob | null }) {
  const [selected, setSelected] = useState(initialJob?.id ?? '')
  const [page, setPage] = useState(1)
  const [jobs, setJobs] = useState<JobPage<AssistantJob> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const activeLanguage = language()
  const sessionEnded = useEffectEvent(() => props.onSessionEnd(t('session.expired')))

  useEffect(() => { if (!selected) listHeading.current?.focus() }, [selected])

  useEffect(() => {
    if (selected) return
    const abort = new AbortController()
    adminRequest<JobPage<AssistantJob>>(`/assistant/jobs?page=${page}&limit=10`, { signal: abort.signal })
      .then((value) => {
        if (abort.signal.aborted) return
        const lastPage = Math.max(1, Math.ceil(value.total / value.limit))
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setJobs(value)
        setError('')
      })
      .catch((e) => {
        if (abort.signal.aborted) return
        if (e instanceof ApiError && e.status === 401) sessionEnded()
        else setError(errorMessage(e))
      })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [selected, page, refresh, activeLanguage])

  if (selected)
    return <JobDetail
      key={selected}
      {...props}
      id={selected}
      initialJob={initialJob?.id === selected ? initialJob : null}
      onBack={() => { setSelected(''); setLoading(true); setRefresh((value) => value + 1) }}
    />

  return (
    <section className="assistant-jobs" aria-labelledby="jobs-title">
      <div className="jobs-heading">
        <div>
          <span className="eyebrow">{t('jobs.eyebrow')}</span>
          <h1 id="jobs-title" ref={listHeading} tabIndex={-1}>{t('jobs.title')}</h1>
        </div>
        <button type="button" className="text-button" disabled={loading} onClick={() => {
          setLoading(true)
          setRefresh((value) => value + 1)
        }}>{t('jobs.refresh')}</button>
      </div>
      <p className="muted">{t('jobs.listHelp')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p role="status">{t('jobs.loading')}</p>}
      {!loading && !error && jobs?.items.length === 0 && <p className="jobs-empty">{t('jobs.empty')}</p>}
      <ul className="jobs-list" aria-busy={loading}>
        {jobs?.items.map((job) => (
          <li key={job.id}>
            <button type="button" onClick={() => setSelected(job.id)}>
              <strong>{job.message || t('jobs.request')}</strong>
              <span className="jobs-list-meta">
                <span>{t(statusKeys[job.status])}</span>
                <span>{t('jobs.savedCount', { count: job.applied })}</span>
                <span>{languageName(job.language)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {jobs && <Pagination page={page} limit={jobs.limit} total={jobs.total} busy={loading} onChange={(next) => {
        setLoading(true)
        setPage(next)
      }} />}
    </section>
  )
}

function JobDetail({ id, initialJob, onBack, ...props }: CommonProps & {
  id: string
  initialJob: AssistantJob | null
  onBack: () => void
}) {
  const [job, setJob] = useState(initialJob)
  const [batches, setBatches] = useState<JobPage<JobBatch> | null>(null)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [draft, setDraft] = useState('')
  const [confirmation, setConfirmation] = useState<'cancel' | 'delete' | null>(null)
  const [loading, setLoading] = useState(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const epoch = useRef(0)
  const mutating = useRef(false)
  const inputRequest = useRef<{ message: string; requestId: string } | null>(null)
  const activeLanguage = language()
  const sessionEnded = useEffectEvent(() => props.onSessionEnd(t('session.expired')))
  const guardChanged = useEffectEvent((value: boolean) => props.onGuardChange(value))

  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    guardChanged(busy || !!draft.trim())
    const prevent = (event: BeforeUnloadEvent) => {
      if (busy || draft.trim()) event.preventDefault()
    }
    window.addEventListener('beforeunload', prevent)
    return () => {
      guardChanged(false)
      window.removeEventListener('beforeunload', prevent)
    }
  }, [busy, draft])
  useEffect(() => {
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      const before = epoch.current
      try {
        if (mutating.current) return
        const [next, lots] = await Promise.all([
          adminRequest<AssistantJob>(`/assistant/jobs/${id}`, { signal: abort.signal }),
          adminRequest<JobPage<JobBatch>>(`/assistant/jobs/${id}/batches?page=${page}&limit=1`, { signal: abort.signal }),
        ])
        if (abort.signal.aborted || before !== epoch.current || mutating.current) return
        setJob(next)
        setBatches(lots)
        setReadError('')
        setLoading(false)
      } catch (e) {
        if (abort.signal.aborted || before !== epoch.current) return
        if (e instanceof ApiError && e.status === 401) sessionEnded()
        else setReadError(errorMessage(e))
        setLoading(false)
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void load(), 2500)
      }
    }
    void load()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [id, page, refresh, activeLanguage])

  function mutation(value: boolean) {
    if (value) epoch.current += 1
    mutating.current = value
    setBusy(value)
  }

  async function action(name: 'pause' | 'resume' | 'cancel' | 'delete' | 'input') {
    mutation(true)
    setError('')
    const message = draft.trim()
    if (name === 'input' && inputRequest.current?.message !== message) {
      inputRequest.current = { message, requestId: crypto.randomUUID() }
    }
    try {
      if (name === 'delete') {
        await adminRequest(`/assistant/jobs/${id}`, { method: 'DELETE', csrf: props.session.csrf_token })
        onBack()
        return
      }
      const value = await adminRequest<AssistantJob>(`/assistant/jobs/${id}/${name}`, {
        method: 'POST', csrf: props.session.csrf_token,
        ...(name === 'input' && { body: { message, request_id: inputRequest.current?.requestId } }),
      })
      setJob(value)
      if (name === 'input' || name === 'cancel') {
        inputRequest.current = null
        setDraft('')
      }
      setConfirmation(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) props.onSessionEnd(t('session.expired'))
      else setError(errorMessage(e))
    } finally {
      mutation(false)
      setRefresh((value) => value + 1)
    }
  }

  function addInput(event: FormEvent) {
    event.preventDefault()
    if (draft.trim() && !busy) void action('input')
  }

  const active = job?.status === 'running' || job?.status === 'queued'
  const terminal = job?.status === 'completed' || job?.status === 'cancelled'

  return (
    <section className="assistant-jobs job-detail" aria-labelledby="job-title">
      <button type="button" className="text-button" disabled={busy || !!draft.trim()} onClick={onBack}>{t('jobs.back')}</button>
      <div className="jobs-heading">
        <div>
          <span className="eyebrow">{t('jobs.eyebrow')}</span>
          <h1 id="job-title" ref={heading} tabIndex={-1}>{t('jobs.request')}</h1>
        </div>
        {job && <span className="proposal-state" role="status">{t(statusKeys[job.status])}</span>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {readError && <p className="form-error" role="alert">{readError}</p>}
      {loading && <p role="status">{t('jobs.loading')}</p>}
      {job && <>
        <p className="jobs-brief">{job.message}</p>
        <p className="muted jobs-context">{languageName(job.language)} · {job.provider} · {job.model}</p>
        <dl className="jobs-progress" aria-live="polite" aria-atomic="true">
          <div><dt>{t('jobs.planned')}</dt><dd>{number(job.planned)}</dd></div>
          <div><dt>{t('jobs.prepared')}</dt><dd>{number(job.prepared)}</dd></div>
          <div><dt>{t('jobs.applied')}</dt><dd>{number(job.applied)}</dd></div>
        </dl>
        {job.total_tasks !== null && job.total_tasks > 0 && <p className="muted">{t('jobs.expectedCount', { count: job.total_tasks })}</p>}
        <p className="jobs-help">{t(terminal ? 'jobs.retainedHelp' : 'jobs.progressHelp')}</p>
        {job.include_private_notes && <p className="jobs-private">{t('jobs.privateIncluded')}</p>}
        {job.error && <p className="form-error" role="alert">{job.error}</p>}
        {!!job.questions.length && <div className="assistant-questions">
          <strong>{t('chat.clarifications')}</strong>
          <ol>{job.questions.map((question, index) => <li key={index}>
            <p>{question.question}</p>
            {question.reason && <span className="muted">{question.reason}</span>}
          </li>)}</ol>
        </div>}
        <div className="jobs-actions">
          {active && <button type="button" className="secondary-button" disabled={busy} onClick={() => void action('pause')}>{t('jobs.pause')}</button>}
          {(job.status === 'paused' || job.status === 'failed') && <button type="button" className="primary-button" disabled={busy} onClick={() => void action('resume')}>{t('jobs.resume')}</button>}
          {!terminal && <button type="button" className="text-button" disabled={busy} onClick={() => setConfirmation('cancel')}>{t('jobs.stop')}</button>}
          {!active && <button type="button" className="text-button" disabled={busy} onClick={() => setConfirmation('delete')}>{t('jobs.delete')}</button>}
          <button type="button" className="text-button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{t('jobs.refresh')}</button>
        </div>
        {job.status !== 'cancelled' && <form className="job-input" onSubmit={addInput}>
          <label htmlFor="job-input">{t('jobs.inputLabel')}</label>
          <p id="job-input-help" className="muted">{t('jobs.inputHelp')}</p>
          <textarea id="job-input" aria-describedby="job-input-help" value={draft} maxLength={16000} rows={3} disabled={busy || active} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="secondary-button" disabled={busy || active || !draft.trim()}>{busy ? t('common.saving') : t('jobs.addInput')}</button>
        </form>}
        {batches && batches.total > 0 && <div className="job-batches">
          <h2>{t('jobs.batches')}</h2>
          <Pagination batches page={page} limit={batches.limit} total={batches.total} busy={busy || loading} onChange={(next) => { setLoading(true); setPage(next) }} />
          {batches.items.map(({ sequence, proposal }) => <div key={proposal.id}>
            <p className="eyebrow">{t('jobs.batchNumber', { number: number(sequence) })}</p>
            <ProposalCard
              {...props}
              proposal={proposal}
              help={t('jobs.reviewHelp')}
              disabled={busy || loading || job.status === 'cancelled'}
              onBusy={mutation}
              onChanged={(value) => {
                setBatches((current) => current && ({ ...current, items: current.items.map((batch) => batch.sequence === sequence ? { ...batch, proposal: value } : batch) }))
                setRefresh((value) => value + 1)
              }}
            />
          </div>)}
        </div>}
      </>}
      {confirmation && <Dialog title={t(confirmation === 'delete' ? 'jobs.delete' : 'jobs.stop')} onClose={() => { if (!busy) setConfirmation(null) }}>
        <p>{t(confirmation === 'delete' ? 'jobs.deleteHelp' : 'jobs.stopHelp')}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>{t('jobs.keep')}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void action(confirmation)}>{busy ? t('common.checking') : t(confirmation === 'delete' ? 'jobs.confirmDelete' : 'jobs.confirmStop')}</button>
        </div>
      </Dialog>}
    </section>
  )
}
