import { t } from '../i18n'
import { useState, type FormEvent } from 'react'
import {
  adminRequest,
  ApiError,
  errorMessage,
  type ProviderSettings,
  type Session,
} from './api'
import { Icon } from './Icon'

interface SharedProps {
  session: Session
  onSessionEnd: (message: string) => void
}

export function ProviderForm({
  settings,
  session,
  onSaved,
  onSessionEnd,
}: SharedProps & {
  settings: ProviderSettings
  onSaved: (settings: ProviderSettings) => void
}) {
  const [provider, setProvider] = useState(settings.provider)
  const [model, setModel] = useState(settings.model)
  const [key, setKey] = useState('')
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const selected = settings.providers.find((item) => item.id === provider)!

  async function save(clear = false) {
    if (!clear && provider !== settings.provider && !key.trim()) {
      setFeedback({ error: t('provider.keyRequired'), success: '' })
      return
    }
    setPending(true)
    setFeedback({ error: '', success: '' })
    try {
      const updated = await adminRequest<ProviderSettings>('/provider', {
        method: 'PUT',
        csrf: session.csrf_token,
        body: {
          provider,
          model: model.trim(),
          ...(key.trim() && !clear ? { api_key: key.trim() } : {}),
          clear_api_key: clear,
        },
      })
      setKey('')
      onSaved(updated)
      setFeedback({
        error: '',
        success: clear ? t('provider.keyRemoved') : t('settings.saved'),
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionEnd(t('session.expired'))
      else setFeedback({ error: errorMessage(error), success: '' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="settings-content" aria-labelledby="provider-title">
      <span className="eyebrow">{t('settings.eyebrow')}</span>
      <h1 id="provider-title">
        {t('provider.title')}
        <span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">{t('provider.subtitle')}</p>
      <form
        className="settings-card"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="card-heading">
          <span className="section-icon">
            <Icon name="sparkles" />
          </span>
          <div>
            <h2>{t('provider.cardTitle')}</h2>
            <p className="muted">{t('provider.cardDescription')}</p>
          </div>
        </div>
        <fieldset className="provider-picker" disabled={pending}>
          <legend>{t('provider.label')}</legend>
          <div className="provider-options">
            {settings.providers.map((item) => (
              <label
                key={item.id}
                className={`provider-option ${item.id === provider ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={item.id}
                  checked={item.id === provider}
                  onChange={() => {
                    setProvider(item.id)
                    setModel(
                      item.id === settings.provider ? settings.model : item.default_model,
                    )
                    setKey('')
                    setFeedback({ error: '', success: '' })
                  }}
                />
                <span className={`provider-symbol ${item.id}`} aria-hidden="true">
                  {item.id === 'openai' ? '◎' : item.id === 'anthropic' ? '✳' : 'M'}
                </span>
                <span>{item.name}</span>
                <span className="provider-check">
                  <Icon name="check" size={14} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="provider-model">{t('provider.model')}</label>
          <input
            id="provider-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            maxLength={128}
            spellCheck={false}
            disabled={pending}
            aria-describedby="model-help"
          />
          <span className="field-help" id="model-help">
            {t('provider.modelHint')}{' '}
            <a href={selected.docs_url} target="_blank" rel="noreferrer">
              {t('provider.models')} <Icon name="external" size={12} />
            </a>
          </span>
        </div>
        <div className="field">
          <label htmlFor="provider-key">{t('provider.apiKey')}</label>
          <span className="field-label-note">
            {settings.has_api_key && provider === settings.provider
              ? t('provider.hasKey')
              : t('provider.noKey')}
          </span>
          <input
            id="provider-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="new-password"
            placeholder={
              settings.has_api_key && provider === settings.provider
                ? t('provider.keepKey')
                : t('provider.enterKey')
            }
            maxLength={512}
            disabled={pending}
            spellCheck={false}
            aria-describedby="key-help"
          />
          <span className="field-help" id="key-help">
            {t('provider.keyPrivacy')}
          </span>
        </div>
        <div className="settings-note">
          <Icon name="lock" size={16} />
          <p>{t('provider.billing')}</p>
        </div>
        <p className="field-help">{t('provider.newConversation')}</p>
        {feedback.error && (
          <p className="form-error" role="alert">
            {feedback.error}
          </p>
        )}
        {feedback.success && (
          <p className="form-success" role="status">
            <Icon name="check" size={16} />
            {feedback.success}
          </p>
        )}
        <div className="form-actions">
          <button className="primary-button" disabled={pending}>
            {pending ? t('common.saving') : t('settings.save')}
          </button>
          {settings.has_api_key && (
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => void save(true)}
            >
              {t('provider.removeKey')}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

export function AccountForm({ session, onSessionEnd }: SharedProps) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('new-password'))
    if (password !== form.get('confirm-password')) {
      setError(t('account.passwordMismatch'))
      return
    }
    setPending(true)
    setError('')
    try {
      await adminRequest('/account', {
        method: 'PUT',
        csrf: session.csrf_token,
        body: {
          username: form.get('username'),
          current_password: form.get('current-password'),
          ...(password ? { new_password: password } : {}),
        },
      })
      onSessionEnd(t('account.updated'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionEnd(t('session.expired'))
      else setError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-content" aria-labelledby="account-title">
      <span className="eyebrow">{t('settings.eyebrow')}</span>
      <h1 id="account-title">
        {t('account.title')}
        <span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">{t('account.subtitle')}</p>
      <form className="settings-card" onSubmit={submit}>
        <div className="card-heading">
          <span className="section-icon">
            <Icon name="user" />
          </span>
          <div>
            <h2>{t('account.cardTitle')}</h2>
            <p className="muted">{t('account.cardDescription')}</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="account-username">{t('account.username')}</label>
          <input
            id="account-username"
            name="username"
            defaultValue={session.username}
            required
            minLength={3}
            maxLength={64}
            pattern="[A-Za-z0-9_.\-]+"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={pending}
            aria-describedby="username-help"
          />
          <span id="username-help" className="field-help">
            {t('account.usernameHint')}
          </span>
        </div>
        <label className="field">
          {t('account.currentPassword')}
          <input
            name="current-password"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
            disabled={pending}
          />
        </label>
        <div className="form-divider" />
        <div className="field">
          <label htmlFor="account-password">{t('account.newPassword')}</label>
          <span className="field-label-note">{t('common.optional')}</span>
          <input
            id="account-password"
            name="new-password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            disabled={pending}
            aria-describedby="password-help"
          />
          <span className="field-help" id="password-help">
            {t('account.passwordHint')}
          </span>
        </div>
        <label className="field">
          {t('account.confirmPassword')}
          <input
            name="confirm-password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            disabled={pending}
          />
        </label>
        <div className="settings-note">
          <Icon name="lock" size={16} />
          <p>{t('account.sessionsHint')}</p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary-button" disabled={pending}>
            {pending ? t('common.saving') : t('account.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
