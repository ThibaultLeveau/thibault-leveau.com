import { UnmatchedTranslations } from '../content/UnmatchedTranslations'
import { languageName, language, t } from '../../i18n'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import {
  getCollectionLabels,
  getOptionLabels,
  resolve,
  type Catalog,
  type Collection,
  type FieldSchema,
  type Item,
  type Value,
} from '../content/types'
import type { Proposal } from './types'

function DisplayValue({
  value,
  schema,
  root,
  references,
}: {
  value: Value
  schema?: FieldSchema
  root?: FieldSchema
  references: Record<number, Item>
}) {
  const f = schema && root ? resolve(schema, root) : schema
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0))
    return <span className="muted">{t('common.notProvided')}</span>
  if (typeof value === 'boolean')
    return <span>{value ? t('common.yes') : t('common.no')}</span>
  if (Array.isArray(value))
    return (
      <ol className="proposal-rows">
        {value.map((row, i) => {
          const child = f?.items && root ? resolve(f.items, root) : undefined
          return (
            <li key={i}>
              <dl>
                {Object.entries(row)
                  .filter(([, v]) => v !== '' && v !== null)
                  .map(([name, v]) => (
                    <div key={name}>
                      <dt>
                        {name === 'id'
                          ? t('content.entry')
                          : (child?.properties?.[name]?.title ?? name)}
                      </dt>
                      <dd>
                        {name === 'id' && typeof v === 'number' ? (
                          (references[v]?.title ?? t('content.entryNumber', { id: v }))
                        ) : (
                          <DisplayValue
                            value={v}
                            schema={child?.properties?.[name]}
                            root={root}
                            references={references}
                          />
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            </li>
          )
        })}
      </ol>
    )
  if (f?.target && typeof value === 'number')
    return (
      <span>{references[value]?.title ?? t('content.entryNumber', { id: value })}</span>
    )
  return (
    <span>
      {typeof value === 'string' && f?.enum
        ? (getOptionLabels()[value] ?? value)
        : String(value)}
    </span>
  )
}

export function ProposalCard({
  proposal,
  session,
  catalog,
  disabled,
  onChanged,
  onOpen,
  onSessionEnd,
  onBusy,
}: {
  proposal: Proposal
  session: Session
  catalog: Catalog | null
  disabled: boolean
  onBusy?: (value: boolean) => void
  onChanged: (value: Proposal) => void | Promise<void>
  onOpen: (kind: Collection, id: number) => void
  onSessionEnd: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const activeLanguage = language()
  const renderedLanguage = useRef(activeLanguage)
  const localized = useEffectEvent((value: Proposal) => onChanged(value))
  const localizationFailed = useEffectEvent((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
    else setError(errorMessage(e))
  })
  useEffect(() => {
    if (renderedLanguage.current === activeLanguage) return
    const abort = new AbortController()
    adminRequest<Proposal>(`/assistant/proposals/${proposal.id}`, {
      signal: abort.signal,
    })
      .then((value) => {
        if (abort.signal.aborted) return
        renderedLanguage.current = activeLanguage
        localized(value)
      })
      .catch((e) => {
        if (!abort.signal.aborted) localizationFailed(e)
      })
    return () => abort.abort()
  }, [activeLanguage, proposal.id])
  async function action(action: 'apply' | 'cancel' | 'verify') {
    setPending(true)
    onBusy?.(true)
    setError('')
    try {
      const value = await adminRequest<Proposal>(
        `/assistant/proposals/${proposal.id}${action === 'verify' ? '' : `/${action}`}`,
        {
          method: action === 'verify' ? 'GET' : 'POST',
          csrf: session.csrf_token,
          ...(action !== 'verify' && { body: { revision: proposal.revision } }),
        },
      )
      await onChanged(value)
      setUncertain(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
      else {
        setError(errorMessage(e))
        if (action === 'apply' && e instanceof ApiError && e.status === 0)
          setUncertain(true)
      }
    } finally {
      setPending(false)
      onBusy?.(false)
    }
  }
  return (
    <section className="assistant-proposal" aria-label={t('proposal.title')}>
      <div className="proposal-heading">
        <div>
          <span className="eyebrow">{t('proposal.eyebrow')}</span>
          <h2>{t('proposal.count', { count: proposal.items.length })}</h2>
        </div>
        <span className="proposal-state">
          {proposal.state === 'applied'
            ? t('proposal.saved')
            : proposal.state === 'cancelled'
              ? t('proposal.discarded')
              : proposal.state === 'superseded'
                ? t('proposal.refreshNeeded')
                : t('status.pending')}
        </span>
      </div>
      <p className="muted">{t('proposal.help')}</p>
      {proposal.items.map((item) => (
        <details
          key={item.key}
          className="proposal-item"
          open={proposal.items.length === 1}
        >
          <summary>
            <span>
              {item.id ? t('common.edit') : t('common.create')} ·{' '}
              {getCollectionLabels()[item.kind]}{' '}
              {item.language && ` · ${languageName(item.language)}`}
            </span>
            <strong>{item.title}</strong>
          </summary>
          <UnmatchedTranslations texts={item.unmatched_texts} />
          {item.related && <p className="field-help">{t('proposal.reciprocal')}</p>}
          {item.status_before !== item.status_after && (
            <p className="proposal-status">
              {t('proposal.status')}{' '}
              {item.status_before === 'ready' ? t('proposal.readyFragment') : ''}
              {item.status_after === 'draft' ? t('status.draft') : item.status_after}
            </p>
          )}
          <div className="proposal-fields">
            {item.changes.map((change) => (
              <section className="proposal-field" key={change.field}>
                <h3>
                  {catalog?.[item.kind].schema.properties?.[change.field]?.title ??
                    change.label}
                </h3>
                <div className="proposal-comparison">
                  {item.id && (
                    <div>
                      <span className="comparison-label">{t('proposal.current')}</span>
                      <DisplayValue
                        value={change.before}
                        schema={catalog?.[item.kind].schema.properties?.[change.field]}
                        root={catalog?.[item.kind].schema}
                        references={item.references}
                      />
                    </div>
                  )}
                  <div>
                    <span className="comparison-label">{t('proposal.proposed')}</span>
                    <DisplayValue
                      value={change.after}
                      schema={catalog?.[item.kind].schema.properties?.[change.field]}
                      root={catalog?.[item.kind].schema}
                      references={item.references}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>
          {(item.missing.length > 0 || item.errors.length > 0) && (
            <div className="proposal-missing">
              <strong>{t('proposal.incomplete')}</strong>
              <ul>
                {[
                  ...new Set([...item.missing, ...item.errors.map((e) => e.message)]),
                ].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {proposal.state === 'pending' && (
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={disabled || pending || uncertain}
            onClick={() => void action('apply')}
          >
            {pending
              ? t('common.checking')
              : t('proposal.save', { count: proposal.items.length })}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={disabled || pending}
            onClick={() => void action('cancel')}
          >
            {t('proposal.discard')}
          </button>
          {uncertain && (
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => void action('verify')}
            >
              {t('proposal.checkSaved')}
            </button>
          )}
        </div>
      )}
      {proposal.state === 'applied' && (
        <div role="status" className="proposal-result">
          <p>{t('proposal.savedMessage')}</p>
          {proposal.result?.map((item) => (
            <button
              type="button"
              className="text-button"
              key={item.id}
              onClick={() => onOpen(item.kind, item.id)}
            >
              {t('proposal.openEntry', { title: item.title })}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
