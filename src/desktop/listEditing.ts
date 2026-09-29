/** Return a replacement for Enter at the caret, or let the textarea handle it. */
export function continueList(text: string, start: number, end: number) {
  if (start !== end) return null
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const before = text.slice(lineStart, start)
  // Treat fenced code as literal text, including examples that look like lists.
  let fence: string | null = null
  for (const line of text.slice(0, lineStart).split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker && !fence) fence = marker
    else if (marker && fence && marker[0] === fence[0] && marker.length >= fence.length) fence = null
  }
  if (fence) return null
  const match = /^(\s*)(?:(\d{1,9})([.)])|([-+*]))([ \t]+)(?:\[([ xX])\][ \t]+)?(.*)$/.exec(before)
  if (!match) return null
  const [, indent, number, delimiter, bullet, space, task, content] = match
  const after = text.slice(start, text.indexOf('\n', start) < 0 ? text.length : text.indexOf('\n', start))
  if (!content.trim() && !after.trim()) return { start: lineStart, end: start + after.length, insert: indent }
  if (!content.trim()) return null
  return { start, end, insert: `\n${indent}${number ? `${Number(number) + 1}${delimiter}` : bullet}${space}${task !== undefined ? '[ ] ' : ''}` }
}
