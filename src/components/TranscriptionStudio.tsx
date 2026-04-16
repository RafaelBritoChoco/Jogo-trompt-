import React, { useState, useEffect } from 'react';
import SheetMusic from './SheetMusic';
import { refineSheetMusicPdf } from '../lib/geminiService';
import { Send, Check, X, Loader2, MessageSquare, Edit2 } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface TranscriptionStudioProps {
  file: File;
  initialAbc: string;
  onApprove: (finalAbc: string) => void;
  onCancel: () => void;
}

export function TranscriptionStudio({ file, initialAbc, onApprove, onCancel }: TranscriptionStudioProps) {
  const [currentAbc, setCurrentAbc] = useState(initialAbc);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  const handleSend = async () => {
    if (!chatInput.trim() || isProcessing) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsProcessing(true);

    try {
      const newAbc = await refineSheetMusicPdf(file, currentAbc, userMsg);
      setCurrentAbc(newAbc);
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Partitura atualizada! Verifique as mudanças na tela.' }]);
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Desculpe, ocorreu um erro ao processar sua correção. Tente novamente.' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#05070a] flex flex-col font-sans">
      {/* Header */}
      <header className="h-[60px] px-6 flex items-center justify-between border-b border-white/10 bg-black/50 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white">AI Transcription Studio</h2>
          <span className="text-xs px-2 py-1 bg-[#d4af37]/20 text-[#d4af37] rounded-md font-mono">
            {file.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-bold bg-white/5 text-white hover:bg-white/10 transition-colors text-sm flex items-center gap-2"
          >
            <X size={16} /> Cancelar
          </button>
          <button 
            onClick={() => onApprove(currentAbc)}
            className="px-4 py-2 rounded-lg font-bold bg-[#00ff88] text-[#05070a] hover:bg-[#00ff88]/80 transition-colors text-sm flex items-center gap-2 shadow-[0_0_15px_rgba(0,255,136,0.3)]"
          >
            <Check size={16} /> Aprovar e Salvar
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: PDF Viewer */}
        <div className="flex-1 border-r border-white/10 bg-white/5 flex flex-col">
          <div className="p-3 bg-black/30 border-b border-white/10 text-xs font-mono text-white/50 uppercase tracking-wider">
            Original PDF
          </div>
          <div className="flex-1 p-4 overflow-auto custom-scrollbar flex justify-center bg-[#2a2a2a]">
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="text-white/30">Carregando PDF...</div>}
              error={<div className="text-red-400">Erro ao carregar o PDF.</div>}
            >
              <Page 
                pageNumber={pageNumber} 
                renderTextLayer={false} 
                renderAnnotationLayer={false}
                className="shadow-xl"
                width={Math.min(window.innerWidth / 2 - 40, 800)} // Responsive width
              />
            </Document>
            {numPages && numPages > 1 && (
              <div className="absolute bottom-4 left-1/4 -translate-x-1/2 flex items-center gap-4 bg-black/80 px-4 py-2 rounded-full backdrop-blur-md">
                <button 
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber(prev => prev - 1)}
                  className="text-white disabled:opacity-30"
                >
                  &lt;
                </button>
                <span className="text-white text-sm">
                  Página {pageNumber} de {numPages}
                </span>
                <button 
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(prev => prev + 1)}
                  className="text-white disabled:opacity-30"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sheet Music & Chat */}
        <div className="flex-1 flex flex-col w-full lg:w-1/2 bg-[#0a0d14]">
          {/* Top Half: Sheet Music */}
          <div className="flex-1 border-b border-white/10 flex flex-col min-h-[300px]">
            <div className="p-3 bg-black/30 border-b border-white/10 flex justify-between items-center">
              <span className="text-xs font-mono text-[#d4af37] uppercase tracking-wider">
                Generated Sheet Music
              </span>
              <div className="flex bg-black/50 rounded-lg p-1">
                <button 
                  onClick={() => setIsManualEdit(false)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${!isManualEdit ? 'bg-[#d4af37] text-black' : 'text-white/50 hover:text-white'}`}
                >
                  <MessageSquare size={12} /> Visualizar
                </button>
                <button 
                  onClick={() => setIsManualEdit(true)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${isManualEdit ? 'bg-[#d4af37] text-black' : 'text-white/50 hover:text-white'}`}
                >
                  <Edit2 size={12} /> Editor ABC
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-white custom-scrollbar">
              {isManualEdit ? (
                <textarea 
                  value={currentAbc}
                  onChange={(e) => setCurrentAbc(e.target.value)}
                  className="w-full h-full min-h-[300px] bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50 resize-none"
                  spellCheck={false}
                />
              ) : (
                <SheetMusic abcNotation={currentAbc} currentNoteIndex={-1} />
              )}
            </div>
          </div>

          {/* Bottom Half: Chat Interface */}
          <div className="h-[250px] flex flex-col bg-black/20">
            <div className="p-3 bg-black/30 border-b border-white/10 text-xs font-mono text-white/50 uppercase tracking-wider">
              Corrections Chat
            </div>
            
            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {chatHistory.length === 0 ? (
                <div className="text-center text-white/30 text-sm mt-4">
                  A partitura está correta? Se não, diga à IA o que ela errou.<br/>
                  Ex: "O compasso 3 está errado, a primeira nota é um Fá sustenido."
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-[#d4af37] text-black rounded-tr-none' 
                        : 'bg-white/10 text-white rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white/5 text-white/50 rounded-lg rounded-tl-none p-3 text-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> A IA está corrigindo a partitura...
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-white/10 bg-black/40 flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ex: Remova as notas de adorno do compasso 5..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#d4af37]/50"
                disabled={isProcessing}
              />
              <button 
                onClick={handleSend}
                disabled={isProcessing || !chatInput.trim()}
                className="bg-[#d4af37] text-black p-2 rounded-lg hover:bg-[#d4af37]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
