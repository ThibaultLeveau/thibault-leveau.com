export interface Session {
  username: string
  csrf_token: string
}
export interface ProviderOption {
  id: string
  name: string
  default_model: string
  docs_url: string
}
export interface ProviderSettings {
  provider: string
  model: string
  has_api_key: boolean
  providers: ProviderOption[]
}
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  source?: string
}
export interface ChatReply {
  message: ChatMessage
  provider: string
  model: string
}

export class ApiError extends Error {
  status: number
  errors: { path: string; message: string; code: string }[]
  constructor(
    status: number,
    message: string,
    errors: { path: string; message: string; code: string }[] = [],
  ) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export async function adminRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    csrf?: string
    signal?: AbortSignal
  } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/admin${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? AbortSignal.timeout(70_000),
    })
  } catch {
    throw new ApiError(0, 'La connexion a été interrompue. Réessayez dans un instant.')
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof data?.detail === 'string'
        ? data.detail
        : 'Une erreur est survenue. Réessayez dans un instant.',
      Array.isArray(data?.errors) ? data.errors : [],
    )
  }
  if (data === null) throw new ApiError(0, 'Réponse du serveur illisible. Rechargez la page.')
  return data as T
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
}
