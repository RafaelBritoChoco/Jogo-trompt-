import React, { useState } from 'react';
import { X, Check, FileCode, Play } from 'lucide-react';
import SheetMusic from './SheetMusic';

interface PasteAbcModalProps {
  onSave: (abc: string, title: string) => void;
  onClose: () => void;
}

export function PasteAbcModal({ onSave, onClose }: PasteAbcModalProps) {
  const [abcCode, setAbcCode] = useState(
`X:1
T:Nova Música
M:4/4
L:1/8
K:C
C D E F | G A B c |]`
  );
  const [title, setTitle] = useState('Nova Música');

  // Extract title from ABC if present
  const handleCodeChange = (code: string) => {
    setAbcCode(code);
    const titleMatch = code.match(/^T:(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      setTitle(titleMatch[1].trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="bg-[#0a0d14] border border-white/10 rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#d4af37]/20 flex items-center justify-center text-[#d4af37]">
              <FileCode size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Importar Código ABC</h2>
              <p className="text-sm text-white/50">Cole o código da partitura para precisão de 100%</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Code Editor */}
          <div className="flex-1 border-r border-white/10 flex flex-col bg-[#1e1e1e]">
            <div className="p-2 bg-black/40 border-b border-white/10 text-xs font-mono text-white/50 uppercase tracking-wider flex justify-between items-center">
              <span>Código ABC</span>
            </div>
            <textarea
              value={abcCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="flex-1 w-full bg-transparent text-[#d4d4d4] font-mono text-sm p-4 focus:outline-none resize-none custom-scrollbar"
              spellCheck={false}
              placeholder="Cole seu código ABC aqui..."
            />
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 flex flex-col bg-white">
            <div className="p-2 bg-black/80 text-xs font-mono text-[#d4af37] uppercase tracking-wider">
              Preview da Partitura
            </div>
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <SheetMusic abcNotation={abcCode} currentNoteIndex={-1} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between shrink-0">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-1">
              Nome da Música
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#d4af37]/50"
              placeholder="Ex: Careless Whisper"
            />
          </div>
          
          <div className="flex gap-3 ml-4">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg font-bold text-white hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(abcCode, title)}
              disabled={!abcCode.trim() || !title.trim()}
              className="px-6 py-2 rounded-lg font-bold bg-[#d4af37] text-black hover:bg-[#d4af37]/80 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={18} /> Salvar na Biblioteca
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
