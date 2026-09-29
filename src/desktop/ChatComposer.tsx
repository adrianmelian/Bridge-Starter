import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { api, useDesktop } from './client'
import { autocorrect } from './autocorrect'
import { continueList } from './listEditing'
import { useDictation } from './useDictation'
import { Icon } from './Icons'
import './composer.css'
import MicrophoneMenu from './MicrophoneMenu'
import { effortName, ModelControls, ModelPopover, useAgentCatalog } from './AgentControls'

export interface ComposerHandle { appendPaths: (paths: string[]) => void; focus: () => void }
const drafts = new Map<string, string>()
type SavedMessage = { requestId: string; text: string; at: string }

const ChatComposer = forwardRef<ComposerHandle, { id: string; onImages: (files: File[]) => void }>(function ChatComposer({ id, onImages }, ref) {
  const state = useDesktop()
  const [micAnchor, setMicAnchor] = useState<HTMLElement | null>(null)
  const closeMicMenu = useCallback(() => setMicAnchor(null), [])
  const session = state.sessions.find(item => item.id === id)
  const key = `data.draft.${id}`
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(key) || drafts.get(id) || '' } catch { return drafts.get(id) || '' } })
  const modelButton = useRef<HTMLButtonElement>(null)
  const closeModel = useCallback(() => setModelOpen(false), [])
  const [inputHeight, setInputHeight] = useState<number | null>(() => { try { const value = Number(localStorage.getItem(`data.composerHeight.${id}`)); return value > 0 ? value : null } catch { return null } })
  const drag = useRef<{ y: number; height: number } | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashQuery = /^\/([\w:.-]*)$/.exec(text)?.[1]
  const options = useAgentCatalog(id, state.connected && session?.agent !== 'shell')
  const activeModel = options.catalog?.models.find(item => item.id === session?.model) || (!session?.model ? options.catalog?.models.find(item => item.isDefault) : undefined)
  const modelLabel = [activeModel?.name || session?.model || 'Default', effortName(session?.effort || activeModel?.defaultEffort || (activeModel?.efforts.length ? 'default' : ''))].filter(Boolean).join(' ')
  const suggestions = slashDismissed || slashQuery === undefined ? [] : (options.catalog?.commands || []).filter(command => command.name.toLowerCase().startsWith(slashQuery.toLowerCase()))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [permissionChoice, setPermissionChoice] = useState<boolean | null>(null)
  const [permissionBusy, setPermissionBusy] = useState(false)
  const permissionLock = useRef(false)
  const lastCorrection = useRef<{ value: string; start: number; end: number; original: string } | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const busy = useRef(false)
  const attempt = useRef<{ requestId: string; text: string } | null>(null)
  const history = useRef<SavedMessage[]>([])
  const historyPosition = useRef(-1)
  const workInProgress = useRef({ text: '', start: 0, end: 0 })
  const historyEdits = useRef(new Map<number, string>())
  useEffect(() => {
    let active = true
    if (state.connected) void api<SavedMessage[]>(`/sessions/${id}/messagehistory`).then(saved => {
      if (active) {
        const merged = new Map([...saved, ...history.current].map(item => [item.requestId, item]))
        history.current = [...merged.values()].sort((a, b) => b.at.localeCompare(a.at))
      }
    }).catch(() => { /* Sending still requires a successful durable save. */ })
    return () => { active = false }
  }, [id, state.connected])
  function browseHistory(direction: -1 | 1) {
    const input = field.current
    if (!input || dictation.phase !== 'idle') return
    const position = historyPosition.current
    const next = position + direction
    if (next < -1 || next >= history.current.length) return
    if (position === -1) workInProgress.current = { text: input.value, start: input.selectionStart, end: input.selectionEnd }
    else historyEdits.current.set(position, input.value)
    historyPosition.current = next
    const value = next === -1 ? workInProgress.current.text : historyEdits.current.get(next) ?? history.current[next].text
    change(value)
    requestAnimationFrame(() => {
      const caret = next === -1 ? workInProgress.current.start : direction === 1 ? 0 : value.length
      input.setSelectionRange(caret, next === -1 ? workInProgress.current.end : caret)
    })
  }
  const ready = state.connected && !!session && !session.permissionsChanging && !permissionBusy
  async function applyPermissions() {
    if (permissionChoice === null || permissionLock.current) return
    permissionLock.current = true; setPermissionBusy(true); setError('')
    try { await api(`/sessions/${id}/permissions`, { bypass: permissionChoice, confirmRestart: true }); setPermissionChoice(null) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { permissionLock.current = false; setPermissionBusy(false) }
  }
  function change(value: string) {
    setText(value); setSlashDismissed(false); setSlashIndex(0)
    const draft = historyPosition.current >= 0 ? workInProgress.current.text : value
    drafts.set(id, draft)
    try { if (draft) sessionStorage.setItem(key, draft); else sessionStorage.removeItem(key) } catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
  }
  const dictation = useDictation(field, change, state.settings.dictationDeviceId)
  const micActive = dictation.phase === 'listening'
  const transcribing = dictation.phase === 'finishing'
  useImperativeHandle(ref, () => ({
    focus: () => field.current?.focus(),
    appendPaths: paths => {
      dictation.cancel()
      const value = field.current?.value || ''
      change(value + (value && !/\s$/.test(value) ? '\n' : '') + paths.map(path => JSON.stringify(path)).join('\n') + '\n')
      field.current?.focus()
    },
  }))
  function bounds() {
    const input = field.current
    const parent = input?.closest('.chat-composer')?.parentElement
    const minimum = window.innerHeight <= 550 ? 54 : 84
    const overhead = input ? (input.closest('.chat-composer')?.getBoundingClientRect().height || 0) - input.getBoundingClientRect().height : 90
    return { minimum, maximum: Math.max(minimum, (parent?.clientHeight || window.innerHeight) - overhead - 180) }
  }
  function resizeInput(value: number | null) {
    const { minimum, maximum } = bounds()
    const height = value === null ? null : Math.round(Math.max(minimum, Math.min(maximum, value)))
    setInputHeight(height)
    try { if (height === null) localStorage.removeItem(`data.composerHeight.${id}`); else localStorage.setItem(`data.composerHeight.${id}`, String(height)) } catch { /* Session sizing still works. */ }
  }
  useEffect(() => {
    const size = () => {
      const input = field.current
      if (!input) return
      const { minimum, maximum } = bounds()
      input.style.height = 'auto'
      input.style.height = `${Math.max(minimum, Math.min(maximum, inputHeight ?? Math.min(220, input.scrollHeight)))}px`
    }
    size()
    const observer = new ResizeObserver(size)
    const parent = field.current?.closest('.chat-composer')?.parentElement
    if (parent) observer.observe(parent)
    window.addEventListener('resize', size)
    return () => { observer.disconnect(); window.removeEventListener('resize', size) }
  }, [text, inputHeight])
  function completeSlash(index: number) {
    const command = suggestions[index]
    if (!command) return
    const value = `/${command.name} `
    change(value); setSlashDismissed(true)
    field.current?.focus(); requestAnimationFrame(() => field.current?.setSelectionRange(value.length, value.length))
  }
  async function send() {
    if (!ready || busy.current || transcribing || dictation.phase === 'starting' || (!micActive && !text.trim())) return
    busy.current = true; setSending(true); setError('')
    try {
      const submitted = micActive ? await dictation.finish() : field.current?.value || text
      if (submitted === null || !submitted.trim()) return
      if (submitted.length > 64000) throw new Error('Keep the message below 64,000 characters.')
      if (!attempt.current) { try { attempt.current = JSON.parse(sessionStorage.getItem(`${key}.pending`) || 'null') } catch { /* New delivery below. */ } }
      if (attempt.current?.text !== submitted) attempt.current = { requestId: crypto.randomUUID(), text: submitted }
      try { sessionStorage.setItem(`${key}.pending`, JSON.stringify(attempt.current)) } catch { /* The service also saves every attempted message. */ }
      const outgoing = attempt.current
      const saved = await api<SavedMessage>(`/sessions/${id}/messagehistory`, outgoing)
      history.current = [saved, ...history.current.filter(item => item.requestId !== saved.requestId)].slice(0, 100)
      historyPosition.current = -1; historyEdits.current.clear()
      attempt.current = null
      try { sessionStorage.removeItem(`${key}.pending`) } catch { /* The durable receipt still prevents duplicates. */ }
      if (field.current?.value === submitted) change('')
      // Recovery depends on the saved message, never on a CLI acknowledgement.
      if (/^\/[\w:.-]+(?: [^\r\n]*)?$/.test(submitted.trim())) window.dispatchEvent(new CustomEvent('data-native-command', { detail: { id } }))
      await api(`/sessions/${id}/message`, outgoing).catch(error => {
        throw new Error(`${error instanceof Error ? error.message : String(error)} Recover the saved message with Up at the top of the input.`)
      })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { busy.current = false; setSending(false) }
  }
  return <section className="chat-composer" aria-label="Message composer">
    <div className="composer-resize" role="separator" aria-label="Resize message input" aria-orientation="horizontal" aria-valuenow={inputHeight || 84} tabIndex={0} title="Drag to resize input. Double-click to reset." onDoubleClick={() => resizeInput(null)} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { y: event.clientY, height: field.current?.getBoundingClientRect().height || 84 }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (drag.current) resizeInput(drag.current.height + drag.current.y - event.clientY) }} onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }} onLostPointerCapture={() => { drag.current = null }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); resizeInput((field.current?.getBoundingClientRect().height || 84) + (event.key === 'ArrowUp' ? 24 : -24)) } if (event.key === 'Home') { event.preventDefault(); resizeInput(null) } }}><span /></div>
    <button type="button" className="restore-message" disabled={sending || dictation.phase !== 'idle' || !!text.trim()} onClick={() => { if (history.current.length) { browseHistory(1); setError(''); field.current?.focus() } else setError('No saved message is available for this chat yet.') }}>Restore last sent message</button>
    {micAnchor && <MicrophoneMenu anchor={micAnchor} recording={dictation.phase !== 'idle'} close={closeMicMenu} />}
    {dictation.phase === 'idle' && !slashDismissed && slashQuery !== undefined && <div className="slash-suggestions">
      {options.loading && <span>Loading commands?</span>}
      {options.error && <span>{options.error} <button onClick={options.refresh}>Retry</button></span>}
      {!!suggestions.length && <><small>Tab to complete ? Up/Down to choose ? Esc to close</small><div id={`slash-${id}`} role="listbox" aria-label="Slash commands">{suggestions.map((command, index) => <button type="button" role="option" id={`slash-${id}-${index}`} aria-selected={index === slashIndex} key={command.name} onMouseDown={event => event.preventDefault()} onClick={() => completeSlash(index)}><strong>/{command.name}</strong><span>{command.description}</span></button>)}</div></>}
    </div>}
    <textarea aria-controls={suggestions.length ? `slash-${id}` : undefined} aria-activedescendant={suggestions.length ? `slash-${id}-${slashIndex}` : undefined} ref={field} value={text} readOnly={dictation.phase !== 'idle'} aria-label="Message" placeholder="Message your agent…" rows={3} maxLength={64000} spellCheck onChange={event => change(event.target.value)}
      onPaste={event => { const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); onImages(images) } }}
      onKeyDown={event => {
        const input = event.currentTarget
        if (!event.nativeEvent.isComposing && dictation.phase === 'idle' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const last = lastCorrection.current
          lastCorrection.current = null
          if (event.key === 'Backspace' && last && input.value === last.value && input.selectionStart === last.end && input.selectionEnd === last.end) {
            event.preventDefault(); input.setSelectionRange(last.start, last.end)
            if (!document.execCommand('insertText', false, last.original)) { input.setRangeText(last.original, last.start, last.end, 'end'); change(input.value) }
            return
          }
          if (event.key === ' ' && input.selectionStart === input.selectionEnd) {
            const correction = autocorrect(input.value, input.selectionStart)
            if (correction) {
              event.preventDefault()
              input.setSelectionRange(correction.start, correction.end)
              const replacement = correction.replacement + ' '
              if (!document.execCommand('insertText', false, replacement)) { input.setRangeText(replacement, correction.start, correction.end, 'end'); change(input.value) }
              lastCorrection.current = { value: input.value, start: correction.start, end: correction.start + replacement.length, original: correction.original + ' ' }
              return
            }
          }
        }
        if (!event.nativeEvent.isComposing && dictation.phase === 'idle' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && suggestions.length) {
          if (event.key === 'Tab') { event.preventDefault(); completeSlash(slashIndex); return }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSlashDismissed(true); return }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); const next = (slashIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length; setSlashIndex(next)
            document.getElementById(`slash-${id}-${next}`)?.scrollIntoView({ block: 'nearest' }); return
          }
        }
        if (!event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && dictation.phase === 'idle') {
          const input = event.currentTarget
          if (input.selectionStart === input.selectionEnd && ((event.key === 'ArrowUp' && input.selectionStart === 0) || (event.key === 'ArrowDown' && input.selectionStart === input.value.length && historyPosition.current >= 0))) {
            event.preventDefault(); browseHistory(event.key === 'ArrowUp' ? 1 : -1); return
          }
        }
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); if (!event.repeat) void send(); return }
        if (event.shiftKey || event.altKey) return
        const edit = continueList(input.value, input.selectionStart, input.selectionEnd)
        if (!edit) return
        event.preventDefault()
        input.setSelectionRange(edit.start, edit.end)
        // Native insertion keeps automatic list continuation in the undo history.
        if (!document.execCommand('insertText', false, edit.insert)) {
          input.setRangeText(edit.insert, edit.start, edit.end, 'end'); change(input.value)
        }
      }} />
    {error && <p className="composer-error" role="alert">{error}</p>}
    {dictation.error && <p className="composer-error" role="alert">{dictation.error} Your draft is still here.</p>}
    {dictation.notice && <p className="dictation-notice" role="status">{dictation.notice}</p>}
    {session && session.agent !== 'shell' && <div className="composer-permissions">
      {modelOpen && modelButton.current && <ModelPopover anchor={modelButton.current} close={closeModel}>{options.loading && <p>Loading available models?</p>}{options.error && <p role="alert">{options.error}</p>}<button type="button" disabled={options.loading} onClick={options.refresh}>Refresh models</button>{options.catalog && (options.catalog.models.length ? <ModelControls session={session} catalog={options.catalog} close={closeModel} blocked={!state.connected || sending || !!session.permissionsChanging || dictation.phase !== 'idle'} /> : <p>{options.catalog.note || 'No available models reported by this agent.'}</p>)}</ModelPopover>}
      {permissionChoice !== null && <div className="permission-confirm" role="group" aria-label="Change bypass permissions">
        <label>Bypass permissions <select aria-label="Bypass permissions" disabled={permissionBusy} value={permissionChoice ? 'on' : 'off'} onChange={event => setPermissionChoice(event.target.value === 'on')}><option value="off">Off</option><option value="on">On</option></select></label>
        <p>{permissionChoice ? 'On skips Codex approval prompts and sandbox restrictions.' : 'Off uses workspace access with approvals when needed.'} Applying reconnects this chat and interrupts any current work. Your conversation and message draft are kept.</p>
        <div><button type="button" disabled={permissionBusy || !state.connected || permissionChoice === !!session.bypass} onClick={() => void applyPermissions()}>{permissionBusy ? 'Reconnecting…' : 'Apply and reconnect'}</button><button type="button" disabled={permissionBusy} onClick={() => setPermissionChoice(null)}>Cancel</button></div>
      </div>}
    </div>}
    <div className="composer-actions"><div className="composer-agent-buttons">{session && <>      {session.agent === 'codex' && <button type="button" className="permission-button" aria-pressed={!!session.bypass} aria-expanded={permissionChoice !== null} disabled={!state.connected || permissionBusy || session.permissionsChanging || sending || dictation.phase !== 'idle'} onClick={() => { setError(''); setPermissionChoice(permissionChoice === null ? !session.bypass : null) }}>Bypass</button>}
      <button type="button" ref={modelButton} className="model-button" title="Choose model and effort" aria-haspopup="dialog" aria-expanded={modelOpen} disabled={!state.connected || permissionBusy || session.permissionsChanging || sending || dictation.phase !== 'idle'} onClick={() => { setModelOpen(!modelOpen); setPermissionChoice(null) }}>{modelLabel}</button></>}</div><span role="status">{micActive ? 'Listening · local Whisper' : transcribing ? 'Finishing transcription…' : dictation.phase === 'starting' ? 'Starting microphone…' : ready && session?.status !== 'running' ? 'Send will resume this chat' : ready ? '' : 'Reconnecting · you can keep writing'}</span><div className="composer-send-controls"><button type="button" aria-haspopup="menu" aria-expanded={!!micAnchor} onContextMenu={event => { event.preventDefault(); setMicAnchor(event.currentTarget) }} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); setMicAnchor(event.currentTarget) } }} className={`composer-mic ${micActive ? 'listening' : ''}`} aria-label={micActive ? 'Stop dictation' : dictation.phase === 'starting' ? 'Cancel microphone startup' : 'Start dictation'} aria-pressed={micActive} title={micActive ? 'Stop listening and finish transcription' : `Dictate with ${state.settings.dictationDeviceLabel || 'system default microphone'} ? Right-click to choose input`} disabled={transcribing || sending || (!state.connected && dictation.phase === 'idle')} onClick={() => { if (micActive) void dictation.finish(); else if (dictation.phase === 'starting') dictation.cancel(); else void dictation.start() }}><Icon name={transcribing ? 'refresh' : 'mic'} size={18} /></button><button type="button" onClick={() => void send()} disabled={!ready || sending || transcribing || dictation.phase === 'starting' || (!micActive && !text.trim()) || text.length > 64000}>{sending ? 'Sending…' : 'Send'}</button><button type="button" className="composer-stop" title="Interrupt agent (Escape)" disabled={!ready || session?.status !== 'running'} onClick={() => void api(`/sessions/${id}/interrupt`, {}).catch(error => setError(error instanceof Error ? error.message : String(error)))}>Stop</button></div></div>
  </section>
})
export default ChatComposer
