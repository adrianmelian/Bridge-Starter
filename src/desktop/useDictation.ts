import { useEffect, useRef, useState } from 'react'
import { api, transcribeAudio } from './client'
import { DictationCapture } from './dictationCapture'

type Phase = 'idle' | 'starting' | 'listening' | 'finishing'
type Recording = { capture: DictationCapture; controller: AbortController; original: string; before: string; after: string; timer: number; limit: number; pending: Promise<void> | null; stopping: boolean }

export function useDictation(field: React.RefObject<HTMLTextAreaElement | null>, change: (text: string) => void, deviceId = '') {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const active = useRef<Recording | null>(null)
  const update = useRef(change)
  useEffect(() => { update.current = change })
  const current = (recording: Recording) => active.current === recording && !recording.controller.signal.aborted
  function cancel() {
    const recording = active.current; active.current = null
    if (recording) { clearTimeout(recording.timer); clearTimeout(recording.limit); recording.controller.abort(); recording.capture.cancel() }
    setPhase('idle'); setNotice('')
  }
  useEffect(() => {
    const release = () => {
      const recording = active.current; active.current = null
      if (recording) { clearTimeout(recording.timer); clearTimeout(recording.limit); recording.controller.abort(); recording.capture.cancel() }
    }
    const hide = () => { if (document.hidden) { release(); setPhase('idle'); setNotice('') } }
    window.addEventListener('pagehide', release); document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('pagehide', release); document.removeEventListener('visibilitychange', hide); release() }
  }, [])
  function insert(recording: Recording, words: string) {
    if (!current(recording)) return
    const before = recording.before + (words && recording.before && !/\s$/.test(recording.before) ? ' ' : '')
    const after = (words && recording.after && !/^\s/.test(recording.after) ? ' ' : '') + recording.after
    update.current(words ? before + words + after : recording.original)
    requestAnimationFrame(() => {
      if (current(recording) && field.current) { const caret = words ? before.length + words.length : recording.before.length; field.current.setSelectionRange(caret, caret); field.current.scrollTop = field.current.scrollHeight }
    })
    if (words) setNotice('')
  }
  async function finish(): Promise<string | null> {
    const recording = active.current
    if (!recording || recording.stopping) return null
    recording.stopping = true; clearTimeout(recording.timer); clearTimeout(recording.limit)
    setPhase('finishing'); setError(''); setNotice('')
    try {
      const audio = await recording.capture.stop() // Release the microphone before waiting for Whisper.
      await recording.pending
      if (!current(recording)) return null
      const words = (await transcribeAudio(audio, recording.controller.signal)).replace(/\s+/g, ' ').trim()
      if (!current(recording)) return null
      insert(recording, words)
      if (!words) setNotice('No speech detected. Try speaking closer to the microphone.')
      // React may not have rendered the final update yet.
      return words ? recording.before + (recording.before && !/\s$/.test(recording.before) ? ' ' : '') + words + (recording.after && !/^\s/.test(recording.after) ? ' ' : '') + recording.after : recording.original
    } catch (error) {
      if (current(recording)) setError(error instanceof Error ? error.message : 'Transcription failed. Your draft is kept.')
      return null
    } finally {
      if (active.current === recording) { active.current = null; setPhase('idle'); field.current?.focus() }
    }
  }
  async function start() {
    if (active.current || !field.current) return
    setError(''); setNotice(''); setPhase('starting')
    const input = field.current
    const recording: Recording = { capture: new DictationCapture(), controller: new AbortController(), original: input.value, before: input.value.slice(0, input.selectionStart), after: input.value.slice(input.selectionEnd), timer: 0, limit: 0, pending: null, stopping: false }
    active.current = recording
    try {
      await api('/dictation/start', {})
      if (!current(recording)) return
      await recording.capture.start(deviceId)
      if (!current(recording)) { recording.capture.cancel(); return }
      setPhase('listening'); setNotice('Listening — words appear after a short delay.')
      const poll = () => {
        if (!current(recording) || recording.stopping) return
        recording.pending = (async () => {
          try {
            const words = (await transcribeAudio(recording.capture.wav(), recording.controller.signal)).replace(/\s+/g, ' ').trim()
            if (!recording.stopping) insert(recording, words)
          } catch (error) {
            if (current(recording) && !recording.stopping) {
              recording.capture.cancel(); recording.controller.abort(); clearTimeout(recording.limit)
              active.current = null; setPhase('idle'); setNotice(''); setError(error instanceof Error ? error.message : 'Transcription failed.')
            }
          }
        })().finally(() => { if (current(recording) && !recording.stopping) recording.timer = window.setTimeout(poll, 1800) })
      }
      recording.timer = window.setTimeout(poll, 2200)
      recording.limit = window.setTimeout(() => { void finish() }, 119000)
    } catch (error) {
      if (current(recording)) { cancel(); setError(error instanceof Error ? error.message : 'Microphone could not start.') }
    }
  }
  return { phase, error, notice, start, finish, cancel }
}
