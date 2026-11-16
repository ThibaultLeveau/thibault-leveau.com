import { t } from '../../i18n'

export function UnmatchedTranslations({
  texts,
}: {
  texts?: { path: string; value: string }[]
}) {
  if (!texts?.length) return null
  return (
    <details className="unmatched-translations">
      <summary>{t('variants.unmatchedTitle')}</summary>
      <p>{t('variants.unmatchedHint')}</p>
      <ul>
        {texts.map(({ path, value }) => (
          <li key={path}>{value}</li>
        ))}
      </ul>
    </details>
  )
}
