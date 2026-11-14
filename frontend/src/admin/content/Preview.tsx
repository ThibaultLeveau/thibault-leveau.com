import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { adminRequest } from '../api'
import { Dialog } from './Dialog'
import {
  optionLabels,
  safeHref,
  type ContentRecord,
  type Draft,
  type FieldSchema,
  type Item,
  type Row,
} from './types'

export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="content-prose">
      <Markdown
        skipHtml
        urlTransform={(url) => safeHref(url) ?? ''}
        components={{
          img: ({ alt }) => (
            <span>{alt ? `[Image : ${alt}]` : '[Image distante non chargée]'}</span>
          ),
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel="noreferrer" target="_blank">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

function PreviewMedia({ row }: { row: Row }) {
  const [media, setMedia] = useState<ContentRecord | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    adminRequest<ContentRecord>(`/content/media/${row.id}`, { signal: controller.signal })
      .then(setMedia)
      .catch(() => {
        /* The surrounding preview remains readable. */
      })
    return () => controller.abort()
  }, [row.id])
  if (!media || media.entry.visibility !== 'public' || row.role === 'private_proof') return null
  const url = media.file
    ? `/api/admin/content/media/${media.id}/file`
    : safeHref(String(media.entry.external_url))
  return (
    <figure>
      {media.file && media.entry.nature === 'image' ? (
        <img src={url} alt={row.decorative ? '' : String(row.alt ?? '')} />
      ) : media.file && media.entry.nature === 'video' ? (
        <video controls src={url} preload="metadata">
          <a href={url}>Télécharger la vidéo</a>
        </video>
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          {String(media.entry.title)}
        </a>
      )}
      {row.caption && <figcaption>{String(row.caption)}</figcaption>}
      {media.entry.credit && <small>{String(media.entry.credit)}</small>}
      {row.transcript && (
        <details>
          <summary>Transcription</summary>
          <p>{String(row.transcript)}</p>
        </details>
      )}
    </figure>
  )
}

export function Preview({
  draft,
  schema,
  references,
  onClose,
}: {
  draft: Draft
  schema: FieldSchema
  references: Record<number, Item>
  onClose: () => void
}) {
  const hidden = new Set([
    'title',
    'summary',
    'body',
    'private_notes',
    'consent_note',
    'slug',
    'visibility',
    'sort_order',
    'featured',
    'seo_title',
    'seo_description',
    'canonical_url',
    'source',
    'language',
    'media',
  ])
  const readingTime = Math.max(
    1,
    Math.ceil(
      String(draft.body ?? '')
        .trim()
        .split(/\s+/).length / 200,
    ),
  )
  return (
    <Dialog title="Aperçu de présentation" onClose={onClose}>
      <p className="muted">
        Prévisualisation privée · aucune publication. Notes privées, justificatifs et références
        confidentielles exclus.
      </p>
      <article className="entry-preview">
        <h1>{String(draft.title || 'Sans titre')}</h1>
        <p className="preview-lead">{String(draft.summary ?? '')}</p>
        {draft.body && (
          <>
            <p className="muted">Lecture estimée : {readingTime} min</p>
            <SafeMarkdown text={String(draft.body)} />
          </>
        )}
        {Object.entries(draft)
          .filter(
            ([name, value]) =>
              !hidden.has(name) && value !== '' && value !== null && value !== false,
          )
          .map(([name, value]) => {
            const field = schema.properties?.[name]
            if (!field) return null
            if (field.target && !Array.isArray(value)) {
              const ref = references[Number(value)]
              return ref?.visibility === 'public' ? (
                <p key={name}>
                  <strong>{field.title}</strong> · {ref.title}
                </p>
              ) : null
            }
            if (Array.isArray(value)) {
              const rows = value.filter(
                (row) =>
                  (!row.id || references[Number(row.id)]?.visibility === 'public') &&
                  Object.values(row).some(Boolean),
              )
              if (!rows.length) return null
              return (
                <section key={name}>
                  <h2>{field.title}</h2>
                  <ul>
                    {rows.map((row, index) => (
                      <li key={index}>
                        {row.id && <strong>{references[Number(row.id)]?.title} · </strong>}
                        {Object.entries(row)
                          .filter(
                            ([key, v]) => key !== 'id' && v !== '' && v !== null && v !== false,
                          )
                          .map(([key, v]) => (
                            <span key={key}>
                              {key.endsWith('url') || key === 'url' ? (
                                safeHref(String(v)) ? (
                                  <a href={safeHref(String(v))} target="_blank" rel="noreferrer">
                                    {String(v)}
                                  </a>
                                ) : (
                                  String(v)
                                )
                              ) : (
                                (optionLabels[String(v)] ?? String(v))
                              )}{' '}
                            </span>
                          ))}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            }
            return (
              <section key={name}>
                <h2>{field.title}</h2>
                {field.widget === 'url' ? (
                  <a href={safeHref(String(value), true)} target="_blank" rel="noreferrer">
                    {String(value)}
                  </a>
                ) : (
                  <p>{value === true ? 'Oui' : (optionLabels[String(value)] ?? String(value))}</p>
                )}
              </section>
            )
          })}
        {Array.isArray(draft.media) &&
          draft.media
            .filter(
              (row) =>
                row.role !== 'private_proof' && references[Number(row.id)]?.visibility === 'public',
            )
            .map((row) => <PreviewMedia key={Number(row.id)} row={row} />)}
      </article>
    </Dialog>
  )
}
