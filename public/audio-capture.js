// AudioWorklet keeps microphone capture off the UI thread. No audio leaves the device.
class ApexCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      const samples = new Float32Array(channel);
      this.port.postMessage(samples, [samples.buffer]);
    }
    return true;
  }
}
registerProcessor('apex-capture', ApexCapture);
