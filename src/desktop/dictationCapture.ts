import workletUrl from './dictation-worklet.js?url&no-inline'

export class DictationCapture {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[] = []
  private count = 0
  private cancelled = false
  private flushed: (() => void) | null = null
  async start(deviceId = '') {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this window.')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false })
    } catch (error) {
      if (deviceId && error instanceof DOMException && ['OverconstrainedError', 'NotFoundError'].includes(error.name)) throw new Error('The selected microphone is unavailable. Right-click the mic button to choose an input.')
      throw error
    }
    if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); throw new Error('Recording cancelled.') }
    this.stream = stream
    try {
      const context = new AudioContext({ sampleRate: 16000 })
      this.context = context
      await context.audioWorklet.addModule(workletUrl)
      if (this.cancelled) throw new Error('Recording cancelled.')
      const node = new AudioWorkletNode(context, 'dictation-capture')
      this.node = node
      node.port.onmessage = event => {
        if (event.data.flushed) { this.flushed?.(); this.flushed = null; return }
        const samples = event.data.samples as Float32Array
        // Two minutes maximum; never grow an unbounded recording in memory.
        if (samples && this.count + samples.length <= 16000 * 120) { this.chunks.push(samples); this.count += samples.length }
      }
      context.createMediaStreamSource(stream).connect(node)
      node.connect(context.destination) // Worklet output is silence, never microphone monitoring.
      await context.resume()
    } catch (error) { this.cancel(); throw error }
  }
  wav(): Blob {
    const data = new ArrayBuffer(44 + this.count * 2)
    const view = new DataView(data)
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
    text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    text(36, 'data'); view.setUint32(40, this.count * 2, true)
    let offset = 44
    for (const chunk of this.chunks) for (const sample of chunk) { view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 32767, true); offset += 2 }
    return new Blob([data], { type: 'audio/wav' })
  }
  async stop(): Promise<Blob> {
    this.stream?.getTracks().forEach(track => track.stop())
    if (this.node && this.context?.state === 'running') await new Promise<void>(resolve => {
      const timeout = window.setTimeout(resolve, 500)
      this.flushed = () => { clearTimeout(timeout); resolve() }
      this.node!.port.postMessage('flush')
    })
    const wav = this.wav()
    this.cancel()
    return wav
  }
  cancel() {
    this.cancelled = true
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null
    this.node?.disconnect(); this.node = null
    void this.context?.close().catch(() => {}); this.context = null
    this.chunks = []; this.count = 0
  }
}
