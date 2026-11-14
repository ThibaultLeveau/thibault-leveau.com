import { t } from '../../i18n'
import { useEffect, useState, type FormEvent } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../api'
import { Dialog } from '../content/Dialog'
import type { NavigationGuard } from '../content/types'
import { defaultStyle, getFamilies, type Family, type Preferences, type Style } from './types'

function getChoices() {
  return {
    tone: {
      label: t('preferences.tone'),
      options: {
        neutral: t('preferences.neutral'),
        warm: t('preferences.warm'),
        direct: t('preferences.direct'),
        formal: t('preferences.formal'),
      },
    },
    technicality: {
      label: t('preferences.technicality'),
      options: {
        accessible: t('preferences.accessible'),
        balanced: t('preferences.balanced'),
        expert: t('preferences.expert'),
      },
    },
    detail: {
      label: t('preferences.detail'),
      options: {
        concise: t('preferences.concise'),
        balanced: t('preferences.balanced'),
        detailed: t('preferences.detailed'),
      },
    },
    voice: {
      label: t('preferences.person'),
      options: {
        first_person: t('preferences.firstPerson'),
        third_person: t('preferences.thirdPerson'),
        impersonal: t('preferences.impersonal'),
      },
    },
  } as const
}

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
        if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
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
    draft &&
    (family === 'defaults' ? draft.defaults : (draft.overrides[family] ?? draft.defaults))
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
      setSuccess(t('preferences.saved'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
      else setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-content" aria-labelledby="agents-title">
      <span className="eyebrow">{t('settings.eyebrow')}</span>
      <h1 id="agents-title">
        {t('preferences.title')}
        <span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">{t('preferences.subtitle')}</p>
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
            {t('preferences.reload')}
          </button>
        </div>
      )}
      {!draft || !style ? (
        !error && <p role="status">{t('preferences.loading')}</p>
      ) : (
        <form className="settings-card assistant-preferences" onSubmit={save}>
          <div className="field">
            <label htmlFor="agent-family">{t('preferences.customize')}</label>
            <select
              id="agent-family"
              value={family}
              onChange={(e) => setFamily(e.target.value as Family | 'defaults')}
            >
              <option value="defaults">{t('preferences.all')}</option>
              {Object.entries(getFamilies()).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {family !== 'defaults' && (
            <p className="field-help">
              {draft.overrides[family]
                ? t('preferences.customized')
                : t('preferences.inherited')}
            </p>
          )}
          <fieldset disabled={pending}>
            <legend className="sr-only">{t('preferences.formTitle')}</legend>
            <div className="assistant-style-grid">
              {Object.entries(getChoices()).map(([key, config]) => (
                <div className="field" key={key}>
                  <label htmlFor={`agent-${key}`}>{config.label}</label>
                  <select
                    id={`agent-${key}`}
                    value={style[key as keyof ReturnType<typeof getChoices>]}
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
              <label htmlFor="agent-language">{t('preferences.language')}</label>
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
                {t('preferences.languageHint')}
              </span>
            </div>
            <div className="field">
              <label htmlFor="agent-audience">{t('preferences.audience')}</label>
              <input
                id="agent-audience"
                maxLength={300}
                value={style.audience}
                onChange={(e) => update({ audience: e.target.value })}
                placeholder={t('preferences.audiencePlaceholder')}
              />
            </div>
            <div className="field">
              <label htmlFor="agent-instructions">{t('preferences.instructions')}</label>
              <textarea
                id="agent-instructions"
                rows={4}
                maxLength={1500}
                value={style.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
                aria-describedby="agent-instructions-help"
              />
              <span className="field-help" id="agent-instructions-help">
                {t('preferences.instructionsHint')}
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
              {pending ? t('common.saving') : t('preferences.save')}
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
              {family === 'defaults' ? t('preferences.reset') : t('preferences.inherit')}
            </button>
          </div>
        </form>
      )}
      {leave && (
        <Dialog title={t('preferences.unsavedTitle')} onClose={() => setLeave(null)}>
          <p>{t('preferences.unsavedDescription')}</p>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => setLeave(null)}>
              {t('common.stay')}
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
              {t('common.discardChanges')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
