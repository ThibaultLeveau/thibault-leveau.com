import { useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import {
  collectionLabels,
  optionLabels,
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
    return <span className="muted">Non renseigné</span>
  if (typeof value === 'boolean') return <span>{value ? 'Oui' : 'Non'}</span>
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
                        {name === 'id' ? 'Fiche' : (child?.properties?.[name]?.title ?? name)}
                      </dt>
                      <dd>
                        {name === 'id' && typeof v === 'number' ? (
                          (references[v]?.title ?? `Fiche ${v}`)
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
    return <span>{references[value]?.title ?? `Fiche ${value}`}</span>
  return (
    <span>
      {typeof value === 'string' && f?.enum ? (optionLabels[value] ?? value) : String(value)}
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
}: {
  proposal: Proposal
  session: Session
  catalog: Catalog | null
  disabled: boolean
  onChanged: (value: Proposal) => void
  onOpen: (kind: Collection, id: number) => void
  onSessionEnd: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  async function action(action: 'apply' | 'cancel' | 'verify') {
    setPending(true)
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
      onChanged(value)
      setUncertain(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else {
        setError(errorMessage(e))
        if (action === 'apply' && e instanceof ApiError && e.status === 0) setUncertain(true)
      }
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="assistant-proposal" aria-label="Proposition de contenu">
      <div className="proposal-heading">
        <div>
          <span className="eyebrow">À RELIRE</span>
          <h2>
            {proposal.items.length} fiche{proposal.items.length > 1 ? 's' : ''} proposée
            {proposal.items.length > 1 ? 's' : ''}
          </h2>
        </div>
        <span className="proposal-state">
          {proposal.state === 'applied'
            ? 'Enregistrée'
            : proposal.state === 'cancelled'
              ? 'Abandonnée'
              : proposal.state === 'superseded'
                ? 'À actualiser'
                : 'En attente'}
        </span>
      </div>
      <p className="muted">
        Vérifiez les faits et les champs ci-dessous. Vous pouvez préciser votre demande dans la
        conversation.
      </p>
      {proposal.items.map((item) => (
        <details key={item.key} className="proposal-item" open={proposal.items.length === 1}>
          <summary>
            <span>
              {item.id ? 'Modifier' : 'Créer'} · {collectionLabels[item.kind]}
            </span>
            <strong>{item.title}</strong>
          </summary>
          {item.related && (
            <p className="field-help">Cette association réciproque sera mise à jour avec le lot.</p>
          )}
          {item.status_before !== item.status_after && (
            <p className="proposal-status">
              Statut : {item.status_before === 'ready' ? 'Prêt → ' : ''}
              {item.status_after === 'draft' ? 'Brouillon' : item.status_after}
            </p>
          )}
          <div className="proposal-fields">
            {item.changes.map((change) => (
              <section className="proposal-field" key={change.field}>
                <h3>{change.label}</h3>
                <div className="proposal-comparison">
                  {item.id && (
                    <div>
                      <span className="comparison-label">Actuel</span>
                      <DisplayValue
                        value={change.before}
                        schema={catalog?.[item.kind].schema.properties?.[change.field]}
                        root={catalog?.[item.kind].schema}
                        references={item.references}
                      />
                    </div>
                  )}
                  <div>
                    <span className="comparison-label">Proposé</span>
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
              <strong>À compléter</strong>
              <ul>
                {[...new Set([...item.missing, ...item.errors.map((e) => e.message)])].map(
                  (text) => (
                    <li key={text}>{text}</li>
                  ),
                )}
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
              ? 'Vérification…'
              : `Enregistrer ${proposal.items.length > 1 ? 'les fiches' : 'la fiche'}`}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={disabled || pending}
            onClick={() => void action('cancel')}
          >
            Abandonner la proposition
          </button>
          {uncertain && (
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => void action('verify')}
            >
              Vérifier l’enregistrement
            </button>
          )}
        </div>
      )}
      {proposal.state === 'applied' && (
        <div role="status" className="proposal-result">
          <p>Les fiches ont été enregistrées.</p>
          {proposal.result?.map((item) => (
            <button
              type="button"
              className="text-button"
              key={item.id}
              onClick={() => onOpen(item.kind, item.id)}
            >
              Ouvrir {item.title} →
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
