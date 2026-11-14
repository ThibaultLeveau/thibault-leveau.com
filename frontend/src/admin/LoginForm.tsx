import { t } from '../i18n'
import { useState, type FormEvent } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import { adminRequest, errorMessage, type Session } from './api'
import { Icon } from './Icon'

export function LoginForm({
  onLogin,
  notice,
}: {
  onLogin: (session: Session) => void
  notice: string
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const session = await adminRequest<Session>('/login', {
        method: 'POST',
        body: { username: form.get('username'), password: form.get('password') },
      })
      onLogin(session)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="admin-login">
      <header className="login-header">
        <a href="/" className="studio-brand">
          <span className="studio-monogram">
            tl<span>.</span>
          </span>
          <span>Thibault Leveau</span>
        </a>
        <ThemeToggle />
      </header>
      <main id="contenu" className="login-main">
        <div className="login-intro">
          <span className="eyebrow">{t('login.eyebrow')}</span>
          <h1>
            {t('login.welcome')}
            <br />
            {t('login.studio')}
            <span className="accent-dot">.</span>
          </h1>
          <p>
            {t('login.introStart')}
            <br />
            {t('login.introEnd')}
          </p>
          <div className="login-ornament" aria-hidden="true">
            <Icon name="sparkles" size={56} />
          </div>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <span className="section-icon">
            <Icon name="lock" />
          </span>
          <h2 id="login-title">{t('login.title')}</h2>
          <p className="muted">{t('login.subtitle')}</p>
          {notice && (
            <p className="form-success" role="status">
              {notice}
            </p>
          )}
          <form onSubmit={submit}>
            <label className="field">
              {t('account.username')}
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={64}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              {t('account.password')}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button login-submit" disabled={pending}>
              {pending ? t('login.pending') : t('login.submit')}
              <Icon name="chevron" size={17} />
            </button>
          </form>
          <p className="login-footnote">
            <Icon name="lock" size={13} /> {t('login.restricted')}
          </p>
        </section>
      </main>
      <footer className="login-footer">
        Thibault Leveau <span>{t('login.aside')}</span>
      </footer>
    </div>
  )
}
