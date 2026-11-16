import { useEffect, useState, type FormEvent } from 'react'
import { changeLanguage, isLanguage, loadLanguage, t, type Language } from '../i18n'
import { adminRequest, ApiError, errorMessage, type Session } from './api'
import { Dialog } from './content/Dialog'
import type { NavigationGuard } from './content/types'
import { Icon } from './Icon'

export interface LanguageSettings {
  public_language: Language
  admin_language: Language
  version: number
}

export function LanguageForm({
  session,
  guardRef,
  onSessionEnd,
}: {
  session: Session
  guardRef: NavigationGuard
  onSessionEnd: (message: string) => void
}) {
  const [saved, setSaved] = useState<LanguageSettings | null>(null)
  const [draft, setDraft] = useState<LanguageSettings | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [reload, setReload] = useState(0)
  const [leave, setLeave] = useState<{ next: () => void } | null>(null)
  const dirty =
    saved?.public_language !== draft?.public_language ||
    saved?.admin_language !== draft?.admin_language

  useEffect(() => {
    const abort = new AbortController()
    adminRequest<LanguageSettings>('/languages', { signal: abort.signal })
      .then((value) => {
        setSaved(value)
        setDraft(value)
        setError('')
        setSuccess(false)
      })
      .catch((e) => {
        if (abort.signal.aborted) return
        if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
        else setError(errorMessage(e))
      })
    return () => abort.abort()
  }, [reload, onSessionEnd])

  useEffect(() => {
    guardRef.current = dirty || pending ? (next) => setLeave({ next }) : null
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || pending) event.preventDefault()
    }
    window.addEventListener('beforeunload', prevent)
    return () => {
      guardRef.current = null
      window.removeEventListener('beforeunload', prevent)
    }
  }, [dirty, pending, guardRef])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || pending) return
    setPending(true)
    setError('')
    setSuccess(false)
    try {
      // A failed asset download must not persist a setting the current tab
      // cannot apply. Loading the catalog leaves the active language unchanged.
      await loadLanguage(draft.admin_language)
      const value = await adminRequest<LanguageSettings>('/languages', {
        method: 'PUT',
        body: draft,
        csrf: session.csrf_token,
      })
      setSaved(value)
      setDraft(value)
      await changeLanguage(value.admin_language)
      setSuccess(true)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionEnd(t('session.expired'))
      else setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="settings-content" aria-labelledby="languages-title">
      <span className="eyebrow">{t('settings.eyebrow')}</span>
      <h1 id="languages-title">
        {t('languages.title')}
        <span className="accent-dot">.</span>
      </h1>
      <p className="settings-lead">{t('languages.subtitle')}</p>
      {!draft && !error && <p role="status">{t('languages.loading')}</p>}
      {draft && (
        <form className="settings-card language-settings" onSubmit={save}>
          <div className="card-heading language-heading">
            <span className="section-icon">
              <Icon name="language" />
            </span>
            <p>{t('languages.description')}</p>
          </div>
          <fieldset disabled={pending} className="language-fields">
            <legend className="sr-only">{t('languages.title')}</legend>
            {(['public', 'admin'] as const).map((area) => (
              <div className="field" key={area}>
                <label htmlFor={`language-${area}`}>{t(`languages.${area}`)}</label>
                <select
                  id={`language-${area}`}
                  name={`${area}_language`}
                  value={draft[`${area}_language`]}
                  aria-describedby={`language-${area}-help`}
                  onChange={(event) => {
                    const value = event.target.value
                    if (isLanguage(value)) {
                      setDraft({ ...draft, [`${area}_language`]: value })
                      setSuccess(false)
                    }
                  }}
                >
                  <option value="fr" lang="fr">
                    Français
                  </option>
                  <option value="en" lang="en">
                    English
                  </option>
                </select>
                <span className="field-help" id={`language-${area}-help`}>
                  {t(`languages.${area}Hint`)}
                </span>
              </div>
            ))}
          </fieldset>
          <p className="settings-note">{t('languages.contentHint')}</p>
          {success && (
            <p className="form-success" role="status">
              <Icon name="check" size={16} />
              {t('languages.saved')}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" disabled={pending || !dirty}>
              {pending ? t('common.saving') : t('languages.save')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="workspace-error">
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={pending}
            onClick={() => {
              const next = () => setReload((value) => value + 1)
              if (dirty) setLeave({ next })
              else next()
            }}
          >
            {t('languages.reload')}
          </button>
        </div>
      )}
      {leave && (
        <Dialog title={t('languages.unsaved')} onClose={() => setLeave(null)}>
          <p>{t('languages.unsavedHint')}</p>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => setLeave(null)}>
              {t('common.stay')}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={pending}
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
