import React from 'react';
import { TrumpetNote, getNoteByFreq } from '../lib/trumpetData';

interface TunerProps {
  currentFreq: number;
  currentVolume: number;
  stability: number;
  targetNote?: TrumpetNote;
  pitchTolerance: number;
  setPitchTolerance: (val: number) => void;
  micSensitivity: number;
  setMicSensitivity: (val: number) => void;
  noiseSuppression: boolean;
  setNoiseSuppression: (val: boolean) => void;
}

export default function Tuner({ 
  currentFreq, 
  currentVolume,
  stability,
  targetNote, 
  pitchTolerance, 
  setPitchTolerance, 
  micSensitivity, 
  setMicSensitivity,
  noiseSuppression,
  setNoiseSuppression
}: TunerProps) {
  if (!targetNote) {
    return (
      <div className="bg-white/5 border border-white/5 rounded-[12px] p-4 backdrop-blur-[10px] text-center">
        <h3 className="text-[0.65rem] uppercase tracking-[1px] mb-[10px] text-[#d4af37]">Real-Time Tuner</h3>
        <div className="text-white/30 font-mono py-10">Waiting...</div>
        
        <div className="mt-4 pt-4 border-t border-white/10 text-left flex flex-col gap-4">
          <div>
            <div className="flex justify-between text-[0.65rem] opacity-70 mb-2">
              <span>Pitch Tolerance (±Cents)</span>
              <span>{pitchTolerance}c</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="100" 
              step="5"
              value={pitchTolerance} 
              onChange={(e) => setPitchTolerance(Number(e.target.value))}
              className="w-full accent-[#d4af37] h-1"
            />
          </div>
          <div>
            <div className="flex justify-between text-[0.65rem] opacity-70 mb-1">
              <span>Mic Sensitivity</span>
              <span>{micSensitivity}%</span>
            </div>
            <div className="text-[0.55rem] text-white/40 mb-2">Higher % = Picks up quieter sounds</div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              step="1"
              value={micSensitivity} 
              onChange={(e) => setMicSensitivity(Number(e.target.value))}
              className="w-full accent-[#00ff88] h-1"
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex flex-col">
              <span className="text-[0.65rem] opacity-70">Noise Cancellation</span>
              <span className="text-[0.55rem] text-white/40">Turn off for raw pitch detection</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={noiseSuppression}
                onChange={(e) => setNoiseSuppression(e.target.checked)}
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#d4af37]"></div>
            </label>
          </div>
        </div>
      </div>
    );
  }

  // Calculate cents off relative to TARGET note
  let centsOff = 0;
  if (currentFreq > 0) {
    centsOff = 1200 * Math.log2(currentFreq / targetNote.freq);
  }

  // Clamp cents for display (-100 to +100)
  const displayCents = Math.max(-100, Math.min(100, centsOff));
  
  // Calculate needle position (0 to 100%) based on -100 to +100 range
  const needlePosition = ((displayCents + 100) / 200) * 100;

  const isTuned = Math.abs(centsOff) <= pitchTolerance && currentFreq > 0;
  const isPlaying = currentFreq > 0;

  const statusColor = isPlaying ? (isTuned ? '#00ff88' : '#ff4444') : '#e0e0e0';
  
  const matchTarget = targetNote.name.match(/^([A-G])([#b]?)(.*)$/);
  const targetBase = matchTarget ? matchTarget[1] : targetNote.name;
  const targetAccidental = matchTarget ? matchTarget[2] : '';
  const targetOctave = matchTarget ? matchTarget[3] : '';

  // Determine what note they are actually playing
  const actualNote = getNoteByFreq(currentFreq);
  const matchActual = actualNote ? actualNote.name.match(/^([A-G])([#b]?)(.*)$/) : null;
  const actualBase = matchActual ? matchActual[1] : (actualNote ? actualNote.name : '?');
  const actualAccidental = matchActual ? matchActual[2] : '';
  const actualOctave = matchActual ? matchActual[3] : '';

  return (
    <div className="bg-white/5 border border-white/5 rounded-[12px] p-4 backdrop-blur-[10px] text-center flex flex-col items-center">
      <h3 className="text-[0.65rem] uppercase tracking-[1px] mb-[10px] text-[#d4af37] w-full text-left">Real-Time Tuner</h3>
      
      {/* Target Note (Top) */}
      <div className="flex flex-col items-center mb-2">
        <span className="text-[0.6rem] uppercase tracking-[2px] text-[#d4af37] opacity-80 mb-1">Target Note</span>
        <div className="text-[2.5rem] font-[200] leading-none text-white">
          {targetBase}
          {targetAccidental && <span className="text-[1.2rem]">{targetAccidental}</span>}
          <span className="text-[1rem] opacity-50 ml-1">{targetOctave}</span>
        </div>
        <div className="text-[0.7rem] font-mono text-white/50 mt-1">{targetNote.freq.toFixed(1)} Hz</div>
      </div>
      
      {/* Needle Area (Middle) */}
      <div className="w-full h-[80px] bg-black/40 rounded-[8px] my-[10px] relative overflow-hidden border border-white/5 flex flex-col justify-center">
        
        {/* Tick marks background */}
        <div className="absolute top-0 w-full flex justify-between px-2 opacity-20">
          {[...Array(21)].map((_, i) => (
            <div key={i} className={`w-[1px] ${i === 10 ? 'h-4 bg-white' : i % 5 === 0 ? 'h-3 bg-white' : 'h-2 bg-white'}`} />
          ))}
        </div>

        {/* Labels for ticks */}
        <div className="absolute top-5 w-full flex justify-between px-2 text-[0.5rem] text-white/30 font-mono">
          <span>-100c</span>
          <span className="ml-2">-50c</span>
          <span>0</span>
          <span className="mr-2">+50c</span>
          <span>+100c</span>
        </div>

        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/30 -translate-x-1/2 z-0" />
        
        {/* Tolerance markers */}
        <div 
          className="absolute top-0 bottom-0 w-[1px] bg-[#00ff88]/30 z-0"
          style={{ left: `${50 - (pitchTolerance / 2)}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-[1px] bg-[#00ff88]/30 z-0"
          style={{ left: `${50 + (pitchTolerance / 2)}%` }}
        />
        
        {/* Needle */}
        {isPlaying && (
          <div 
            className="w-[3px] h-full absolute top-0 transition-all duration-75 z-10"
            style={{ 
              left: `${needlePosition}%`, 
              background: statusColor, 
              boxShadow: `0 0 10px ${statusColor}`,
              transform: 'translateX(-50%)'
            }}
          />
        )}

        {/* Up/Down Indicators */}
        {isPlaying && !isTuned && (
          <div className="absolute w-full flex justify-center items-center z-20 pointer-events-none mt-4">
            {centsOff < 0 ? (
              <div className="flex items-center gap-2 text-[#ff4444] bg-black/60 px-2 py-1 rounded-full animate-pulse">
                <span className="text-[0.7rem] font-bold tracking-wider">RAISE PITCH</span>
                <span className="text-lg leading-none">▶</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#ff4444] bg-black/60 px-2 py-1 rounded-full animate-pulse">
                <span className="text-lg leading-none">◀</span>
                <span className="text-[0.7rem] font-bold tracking-wider">LOWER PITCH</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Current Note (Bottom Miniature) */}
      <div className="flex flex-col items-center mt-2 bg-black/20 w-full py-2 rounded-lg border border-white/5 relative overflow-hidden">
        {/* Volume background meter */}
        {isPlaying && (
          <div 
            className="absolute left-0 bottom-0 top-0 bg-[#d4af37]/10 transition-all duration-75"
            style={{ width: `${Math.min(100, currentVolume * 2000)}%` }}
          />
        )}
        
        <span className="text-[0.55rem] uppercase tracking-[1px] text-white/50 mb-1 z-10">You are playing</span>
        
        {/* Stability Warning */}
        {isPlaying && stability < 60 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-[0.45rem] text-[#ff4444] font-bold animate-pulse z-20">
            <span>⚠</span>
            <span>UNSTABLE TONE</span>
          </div>
        )}
        <div className="flex items-baseline gap-3">
          <div className="text-[1.5rem] font-[300]" style={{ color: isPlaying ? statusColor : '#e0e0e0' }}>
            {isPlaying ? (
              <>
                {actualBase}
                {actualAccidental && <span className="text-[0.8rem]">{actualAccidental}</span>}
                <span className="text-[0.7rem] opacity-50 ml-1">{actualOctave}</span>
              </>
            ) : (
              <span className="opacity-30">--</span>
            )}
          </div>
          <div className="text-[0.8rem] font-mono flex flex-col items-end" style={{ color: isPlaying ? statusColor : '#e0e0e0' }}>
            <div>{isPlaying ? currentFreq.toFixed(1) : '---'} Hz</div>
            {isPlaying && (
              <div className={`text-[0.65rem] font-bold ${Math.abs(centsOff) <= 5 ? 'text-[#00ff88]' : ''}`}>
                {centsOff > 0 ? '+' : ''}{centsOff.toFixed(1)}c
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/10 text-left w-full flex flex-col gap-4">
        <div>
          <div className="flex justify-between text-[0.65rem] opacity-70 mb-2">
            <span>Pitch Tolerance (±Cents)</span>
            <span>{pitchTolerance}c</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            step="5"
            value={pitchTolerance} 
            onChange={(e) => setPitchTolerance(Number(e.target.value))}
            className="w-full accent-[#d4af37] h-1"
          />
        </div>
        <div>
          <div className="flex justify-between text-[0.65rem] opacity-70 mb-1">
            <span>Mic Sensitivity</span>
            <span>{micSensitivity}%</span>
          </div>
          <div className="text-[0.55rem] text-white/40 mb-2">Higher % = Picks up quieter sounds</div>
          <input 
            type="range" 
            min="1" 
            max="100" 
            step="1"
            value={micSensitivity} 
            onChange={(e) => setMicSensitivity(Number(e.target.value))}
            className="w-full accent-[#00ff88] h-1"
          />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-[0.65rem] opacity-70">Noise Cancellation</span>
            <span className="text-[0.55rem] text-white/40">Turn off for raw pitch detection</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={noiseSuppression}
              onChange={(e) => setNoiseSuppression(e.target.checked)}
            />
            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#d4af37]"></div>
          </label>
        </div>
      </div>
    </div>
  );
}
