import { ApiError } from '../api'
import type { ContentRecord } from './types'

export function uploadFile(
  file: File,
  csrf: string,
  onProgress: (value: number) => void,
  signal: AbortSignal,
): Promise<ContentRecord> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const mime =
      file.type ||
      (
        {
          pdf: 'application/pdf',
          mp4: 'video/mp4',
          webm: 'video/webm',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
        } as Record<string, string>
      )[file.name.split('.').pop()?.toLowerCase() ?? ''] ||
      'application/octet-stream'
    request.open(
      'POST',
      `/api/admin/content/media/upload?filename=${encodeURIComponent(file.name)}`,
    )
    request.setRequestHeader('Content-Type', mime)
    request.setRequestHeader('X-CSRF-Token', csrf)
    request.timeout = 300_000
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () => {
      let data: { detail?: string; errors?: ApiError['errors'] } & ContentRecord
      try {
        data = JSON.parse(request.responseText)
      } catch {
        reject(new ApiError(0, 'Réponse du serveur illisible.'))
        return
      }
      if (request.status >= 200 && request.status < 300) resolve(data)
      else reject(new ApiError(request.status, data.detail ?? 'Téléversement refusé.', data.errors))
    }
    request.onerror = () =>
      reject(new ApiError(0, 'Connexion interrompue. Réessayez le téléversement.'))
    request.ontimeout = () => reject(new ApiError(0, 'Le téléversement a dépassé cinq minutes.'))
    request.onabort = () => reject(new ApiError(0, 'Téléversement annulé.'))
    signal.addEventListener('abort', () => request.abort(), { once: true })
    request.send(file)
  })
}
