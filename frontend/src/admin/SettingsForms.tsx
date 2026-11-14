import { useState, type FormEvent } from 'react'
import { adminRequest, ApiError, errorMessage, type ProviderSettings, type Session } from './api'
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
      setFeedback({ error: 'Saisissez une clé API pour le nouveau fournisseur.', success: '' })
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
        success: clear ? 'La clé API a été retirée.' : 'Vos réglages sont enregistrés.',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else setFeedback({ error: errorMessage(error), success: '' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="settings-content" aria-labelledby="provider-title">
      <span className="eyebrow">RÉGLAGES DU SITE</span>
      <h1 id="provider-title">
        AI provider<span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">Choisissez l’intelligence qui vous accompagne.</p>
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
            <h2>Votre modèle, vos idées</h2>
            <p className="muted">Connectez le fournisseur de votre choix.</p>
          </div>
        </div>
        <fieldset className="provider-picker" disabled={pending}>
          <legend>Fournisseur LLM</legend>
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
                    setModel(item.id === settings.provider ? settings.model : item.default_model)
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
          <label htmlFor="provider-model">Modèle</label>
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
            L’identifiant exact d’un modèle disponible sur votre compte.{' '}
            <a href={selected.docs_url} target="_blank" rel="noreferrer">
              Voir les modèles <Icon name="external" size={12} />
            </a>
          </span>
        </div>
        <div className="field">
          <label htmlFor="provider-key">Clé API</label>
          <span className="field-label-note">
            {settings.has_api_key && provider === settings.provider
              ? 'Une clé est enregistrée'
              : 'Aucune clé enregistrée'}
          </span>
          <input
            id="provider-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="new-password"
            placeholder={
              settings.has_api_key && provider === settings.provider
                ? 'Laisser vide pour conserver la clé'
                : 'Saisissez votre clé API'
            }
            maxLength={512}
            disabled={pending}
            spellCheck={false}
            aria-describedby="key-help"
          />
          <span className="field-help" id="key-help">
            Votre clé reste confidentielle. Une clé enregistrée n’est jamais réaffichée.
          </span>
        </div>
        <div className="settings-note">
          <Icon name="lock" size={16} />
          <p>
            Les messages sont envoyés au fournisseur sélectionné. L’utilisation est facturée sur
            votre compte selon ses tarifs.
          </p>
        </div>
        <p className="field-help">
          Changer de fournisseur ou de modèle démarre une nouvelle conversation.
        </p>
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
            {pending ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </button>
          {settings.has_api_key && (
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => void save(true)}
            >
              Retirer la clé
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
      setError('Les deux nouveaux mots de passe ne correspondent pas.')
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
      onSessionEnd('Votre compte est mis à jour. Connectez-vous avec vos nouveaux identifiants.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else setError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-content" aria-labelledby="account-title">
      <span className="eyebrow">RÉGLAGES DU SITE</span>
      <h1 id="account-title">
        Admin user<span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">Votre espace commence par vous.</p>
      <form className="settings-card" onSubmit={submit}>
        <div className="card-heading">
          <span className="section-icon">
            <Icon name="user" />
          </span>
          <div>
            <h2>Compte administrateur</h2>
            <p className="muted">Gérez vos identifiants de connexion.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="account-username">Nom d’utilisateur</label>
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
            3 à 64 caractères : lettres, chiffres, point, tiret ou tiret bas.
          </span>
        </div>
        <label className="field">
          Mot de passe actuel
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
          <label htmlFor="account-password">Nouveau mot de passe</label>
          <span className="field-label-note">Facultatif</span>
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
            12 caractères minimum. Laissez vide pour conserver le mot de passe actuel.
          </span>
        </div>
        <label className="field">
          Confirmer le nouveau mot de passe
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
          <p>
            Après une modification, toutes les sessions sont fermées. Vous pourrez vous reconnecter
            avec vos nouveaux identifiants.
          </p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary-button" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Mettre à jour le compte'}
          </button>
        </div>
      </form>
    </section>
  )
}
