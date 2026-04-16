import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Play, Square, ZoomIn, ZoomOut } from 'lucide-react';
import { playNote } from '../lib/synth';

interface SheetMusicProps {
  abcNotation: string;
  currentNoteIndex: number;
  transposeSteps?: number;
  onNoteSelect?: (index: number | null) => void;
  onNoteDoubleClick?: (index: number) => void;
  onPlayNote?: (index: number) => void;
  onPlay?: () => void;
  onStop?: () => void;
  paperColor?: string;
}

export default function SheetMusic({ 
  abcNotation, 
  currentNoteIndex, 
  transposeSteps, 
  onNoteSelect, 
  onNoteDoubleClick,
  onPlayNote, 
  onPlay, 
  onStop,
  paperColor = '#ffffff'
}: SheetMusicProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!paperRef.current) return;

    const visualObj = abcjs.renderAbc(paperRef.current, abcNotation, {
      responsive: 'resize',
      add_classes: true,
      staffwidth: 800 * zoom,
      visualTranspose: transposeSteps || 0,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
    })[0];

    // Add click listeners to notes and background
    const svg = paperRef.current.querySelector('svg');
    if (svg) {
      // Background click to deselect
      svg.addEventListener('click', (e) => {
        const target = e.target as SVGElement;
        if (!target.closest('.abcjs-note') && onNoteSelect) {
          onNoteSelect(null);
        }
      });

      const notes = svg.querySelectorAll('.abcjs-note');
      notes.forEach((note, index) => {
        note.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent background click
          if (onNoteSelect) onNoteSelect(index);
          if (onPlayNote) onPlayNote(index);
        });
        
        note.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (onNoteDoubleClick) onNoteDoubleClick(index);
        });
      });
    }

    // Highlight the current note using DOM order to guarantee sync
    if (visualObj && visualObj.lines) {
      if (svg) {
        const highlighted = svg.querySelectorAll('.highlighted-note');
        highlighted.forEach(el => el.classList.remove('highlighted-note'));

        const notes = svg.querySelectorAll('.abcjs-note');
        if (notes[currentNoteIndex]) {
          notes[currentNoteIndex].classList.add('highlighted-note');
        }
      }
    }
  }, [abcNotation, currentNoteIndex, zoom, transposeSteps, onNoteSelect, onPlayNote]);

  return (
    <div className="w-full bg-white rounded-xl p-4 relative shadow-[inset_0_0_50px_rgba(0,0,0,0.1)] flex flex-col items-center">
      <div className="flex gap-2 mb-4 w-full justify-center">
        <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} className="p-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"><ZoomIn size={20} className="text-black"/></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} className="p-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"><ZoomOut size={20} className="text-black"/></button>
        <button onClick={onPlay} className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"><Play size={20}/></button>
        <button onClick={onStop} className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"><Square size={20}/></button>
      </div>
      <style>{`
        .abcjs-container path, .abcjs-container text, .abcjs-container tspan { 
          fill: #000000 !important; 
          stroke: #000000 !important; 
        }
        .highlighted-note path, .highlighted-note text, .highlighted-note tspan { 
          fill: #4ade80 !important; /* Softer green */
          stroke: #4ade80 !important; 
        }
        .abcjs-note:hover path, .abcjs-note:hover text, .abcjs-note:hover tspan { 
          fill: #d4af37 !important; 
          stroke: #d4af37 !important; 
          cursor: pointer; 
        }
      `}</style>
      <div ref={paperRef} className="w-full overflow-x-auto rounded-lg p-4 transition-colors" style={{ backgroundColor: paperColor }} />
    </div>
  );
}
