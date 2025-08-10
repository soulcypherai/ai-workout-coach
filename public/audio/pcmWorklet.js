// Audio Worklet Processor for PCM streaming
class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isRecording = false;
    
    this.port.onmessage = (event) => {
      if (event.data.command === 'start') {
        this.isRecording = true;
        this.bufferIndex = 0;
        this.buffer.fill(0);
        console.log('[Worklet] Recording started');
      } else if (event.data.command === 'stop') {
        this.isRecording = false;
        console.log('[Worklet] Recording stopped, flushing buffer.');
        this.flush();
        this.bufferIndex = 0;
      }
    };
  }

  flush() {
    if (this.bufferIndex > 0) {
      const pcm16 = new Int16Array(this.bufferIndex);
      for (let j = 0; j < this.bufferIndex; j++) {
        const s = this.buffer[j];
        if (isNaN(s)) {
          pcm16[j] = 0;
          continue;
        }
        pcm16[j] = Math.max(-1, Math.min(1, s)) * 0x7FFF;
      }

      this.port.postMessage({
        type: 'audioData',
        data: pcm16,
      });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) {
      return true;
    }

    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0];

    for (let i = 0; i < inputChannel.length; i++) {
      const sample = inputChannel[i];
      if (isNaN(sample)) {
        continue;
      }
      this.buffer[this.bufferIndex++] = sample;

      if (this.bufferIndex >= this.bufferSize) {
        const pcm16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = this.buffer[j];
          pcm16[j] = isNaN(s) ? 0 : Math.max(-1, Math.min(1, s)) * 0x7FFF;
        }

        this.port.postMessage({
          type: 'audioData',
          data: pcm16,
        });

        this.buffer.fill(0);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor); 