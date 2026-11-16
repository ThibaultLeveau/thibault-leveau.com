import { useEffect, useRef, useState } from 'react'
import { languageName, t, type Language } from '../../i18n'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import type { Collection } from '../content/types'
import { ProposalCard } from './ProposalCard'
import type { AssistantReply, Proposal } from './types'

export function TranslationOffer({
  kind,
  id,
  version,
  sourceLanguage,
  session,
  disabled = false,
  onSessionEnd,
  onOpen,
  onApplied,
  onBusy,
}: {
  kind: Collection
  id: number
  version: number
  sourceLanguage: Language
  session: Session
  disabled?: boolean
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
  onApplied?: () => void | Promise<void>
  onBusy?: (value: boolean) => void
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [pending, setPending] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const requestId = useRef('')
  const target = sourceLanguage === 'fr' ? 'en' : 'fr'
  useEffect(() => () => controller.current?.abort(), [])
  async function generate() {
    setPending(true)
    onBusy?.(true)
    setError('')
    controller.current = new AbortController()
    requestId.current = crypto.randomUUID()
    try {
      const reply = await adminRequest<AssistantReply>('/assistant/turn', {
        method: 'POST',
        csrf: session.csrf_token,
        body: {
          request_id: requestId.current,
          thread_id: crypto.randomUUID(),
          language: target,
          messages: [{ role: 'user', content: 'Translate the saved entry.' }],
          translation: {
            kind,
            entry_id: id,
            version,
            source_language: sourceLanguage,
          },
        },
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(250_000),
        ]),
      })
      setProposal(reply.proposal)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
      else setError(errorMessage(e))
    } finally {
      setPending(false)
      onBusy?.(false)
    }
  }
  async function cancel() {
    try {
      await adminRequest(`/assistant/runs/${requestId.current}/cancel`, {
        method: 'POST',
        csrf: session.csrf_token,
      })
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  if (dismissed) return null
  return (
    <section className="translation-offer" aria-label={t('variants.offerTitle')}>
      <h2>{t('variants.offerTitle')}</h2>
      <p>{t('variants.offerHint', { language: languageName(target) })}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!proposal && (
        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={disabled || pending}
            onClick={() => void generate()}
          >
            {pending
              ? t('chat.preparing')
              : t('variants.generate', { language: languageName(target) })}
          </button>
          {pending ? (
            <button type="button" className="text-button" onClick={() => void cancel()}>
              {t('chat.cancel')}
            </button>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => setDismissed(true)}
            >
              {t('variants.later')}
            </button>
          )}
        </div>
      )}
      {proposal && (
        <ProposalCard
          proposal={proposal}
          session={session}
          catalog={null}
          disabled={disabled || pending}
          onOpen={onOpen}
          onSessionEnd={onSessionEnd}
          onBusy={onBusy}
          onChanged={async (value) => {
            setProposal(value)
            if (value.state === 'applied' && proposal.state !== 'applied')
              await onApplied?.()
          }}
        />
      )}
    </section>
  )
}
