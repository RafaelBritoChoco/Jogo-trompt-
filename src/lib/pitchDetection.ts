export function autoCorrelate(buf: Float32Array, sampleRate: number, sensitivity: number = 50): number {
  let SIZE = buf.length;
  let rms = 0;

  // Calculate RMS (Root Mean Square) to measure volume
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / SIZE);
  
  // Map sensitivity (1-100) to RMS threshold
  // At 1% = 0.01 (requires moderately loud sound)
  // At 100% = 0.000 (captures literally any sound, no volume gate)
  const rmsThreshold = 0.01 * (1 - (sensitivity - 1) / 99);
  if (rms < rmsThreshold) return -1;

  // YIN Algorithm - Industry standard for robust pitch detection
  const halfBufferSize = Math.floor(SIZE / 2);
  const yinBuffer = new Float32Array(halfBufferSize);
  
  // Step 1: Difference function
  for (let tau = 0; tau < halfBufferSize; tau++) {
    let delta = 0;
    for (let i = 0; i < halfBufferSize; i++) {
      const diff = buf[i] - buf[i + tau];
      delta += diff * diff;
    }
    yinBuffer[tau] = delta;
  }
  
  // Step 2: Cumulative mean normalized difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfBufferSize; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = (yinBuffer[tau] * tau) / runningSum;
  }
  
  // Step 3: Absolute threshold
  // Map sensitivity (1-100) to YIN threshold
  // At 1% = 0.1 (strict, only pure tones)
  // At 100% = 0.9 (loose, accepts highly distorted waves)
  const yinThreshold = 0.1 + ((sensitivity - 1) / 99) * 0.8;
  
  let tauEstimate = -1;
  for (let tau = 2; tau < halfBufferSize; tau++) {
    if (yinBuffer[tau] < yinThreshold) {
      // Found a dip below threshold, now find the local minimum
      while (tau + 1 < halfBufferSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }
  
  // If no dip was found, fallback to absolute minimum if it's somewhat periodic
  if (tauEstimate === -1) {
    let minVal = Infinity;
    for (let tau = 2; tau < halfBufferSize; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        tauEstimate = tau;
      }
    }
    
    // REMOVED HARDCODED 0.6
    // Fallback threshold entirely controlled by sensitivity
    // At 1% = 0.3 (strict fallback)
    // At 100% = 1.0 (accepts almost any noise as a valid wave)
    const fallbackThreshold = 0.3 + ((sensitivity - 1) / 99) * 0.7;
    if (minVal > fallbackThreshold) {
      return -1; 
    }
  }
  
  // Step 4: Parabolic interpolation for sub-sample accuracy
  let T0 = tauEstimate;
  if (T0 > 0 && T0 < halfBufferSize - 1) {
    const s0 = yinBuffer[T0 - 1];
    const s1 = yinBuffer[T0];
    const s2 = yinBuffer[T0 + 1];
    const a = (s0 + s2 - 2 * s1) / 2;
    const b = (s2 - s0) / 2;
    if (a !== 0) {
      T0 = T0 - b / (2 * a);
    }
  }
  
  const freq = sampleRate / T0;
  
  // Restrict to human/instrument range
  if (freq < 60 || freq > 2000) return -1;
  
  return freq;
}
