import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import { safeLink } from './content'

interface MarkdownNode {
  type: string
  value?: string
  alt?: string
  children?: MarkdownNode[]
  data?: { hProperties?: { id?: string } }
}

// Both the article and its outline use the same Markdown tree and heading IDs.
// Assignment happens in the parser, not during React rendering (including StrictMode).
function headingIds(prefix: string) {
  return () => (tree: MarkdownNode) => {
    const counts = new Map<string, number>()
    const text = (node: MarkdownNode): string =>
      node.type === 'html'
        ? ''
        : node.value || node.alt || node.children?.map(text).join('') || ''
    function walk(node: MarkdownNode) {
      if (node.type === 'heading') {
        const slug =
          text(node)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'section'
        const n = counts.get(slug) || 0
        counts.set(slug, n + 1)
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id: `${prefix}-${slug}${n ? `-${n}` : ''}`,
          },
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

export function ReadingContents({ value }: { value: string }) {
  const heading = ({ id, children }: { id?: string; children?: ReactNode }) => (
    <a href={`#${id}`}>{children}</a>
  )
  return (
    <div className="reading-headings">
      <Markdown
        skipHtml
        remarkPlugins={[headingIds('texte')]}
        allowedElements={[
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'em',
          'strong',
          'code',
          'a',
        ]}
        components={{
          h1: heading,
          h2: heading,
          h3: heading,
          h4: heading,
          h5: heading,
          h6: heading,
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {value}
      </Markdown>
    </div>
  )
}

export function Reading({
  value,
  prefix = 'texte',
}: {
  value: string
  prefix?: string
}) {
  return (
    <div className="public-prose">
      <Markdown
        skipHtml
        remarkPlugins={[headingIds(prefix)]}
        urlTransform={(url) =>
          url.startsWith('#') ? url : safeLink(url) || ''
        }
        components={{
          h1: ({ id, children }) => <h2 id={id}>{children}</h2>,
          img: ({ alt }) => (
            <span className="markdown-image-note">{alt || 'Illustration'}</span>
          ),
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel="noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          pre: ({ children }) => (
            <pre tabIndex={0} aria-label="Extrait de code">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="reading-table" tabIndex={0} aria-label="Tableau">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {value}
      </Markdown>
    </div>
  )
}
