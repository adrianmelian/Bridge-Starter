import { Children, isValidElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import { localPath, remarkFilePaths } from './conversationPaths'
import remarkGfm from 'remark-gfm'
import { api, useDesktop } from './client'
import './conversation.css'

type Call = { id: string; name: string; input: string; output: string; complete: boolean }
type Message = { id: string; kind: 'message'; role: 'user' | 'assistant'; text: string; phase: string; at?: string }
type Commands = { id: string; kind: 'commands'; calls: Call[]; settled: boolean }
type Conversation = { available: boolean; version?: number; items: (Message | Commands)[]; hasMore?: boolean; trimmed?: boolean; note?: string; terminalNotice?: { kind: string; text: string } | null }

function linkText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? linkText(child.props.children) : '').join('')
}

function CommandGroup({ item }: { item: Commands }) {
  const [open, setOpen] = useState(!item.settled)
  useEffect(() => { setOpen(!item.settled) }, [item.settled])
  return <details className="conversation-commands" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{item.calls.length} {item.calls.length === 1 ? 'command / tool call' : 'commands / tool calls'}</span><small>{item.settled ? 'Expand to inspect' : 'Working'}</small></summary>
    <div className="conversation-command-list">{item.calls.map(call => <section key={call.id} aria-label={call.name}>
      <header><strong>{call.name}</strong><span>{call.complete ? 'Result received' : item.settled ? 'No result recorded' : 'Running…'}</span></header>
      {call.input && <pre aria-label="Command input">{call.input}</pre>}
      {call.output && <pre className="command-output" aria-label="Command output">{call.output}</pre>}
    </section>)}</div>
  </details>
}

export default function ConversationView({ id, terminal }: { id: string; terminal: () => void }) {
  const state = useDesktop()
  const session = state.sessions.find(item => item.id === id)
  const [data, setData] = useState<Conversation | null>(null)
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(100)
  const [newActivity, setNewActivity] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const older = useRef<{ height: number; top: number } | null>(null)
  useEffect(() => {
    let alive = true; let timer = 0
    const refresh = async () => {
      try {
        const next = await api<Conversation>('/sessions/' + id + '/conversation?limit=' + limit)
        if (alive) {
          setData(previous => previous?.version === next.version && previous?.available === next.available && previous?.items.length === next.items.length && previous?.terminalNotice?.text === next.terminalNotice?.text ? previous : next)
          setError('')
        }
      } catch (error) { if (alive) setError(error instanceof Error ? error.message : String(error)) }
      finally { if (alive) timer = window.setTimeout(refresh, 1000) }
    }
    void refresh()
    return () => { alive = false; clearTimeout(timer) }
  }, [id, limit])
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element || !data) return
    if (older.current) { element.scrollTop = older.current.top + element.scrollHeight - older.current.height; older.current = null }
    else if (follow.current) element.scrollTop = element.scrollHeight
    else setNewActivity(true)
  }, [data])
  return <div className="conversation-surface">
    {fileError && <p className="conversation-note" role="alert">{fileError}</p>}
    {data?.terminalNotice && <div className="conversation-terminal-notice" role="alert"><strong>Agent needs attention</strong><p>{data.terminalNotice.text}</p><button onClick={terminal}>Open Terminal</button>{data.terminalNotice.kind === 'authentication' && session?.nativeId && <button disabled={reconnecting || session.permissionsChanging} onClick={() => {
      setReconnecting(true)
      void api('/sessions/' + id + '/reload', { confirmRestart: true }).catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setReconnecting(false))
    }}>{reconnecting ? 'Reconnecting…' : 'Reconnect this chat'}</button>}</div>}
    <div ref={scroll} className="conversation-scroll" aria-label="Chat conversation" onScroll={() => {
      const element = scroll.current!
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60
      if (follow.current) setNewActivity(false)
    }}>
      {!data && !error && <p className="conversation-note">Loading saved conversation…</p>}
      {error && <p className="conversation-note" role="alert">{error} <button onClick={terminal}>Open Terminal</button></p>}
      {data?.hasMore && <button className="conversation-older" onClick={() => { const element = scroll.current!; older.current = { top: element.scrollTop, height: element.scrollHeight }; follow.current = false; setLimit(value => value + 100) }}>Load earlier messages</button>}
      {data?.trimmed && <p className="conversation-note">Recent conversation shown. Older records remain in the native transcript.</p>}
      {data && (!data.available || !data.items.length) && <p className="conversation-note">{data.note || 'Start a conversation by sending a message below.'} {!data.available && <button onClick={terminal}>Open Terminal</button>}</p>}
      {data?.items.map(item => item.kind === 'commands' ? <CommandGroup key={item.id} item={item} /> : <article key={item.id} className={'conversation-message conversation-' + item.role} aria-label={item.role === 'user' ? 'Your message' : item.phase === 'commentary' ? 'Assistant progress update' : 'Assistant message'}>
        <header><strong>{item.role === 'user' ? (state.settings.captainName || 'Captain') : (state.settings.assistantName || 'Commander Data')}</strong>{item.phase === 'commentary' && <span>Progress update</span>}{item.at && <time dateTime={item.at}>{new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}</header>
        <div className="conversation-message-body"><Markdown remarkPlugins={[remarkGfm, remarkFilePaths]} urlTransform={value => localPath(value) !== null ? value : defaultUrlTransform(value)} components={{ a: ({ href, children }) => {
          const file = href ? localPath(href) : null
          return file ? <a className="conversation-file-link" href={href} title={`Show in Explorer: ${file}`} onClick={event => { event.preventDefault(); setFileError(''); void api('/reveal', { path: file, sessionId: id }).catch(error => setFileError(`Could not reveal ${file}: ${error.message}`)) }}>{children}{linkText(children) !== file && <span className="conversation-file-path"> ({file})</span>}</a> : <a href={href} target="_blank" rel="noreferrer">{children}</a>
        }, img: ({ alt }) => <span>[{alt || 'Attached image'}]</span> }}>{item.text}</Markdown></div>
      </article>)}
      {session?.activity === 'working' && !data?.terminalNotice && <p className="conversation-note" role="status">Working…</p>}
      {session?.activity === 'waiting' && <p className="conversation-note" role="status">The agent may need input. <button onClick={terminal}>Open Terminal</button></p>}
    </div>
    {newActivity && <button className="conversation-latest" onClick={() => { follow.current = true; const element = scroll.current!; element.scrollTop = element.scrollHeight; setNewActivity(false) }}>Latest activity ↓</button>}
  </div>
}
