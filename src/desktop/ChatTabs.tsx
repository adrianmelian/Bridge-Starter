import type { AgentInfo, ChatSession } from './types'
import { chatActivityLabel } from './chatActivity'
import { Icon } from './Icons'
import SessionLogo from './SessionLogo'

export default function ChatTabs({ items, selectedId, agents, choose, close, edit }: {
  items: ChatSession[]; selectedId?: string; agents: AgentInfo[]; choose: (id: string) => void; close: (id: string) => void; edit: (id: string) => void
}) {
  return <div className="chat-tabs" role="tablist" aria-label="Agent chats">
    {items.map(item => <div key={item.id} data-chat-tab={item.id} className={`chat-tab ${selectedId === item.id ? 'selected' : ''} ${item.tabColor ? 'has-color' : ''}`} style={{ '--tab-accent': item.tabColor || '#dfa3b8' } as React.CSSProperties}>
      <button onDoubleClick={() => edit(item.id)} role="tab" aria-selected={selectedId === item.id} onClick={() => choose(item.id)}
        className="chat-tab-select" aria-label={`${item.name} · ${chatActivityLabel(item)}`} title={`${agents.find(a => a.id === item.agent)?.label} · ${item.name}\n${chatActivityLabel(item)}\nDouble-click to edit\nMost recent conversations first\n${item.cwd}`}>
        <span style={{ color: agents.find(a => a.id === item.agent)?.color }}><SessionLogo session={item} /></span><span className="chat-tab-name">{item.name}</span>{item.pinned && <span className="tab-pinned" title="Pinned in History"><Icon name="pin" size={11} /></span>}
      </button>
      <button className="chat-tab-close" onClick={() => close(item.id)} aria-label={`Close ${item.name}`} title="Close tab · keep in History"><Icon name="close" size={12} /></button>
    </div>)}

  </div>
}
