import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, onServiceEvent, useDesktop } from './client'
import './workspace-tabs.css'

export type BrowserState = { available: boolean; activeId: string; error?: string; tabs: { id: string; url: string; title: string; loading?: boolean; error?: string }[] }
export default function WorkspaceTabs({ children }: { children: ReactNode }) {
  const desktop = useDesktop()
  const [state, setState] = useState<BrowserState>({ available: false, activeId: 'workspace', tabs: [] })
  const [draft, setDraft] = useState({ key: '', value: '' })
  const [error, setError] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const active = state.tabs.find(t => t.id === state.activeId)
  const home = !active
  const addressKey = `${state.activeId}:${active?.url || ''}`
  const address = draft.key === addressKey ? draft.value : active?.url || ''
  const blankId = active && !active.url ? active.id : null
  const act = (action: string, values: Record<string, unknown> = {}) => api<BrowserState>('/browser', { action, id: state.activeId, ...values }).then(value => { setState(value); setError('') }).catch(e => setError(e.message))
  useEffect(() => {
    if (!desktop.connected) return
    let live = true
    const off = onServiceEvent(event => {
      if (event.type === 'browser-tabs' && event.browser) setState(event.browser)
      if (event.type === 'navigate' && event.window === 'workspace') api<BrowserState>('/browser', { action: 'select', id: 'workspace' }).then(setState).catch(() => {})
    })
    api<BrowserState>('/browser').then(value => { if (live) setState(value) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false; off() }
  }, [desktop.connected])
  useEffect(() => {
    if (blankId) input.current?.focus()
  }, [blankId])
  useEffect(() => {
    if (!desktop.preview) return
    api<BrowserState>('/browser', { action: 'select', id: 'workspace' }).then(setState).catch(() => {})
  }, [desktop.preview])
  useEffect(() => {
    document.body.classList.toggle('workspace-browser-active', !home)
    return () => document.body.classList.remove('workspace-browser-active')
  }, [home])
  useEffect(() => {
    const element = stage.current
    if (!element || !desktop.connected) return
    let timer = 0
    const layout = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const r = element.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return
        api('/browser', { action: 'layout', x: r.x, y: r.y, width: r.width, height: r.height }).catch(e => setError(e.message))
      }, 30)
    }
    const observer = new ResizeObserver(layout)
    observer.observe(element); layout()
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [desktop.connected])
  return <div className="workspace-browser">
    <div className="browser-tabs" role="tablist" aria-label="Workspace pages">
      <button role="tab" aria-selected={home} onClick={() => act('select', { id: 'workspace' })}>⌂ Workspace</button>
      {state.tabs.map(tab => <div className={`browser-tab ${tab.id === state.activeId ? 'selected' : ''}`} key={tab.id}>
        <button role="tab" aria-selected={tab.id === state.activeId} title={tab.url || 'New tab'} onClick={() => act('select', { id: tab.id })}>{tab.loading ? '◌ ' : ''}{tab.title}</button>
        <button className="browser-close" aria-label={`Close ${tab.title}`} onClick={() => act('close', { id: tab.id })}>×</button>
      </div>)}
      <button className="browser-new" title="New browser tab" aria-label="New browser tab" disabled={!state.available} onClick={() => act('new')}>+</button>
    </div>
    <form className="browser-toolbar" onSubmit={e => { e.preventDefault(); void act(home ? 'new' : 'navigate', { url: address }) }}>
      <button type="button" title="Back" aria-label="Back" disabled={home || !active?.url} onClick={() => act('back')}>←</button>
      <button type="button" title="Forward" aria-label="Forward" disabled={home || !active?.url} onClick={() => act('forward')}>→</button>
      <button type="button" title="Reload page" aria-label="Reload page" disabled={home || !active?.url} onClick={() => act('reload')}>↻</button>
      <input ref={input} aria-label="Web address" placeholder="Enter a web address or localhost:5173" value={address} onChange={e => setDraft({ key: addressKey, value: e.target.value })} onFocus={e => e.target.select()} spellCheck={false} />
      <button type="submit" disabled={!state.available || !address.trim()}>Go</button>
    </form>
    {(error || active?.error || state.error) && <div className="browser-error" role="alert">{error || active?.error || state.error}</div>}
    <div className="browser-stage" ref={stage}>
      <div className="browser-home" style={{ display: home ? undefined : 'none' }}>{children}</div>
      {!home && <div className="browser-empty"><h2>{active.url ? 'Opening page…' : 'New browser tab'}</h2><p>{active.url ? active.url : 'Enter your app’s localhost address or another web address above.'}</p><p>Your development server needs to be running to open a localhost app.</p></div>}
    </div>
  </div>
}
