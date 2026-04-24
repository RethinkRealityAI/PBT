// AudioWorklet processor for capturing microphone input as PCM16 at 16kHz.
// Runs on the audio rendering thread, so the main thread is free for React.
// The processor buffers incoming Float32 samples into ~20ms chunks, converts
// them to little-endian signed 16-bit PCM, and posts the bytes to the main
// thread as a transferable ArrayBuffer.

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // ~20ms at 16kHz = 320 samples. We use 2048 to keep WebSocket traffic low
    // while staying well under the Live API's 1-second realtime buffer.
    this._chunkSize = (options && options.processorOptions && options.processorOptions.chunkSize) || 2048;
    this._buffer = new Float32Array(this._chunkSize);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset === this._chunkSize) {
        this._flush();
      }
    }
    return true;
  }

  _flush() {
    const pcm16 = new Int16Array(this._chunkSize);
    for (let i = 0; i < this._chunkSize; i++) {
      const s = Math.max(-1, Math.min(1, this._buffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    this._offset = 0;
  }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
