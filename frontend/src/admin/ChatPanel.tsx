import { Dialog } from './content/Dialog'
import { TranslationOffer } from './assistant/TranslationOffer'
import { languageName, t, language, type Language } from '../i18n'
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
  const [choosingLanguage, setChoosingLanguage] = useState(false)
  const [pending, setPending] = useState(false)
  const [translationBusy, setTranslationBusy] = useState(false)
  const busy = pending || translationBusy
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
  const activeLanguage = language()

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const abort = new AbortController()
    adminRequest<Catalog>('/content/catalog', { signal: abort.signal })
      .then(setCatalog)
      .catch(() => {})
    return () => abort.abort()
  }, [activeLanguage])
  useEffect(() => {
    if (visible) bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [messages, pending, visible])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (draft.trim() && !busy && !uploading && settings.has_api_key)
      setChoosingLanguage(true)
  }
  async function generate(code: Language) {
    setChoosingLanguage(false)
    const text = draft.trim()
    if (!text || busy || uploading || !settings.has_api_key) return
    const next: ConversationMessage[] = [...messages, { role: 'user', content: text }]
    if (
      next.length > 40 ||
      next.reduce((total, message) => total + message.content.length, 0) > 80000
    ) {
      setError(t('chat.limit'))
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
          language: code,
          messages: next.map(({ role, content }) => ({ role, content })),
          request_id: requestId.current,
          thread_id: thread.current,
          include_private_notes: includePrivate,
          media_ids: media.map((m) => m.id),
        },
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(250_000),
        ]),
      })
      const content = [reply.message, ...reply.questions.map((q) => q.question)].join(
        '\n',
      )
      setMessages([
        ...next,
        {
          role: 'assistant',
          content,
          reply,
          source: `${reply.provider} · ${reply.model}`,
        },
      ])
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        onSessionEnd(t('session.expired'))
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

  const suggestions = [
    t('chat.createProject'),
    t('chat.completeProfile'),
    t('chat.writeArticle'),
  ]
  return (
    <section className="chat-panel" aria-label={t('chat.label')} hidden={!visible}>
      {choosingLanguage && (
        <Dialog title={t('variants.chooseAI')} onClose={() => setChoosingLanguage(false)}>
          <p>{t('variants.chooseHint')}</p>
          <div className="dialog-actions">
            {(['fr', 'en'] as const).map((code) => (
              <button
                type="button"
                className="primary-button"
                key={code}
                lang={code}
                onClick={() => void generate(code)}
              >
                {languageName(code)}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      <div className="chat-toolbar">
        <span className="model-label">
          <span className={settings.has_api_key ? 'status-dot' : 'status-dot inactive'} />
          {provider.name}
          <span className="model-name">/ {settings.model}</span>
        </span>
        <button
          className="text-button new-chat"
          type="button"
          disabled={busy || uploading || !messages.length}
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
          <span>{t('chat.newConversation')}</span>
        </button>
      </div>
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <span className="chat-emblem">
              <Icon name="sparkles" size={32} />
            </span>
            <span className="eyebrow">{t('chat.eyebrow')}</span>
            <h1>
              {t('chat.headingStart')}
              <br />
              {t('chat.headingEnd')}
              <span className="accent-dot">{t('chat.questionMark')}</span>
            </h1>
            <p>
              {t('chat.intro')}
              <br className="desktop-break" /> {t('chat.help')}
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
                {t('chat.connectProvider')}
                <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        ) : (
          <div
            className="messages"
            role="log"
            aria-label={t('chat.conversation')}
            aria-live="polite"
          >
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
                    {message.role === 'user' ? t('chat.you') : t('chat.assistant')}
                    {message.source && <span>{message.source}</span>}
                  </span>
                  <p>{message.reply?.message ?? message.content}</p>
                  {message.reply && message.reply.questions.length > 0 && (
                    <div className="assistant-questions">
                      <strong>{t('chat.clarifications')}</strong>
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
                      disabled={busy || index !== messages.length - 1}
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
                                      ? `${m.content}\n${t('chat.savedEntries', { entries: proposal.result?.map((r) => `${r.kind} #${r.id} : ${r.title}`).join(', ') ?? '' })}`
                                      : m.content,
                                  reply: { ...m.reply, proposal },
                                }
                              : m,
                          ),
                        )
                      }
                    />
                  )}
                  {message.reply?.proposal?.state === 'applied' &&
                    !message.reply.proposal.translation &&
                    message.reply.proposal.result?.map((item) => (
                      <TranslationOffer
                        key={`${item.id}-${item.version}`}
                        kind={item.kind}
                        id={item.id}
                        version={item.version}
                        sourceLanguage={item.language ?? 'fr'}
                        session={session}
                        disabled={busy || index !== messages.length - 1}
                        onBusy={setTranslationBusy}
                        onSessionEnd={onSessionEnd}
                        onOpen={onOpen}
                      />
                    ))}
                </div>
              </article>
            ))}
            {pending && (
              <div className="assistant-pending">
                <div className="thinking" role="status">
                  <span className="thinking-dot" />
                  {t('chat.preparing')}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void cancel()}
                >
                  {t('chat.cancel')}
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
            {t('chat.message')}
          </label>
          <textarea
            id="chat-message"
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('chat.placeholder')}
            maxLength={16000}
            rows={3}
            disabled={busy}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void submit(event)
              }
            }}
          />
          <div className="composer-bottom">
            <span>
              <Icon name="sparkles" size={14} />
              {provider.name}
              <span className="composer-hint"> {t('chat.sendHint')}</span>
            </span>
            <button
              type="submit"
              className="send-button"
              disabled={busy || uploading || !draft.trim() || !settings.has_api_key}
              aria-label={pending ? t('chat.responding') : t('chat.send')}
            >
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </form>
        <Attachments
          items={media}
          onChange={setMedia}
          session={session}
          disabled={busy}
          onBusy={setUploading}
          onOpen={onOpen}
          onSessionEnd={onSessionEnd}
        />
        <details className="assistant-options">
          <summary>
            {t('chat.requestOptions')}
            {includePrivate ? t('chat.privateNotesIncluded') : ''}
          </summary>
          <label className="assistant-private">
            <input
              type="checkbox"
              checked={includePrivate}
              disabled={busy}
              aria-describedby="private-notes-help"
              onChange={(e) => setIncludePrivate(e.target.checked)}
            />
            {t('chat.allowPrivateNotes')}
          </label>
          <p id="private-notes-help">
            {t('chat.privateNotesHelp', { provider: provider.name })}
          </p>
        </details>
      </div>
    </section>
  )
}
