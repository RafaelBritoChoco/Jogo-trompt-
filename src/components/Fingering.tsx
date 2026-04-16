import React from 'react';

interface FingeringProps {
  valves: [boolean, boolean, boolean];
  noteName?: string;
}

const FINGER_NAMES = ['INDEX', 'MIDDLE', 'RING'];

export default function Fingering({ valves, noteName }: FingeringProps) {
  return (
    <div className="bg-white/5 border border-white/5 rounded-[16px] p-5 backdrop-blur-[10px] flex flex-col items-center gap-6">
      <div className="w-full flex justify-between items-center">
        <h3 className="text-[0.7rem] uppercase tracking-[1px] text-[#d4af37]">Fingering</h3>
        {noteName && (
          <div className="text-right">
            <span className="text-xl text-[#d4af37] font-bold">{noteName}</span>
          </div>
        )}
      </div>
      
      <div className="flex justify-center gap-3 w-full">
        {valves.map((isPressed, index) => (
          <div key={index} className="flex flex-col items-center gap-2">
            <div 
              className={`w-10 h-10 border-[2px] border-[#d4af37] rounded-full flex items-center justify-center transition-all duration-300
                ${isPressed ? 'bg-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.6)]' : 'bg-transparent'}`}
            >
              <span className={`font-black text-lg ${isPressed ? 'text-[#05070a]' : 'text-white/30'}`}>
                {index + 1}
              </span>
            </div>
            <span className="font-mono text-[#d4af37] text-[0.55rem]">{FINGER_NAMES[index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
