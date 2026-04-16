let audioCtx: AudioContext | null = null;

export function initSynth() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function playNote(freq: number, durationSec: number) {
  if (!audioCtx) {
    initSynth();
  }
  
  if (audioCtx!.state === 'suspended') {
    audioCtx!.resume();
  }

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  // Trumpet-like waveform (sawtooth is a decent simple approximation for brass)
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  // Envelope
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05); // Attack
  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + durationSec - 0.1); // Sustain
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + durationSec); // Release

  // Filter to make it less harsh
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + durationSec);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + durationSec);
}
