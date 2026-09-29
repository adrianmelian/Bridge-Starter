// Deliberately small: never guess at names, valid words, or unfamiliar vocabulary.
const corrections: Record<string, string> = {
  teh: 'the', thier: 'their', recieve: 'receive', recieved: 'received',
  recieving: 'receiving', seperate: 'separate', seperately: 'separately',
  definately: 'definitely', defintely: 'definitely', becuase: 'because',
  beacuse: 'because', adn: 'and', waht: 'what', wiht: 'with',
  hte: 'the', tihs: 'this', thsi: 'this', taht: 'that',
  pleae: 'please', plese: 'please', mesage: 'message', messsage: 'message',
  resposne: 'response', reponse: 'response', respone: 'response',
  reatart: 'restart', restar: 'restart', poerfect: 'perfect',
  occured: 'occurred', occuring: 'occurring', untill: 'until',
  apparantly: 'apparently', acheive: 'achieve', acheived: 'achieved',
}

export function autocorrect(text: string, caret: number) {
  const prefix = text.slice(0, caret)
  const line = prefix.slice(prefix.lastIndexOf('\n') + 1)
  // Literal contexts: commands, paths, URLs, inline/fenced code and code-like lines.
  if (/[/\\`~@_=<>]|^\s{4}|^\s*[$>]|[{};]/.test(line)) return null
  let fence: string | null = null
  for (const row of prefix.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(row)?.[1]
    if (marker && !fence) fence = marker
    else if (marker && fence && marker[0] === fence[0] && marker.length >= fence.length) fence = null
  }
  if (fence || (text[caret] && !/\s/.test(text[caret]))) return null
  const match = /(?:^|\s)([A-Za-z]+)([!?,.]?)$/.exec(line)
  if (!match) return null
  const [, word, punctuation] = match
  const key = word.toLowerCase()
  const replacement = Object.prototype.hasOwnProperty.call(corrections, key) ? corrections[key] : undefined
  if (!replacement || !/^(?:[a-z]+|[A-Z][a-z]+)$/.test(word)) return null
  const fixed = /^[A-Z]/.test(word) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
  return { start: caret - word.length - punctuation.length, end: caret, original: word + punctuation, replacement: fixed + punctuation }
}
