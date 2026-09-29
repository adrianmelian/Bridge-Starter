import { useEffect, useRef, useState } from 'react'
import { api, useDesktop } from './client'
import type { ChatSession } from './types'
import { Icon } from './Icons'

export default function EditChat({ session, close }: { session: ChatSession; close: () => void }) {
  const state = useDesktop()
  const [name, setName] = useState(session.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    form.current?.querySelector('input')?.select()
    return () => previous?.focus()
  }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true); setError('')
    try { await api(`/sessions/${session.id}`, { name: name.trim() }, 'PATCH'); close() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }
  return <div className="desk-scrim" onClick={() => { if (!busy) close() }}>
    <form ref={form} className="desk-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-chat-title" onClick={event => event.stopPropagation()} onSubmit={save} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.stopPropagation(); if (!busy) close() }
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <div className="desk-dialog-heading"><div><span className="desk-eyebrow">CONVERSATION DETAILS</span><h2 id="edit-chat-title">Edit chat</h2></div><button type="button" className="desk-icon" onClick={close} disabled={busy} aria-label="Close edit chat"><Icon name="close" /></button></div>
      <label className="desk-field">Chat name<input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy} /></label>
      <label className="desk-field">Agent<input readOnly value={state.agents.find(agent => agent.id === session.agent)?.label || session.agent} /></label>
      <label className="desk-field">Working folder<input readOnly value={session.cwd} spellCheck={false} /></label>
      <p className="desk-muted">Renaming keeps this conversation and its history. Agent and working folder belong to the existing conversation.</p>
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
      <button className="desk-primary" disabled={busy || !state.connected || !name.trim()}>{busy ? 'Saving…' : 'Save changes'}<Icon name="arrow" size={16} /></button>
    </form>
  </div>
}
