import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, ApiError, errorMessage, type Session } from '../admin/api'
import { LoginForm } from '../admin/LoginForm'
import type { DraftMemory, Memory } from '../admin/content/types'
import AdminWorkspace from './AdminWorkspace'
import '../styles/admin.css'

export default function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const memoryRef = useRef<Memory | null>(null)
  const [memory] = useState<DraftMemory>(() => ({
    read: () => memoryRef.current,
    write: (value) => {
      memoryRef.current = value
    },
  }))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const endSession = useCallback((message: string) => {
    setNotice(message)
    setSession(null)
  }, [])

  useEffect(() => {
    document.title = 'Le studio · Administration — Thibault Leveau'
    const controller = new AbortController()
    adminRequest<Session>('/session', { signal: controller.signal })
      .then(setSession)
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) setSession(null)
        else setError(errorMessage(error))
      })
    return () => controller.abort()
  }, [])

  if (error)
    return (
      <div className="admin-unavailable">
        <span className="studio-monogram">
          tl<span>.</span>
        </span>
        <h1>Le studio</h1>
        <p role="alert">{error}</p>
        <div>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
          <a className="text-button" href="/documentation/administration/">
            Guide d’administration
          </a>
          <a className="text-button" href="/">
            Retour au site
          </a>
        </div>
      </div>
    )
  if (session === undefined)
    return (
      <div className="admin-unavailable" role="status">
        Ouverture du studio…
      </div>
    )
  if (session === null) return <LoginForm onLogin={setSession} notice={notice} />
  return <AdminWorkspace session={session} onSessionEnd={endSession} memory={memory} />
}
