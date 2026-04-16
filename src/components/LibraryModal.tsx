import React, { useState, useMemo } from 'react';
import { X, Search, Trash2, Play, Music, Clock, BarChart } from 'lucide-react';
import { Exercise } from '../lib/exercises';

interface LibraryModalProps {
  customExercises: Exercise[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

type SortOption = 'dateDesc' | 'dateAsc' | 'title' | 'composer' | 'difficulty';

export default function LibraryModal({ customExercises, onSelect, onDelete, onClose }: LibraryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc');

  const filteredAndSorted = useMemo(() => {
    let result = [...customExercises];
    
    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(ex => 
        ex.title.toLowerCase().includes(q) || 
        (ex.composer && ex.composer.toLowerCase().includes(q))
      );
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'dateDesc':
          return (b.dateAdded || 0) - (a.dateAdded || 0);
        case 'dateAsc':
          return (a.dateAdded || 0) - (b.dateAdded || 0);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'composer':
          return (a.composer || '').localeCompare(b.composer || '');
        case 'difficulty': {
          const diffMap = { 'Beginner': 1, 'Intermediate': 2, 'Advanced': 3 };
          const valA = diffMap[a.difficulty || 'Intermediate'] || 2;
          const valB = diffMap[b.difficulty || 'Intermediate'] || 2;
          return valA - valB;
        }
        default:
          return 0;
      }
    });
    
    return result;
  }, [customExercises, searchQuery, sortBy]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0d14] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <Music className="text-[#d4af37]" size={24} />
            <h2 className="text-[#d4af37] text-xl font-bold tracking-wider uppercase">My Library</h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        {/* Toolbar */}
        <div className="p-4 border-b border-white/10 bg-black/20 flex flex-col sm:flex-row gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
            <input 
              type="text" 
              placeholder="Search by title or composer..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-white/50">Sort By:</span>
            <select 
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37] transition-colors appearance-none"
            >
              <option value="dateDesc">Newest First</option>
              <option value="dateAsc">Oldest First</option>
              <option value="title">Title (A-Z)</option>
              <option value="composer">Composer (A-Z)</option>
              <option value="difficulty">Difficulty (Easy-Hard)</option>
            </select>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredAndSorted.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 gap-4">
              <Music size={48} className="opacity-20" />
              <p>No scores found in your library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAndSorted.map(ex => (
                <div key={ex.id} className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/10 transition-colors group">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-white mb-1 line-clamp-1" title={ex.title}>{ex.title}</h3>
                    <p className="text-sm text-white/50 line-clamp-1">{ex.composer || 'Unknown Composer'}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <div className="flex items-center gap-1" title="Difficulty">
                      <BarChart size={14} />
                      <span>{ex.difficulty || 'Intermediate'}</span>
                    </div>
                    {ex.dateAdded && (
                      <div className="flex items-center gap-1" title="Date Added">
                        <Clock size={14} />
                        <span>{new Date(ex.dateAdded).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 pt-4 border-t border-white/10 mt-auto">
                    <button 
                      onClick={() => onSelect(ex.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#d4af37] text-black py-2 rounded-lg font-bold hover:bg-[#d4af37]/80 transition-colors"
                    >
                      <Play size={16} /> Play
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this score?')) {
                          onDelete(ex.id);
                        }
                      }}
                      className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Delete Score"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
