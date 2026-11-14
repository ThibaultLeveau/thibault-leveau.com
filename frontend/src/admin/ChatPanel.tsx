import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  adminRequest,
  ApiError,
  errorMessage,
  type ChatMessage,
  type ChatReply,
  type ProviderSettings,
  type Session,
} from './api'
import { Icon } from './Icon'

export function ChatPanel({
  settings,
  session,
  onSettings,
  onSessionEnd,
  visible,
}: {
  settings: ProviderSettings
  session: Session
  visible: boolean
  onSettings: () => void
  onSessionEnd: (message: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const controller = useRef<AbortController | null>(null)
  const provider = settings.providers.find((item) => item.id === settings.provider)!

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (visible) bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [messages, pending, visible])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || pending || !settings.has_api_key) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    if (
      next.length > 40 ||
      next.reduce((total, message) => total + message.content.length, 0) > 40000
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
    try {
      const reply = await adminRequest<ChatReply>('/chat', {
        method: 'POST',
        csrf: session.csrf_token,
        body: { messages: next.map(({ role, content }) => ({ role, content })) },
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(70_000)]),
      })
      setMessages([...next, { ...reply.message, source: `${reply.provider} · ${reply.model}` }])
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

  const suggestions = ['Structurer une idée', 'Écrire un premier jet', 'Explorer une question']
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
          disabled={pending || !messages.length}
          onClick={() => {
            setMessages([])
            setDraft('')
            setError('')
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
            <span className="eyebrow">UNE PAGE BLANCHE, MILLE POSSIBILITÉS</span>
            <h1>
              Que voulez-vous
              <br />
              explorer aujourd’hui<span className="accent-dot"> ?</span>
            </h1>
            <p>
              Une idée à préciser, un texte à écrire,
              <br className="desktop-break" /> une question à creuser. La conversation commence ici.
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
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {pending && (
              <div className="thinking" role="status">
                <span className="thinking-dot" />
                Le modèle prépare sa réponse…
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
            maxLength={4000}
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
              disabled={pending || !draft.trim() || !settings.has_api_key}
              aria-label={pending ? 'Réponse en cours' : 'Envoyer le message'}
            >
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </form>
        <p className="composer-footnote">
          L’IA peut se tromper. Votre conversation reste temporaire et disparaît à la fermeture de
          la page.
        </p>
      </div>
    </section>
  )
}
