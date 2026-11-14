import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  adminRequest,
  ApiError,
  errorMessage,
  type ChatMessage,
  type ProviderSettings,
  type Session,
} from './api'
import { Icon } from './Icon'
import { ProposalCard } from './assistant/ProposalCard'
import { Attachments } from './assistant/Attachments'
import type { AssistantReply } from './assistant/types'
import type { Catalog, Collection, Item } from './content/types'

type ConversationMessage = ChatMessage & { reply?: AssistantReply }

export function ChatPanel({
  settings,
  session,
  onSettings,
  onSessionEnd,
  visible,
  onOpen,
}: {
  settings: ProviderSettings
  session: Session
  visible: boolean
  onSettings: () => void
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const controller = useRef<AbortController | null>(null)
  const thread = useRef(crypto.randomUUID())
  const requestId = useRef('')
  const [includePrivate, setIncludePrivate] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [media, setMedia] = useState<Item[]>([])
  const [uploading, setUploading] = useState(false)
  const provider = settings.providers.find((item) => item.id === settings.provider)!

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const abort = new AbortController()
    adminRequest<Catalog>('/content/catalog', { signal: abort.signal })
      .then(setCatalog)
      .catch(() => {})
    return () => abort.abort()
  }, [])
  useEffect(() => {
    if (visible) bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [messages, pending, visible])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || pending || uploading || !settings.has_api_key) return
    const next: ConversationMessage[] = [...messages, { role: 'user', content: text }]
    if (
      next.length > 40 ||
      next.reduce((total, message) => total + message.content.length, 0) > 80000
    ) {
      setError(
        'Cette conversation a atteint sa limite. Démarrez une nouvelle conversation pour continuer.',
      )
      return
    }
    setError('')
    setMessages(next)
    setDraft('')
    setPending(true)
    controller.current = new AbortController()
    requestId.current = crypto.randomUUID()
    try {
      const reply = await adminRequest<AssistantReply>('/assistant/turn', {
        method: 'POST',
        csrf: session.csrf_token,
        body: {
          messages: next.map(({ role, content }) => ({ role, content })),
          request_id: requestId.current,
          thread_id: thread.current,
          include_private_notes: includePrivate,
          media_ids: media.map((m) => m.id),
        },
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(250_000)]),
      })
      const content = [reply.message, ...reply.questions.map((q) => q.question)].join('\n')
      setMessages([
        ...next,
        { role: 'assistant', content, reply, source: `${reply.provider} · ${reply.model}` },
      ])
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else {
        setMessages(messages)
        setDraft(text)
        setError(errorMessage(error))
      }
    } finally {
      setPending(false)
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

  const suggestions = ['Créer un projet', 'Compléter mon profil', 'Rédiger un article']
  return (
    <section className="chat-panel" aria-label="Chat avec le LLM" hidden={!visible}>
      <div className="chat-toolbar">
        <span className="model-label">
          <span className={settings.has_api_key ? 'status-dot' : 'status-dot inactive'} />
          {provider.name}
          <span className="model-name">/ {settings.model}</span>
        </span>
        <button
          className="text-button new-chat"
          type="button"
          disabled={pending || uploading || !messages.length}
          onClick={() => {
            setMessages([])
            setDraft('')
            setError('')
            thread.current = crypto.randomUUID()
            setMedia([])
            input.current?.focus()
          }}
        >
          <Icon name="plus" size={16} />
          <span>Nouvelle conversation</span>
        </button>
      </div>
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <span className="chat-emblem">
              <Icon name="sparkles" size={32} />
            </span>
            <span className="eyebrow">VOS IDÉES PRENNENT FORME</span>
            <h1>
              Que voulez-vous
              <br />
              créer aujourd’hui<span className="accent-dot"> ?</span>
            </h1>
            <p>
              Décrivez votre parcours, une réalisation ou une offre.
              <br className="desktop-break" /> Je prépare vos fiches et vous demande les précisions
              utiles.
            </p>
            <div className="prompt-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion)
                    input.current?.focus()
                  }}
                >
                  {suggestion}
                  <Icon name="chevron" size={14} />
                </button>
              ))}
            </div>
            {!settings.has_api_key && (
              <button type="button" className="setup-prompt" onClick={onSettings}>
                <Icon name="settings" size={16} />
                Connecter un AI provider pour commencer
                <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="messages" role="log" aria-label="Conversation" aria-live="polite">
            {messages.map((message, index) => (
              <article key={index} className={`message message-${message.role}`}>
                <span className="message-avatar" aria-hidden="true">
                  {message.role === 'user' ? (
                    session.username.slice(0, 1).toUpperCase()
                  ) : (
                    <Icon name="sparkles" size={17} />
                  )}
                </span>
                <div className="message-body">
                  <span className="message-author">
                    {message.role === 'user' ? 'Vous' : 'Assistant'}
                    {message.source && <span>{message.source}</span>}
                  </span>
                  <p>{message.reply?.message ?? message.content}</p>
                  {message.reply && message.reply.questions.length > 0 && (
                    <div className="assistant-questions">
                      <strong>Quelques précisions</strong>
                      <ol>
                        {message.reply.questions.map((q, i) => (
                          <li key={i}>
                            <p>{q.question}</p>
                            {q.reason && <span className="muted">{q.reason}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {message.reply?.proposal && (
                    <ProposalCard
                      proposal={message.reply.proposal}
                      session={session}
                      catalog={catalog}
                      disabled={pending || index !== messages.length - 1}
                      onOpen={onOpen}
                      onSessionEnd={onSessionEnd}
                      onChanged={(proposal) =>
                        setMessages((current) =>
                          current.map((m, i) =>
                            i === index && m.reply
                              ? {
                                  ...m,
                                  content:
                                    proposal.state === 'applied'
                                      ? `${m.content}\nFiches enregistrées : ${proposal.result?.map((r) => `${r.kind} #${r.id} : ${r.title}`).join(', ')}`
                                      : m.content,
                                  reply: { ...m.reply, proposal },
                                }
                              : m,
                          ),
                        )
                      }
                    />
                  )}
                </div>
              </article>
            ))}
            {pending && (
              <div className="assistant-pending">
                <div className="thinking" role="status">
                  <span className="thinking-dot" />
                  L’assistant prépare votre contenu…
                </div>
                <button type="button" className="text-button" onClick={() => void cancel()}>
                  Annuler la génération
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="chat-message">
            Votre message
          </label>
          <textarea
            id="chat-message"
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Écrivez votre message…"
            maxLength={16000}
            rows={3}
            disabled={pending}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submit(event)
              }
            }}
          />
          <div className="composer-bottom">
            <span>
              <Icon name="sparkles" size={14} />
              {provider.name}
              <span className="composer-hint"> · Entrée pour envoyer</span>
            </span>
            <button
              type="submit"
              className="send-button"
              disabled={pending || uploading || !draft.trim() || !settings.has_api_key}
              aria-label={pending ? 'Réponse en cours' : 'Envoyer le message'}
            >
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </form>
        <Attachments
          items={media}
          onChange={setMedia}
          session={session}
          disabled={pending}
          onBusy={setUploading}
          onOpen={onOpen}
          onSessionEnd={onSessionEnd}
        />
        <details className="assistant-options">
          <summary>
            Options de la demande{includePrivate ? ' · Notes privées incluses' : ''}
          </summary>
          <label className="assistant-private">
            <input
              type="checkbox"
              checked={includePrivate}
              disabled={pending}
              aria-describedby="private-notes-help"
              onChange={(e) => setIncludePrivate(e.target.checked)}
            />
            Autoriser l’IA à utiliser les notes privées des fiches
          </label>
          <p id="private-notes-help">
            Désactivé par défaut. Si vous cochez cette option, les annotations internes des
            fiches utiles à votre demande peuvent être envoyées à {provider.name} pour être
            consultées ou modifiées.
          </p>
        </details>
      </div>
    </section>
  )
}
