import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from './client'
import type { ChatSession } from './types'

export type AgentCatalog = { models: { id: string; name: string; description: string; efforts: string[]; defaultEffort?: string; isDefault?: boolean }[]; commands: { name: string; description: string }[]; note?: string }
export function useAgentCatalog(id: string, needed: boolean) {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!needed) return
    let alive = true; setLoading(true); setError('')
    void api<AgentCatalog>(`/sessions/${id}/options${revision ? '?refresh=1' : ''}`).then(value => { if (alive) setCatalog(value) }).catch(error => { if (alive) setError(error.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, needed, revision])
  return { catalog, error, loading, refresh: () => setRevision(value => value + 1) }
}

export const effortName = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : ''

export function ModelPopover({ anchor, close, children }: { anchor: HTMLElement; close: () => void; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 8, bottom: 8 })
  useEffect(() => {
    const place = () => { const rect = anchor.getBoundingClientRect(); setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), bottom: Math.max(8, window.innerHeight - rect.top + 8) }) }
    place(); menu.current?.focus()
    const observer = new ResizeObserver(place); observer.observe(anchor)
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', place)
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place) }
  }, [anchor, close])
  return createPortal(<div ref={menu} className="model-popover" role="dialog" aria-label="Choose model and effort" tabIndex={-1} style={position} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { close(); anchor.focus() } }}>{children}</div>, document.body)
}

export function ModelControls({ session, catalog, close, blocked }: { session: ChatSession; catalog: AgentCatalog; close: () => void; blocked: boolean }) {
  const [model, setModel] = useState(session.model || catalog.models.find(m => m.isDefault)?.id || catalog.models[0]?.id || '')
  const [effort, setEffort] = useState(session.effort || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = catalog.models.find(m => m.id === model)
  const levels = selected?.efforts || []
  const valid = !!selected && (!effort || levels.includes(effort))
  async function apply() {
    if (busy || blocked || !valid) return
    setBusy(true); setError('')
    try { await api(`/sessions/${session.id}/model`, { model, effort, confirmRestart: true }); close() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }
  return <div className="model-controls" role="group" aria-label="Model and effort">
    <div className="model-list" role="group" aria-label="Available models">
      {catalog.models.map(item => <button type="button" key={item.id} aria-pressed={model === item.id} disabled={busy} onClick={() => { setModel(item.id); setEffort('') }}>{item.name}</button>)}
    </div>
    {!!levels.length && <label className="effort-control"><strong>{effortName(effort || selected?.defaultEffort || 'default')}</strong><button type="button" className="effort-reset" aria-label="Use agent default effort" title="Use agent default effort" disabled={busy} onClick={() => setEffort('')}>↺</button><input type="range" aria-label="Reasoning effort" aria-valuetext={effortName(effort || selected?.defaultEffort || 'default')} min={0} max={levels.length - 1} step={1} disabled={busy} value={Math.max(0, levels.indexOf(effort || selected?.defaultEffort || 'medium'))} onChange={event => setEffort(levels[Number(event.target.value)])} /><span className="effort-labels"><span>{effortName(levels[0])}</span><span>{effortName(levels[levels.length - 1])}</span></span></label>}
    <p className="model-reconnect-note">Applying reconnects this chat and interrupts current work.</p>
    {!session.nativeId && <p>Wait until this chat has a saved conversation before applying.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || blocked || !session.nativeId || !valid} onClick={() => void apply()}>{busy ? 'Reconnecting…' : 'Apply'}</button> <button type="button" disabled={busy} onClick={close}>Cancel</button>
  </div>
}
