import { t } from '../../i18n'
import { fieldId } from './Fields'
import type { Draft, LocalizationField, Row } from './types'

export function TranslationFields({
  fields,
  draft,
  onChange,
}: {
  fields: LocalizationField[]
  draft: Draft
  onChange: (value: Draft) => void
}) {
  return (
    <>
      {fields.map((field) => {
        const [name, index, child] = field.path.split('.')
        const value = child ? (draft[name] as Row[])[Number(index)][child] : draft[name]
        return (
          <div className="content-field translation-field" key={field.path}>
            <label htmlFor={fieldId(field.path)}>
              {field.label}
              {child ? ` · ${Number(index) + 1}` : ''}
            </label>
            <details>
              <summary>{t('variants.sourceText')}</summary>
              <p>{field.source || t('common.notProvided')}</p>
            </details>
            {!field.translated && field.source && (
              <p className="field-help">{t('variants.sourceFallback')}</p>
            )}
            <textarea
              id={fieldId(field.path)}
              value={String(value ?? '')}
              maxLength={field.max_length}
              rows={field.max_length > 500 ? 6 : 2}
              onChange={(event) => {
                const next = structuredClone(draft)
                if (child)
                  (next[name] as Row[])[Number(index)][child] = event.target.value
                else next[name] = event.target.value
                onChange(next)
              }}
            />
          </div>
        )
      })}
    </>
  )
}
