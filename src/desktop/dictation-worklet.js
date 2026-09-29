class DictationCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(2048); this.used = 0;
    this.port.onmessage = () => { this.flush(); this.port.postMessage({ flushed: true }); };
  }
  flush() {
    if (this.used) this.port.postMessage({ samples: this.buffer.slice(0, this.used) });
    this.used = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.buffer[this.used++] = value;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('dictation-capture', DictationCapture);
