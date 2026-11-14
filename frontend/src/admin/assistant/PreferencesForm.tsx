import { useEffect, useState, type FormEvent } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from '../content/Dialog'
import type { NavigationGuard } from '../content/types'
import { defaultStyle, families, type Family, type Preferences, type Style } from './types'

const choices = {
  tone: {
    label: 'Ton',
    options: {
      neutral: 'Neutre et professionnel',
      warm: 'Chaleureux',
      direct: 'Direct',
      formal: 'Formel',
    },
  },
  technicality: {
    label: 'Degré de technicité',
    options: { accessible: 'Accessible', balanced: 'Équilibré', expert: 'Expert' },
  },
  detail: {
    label: 'Niveau de détail',
    options: { concise: 'Concis', balanced: 'Équilibré', detailed: 'Détaillé' },
  },
  voice: {
    label: 'Personne narrative',
    options: {
      first_person: 'Première personne',
      third_person: 'Troisième personne',
      impersonal: 'Impersonnel',
    },
  },
} as const

export function PreferencesForm({
  session,
  guardRef,
  onSessionEnd,
}: {
  session: Session
  guardRef: NavigationGuard
  onSessionEnd: (message: string) => void
}) {
  const [saved, setSaved] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState<Preferences | null>(null)
  const [family, setFamily] = useState<Family | 'defaults'>('defaults')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)
  const [leave, setLeave] = useState<{ next: () => void } | null>(null)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  useEffect(() => {
    const controller = new AbortController()
    adminRequest<Preferences>('/assistant/preferences', { signal: controller.signal })
      .then((value) => {
        setSaved(value)
        setDraft(value)
        setError('')
        setSuccess('')
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        if (e instanceof ApiError && e.status === 401)
          onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        else setError(errorMessage(e))
      })
    return () => controller.abort()
  }, [onSessionEnd, reload])
  useEffect(() => {
    guardRef.current = dirty ? (next) => setLeave({ next }) : null
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => {
      guardRef.current = null
      window.removeEventListener('beforeunload', prevent)
    }
  }, [dirty, guardRef])
  const style =
    draft && (family === 'defaults' ? draft.defaults : (draft.overrides[family] ?? draft.defaults))
  function update(value: Partial<Style>) {
    if (!draft || !style) return
    const next = { ...style, ...value }
    setDraft(
      family === 'defaults'
        ? { ...draft, defaults: next }
        : { ...draft, overrides: { ...draft.overrides, [family]: next } },
    )
    setSuccess('')
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setPending(true)
    setError('')
    setSuccess('')
    try {
      const value = await adminRequest<Preferences>('/assistant/preferences', {
        method: 'PUT',
        body: draft,
        csrf: session.csrf_token,
      })
      setDraft(value)
      setSaved(value)
      setSuccess('Vos préférences de rédaction sont enregistrées.')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-content" aria-labelledby="agents-title">
      <span className="eyebrow">RÉGLAGES DU SITE</span>
      <h1 id="agents-title">
        Agents et rédaction<span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">Une voix cohérente, adaptée à chaque contenu.</p>
      {error && (
        <div>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              const load = () => setReload((value) => value + 1)
              if (dirty) setLeave({ next: load })
              else load()
            }}
          >
            Recharger les préférences
          </button>
        </div>
      )}
      {!draft || !style ? (
        !error && <p role="status">Chargement des préférences…</p>
      ) : (
        <form className="settings-card assistant-preferences" onSubmit={save}>
          <div className="field">
            <label htmlFor="agent-family">Personnaliser</label>
            <select
              id="agent-family"
              value={family}
              onChange={(e) => setFamily(e.target.value as Family | 'defaults')}
            >
              <option value="defaults">Tous les contenus</option>
              {Object.entries(families).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {family !== 'defaults' && (
            <p className="field-help">
              {draft.overrides[family]
                ? 'Cette famille utilise ses propres préférences.'
                : 'Cette famille hérite des préférences globales. Modifier un champ crée une personnalisation.'}
            </p>
          )}
          <fieldset disabled={pending}>
            <legend className="sr-only">Préférences de rédaction</legend>
            <div className="assistant-style-grid">
              {Object.entries(choices).map(([key, config]) => (
                <div className="field" key={key}>
                  <label htmlFor={`agent-${key}`}>{config.label}</label>
                  <select
                    id={`agent-${key}`}
                    value={style[key as keyof typeof choices]}
                    onChange={(e) => update({ [key]: e.target.value })}
                  >
                    {Object.entries(config.options).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="agent-language">Langue de rédaction</label>
              <input
                id="agent-language"
                value={style.language}
                maxLength={6}
                pattern="[a-z]{2,3}(-[A-Z]{2})?"
                required
                onChange={(e) => update({ language: e.target.value })}
                aria-describedby="agent-language-help"
              />
              <span id="agent-language-help" className="field-help">
                Code de langue : fr, en, fr-CA…
              </span>
            </div>
            <div className="field">
              <label htmlFor="agent-audience">Public visé</label>
              <input
                id="agent-audience"
                maxLength={300}
                value={style.audience}
                onChange={(e) => update({ audience: e.target.value })}
                placeholder="Par exemple : responsables techniques, recruteurs…"
              />
            </div>
            <div className="field">
              <label htmlFor="agent-instructions">Consignes de rédaction</label>
              <textarea
                id="agent-instructions"
                rows={4}
                maxLength={1500}
                value={style.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
                aria-describedby="agent-instructions-help"
              />
              <span className="field-help" id="agent-instructions-help">
                Vocabulaire préféré, formulations à éviter, style des exemples. Ces consignes
                s’appliquent aux prochaines générations et à leurs spécialistes.
              </span>
            </div>
          </fieldset>
          {success && (
            <p className="form-success" role="status">
              {success}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" disabled={pending || !dirty}>
              {pending ? 'Enregistrement…' : 'Enregistrer les préférences'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => {
                if (family === 'defaults') setDraft({ ...draft, defaults: { ...defaultStyle } })
                else {
                  const overrides = { ...draft.overrides }
                  delete overrides[family]
                  setDraft({ ...draft, overrides })
                }
                setSuccess('')
              }}
            >
              {family === 'defaults' ? 'Réinitialiser le style global' : 'Revenir au style global'}
            </button>
          </div>
        </form>
      )}
      {leave && (
        <Dialog title="Préférences non enregistrées" onClose={() => setLeave(null)}>
          <p>Vos changements de rédaction ne sont pas encore enregistrés.</p>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => setLeave(null)}>
              Rester
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const next = leave.next
                setLeave(null)
                guardRef.current = null
                next()
              }}
            >
              Abandonner les changements
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
