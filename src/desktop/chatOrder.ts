import type { ChatSession } from './types'

function activityTime(session: ChatSession) {
  // Only actual messages count; settings, reopening and terminal redraws do not.
  return Date.parse(session.lastMessageAt || session.createdAt || '') || 0
}

export function orderedChats(sessions: ChatSession[]) {
  return sessions.filter(item => item.open).sort((a, b) => activityTime(b) - activityTime(a) || (a.tabOrder || 0) - (b.tabOrder || 0) || a.id.localeCompare(b.id))
}

export const tabColors = [
  { name: 'Rose', value: '#dba3bb' }, { name: 'Peach', value: '#dfa48b' },
  { name: 'Gold', value: '#d7bd80' }, { name: 'Sage', value: '#a5bd91' },
  { name: 'Mint', value: '#8cc8b4' }, { name: 'Sky', value: '#91b6da' },
  { name: 'Lilac', value: '#b8a2d4' }, { name: 'Slate', value: '#a6afbc' },
]
