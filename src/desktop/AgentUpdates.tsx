import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { api } from './client'
import type { ChatSession } from './types'
import './agentUpdates.css'

type Update = { agent: string; current: string; latest: string; channel: string; available: boolean; supported: boolean; note: string; job: null | { sessionId: string; phase: string; output: string; error: string } }
export default function AgentUpdates({ session }: { session: ChatSession }) {
  const [info, setInfo] = useState<Update | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const supported = ['codex', 'claude'].includes(session.agent)
  const running = !!info?.job && ['checking', 'installing', 'reconnecting', 'restarting'].includes(info.job.phase)
  useEffect(() => {
    if (!supported) return
    let alive = true; let timer = 0
    const poll = async () => {
      let delay = 60000
      try {
        const next = await api<Update>(`/sessions/${session.id}/updates`)
        if (alive) { setInfo(next); setError('') }
        if (next.job && ['checking', 'installing', 'reconnecting', 'restarting'].includes(next.job.phase)) delay = 1000
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
      finally { if (alive) timer = window.setTimeout(poll, delay) }
    }
    void poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [session.id, supported, starting])
  if (!supported) return null
  const label = session.agent === 'codex' ? 'Codex' : 'Claude Code'
  async function refresh() {
    setChecking(true); setError('')
    try { setInfo(await api<Update>(`/sessions/${session.id}/updates?refresh=1`)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setChecking(false) }
  }
  async function install() {
    setStarting(true); setOpen(true); setError('')
    try { await api(`/sessions/${session.id}/updates`, { confirmRestart: true, restartAll: true }); setInfo(await api<Update>(`/sessions/${session.id}/updates`)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setStarting(false) }
  }
  return <div className="agent-update-bar">
    <button className="desk-icon agent-update-icon" title="Agent updates" aria-label={info?.available ? 'Agent updates available' : 'Agent updates'} onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="refresh" size={18} />{info?.available && <i className="agent-update-dot" />}</button>
    {info?.available && dismissed !== info.latest && !open && <span className="agent-update-prompt" role="status">{label} {info.latest} is available. Updating restarts the Bridge and all open chats. <button disabled={!info.supported || starting || running} onClick={() => void install()}>Update</button><button onClick={() => setOpen(true)}>Review update</button><button onClick={() => setDismissed(info.latest)}>Later</button></span>}
    {running && <span role="status">{label}: {info?.job?.phase}…</span>}
    {open && <section className="agent-update-panel" aria-label="Agent updates">
      <strong>{label} updates</strong>
      {info && <p>Installed: {info.current} · {info.channel} release: {info.latest}{!info.available && ' · Up to date'}</p>}
      <p>Updates the installed CLI, then restarts the Bridge and all open chats. This interrupts current work in every chat. Saved conversations, drafts, models and permissions are retained.</p>
      {info?.note && <p>{info.note}</p>}
      {(error || info?.job?.error) && <p role="alert">{error || info?.job?.error}</p>}
      {info?.job?.phase === 'complete' && <p role="status">Update complete.</p>}
      {info?.job?.output && <details><summary>Update details</summary><pre>{info.job.output}</pre></details>}
      <button disabled={checking || starting || running} onClick={() => void refresh()}>{checking ? 'Checking…' : 'Check for updates'}</button>
      <button disabled={!info?.supported || checking || starting || running || session.permissionsChanging} onClick={() => void install()}>{starting || running ? 'Updating…' : 'Update'}</button>
      <button onClick={() => setOpen(false)}>Close</button>
    </section>}
  </div>
}
