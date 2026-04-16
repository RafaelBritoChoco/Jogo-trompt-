import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { CHORD_DICTIONARY, TRUMPET_NOTES } from '../lib/trumpetData';
import Fingering from './Fingering';

interface ChordDictionaryProps {
  onClose: () => void;
}

export default function ChordDictionary({ onClose }: ChordDictionaryProps) {
  const [search, setSearch] = useState('');
  const [selectedChord, setSelectedChord] = useState(CHORD_DICTIONARY[0]);

  const filteredChords = CHORD_DICTIONARY.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#05070a] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <h2 className="text-xl font-bold text-[#d4af37] tracking-widest uppercase">Chord Dictionary</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-1/3 border-r border-white/10 flex flex-col bg-white/[0.02]">
            <div className="p-4 border-b border-white/10 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input 
                  type="text" 
                  placeholder="Search chords..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#d4af37]/50"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredChords.map(chord => (
                <button
                  key={chord.name}
                  onClick={() => setSelectedChord(chord)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${selectedChord.name === chord.name ? 'bg-[#d4af37]/20 text-[#d4af37] font-bold' : 'text-white/70 hover:bg-white/5'}`}
                >
                  {chord.name}
                </button>
              ))}
              {filteredChords.length === 0 && (
                <div className="p-4 text-center text-white/30 text-sm">No chords found.</div>
              )}
            </div>
          </div>
          
          {/* Content */}
          <div className="w-2/3 p-8 overflow-y-auto bg-gradient-to-b from-transparent to-black/40">
            <h3 className="text-3xl font-bold text-white mb-8">{selectedChord.name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {selectedChord.notes.map((noteName, idx) => {
                const noteData = TRUMPET_NOTES.find(n => n.name === noteName);
                if (!noteData) return null;
                return (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center relative">
                    <div className="text-2xl font-bold text-[#d4af37] mb-6">{noteData.name}</div>
                    <Fingering valves={noteData.fingering} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
