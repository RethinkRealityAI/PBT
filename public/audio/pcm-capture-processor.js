/**
 * AudioWorklet: forwards microphone PCM as Float32 buffers to the main thread.
 * Main thread converts to 16-bit PCM and sends to Gemini Live at context sample rate.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch || ch.length === 0) return true;
    const copy = new Float32Array(ch.length);
    copy.set(ch);
    this.port.postMessage(copy.buffer, [copy.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
