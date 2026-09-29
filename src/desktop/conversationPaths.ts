// Keep local Markdown destinations visible and route them through Explorer.
export function localPath(value: string): string | null {
  if (!value || value.startsWith('#')) return null
  let result = value
  if (/^file:\/\//i.test(result)) {
    result = result.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '//')
  } else if (/^[a-z][a-z\d+.-]*:/i.test(result) && !/^[a-z]:[\\/]/i.test(result)) return null
  try { result = decodeURIComponent(result) } catch { /* Preserve literal percent characters. */ }
  return result.replace(/(?::\d+(?::\d+)?|#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)$/, '')
}

type Node = { type: string; value?: string; url?: string; children?: Node[] }
const pathLike = /^(?:[a-z]:[\\/]|\.{1,2}[\\/]|[\\/]|[\w.-]+[\\/])[\s\S]+$/i
// Recognize unquoted paths without spaces; paths with spaces can use inline code
// or a Markdown link. Never rewrite code blocks or existing links.
export function remarkFilePaths() {
  return (tree: Node) => {
    function walk(node: Node) {
      if (!node.children || ['link', 'linkReference', 'code', 'html'].includes(node.type)) return
      node.children = node.children.flatMap(child => {
        if (child.type === 'inlineCode' && child.value && pathLike.test(child.value) && localPath(child.value)) {
          return [{ type: 'link', url: child.value, children: [child] }]
        }
        if (child.type === 'text' && child.value) {
          const parts: Node[] = []; let end = 0
          const pattern = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\w.-]+\/)[^\s<>"`]*[\w]/g
          for (const match of child.value.matchAll(pattern)) {
            const start = match.index!
            if (start && !/[\s(]/.test(child.value[start - 1])) continue
            if (!localPath(match[0]) || !/[\\/]/.test(match[0])) continue
            parts.push({ type: 'text', value: child.value.slice(end, start) }, { type: 'link', url: match[0], children: [{ type: 'text', value: match[0] }] })
            end = start + match[0].length
          }
          if (end) return [...parts, { type: 'text', value: child.value.slice(end) }]
        }
        walk(child); return [child]
      })
    }
    walk(tree)
  }
}
