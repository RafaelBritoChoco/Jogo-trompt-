import React, { useMemo } from 'react';
import { getNoteByAbc, transposeNote } from '../lib/trumpetData';

interface GameViewProps {
  notes: {abc: string, duration: number}[];
  playheadTime: number;
  currentNoteIndex: number;
  tempo: number;
  transposeSteps?: number;
  isPitchMatching?: boolean;
  currentFreq?: number;
}

export default function GameView({ notes, playheadTime, currentNoteIndex, tempo, transposeSteps, isPitchMatching, currentFreq }: GameViewProps) {
  const BEAT_HEIGHT = 120; // Reduced from 150 for better mobile visibility

  const noteStartTimes = useMemo(() => {
    let time = 0;
    return notes.map(n => {
      const start = time;
      time += n.duration;
      return start;
    });
  }, [notes]);

  const currentNote = notes[currentNoteIndex];
  const currentBaseNote = currentNote ? getNoteByAbc(currentNote.abc) : undefined;
  const currentTargetNote = currentBaseNote ? transposeNote(currentBaseNote, transposeSteps || 0) : undefined;
  const currentFingering = currentTargetNote ? currentTargetNote.fingering : [false, false, false];
  const isCurrentNoteOpen = !currentFingering[0] && !currentFingering[1] && !currentFingering[2];

  return (
    <div className="flex flex-col w-full h-full min-h-[400px] landscape:min-h-0 lg:min-h-0 bg-black/40 border border-white/10 rounded-xl overflow-hidden relative">
      {/* Falling Blocks Area */}
      <div className="flex-1 relative flex justify-center overflow-hidden bg-gradient-to-b from-transparent to-black/60 min-h-0">
        {/* Track Background */}
        <div className="w-[200px] h-full bg-white/[0.02] border-x border-white/5 relative">
          
          {/* Beat Grid Lines */}
          {(() => {
            const startBeat = Math.floor(playheadTime);
            const lines = [];
            // Show main beats and 8th notes
            for (let b = startBeat; b < startBeat + 10; b += 0.5) {
              const relativePos = b - playheadTime;
              const bottom = 60 + (relativePos * BEAT_HEIGHT);
              if (bottom < -100 || bottom > 1200) continue;
              
              const isFullBeat = b % 1 === 0;
              const isMeasure = b % 4 === 0;
              
              lines.push(
                <div 
                  key={b}
                  className={`absolute left-0 w-full h-[1px] transition-all duration-100 
                    ${isMeasure ? 'bg-white/10' : isFullBeat ? 'bg-white/5' : 'bg-white/[0.02] border-t border-dashed border-white/5 h-0'}`}
                  style={{ bottom: `${bottom}px` }}
                >
                  {isMeasure && (
                    <span className="absolute left-1 bottom-1 text-[0.5rem] opacity-30 font-mono">
                      M{Math.floor(b/4) + 1}
                    </span>
                  )}
                </div>
              );
            }
            return lines;
          })()}
          
          {/* Hit Line Glow */}
          <div className={`absolute bottom-[60px] left-0 w-full h-[60px] bg-gradient-to-t from-[#d4af37]/20 to-transparent pointer-events-none transition-opacity duration-100 ${isPitchMatching ? 'opacity-100 from-[#00ff88]/40' : 'opacity-50'}`} />
          
          {/* Hit Line */}
          <div className={`absolute bottom-[60px] left-0 w-full h-[2px] transition-all duration-100 ${isPitchMatching ? 'bg-[#00ff88] shadow-[0_0_20px_#00ff88]' : 'bg-[#d4af37]/80 shadow-[0_0_15px_#d4af37]'}`} />
          
          {/* Cents Indicator Sidebar */}
          {currentFreq && currentFreq > 0 && currentTargetNote && (
            <div className="absolute right-0 bottom-[60px] w-4 h-[100px] bg-black/40 border-l border-white/10 z-20 flex flex-col justify-between items-center py-1">
              <div className="text-[0.4rem] text-white/30 font-mono">+50</div>
              <div className="flex-1 w-[2px] bg-white/5 relative">
                {(() => {
                  const cents = 1200 * Math.log2(currentFreq / currentTargetNote.freq);
                  const clamped = Math.max(-50, Math.min(50, cents));
                  const pos = 50 - (clamped * 1); // 50 is center, each cent is 1% if range is -50 to 50
                  return (
                    <div 
                      className="absolute left-[-3px] w-2 h-2 rounded-full transition-all duration-75"
                      style={{ 
                        top: `${pos}%`, 
                        backgroundColor: Math.abs(cents) < 10 ? '#00ff88' : '#ff4444',
                        boxShadow: `0 0 8px ${Math.abs(cents) < 10 ? '#00ff88' : '#ff4444'}`
                      }}
                    />
                  );
                })()}
              </div>
              <div className="text-[0.4rem] text-white/30 font-mono">-50</div>
            </div>
          )}

          {/* Targets */}
          <div className="absolute bottom-[40px] left-0 w-full flex justify-between px-6 z-10">
            {[0, 1, 2].map(vIndex => {
              const isPressed = currentFingering[vIndex];
              const colors = ['bg-[#00e5ff]', 'bg-[#d4af37]', 'bg-[#ff4444]'];
              const borderColors = ['border-[#00e5ff]', 'border-[#d4af37]', 'border-[#ff4444]'];
              const shadowColors = ['shadow-[#00e5ff]', 'shadow-[#d4af37]', 'shadow-[#ff4444]'];
              
              // If pitch is matching, make the pressed targets glow green
              const activeColor = isPitchMatching && isPressed ? 'bg-[#00ff88]' : colors[vIndex];
              const activeBorder = isPitchMatching && isPressed ? 'border-[#00ff88]' : borderColors[vIndex];
              const activeShadow = isPitchMatching && isPressed ? 'shadow-[#00ff88]' : shadowColors[vIndex];
              
              return (
                <div 
                  key={vIndex} 
                  className={`w-8 h-8 rounded-full border-[2px] flex items-center justify-center transition-all duration-100
                    ${isPressed ? `${activeColor} ${activeBorder} shadow-[0_0_15px_rgba(0,0,0,0.8)] ${activeShadow}` : 'border-white/20 bg-black/80'}`}
                >
                  <span className={`text-[0.65rem] font-bold ${isPressed ? 'text-black' : 'text-white/30'}`}>{vIndex + 1}</span>
                </div>
              );
            })}
          </div>

          {/* Blocks */}
          {notes.map((note, index) => {
            const baseNote = getNoteByAbc(note.abc);
            const targetNote = baseNote ? transposeNote(baseNote, transposeSteps || 0) : undefined;
            if (!targetNote) return null;

            const startTime = noteStartTimes[index];
            const relativeTime = startTime - playheadTime;
            
            // Only render notes that are somewhat visible
            if (relativeTime < -4 || relativeTime > 10) return null;

            const bottomPos = 60 + (relativeTime * BEAT_HEIGHT);
            
            // Calculate visual articulation gap so notes aren't continuously glued together
            const articulationGap = Math.max(8, Math.min(24, (note.duration * BEAT_HEIGHT) * 0.15));
            const height = Math.max(12, note.duration * BEAT_HEIGHT - articulationGap);
            
            const isOpen = !targetNote.fingering[0] && !targetNote.fingering[1] && !targetNote.fingering[2];
            const isCurrent = index === currentNoteIndex;

            // Map frequency to color (Low = Blue, High = Red)
            // Typical trumpet range: ~160Hz (E3) to ~1000Hz (C6)
            const minFreq = 160;
            const maxFreq = 1000;
            const freq = targetNote.freq;
            const normalizedFreq = Math.max(0, Math.min(1, (freq - minFreq) / (maxFreq - minFreq)));
            // Hue from 240 (Blue) to 0 (Red)
            const hue = (1 - normalizedFreq) * 240;
            
            // If it's the current note and pitch is matching, turn it bright green
            const noteColor = isCurrent && isPitchMatching ? '#00ff88' : `hsl(${hue}, 100%, 50%)`;

            return (
              <div 
                key={index}
                className="absolute left-0 w-full flex justify-between px-6 transition-colors duration-100"
                style={{ 
                  bottom: `${bottomPos}px`, 
                  height: `${Math.max(20, height)}px`
                }}
              >
                {isOpen ? (
                  <div 
                    className={`w-full h-full rounded-md border flex items-center justify-center transition-all duration-100 ${isCurrent ? (isPitchMatching ? 'border-[#00ff88] shadow-[0_0_30px_rgba(0,255,136,0.6)]' : 'border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]') : 'border-white/20'}`}
                    style={{ backgroundColor: isCurrent ? noteColor : `color-mix(in srgb, ${noteColor} 30%, transparent)` }}
                  >
                    <span className="text-white/90 font-bold drop-shadow-md">{targetNote.name}</span>
                  </div>
                ) : (
                  targetNote.fingering.map((isPressed, vIndex) => (
                    <div key={vIndex} className="w-8 flex justify-center h-full">
                      {isPressed && (
                        <div 
                          className={`w-6 h-full rounded-md transition-all duration-100 ${isCurrent && isPitchMatching ? 'shadow-[0_0_20px_rgba(0,255,136,0.8)]' : 'shadow-[0_0_10px_rgba(0,0,0,0.5)]'}`} 
                          style={{ backgroundColor: noteColor, boxShadow: isCurrent && isPitchMatching ? `0 0 20px ${noteColor}` : `0 0 10px ${noteColor}` }}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cifras / Note Names Strip */}
      <div className="h-[80px] bg-black/80 border-t border-white/10 flex items-center relative overflow-hidden shrink-0">
        {/* Center Marker for Cifras */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[#d4af37]/50 -translate-x-1/2 z-10" />
        
        <div 
          className="flex items-center absolute h-full"
          style={{ 
            left: `calc(50% - ${playheadTime * 80}px)`,
          }}
        >
          {notes.map((note, index) => {
            const baseNote = getNoteByAbc(note.abc);
            const targetNote = baseNote ? transposeNote(baseNote, transposeSteps || 0) : undefined;
            const isCurrent = index === currentNoteIndex;
            const width = note.duration * 80;
            return (
              <div 
                key={index} 
                className={`flex flex-col justify-center items-center transition-colors duration-300
                  ${isCurrent ? 'text-[#d4af37] scale-110' : 'text-white/40'}`}
                style={{ width: `${width}px` }}
              >
                <div className="font-mono text-xl font-bold">
                  {targetNote ? targetNote.name.replace(/\d/, '') : '?'}
                </div>
                <div className="text-[0.55rem] opacity-50 mt-1">
                  {targetNote ? targetNote.name : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
