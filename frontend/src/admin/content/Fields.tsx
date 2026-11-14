import type { Session } from '../api'
import { ReferencePicker } from './ReferencePicker'
import {
  defaults,
  optionLabels,
  resolve,
  type Collection,
  type Draft,
  type FieldError,
  type FieldSchema,
  type Item,
  type Row,
  type Value,
} from './types'

export function fieldId(path: string) {
  return `content-${path.replaceAll('.', '-')}`
}

interface Props {
  name: string
  schema: FieldSchema
  root: FieldSchema
  value: Value
  onChange: (value: Value) => void
  errors: FieldError[]
  references: Record<number, Item>
  session: Session
  onReference: (item: Item) => void
  onSessionEnd: (message: string) => void
  onOpen: (kind: Collection, id: number) => void
  disabled?: boolean
}

export function FieldControl(props: Props) {
  const { name, schema, root, value, onChange, errors, disabled } = props
  const f = resolve(schema, root)
  const id = fieldId(name)
  const ownErrors = errors.filter((e) => e.path === name)
  const errorId = ownErrors.length ? `${id}-error` : undefined
  const helpId =
    f.widget === 'date' || f.widget === 'markdown' || f.maxLength ? `${id}-help` : undefined
  const shared = {
    id,
    disabled,
    'aria-invalid': ownErrors.length ? (true as const) : undefined,
    'aria-describedby': [errorId, helpId].filter(Boolean).join(' ') || undefined,
  }
  const label = f.title ?? name
  const error = ownErrors.length > 0 && (
    <span className="field-error" id={errorId}>
      {ownErrors.map((e) => e.message).join(' ')}
    </span>
  )
  if (f.type === 'array') {
    const items = Array.isArray(value) ? value : []
    const child = resolve(f.items!, root)
    function move(index: number, offset: number) {
      const next = [...items]
      ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
      onChange(next)
      requestAnimationFrame(() =>
        document.getElementById(`${id}-${index + offset}-move${offset}`)?.focus(),
      )
    }
    return (
      <fieldset
        className="repeat-field"
        disabled={disabled}
        id={id}
        tabIndex={-1}
        aria-describedby={errorId}
      >
        <legend>
          {label} <span>{items.length ? `· ${items.length}` : '· facultatif en brouillon'}</span>
        </legend>
        {error}
        {items.map((row, index) => (
          <div className="repeat-row" key={index}>
            <div className="repeat-row-heading">
              <span>
                {label} · {index + 1}
              </span>
              <div>
                <button
                  type="button"
                  className="icon-button"
                  id={`${id}-${index}-move-1`}
                  disabled={disabled || index === 0}
                  aria-label={`Monter ${label}, ligne ${index + 1}`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  id={`${id}-${index}-move1`}
                  disabled={disabled || index === items.length - 1}
                  aria-label={`Descendre ${label}, ligne ${index + 1}`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Retirer ${label}, ligne ${index + 1}`}
                  onClick={() => {
                    onChange(items.filter((_, i) => i !== index))
                    requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus())
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="content-fields">
              {Object.entries(child.properties ?? {}).map(([key, item]) => (
                <FieldControl
                  key={key}
                  {...props}
                  schema={
                    key === 'id' && f.target
                      ? { type: 'integer', target: f.target, title: `Choisir · ${label}` }
                      : item
                  }
                  name={`${name}.${index}.${key}`}
                  value={row[key]}
                  onChange={(next) =>
                    onChange(
                      items.map((r, i) => (i === index ? ({ ...r, [key]: next } as Row) : r)),
                    )
                  }
                />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="secondary-button"
          id={`${id}-add`}
          disabled={disabled || items.length >= 100}
          onClick={() => {
            onChange([...items, defaults(child, root) as Row])
            requestAnimationFrame(() =>
              document
                .getElementById(
                  fieldId(`${name}.${items.length}.${Object.keys(child.properties ?? {})[0]}`),
                )
                ?.focus(),
            )
          }}
        >
          + Ajouter · {label}
        </button>
        {items.length >= 100 && <p className="muted">Limite de 100 lignes atteinte.</p>}
      </fieldset>
    )
  }
  if (f.type === 'boolean')
    return (
      <div className="content-field">
        <label className="content-checkbox">
          <input
            {...shared}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
        {error}
      </div>
    )
  return (
    <div
      className={`content-field ${f.widget === 'textarea' || f.widget === 'markdown' || f.target ? 'field-wide' : ''}`}
    >
      <label htmlFor={id}>
        {label}
        {f.minLength ? <span className="required-note"> · requis</span> : null}
      </label>
      {f.target ? (
        <ReferencePicker
          target={f.target}
          value={typeof value === 'number' ? value : null}
          label={label}
          id={id}
          selected={typeof value === 'number' ? props.references[value] : undefined}
          session={props.session}
          onChange={(next, selected) => {
            onChange(next)
            if (selected) props.onReference(selected)
          }}
          onOpen={props.onOpen}
          onSessionEnd={props.onSessionEnd}
          invalid={ownErrors.length > 0}
        />
      ) : f.enum ? (
        <select {...shared} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {f.enum.map((option) => (
            <option key={option} value={option}>
              {option ? (optionLabels[option] ?? option) : 'À renseigner'}
            </option>
          ))}
        </select>
      ) : f.widget === 'textarea' || f.widget === 'markdown' ? (
        <textarea
          {...shared}
          className={f.widget === 'markdown' ? 'markdown-input' : ''}
          value={String(value ?? '')}
          rows={f.widget === 'markdown' ? 9 : 4}
          maxLength={f.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...shared}
          type={f.type === 'integer' ? 'number' : 'text'}
          inputMode={f.widget === 'url' ? 'url' : undefined}
          autoComplete="off"
          value={String(value ?? '')}
          min={f.minimum}
          max={f.maximum}
          maxLength={f.maxLength}
          placeholder={f.widget === 'date' ? '2024 ou 2024-06 ou 2024-06-15' : undefined}
          onChange={(e) =>
            onChange(
              f.type === 'integer'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
      {helpId && (
        <span className="field-help" id={helpId}>
          {f.widget === 'date'
            ? 'Conservez la précision connue ; ne complétez pas une date au hasard.'
            : f.widget === 'markdown'
              ? 'Markdown : titres, listes et liens. Le HTML et les images distantes ne sont pas exécutés dans l’aperçu.'
              : `${f.maxLength?.toLocaleString('fr-FR')} caractères maximum`}
        </span>
      )}
      {error}
    </div>
  )
}

export function sectionFields(
  schema: FieldSchema,
  section: string,
  kind: Collection,
  draft: Draft,
) {
  const priority = [
    'title',
    'slug',
    'nature',
    'phase',
    'summary',
    'body',
    'language',
    'start_date',
    'end_date',
    'ongoing',
    'date_note',
    'role',
    'authority',
    'team_size',
    'team',
    'responsibilities',
    'actions',
    'deliverables',
    'outcomes',
    'metrics',
    'skills',
    'technologies',
  ]
  return Object.entries(schema.properties ?? {})
    .filter(([name, f]) => {
      if ((f.section ?? 'essential') !== section) return false
      if (kind === 'profiles' && name === 'slug') return false
      if (
        kind === 'media' &&
        (name === 'media' ||
          name === 'source' ||
          (draft.source === 'file' && (name === 'external_url' || name === 'nature')))
      )
        return false
      return true
    })
    .sort(
      ([a], [b]) =>
        (priority.indexOf(a) < 0 ? 100 : priority.indexOf(a)) -
        (priority.indexOf(b) < 0 ? 100 : priority.indexOf(b)),
    )
}
