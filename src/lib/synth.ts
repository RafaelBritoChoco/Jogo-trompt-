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

  const osc = audioCtx!.createOscillator();
  const gainNode = audioCtx!.createGain();

  // Create an articulation gap so repeated notes have a clear "Ta" attack and don't bleed
  const playingDuration = Math.max(0.05, durationSec * 0.85); // 85% sound, 15% silence

  // Trumpet-like waveform (sawtooth is a decent simple approximation for brass)
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, audioCtx!.currentTime);

  // Envelope
  gainNode.gain.setValueAtTime(0, audioCtx!.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx!.currentTime + 0.02); // Faster Attack
  gainNode.gain.setValueAtTime(0.3, audioCtx!.currentTime + Math.max(0.02, playingDuration - 0.05)); // Sustain
  gainNode.gain.linearRampToValueAtTime(0, audioCtx!.currentTime + playingDuration); // Faster Release

  // Filter to make it less harsh
  const filter = audioCtx!.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, audioCtx!.currentTime);
  filter.frequency.exponentialRampToValueAtTime(800, audioCtx!.currentTime + playingDuration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx!.destination);

  osc.start();
  osc.stop(audioCtx!.currentTime + playingDuration);
}
