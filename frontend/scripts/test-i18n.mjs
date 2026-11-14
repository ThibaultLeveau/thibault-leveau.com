import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { createInstance } from 'i18next'

const resources = Object.fromEntries(
  ['fr', 'en'].map((lang) => [
    lang,
    {
      translation: JSON.parse(
        fs.readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
      ),
    },
  ]),
)

test('catalog plurals and number interpolation follow each interface language', async () => {
  const instance = createInstance()
  await instance.init({ resources, lng: 'en', fallbackLng: 'fr', keySeparator: false })
  for (const [lng, count, expected] of [
    ['en', 0, '0 items'],
    ['en', 1, '1 item'],
    ['en', 2, '2 items'],
    ['en', 1000000, '1,000,000 items'],
    ['fr', 0, '0 contenu'],
    ['fr', 1, '1 contenu'],
    ['fr', 2, '2 contenus'],
    ['fr', 1000000, '1\u202f000\u202f000 contenus'],
  ]) {
    assert.equal(instance.t('public.resultCount', { lng, count }), expected)
  }
  assert.equal(
    instance.t('public.searchCount', { lng: 'en', count: 1, query: 'Atlas' }),
    '1 item for “Atlas”',
  )
  assert.equal(instance.t('public.pageOf', { lng: 'en', page: 2, total: 10 }), 'Page 2 of 10')
  assert.equal(instance.t('public.pageOf', { lng: 'fr', page: 2, total: 10 }), 'Page 2 sur 10')
  // Every plural message has a usable form for zero, one, several and a million.
  const bases = new Set(
    Object.keys(resources.en.translation)
      .filter((key) => key.endsWith('_one'))
      .map((key) => key.slice(0, -4)),
  )
  for (const lng of ['fr', 'en'])
    for (const key of bases)
      for (const count of [0, 1, 2, 1000000]) {
        assert.notEqual(instance.t(key, { lng, count, query: 'Atlas' }), key)
        assert.doesNotMatch(instance.t(key, { lng, count, query: 'Atlas' }), /\{\{|undefined/)
      }
})
