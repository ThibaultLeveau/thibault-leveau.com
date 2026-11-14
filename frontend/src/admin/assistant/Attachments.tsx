import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage, type Session } from '../api'
import { ReferencePicker } from '../content/ReferencePicker'
import type { Collection, Item } from '../content/types'
import { uploadFile } from '../content/upload'

export function Attachments({
  items,
  onChange,
  session,
  disabled,
  onBusy,
  onSessionEnd,
  onOpen,
}: {
  items: Item[]
  onChange: (items: Item[]) => void
  session: Session
  disabled: boolean
  onBusy: (busy: boolean) => void
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function upload(file: File) {
    controller.current = new AbortController()
    setProgress(0)
    onBusy(true)
    setError('')
    try {
      const result = await uploadFile(
        file,
        session.csrf_token,
        setProgress,
        controller.current.signal,
      )
      onChange([
        ...items,
        {
          id: result.id,
          kind: 'media',
          title: String(result.entry.title),
          status: result.status,
          visibility: 'private',
        },
      ])
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        onSessionEnd('Votre session a expiré. Reconnectez-vous.')
      else setError(errorMessage(e))
    } finally {
      setProgress(null)
      onBusy(false)
    }
  }
  return (
    <details className="assistant-attachments">
      <summary>Médias de la demande {items.length ? `· ${items.length}` : ''}</summary>
      <p className="field-help">
        Ajoutez les fichiers à la médiathèque, puis décrivez leur contenu dans le message. Seules
        leurs métadonnées sont transmises au modèle.
      </p>
      <fieldset disabled={disabled || progress !== null || items.length >= 10}>
        <legend className="sr-only">Ajouter un média</legend>
        <ReferencePicker
          target="media"
          value={null}
          label="Choisir dans la médiathèque"
          id="assistant-media"
          session={session}
          onOpen={onOpen}
          onSessionEnd={onSessionEnd}
          onChange={(id, item) => {
            if (id && item && !items.some((m) => m.id === id)) onChange([...items, item])
          }}
        />
        <label className="secondary-button upload-label">
          Téléverser un fichier
          <input
            type="file"
            aria-label="Téléverser un fichier pour la demande"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.webm"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </label>
      </fieldset>
      {progress !== null && (
        <div role="status">
          Téléversement : {progress} %{' '}
          <button type="button" className="text-button" onClick={() => controller.current?.abort()}>
            Annuler le téléversement
          </button>
        </div>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.title}
              <button
                type="button"
                className="text-button"
                disabled={disabled || progress !== null}
                onClick={() => onChange(items.filter((m) => m.id !== item.id))}
                aria-label={`Retirer ${item.title} de la demande`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
