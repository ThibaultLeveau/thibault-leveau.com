import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const failures = []
const names = new Set(['tl', 'Thibault Leveau', 'M']) // Site and provider marks.
const attributes = new Set([
  'title',
  'aria-label',
  'alt',
  'placeholder',
  'label',
  'link',
  'eyebrow',
  'description',
  'parent',
])
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'i18n') walk(file)
      continue
    }
    if (!/\.tsx?$/.test(file)) continue
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const report = (node, text) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      failures.push(
        `${path.relative(root, file)}:${line}: extract UI text into a catalog: ${text}`,
      )
    }
    function visit(node) {
      if (ts.isJsxText(node)) {
        const value = node.text.replace(/\s+/g, ' ').trim()
        const autonym =
          file.endsWith('/LanguageForm.tsx') && ['Français', 'English'].includes(value)
        if (/[\p{L}]/u.test(value) && !names.has(value) && !autonym) report(node, value)
      }
      if (
        ts.isJsxAttribute(node) &&
        attributes.has(node.name.text) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[\p{L}]/u.test(node.initializer.text)
      ) {
        report(node, node.initializer.text)
      }
      // French prose inside expressions (including templates) must be explicit catalog text.
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        if (/[éèàùêîôâçœÉÀ’]/.test(node.text)) report(node, node.text)
        let parent = node.parent
        while (
          parent &&
          !ts.isJsxExpression(parent) &&
          !ts.isJsxAttribute(parent) &&
          !ts.isCallExpression(parent) &&
          !ts.isBinaryExpression(parent)
        )
          parent = parent.parent
        if (
          parent &&
          ts.isJsxExpression(parent) &&
          /[\p{L}]/u.test(node.text) &&
          !names.has(node.text)
        ) {
          const attribute = parent.parent
          if (!ts.isJsxAttribute(attribute) || attributes.has(attribute.name.text))
            report(node, node.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}
walk(root)
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n')
  process.exitCode = 1
} else {
  process.stdout.write('Interface text extraction: passed\n')
}
