import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Exercise } from '../lib/exercises';

interface UploadModalProps {
  abcData: string;
  defaultFilename: string;
  onSave: (exercise: Exercise) => void;
  onCancel: () => void;
}

export default function UploadModal({ abcData, defaultFilename, onSave, onCancel }: UploadModalProps) {
  const [title, setTitle] = useState(defaultFilename.replace('.pdf', ''));
  const [composer, setComposer] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');

  const handleSave = () => {
    if (!title.trim()) return;
    
    const newExercise: Exercise = {
      id: 'custom-' + Date.now(),
      title: title.trim(),
      category: 'My Library',
      abc: abcData,
      composer: composer.trim(),
      difficulty,
      dateAdded: Date.now(),
    };
    
    onSave(newExercise);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0d14] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
          <h2 className="text-[#d4af37] font-bold tracking-wider uppercase">Save to Library</h2>
          <button onClick={onCancel} className="text-white/50 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-white/50">Title *</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#d4af37] transition-colors"
              placeholder="e.g. My Awesome Song"
              autoFocus
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-white/50">Composer (Optional)</label>
            <input 
              type="text" 
              value={composer}
              onChange={e => setComposer(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#d4af37] transition-colors"
              placeholder="e.g. John Williams"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-wider text-white/50">Difficulty</label>
            <select 
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as any)}
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#d4af37] transition-colors appearance-none"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
        </div>
        
        <div className="p-5 border-t border-white/10 bg-white/5 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2.5 rounded-lg font-bold bg-[#d4af37] text-black hover:bg-[#d4af37]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Score
          </button>
        </div>
      </div>
    </div>
  );
}
