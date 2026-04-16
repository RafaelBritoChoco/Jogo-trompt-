import React, { useState } from 'react';
import { X, Activity } from 'lucide-react';
import { Exercise } from '../lib/exercises';

interface ScaleGeneratorModalProps {
  onGenerate: (exercise: Exercise) => void;
  onClose: () => void;
}

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const TYPES = [
  { id: 'major', name: 'Major Scale' },
  { id: 'minor', name: 'Natural Minor Scale' },
  { id: 'major_arp', name: 'Major Arpeggio' },
  { id: 'minor_arp', name: 'Minor Arpeggio' }
];

// Helper to generate ABC notation for scales
function generateScaleAbc(root: string, type: string): string {
  // Very simplified ABC generator for prototype
  // In a real app, this would properly handle key signatures and octaves
  const rootMap: Record<string, string> = {
    'C': 'C', 'C#': '^C', 'D': 'D', 'Eb': '_E', 'E': 'E', 'F': 'F', 
    'F#': '^F', 'G': 'G', 'Ab': '_A', 'A': 'A', 'Bb': '_B', 'B': 'B'
  };
  
  const scalePatterns: Record<string, number[]> = {
    'major': [0, 2, 4, 5, 7, 9, 11, 12],
    'minor': [0, 2, 3, 5, 7, 8, 10, 12],
    'major_arp': [0, 4, 7, 12],
    'minor_arp': [0, 3, 7, 12]
  };
  
  const allNotes = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const rootIndex = allNotes.indexOf(rootMap[root].replace('_', '^')); // Simplified enharmonic handling
  
  const pattern = scalePatterns[type];
  let abcNotes = [];
  
  for (let i = 0; i < pattern.length; i++) {
    const noteIndex = (rootIndex + pattern[i]) % 12;
    const octaveShift = Math.floor((rootIndex + pattern[i]) / 12);
    let noteStr = allNotes[noteIndex];
    
    // Add octave marker if needed (lowercase for higher octave in ABC)
    if (octaveShift > 0 || noteIndex < rootIndex) {
      noteStr = noteStr.toLowerCase();
    }
    
    abcNotes.push(noteStr);
  }
  
  // Add descending
  const descending = [...abcNotes].reverse().slice(1);
  const fullSequence = [...abcNotes, ...descending];
  
  // Format into measures of 4
  let body = '';
  for (let i = 0; i < fullSequence.length; i++) {
    body += fullSequence[i] + ' ';
    if ((i + 1) % 4 === 0) body += '| ';
  }
  
  return `X: 1
T: ${root} ${TYPES.find(t => t.id === type)?.name}
M: 4/4
L: 1/4
K: C
${body}|`;
}

export default function ScaleGeneratorModal({ onGenerate, onClose }: ScaleGeneratorModalProps) {
  const [rootNote, setRootNote] = useState('C');
  const [scaleType, setScaleType] = useState('major');

  const handleGenerate = () => {
    const abc = generateScaleAbc(rootNote, scaleType);
    const title = `${rootNote} ${TYPES.find(t => t.id === scaleType)?.name}`;
    
    const exercise: Exercise = {
      id: `generated-${rootNote}-${scaleType}-${Date.now()}`,
      title,
      category: 'Generated Scales',
      abc,
      difficulty: 'Beginner',
      dateAdded: Date.now()
    };
    
    onGenerate(exercise);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0d14] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <Activity className="text-[#d4af37]" size={20} />
            <h2 className="text-[#d4af37] font-bold tracking-wider uppercase">Scale Generator</h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-white/50">Root Note</label>
            <div className="grid grid-cols-4 gap-2">
              {NOTES.map(note => (
                <button
                  key={note}
                  onClick={() => setRootNote(note)}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    rootNote === note 
                      ? 'bg-[#d4af37] text-black' 
                      : 'bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {note}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-col gap-2 mt-2">
            <label className="text-xs uppercase tracking-wider text-white/50">Type</label>
            <div className="flex flex-col gap-2">
              {TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setScaleType(type.id)}
                  className={`py-3 px-4 rounded-lg font-bold text-left transition-colors ${
                    scaleType === type.id 
                      ? 'bg-[#d4af37] text-black' 
                      : 'bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-5 border-t border-white/10 bg-white/5 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            className="px-5 py-2.5 rounded-lg font-bold bg-[#d4af37] text-black hover:bg-[#d4af37]/80 transition-colors"
          >
            Generate & Play
          </button>
        </div>
      </div>
    </div>
  );
}
