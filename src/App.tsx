/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Upload, Play, Square, Settings, Award, Library, FileCode } from 'lucide-react';
import SheetMusic from './components/SheetMusic';
import Fingering from './components/Fingering';
import Tuner from './components/Tuner';
import GameView from './components/GameView';
import ChordDictionary from './components/ChordDictionary';
import LibraryModal from './components/LibraryModal';
import UploadModal from './components/UploadModal';
import ScaleGeneratorModal from './components/ScaleGeneratorModal';
import { TranscriptionStudio } from './components/TranscriptionStudio';
import { PasteAbcModal } from './components/PasteAbcModal';
import { autoCorrelate } from './lib/pitchDetection';
import { playNote, initSynth } from './lib/synth';
import { TRUMPET_NOTES, getNoteByAbc, transposeNote, TrumpetNote } from './lib/trumpetData';
import { parseSheetMusicPdf, convertMusicXmlToAbc } from './lib/geminiService';
import { EXERCISES, Exercise } from './lib/exercises';
import JSZip from 'jszip';

// Parse ABC to extract just the notes for our logic
// This is a very simplified parser just for the prototype
function extractNotesFromAbc(abc: string): { abc: string, duration: number }[] {
  const lines = abc.split('\n');
  const musicLines = lines.filter(l => !l.match(/^[A-Z]:/));
  // Remove chords in brackets like "C" or [CEG] to avoid messing up the index
  let musicText = musicLines.join(' ')
    .replace(/"[^"]*"/g, '') // Remove text annotations like "C"
    .replace(/\[[^\]]*\]/g, '') // Remove chords like [CEG]
    .replace(/[-()]/g, ''); // Remove ties and slurs to prevent parser desync
  
  // Regex to match notes AND rests (z) so our index matches abcjs which counts rests as elements sometimes,
  // Actually abcjs assigns .abcjs-n0 to the first note OR rest.
  const noteRegex = /([\^_=]?[a-gA-GzZ][,']*)([0-9]*\/*[0-9]*|>|<)?/g;
  const matches = [...musicText.matchAll(noteRegex)];
  
  const notes: { abc: string, duration: number }[] = [];
  
  for (let i = 0; i < matches.length; i++) {
    const abcNote = matches[i][1];
    const durStr = matches[i][2];
    let duration = 1;
    
    if (durStr) {
      if (durStr === '>') {
        duration = 1.5;
      } else if (durStr === '<') {
        duration = 0.5;
      } else if (durStr.includes('/')) {
        const parts = durStr.split('/');
        const num = parts[0] ? parseInt(parts[0]) : 1;
        const den = parts[1] ? parseInt(parts[1]) : 2;
        duration = num / den;
      } else {
        duration = parseInt(durStr) || 1;
      }
    }
    
    if (i > 0) {
      const prevDurStr = matches[i-1][2];
      if (prevDurStr === '>') duration = 0.5;
      if (prevDurStr === '<') duration = 1.5;
    }
    
    notes.push({ abc: abcNote, duration });
  }
  
  return notes;
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [currentFreq, setCurrentFreq] = useState(-1);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [stability, setStability] = useState(100);
  const [selectedExerciseId, setSelectedExerciseId] = useState(EXERCISES[0].id);
  const [abcNotation, setAbcNotation] = useState(EXERCISES[0].abc);
  const [originalAbcNotation, setOriginalAbcNotation] = useState(EXERCISES[0].abc);
  const [customExercises, setCustomExercises] = useState<Exercise[]>(() => {
    const saved = localStorage.getItem('trumpetCustomScores');
    return saved ? JSON.parse(saved) : [];
  });
  const [notes, setNotes] = useState<{abc: string, duration: number}[]>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [score, setScore] = useState(0);
  
  // New State for Game Mode
  const [viewMode, setViewMode] = useState<'sheet' | 'game'>('game');
  const [tempo, setTempo] = useState(60);
  const [autoPlay, setAutoPlay] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [transposeSteps, setTransposeSteps] = useState(0);
  const [showChordDict, setShowChordDict] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isScaleGeneratorOpen, setIsScaleGeneratorOpen] = useState(false);
  const [isPasteAbcOpen, setIsPasteAbcOpen] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{abc: string, filename: string} | null>(null);
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const [studioInitialAbc, setStudioInitialAbc] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [sheetBgColor, setSheetBgColor] = useState('#ffffff');
  const [isUploading, setIsUploading] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [waitForPitch, setWaitForPitch] = useState(false);
  const [countInBeats, setCountInBeats] = useState(4);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [pitchTolerance, setPitchTolerance] = useState(40); // Default 40 cents tolerance
  const [micSensitivity, setMicSensitivity] = useState(50); // Default 50 (1-100)
  const micSensitivityRef = useRef(50);
  const [noiseSuppression, setNoiseSuppression] = useState(false); // Default false for music
  const [isPitchMatching, setIsPitchMatching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const currentFreqRef = useRef<number>(-1);
  const playheadTimeRef = useRef<number>(-2);
  const pitchHistoryRef = useRef<number[]>([]);
  const pitchLossTimerRef = useRef<number>(0);

  useEffect(() => {
    micSensitivityRef.current = micSensitivity;
  }, [micSensitivity]);

  useEffect(() => {
    const allExercises = [...EXERCISES, ...customExercises];
    const exercise = allExercises.find(e => e.id === selectedExerciseId);
    if (exercise) {
      setAbcNotation(exercise.abc);
      setOriginalAbcNotation(exercise.abc);
      setCurrentNoteIndex(0);
      setScore(0);
      setAutoPlay(false);
      setIsCountingIn(false);
      pitchHistoryRef.current = [];
      pitchLossTimerRef.current = 0;
    }
  }, [selectedExerciseId, customExercises]);

  useEffect(() => {
    setNotes(extractNotesFromAbc(abcNotation));
  }, [abcNotation]);

  const startListening = async (useNoiseSuppression: boolean = noiseSuppression) => {
    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: useNoiseSuppression,
          noiseSuppression: useNoiseSuppression,
          autoGainControl: useNoiseSuppression
        } 
      });
      streamRef.current = stream;
      
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 4096; // Increased from 2048 for better low-frequency resolution
      analyserRef.current = analyser;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);
      
      setIsListening(true);
      if (!requestRef.current) {
        updatePitch();
      }
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Microphone access is required for pitch detection.');
    }
  };

  // Restart mic if noise suppression changes while listening
  useEffect(() => {
    if (isListening) {
      startListening(noiseSuppression);
    }
  }, [noiseSuppression]);

  const stopListening = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsListening(false);
    setCurrentFreq(-1);
    setCurrentVolume(0);
    currentFreqRef.current = -1;
  };

  const updatePitch = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const buffer = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buffer);
    
    const rawFreq = autoCorrelate(buffer, audioContextRef.current.sampleRate, micSensitivityRef.current);
    
    // Median Filter / Smoothing Logic
    // We keep a history of the last 5 frames (~80ms)
    pitchHistoryRef.current.push(rawFreq);
    if (pitchHistoryRef.current.length > 5) {
      pitchHistoryRef.current.shift();
    }

    // Only consider valid pitches for the median
    const validPitches = pitchHistoryRef.current.filter(f => f !== -1);
    
    // Simple RMS calculation for volume visualization
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    setCurrentVolume(rms);
    
    // Stability calculation: Check variation in recent valid pitches
    const validFreqs = pitchHistoryRef.current.filter(f => f > 0);
    let stabilityRating = 100;
    if (validFreqs.length >= 5) {
      const avg = validFreqs.reduce((a, b) => a + b, 0) / validFreqs.length;
      const variance = validFreqs.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / validFreqs.length;
      const stdDev = Math.sqrt(variance);
      // stdDev > 2Hz is getting unstable for trumpet stability training
      stabilityRating = Math.max(0, 100 - (stdDev * 15));
    }
    setStability(stabilityRating);
    
    let smoothedFreq = -1;
    if (validPitches.length > 0) {
      // If we have at least 1 valid pitch in the last 5 frames, we use the median.
      // This prevents micro-drops (1 frame of silence) from breaking the tuner.
      validPitches.sort((a, b) => a - b);
      smoothedFreq = validPitches[Math.floor(validPitches.length / 2)];
    }

    setCurrentFreq(smoothedFreq);
    currentFreqRef.current = smoothedFreq;

    requestRef.current = requestAnimationFrame(updatePitch);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // Sync playheadTime when currentNoteIndex changes manually (not during autoplay)
  useEffect(() => {
    if (!autoPlay && notes.length > 0) {
      let time = 0;
      for (let i = 0; i < currentNoteIndex; i++) {
        time += notes[i].duration;
      }
      // Add a 2-beat lead-in if we are at the very beginning AND in game mode
      const newTime = (currentNoteIndex === 0 && viewMode === 'game') ? -2 : time;
      setPlayheadTime(newTime);
      playheadTimeRef.current = newTime;
    }
  }, [currentNoteIndex, autoPlay, notes, viewMode]);

  // Handle viewMode changes to fix playheadTime
  useEffect(() => {
    if (viewMode === 'sheet' && playheadTimeRef.current < 0) {
      setPlayheadTime(0);
      playheadTimeRef.current = 0;
    } else if (viewMode === 'game' && currentNoteIndex === 0 && !autoPlay && playheadTimeRef.current === 0) {
      setPlayheadTime(-2);
      playheadTimeRef.current = -2;
    }
  }, [viewMode, currentNoteIndex, autoPlay]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExt !== 'pdf' && fileExt !== 'mscz') {
      alert('Please upload a valid PDF or MuseScore (.mscz) file.');
      return;
    }

    setIsUploading(true);
    try {
      let abc = '';
      if (fileExt === 'pdf') {
        abc = await parseSheetMusicPdf(file);
      } else if (fileExt === 'mscz') {
        const zip = new JSZip();
        const content = await zip.loadAsync(file);
        // MSCZ is a zip containing .mscx (XML)
        const mscxFile = Object.values(content.files).find(f => f.name.endsWith('.mscx'));
        if (!mscxFile) throw new Error('No MSCX file found inside MSCZ');
        const xml = await mscxFile.async('string');
        abc = await convertMusicXmlToAbc(xml);
      }
      
      setStudioFile(file);
      setStudioInitialAbc(abc);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveUpload = (exercise: Exercise) => {
    setCustomExercises(prev => {
      const updated = [...prev, exercise];
      localStorage.setItem('trumpetCustomScores', JSON.stringify(updated));
      return updated;
    });
    setPendingUpload(null);
    setSelectedExerciseId(exercise.id);
  };

  const handleDeleteExercise = (id: string) => {
    setCustomExercises(prev => {
      const updated = prev.filter(ex => ex.id !== id);
      localStorage.setItem('trumpetCustomScores', JSON.stringify(updated));
      return updated;
    });
    if (selectedExerciseId === id) {
      setSelectedExerciseId(EXERCISES[0].id);
    }
  };

  const handleModifyNote = (action: 'transposeUp' | 'transposeDown' | 'addSharp' | 'addFlat' | 'makeNatural' | 'duplicate' | 'moveLeft' | 'moveRight') => {
    if (selectedNoteIndex === null) return;

    setAbcNotation(prevAbc => {
      const lines = prevAbc.split('\n');
      const headerLines = lines.filter(l => l.match(/^[A-Z]:/));
      let body = lines.filter(l => !l.match(/^[A-Z]:/)).join('\n');

      // Remove text annotations to simplify parsing for now
      let cleanBody = body.replace(/"[^"]*"/g, '');

      let currentIdx = 0;
      const noteRegex = /([\^_=]?)([a-gA-GzZ])([,']*)([\d\/]*)/g;
      
      let modifiedFreq = 0;

      const newBody = cleanBody.replace(noteRegex, (match, acc, note, oct, dur) => {
        if (currentIdx === selectedNoteIndex) {
          let newAcc = acc;
          let newNote = note;

          if (action === 'addSharp') newAcc = '^';
          if (action === 'addFlat') newAcc = '_';
          if (action === 'makeNatural') newAcc = '=';
          
          if (action === 'transposeUp') {
            const upMap: Record<string, string> = { 'C':'D', 'D':'E', 'E':'F', 'F':'G', 'G':'A', 'A':'B', 'B':'c', 'c':'d', 'd':'e', 'e':'f', 'f':'g', 'g':'a', 'a':'b' };
            if (upMap[note]) newNote = upMap[note];
          }
          if (action === 'transposeDown') {
            const downMap: Record<string, string> = { 'D':'C', 'E':'D', 'F':'E', 'G':'F', 'A':'G', 'B':'A', 'c':'B', 'd':'c', 'e':'d', 'f':'e', 'g':'f', 'a':'g', 'b':'a' };
            if (downMap[note]) newNote = downMap[note];
          }

          const resultNote = `${newAcc}${newNote}${oct}${dur}`;
          
          if (action === 'duplicate') {
            currentIdx++;
            return `${resultNote} ${resultNote}`;
          }

          // Play sound of the modified note
          if (soundEnabled && note.toLowerCase() !== 'z') {
            const tempNoteObj = getNoteByAbc(`${newAcc}${newNote}${oct}`);
            if (tempNoteObj) {
              const transposed = transposeNote(tempNoteObj, transposeSteps);
              if (transposed) playNote(transposed.freq, 0.5);
            }
          }

          currentIdx++;
          return resultNote;
        }
        currentIdx++;
        return match;
      });

      return [...headerLines, newBody].join('\n');
    });
  };

  const startPlayback = () => {
    initSynth(); // Initialize audio context on user interaction
    
    if (viewMode === 'game') {
      // In game mode, always restart from beginning when hitting play
      setCurrentNoteIndex(0);
      setPlayheadTime(-2);
      playheadTimeRef.current = -2;
    } else if (currentNoteIndex >= notes.length - 1) {
      // If at the end of the sheet, restart from beginning
      setCurrentNoteIndex(0);
      setPlayheadTime(0);
      playheadTimeRef.current = 0;
    }
    
    if (countInBeats > 0) {
      setIsCountingIn(true);
      setCurrentCount(countInBeats);
    } else {
      setAutoPlay(true);
    }
  };

  const stopPlayback = () => {
    setAutoPlay(false);
    setIsCountingIn(false);
    setCurrentNoteIndex(0);
    const resetTime = viewMode === 'game' ? -2 : 0;
    setPlayheadTime(resetTime);
    playheadTimeRef.current = resetTime;
  };

  const handleResetModifications = () => {
    if (window.confirm('Are you sure you want to revert all changes to the original score?')) {
      setAbcNotation(originalAbcNotation);
    }
  };

  const handleSaveAsNew = () => {
    const name = window.prompt('Enter a name for your modified score:');
    if (name) {
      const newId = 'custom-' + Date.now();
      const newExercise = {
        id: newId,
        title: name,
        category: 'My Scores',
        abc: abcNotation
      };
      setCustomExercises(prev => {
        const updated = [...prev, newExercise];
        localStorage.setItem('trumpetCustomScores', JSON.stringify(updated));
        return updated;
      });
      setSelectedExerciseId(newId);
    }
  };

  useEffect(() => {
    if (!isCountingIn) return;
    
    // Play first click immediately
    if (soundEnabled) playNote(880, 0.1);

    const interval = setInterval(() => {
      setCurrentCount(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCountingIn(false);
          setAutoPlay(true);
          return 0;
        }
        if (soundEnabled) playNote(440, 0.1);
        return prev - 1;
      });
    }, (60 / tempo) * 1000);

    return () => clearInterval(interval);
  }, [isCountingIn, tempo, soundEnabled]);

  // Auto-play smooth scrolling
  useEffect(() => {
    if (!autoPlay || notes.length === 0) return;

    let animationFrameId: number;
    lastTimeRef.current = performance.now();
    let lastPlayedIndex = currentNoteIndex - 1;

    const updatePlayhead = (timestamp: number) => {
      const deltaMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      
      const deltaBeats = (deltaMs / 1000) * (tempo / 60);
      
      let nextTime = playheadTimeRef.current + deltaBeats;
      
      // Find which note we are currently on
      let timeAcc = 0;
      let newIndex = notes.length - 1;
      for (let i = 0; i < notes.length; i++) {
        timeAcc += notes[i].duration;
        if (nextTime < timeAcc) {
          newIndex = i;
          break;
        }
      }
      
      const noteStartTime = timeAcc - notes[newIndex].duration;
      const currentNote = notes[newIndex];
      const noteDuration = currentNote.duration;
      const completionPercentage = (nextTime - noteStartTime) / noteDuration;
      
      let isCorrectPitch = false;
      
      if (currentNote && currentNote.abc.toLowerCase() !== 'z' && currentFreqRef.current > 0) {
        const baseNoteObj = getNoteByAbc(currentNote.abc);
        const targetNoteObj = baseNoteObj ? transposeNote(baseNoteObj, transposeSteps) : null;
        
        if (targetNoteObj) {
          const centsDiff = 1200 * Math.log2(currentFreqRef.current / targetNoteObj.freq);
          isCorrectPitch = Math.abs(centsDiff) <= pitchTolerance;
        }
      }

      if (waitForPitch && viewMode === 'game') {
        if (currentNote && currentNote.abc.toLowerCase() !== 'z') {
          // Allow continuation if pitch is matching OR if we've already played 20% of the note correctly
          // Or if we are in the initial grace period (0.15 beats)
          if (!isCorrectPitch) {
            pitchLossTimerRef.current += deltaBeats;
            
            // Leniency: if already completed 20% of note or inside initial grace period, don't freeze yet
            const gracePeriod = Math.max(0.15, noteDuration * 0.2);
            
            if (pitchLossTimerRef.current > gracePeriod) {
              if (nextTime > noteStartTime) {
                nextTime = Math.max(noteStartTime, playheadTimeRef.current);
              }
            }
          } else {
            pitchLossTimerRef.current = 0;
          }
        } else {
          pitchLossTimerRef.current = 0;
        }
      } else {
        pitchLossTimerRef.current = 0;
      }
      
      // Update refs and state
      playheadTimeRef.current = nextTime;
      setPlayheadTime(nextTime);
      setIsPitchMatching(isCorrectPitch);
      
      if (isCorrectPitch && nextTime > noteStartTime) {
        setScore(prev => prev + 1);
      }

      if (newIndex !== currentNoteIndex) {
        setCurrentNoteIndex(newIndex);
      }
      
      // Play sound if we entered a new note and it's not a rest
      if (newIndex !== lastPlayedIndex && newIndex < notes.length) {
        if (nextTime >= noteStartTime) {
          lastPlayedIndex = newIndex;
          const noteData = notes[newIndex];
          if (noteData.abc.toLowerCase() !== 'z') {
            const baseNote = getNoteByAbc(noteData.abc);
            const targetNote = baseNote ? transposeNote(baseNote, transposeSteps) : undefined;
            
            if (targetNote && soundEnabled) {
               const durationSec = noteData.duration * (60 / tempo);
               playNote(targetNote.freq, durationSec);
            }
          }
        }
      }
      
      if (newIndex >= notes.length - 1 && nextTime >= timeAcc) {
        if (isLooping) {
          const resetTime = viewMode === 'game' ? -2 : 0;
          playheadTimeRef.current = resetTime;
          setPlayheadTime(resetTime);
          lastPlayedIndex = -1;
          animationFrameId = requestAnimationFrame(updatePlayhead);
        } else {
          setAutoPlay(false);
        }
      } else {
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    };
    
    animationFrameId = requestAnimationFrame(updatePlayhead);

    return () => cancelAnimationFrame(animationFrameId);
  }, [autoPlay, tempo, notes, transposeSteps, soundEnabled, waitForPitch, viewMode, pitchTolerance]);

  const currentAbcNote = notes[currentNoteIndex]?.abc;
  const baseNote = currentAbcNote ? getNoteByAbc(currentAbcNote) : undefined;
  const targetNote = baseNote ? transposeNote(baseNote, transposeSteps) : undefined;

  return (
    <div className="h-screen w-full bg-[#05070a] text-[#e0e0e0] font-sans flex flex-col overflow-hidden">
      <header className="h-[60px] px-4 md:px-10 flex items-center justify-between border-b border-white/10 bg-black/50 shrink-0">
        <div className="text-[1.2rem] font-bold tracking-[2px] text-[#d4af37] uppercase">MaestroVibe</div>
        <div className="text-[0.9rem] opacity-70 font-mono hidden md:block">
          {EXERCISES.find(e => e.id === selectedExerciseId)?.title || "Custom Score"} • Bb TRUMPET
        </div>
        <div className="flex items-center gap-[15px]">
          <button 
            onClick={() => setIsLibraryOpen(true)}
            className="px-4 py-2 rounded-lg font-bold bg-[#d4af37]/10 text-[#d4af37] hover:bg-[#d4af37]/20 border border-[#d4af37]/20 transition-colors text-sm hidden md:flex items-center gap-2"
          >
            <Library size={16} /> My Library
          </button>
          <button 
            onClick={() => setShowChordDict(true)}
            className="px-4 py-2 rounded-lg font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm hidden md:block"
          >
            Chord Dictionary
          </button>
          <div className="flex items-center gap-[15px] bg-white/5 px-4 py-2 rounded-[20px]">
            <span className="opacity-50 text-[0.8rem]">SCORE</span>
            <span className="font-bold">{score} PTS</span>
            <div className="w-3 h-3 bg-[#00ff88] rounded-full shadow-[0_0_10px_#00ff88]"></div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-2 flex flex-col landscape:grid landscape:grid-cols-[140px_1fr_160px] md:grid md:grid-cols-[200px_1fr_220px] lg:grid-cols-[220px_1fr_240px] gap-2 overflow-y-auto landscape:overflow-hidden md:overflow-hidden custom-scrollbar">
        {/* Left Panel */}
        <section className="min-w-0 flex flex-col gap-2 shrink-0 landscape:shrink landscape:overflow-y-auto landscape:min-h-0 landscape:pr-1 md:shrink md:overflow-y-auto md:min-h-0 md:pr-1 custom-scrollbar">
          <div className="bg-white/5 border border-white/5 rounded-[12px] p-3 backdrop-blur-[10px] shrink-0">
            <h3 className="text-[0.65rem] uppercase tracking-[1px] mb-[10px] text-[#d4af37]">Practice Controls</h3>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1 mb-1">
                <span className="text-[0.65rem] opacity-70">Select Exercise</span>
                <select 
                  value={selectedExerciseId}
                  onChange={(e) => setSelectedExerciseId(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-[#d4af37]/50"
                >
                  <option value="" disabled>Custom / Uploaded</option>
                  {[...EXERCISES, ...customExercises].map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.category}: {ex.title}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={() => { setCurrentNoteIndex(0); setScore(0); setAutoPlay(false); }}
                className="py-1.5 rounded-lg font-bold text-[0.65rem] bg-white/10 hover:bg-white/20 transition-colors"
              >
                Reset
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={`py-1.5 rounded-lg font-bold text-[0.65rem] bg-white/5 hover:bg-white/10 border border-white/10 border-dashed flex items-center justify-center gap-1.5 mt-1 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Upload className="w-3 h-3" /> {isUploading ? 'Lendo...' : 'Upload PDF/MSCZ'}
              </button>
              <button 
                onClick={() => setIsPasteAbcOpen(true)}
                className="py-1.5 rounded-lg font-bold text-[0.65rem] bg-white/5 hover:bg-white/10 border border-white/10 border-dashed flex items-center justify-center gap-1.5"
              >
                <FileCode className="w-3 h-3 text-[#d4af37]" /> Colar ABC
              </button>
              <button 
                onClick={() => setIsScaleGeneratorOpen(true)}
                className="py-1.5 rounded-lg font-bold text-[0.65rem] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5"
              >
                <Award className="w-3 h-3 text-[#d4af37]" /> Scales & Arpeggios
              </button>
              <input 
                type="file" 
                accept=".pdf,.mscz" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex justify-between text-[0.65rem] opacity-70">
                  <span>Count-in</span>
                  <select 
                    value={countInBeats} 
                    onChange={e => setCountInBeats(Number(e.target.value))}
                    className="bg-transparent text-right outline-none text-[#d4af37]"
                  >
                    <option value={0}>Off</option>
                    <option value={2}>2 Beats</option>
                    <option value={4}>4 Beats</option>
                    <option value={8}>8 Beats</option>
                  </select>
                </div>
                <div className="flex justify-between text-[0.65rem] opacity-70 mt-1">
                  <span>Loop Playback</span>
                  <input 
                    type="checkbox" 
                    checked={isLooping} 
                    onChange={e => setIsLooping(e.target.checked)}
                    className="accent-[#d4af37] w-3 h-3"
                  />
                </div>
              </div>

              <div className="mt-1 flex flex-col gap-1 bg-white/5 p-2 rounded-lg border border-white/5">
                <div className="flex justify-between items-center text-[0.65rem] mb-1">
                  <div className="flex items-center gap-2">
                    <span className="opacity-70">Speed (BPM)</span>
                    {(autoPlay || isCountingIn) && (
                      <div className={`w-2 h-2 rounded-full transition-all duration-75 ${Math.floor(playheadTime * 2) % 2 === 0 ? 'bg-[#d4af37] shadow-[0_0_8px_#d4af37]' : 'bg-white/10'}`} />
                    )}
                  </div>
                  <span className="font-mono text-[#d4af37] font-bold">{tempo}</span>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={() => setTempo(t => Math.max(40, t - 5))} className="w-6 h-6 flex items-center justify-center bg-white/10 rounded hover:bg-white/20 text-[0.6rem]">-5</button>
                    <input 
                    type="range" 
                    min="40" 
                    max="200" 
                    value={tempo} 
                    onChange={(e) => setTempo(Number(e.target.value))}
                    className="flex-1 min-w-0 accent-[#d4af37] h-1"
                  />
                  <button onClick={() => setTempo(t => Math.min(200, t + 5))} className="w-6 h-6 flex items-center justify-center bg-white/10 rounded hover:bg-white/20 text-[0.6rem]">+5</button>
                </div>
              </div>

              <div className="mt-1 flex flex-col gap-1">
                <div className="flex justify-between text-[0.65rem] opacity-70">
                  <span>Transpose</span>
                  <span>{transposeSteps > 0 ? `+${transposeSteps}` : transposeSteps}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTransposeSteps(s => s - 1)} className="px-2 py-0.5 text-xs bg-white/10 rounded hover:bg-white/20">-</button>
                  <input 
                    type="range" 
                    min="-12" 
                    max="12" 
                    value={transposeSteps} 
                    onChange={(e) => setTransposeSteps(Number(e.target.value))}
                    className="flex-1 min-w-0 w-full accent-[#d4af37] h-1"
                  />
                  <button onClick={() => setTransposeSteps(s => s + 1)} className="px-2 py-0.5 text-xs bg-white/10 rounded hover:bg-white/20">+</button>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[0.65rem] uppercase tracking-[1px] text-[#d4af37]">View Mode</span>
                <button 
                  onClick={() => setViewMode(v => v === 'sheet' ? 'game' : 'sheet')}
                  className="text-[0.65rem] bg-white/10 px-2 py-1 rounded-full hover:bg-white/20 transition-colors"
                >
                  {viewMode === 'sheet' ? 'Game Mode' : 'Sheet Mode'}
                </button>
              </div>
              
              {viewMode === 'game' && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between text-[0.65rem] opacity-70 mt-1">
                    <span>Wait for Pitch</span>
                    <input 
                      type="checkbox" 
                      checked={waitForPitch} 
                      onChange={e => setWaitForPitch(e.target.checked)}
                      className="accent-[#d4af37] w-3 h-3"
                    />
                  </div>
                  <button 
                    onClick={isListening ? stopListening : startListening}
                    className={`py-1.5 rounded-lg font-bold text-[0.65rem] transition-all ${isListening ? 'bg-[#ff4444] text-white shadow-[0_0_10px_#ff4444]' : 'bg-[#00ff88] text-[#05070a] shadow-[0_0_10px_#00ff88]'}`}
                  >
                    {isListening ? 'Stop Mic' : 'Start Mic'}
                  </button>
                  <button 
                    onClick={autoPlay || isCountingIn ? stopPlayback : startPlayback}
                    className={`py-1.5 rounded-lg font-bold text-[0.65rem] transition-all flex-1 ${autoPlay || isCountingIn ? 'bg-white/20 text-white' : 'bg-[#d4af37] text-[#05070a] shadow-[0_0_10px_#d4af37]'}`}
                  >
                    {autoPlay || isCountingIn ? 'Stop Game' : 'Start Game'}
                  </button>
                  <button 
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[0.65rem] transition-all ${soundEnabled ? 'bg-[#00ff88] text-[#05070a]' : 'bg-white/10 text-white/50'}`}
                  >
                    Sound {soundEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-white/5 border border-white/5 rounded-[12px] p-3 lg:p-4 backdrop-blur-[10px] shrink-0">
            <h3 className="text-[0.65rem] uppercase tracking-[1px] mb-[10px] text-[#d4af37]">Pro Tip</h3>
            <p className="text-xs opacity-70 leading-relaxed">
              Keep your embouchure steady. If the needle is to the left (flat), tighten your lips slightly. If it's to the right (sharp), relax your lips.
            </p>
          </div>
        </section>

        {/* Center Panel */}
        <section className="min-w-0 flex flex-col gap-2 relative shrink-0 landscape:shrink landscape:min-h-0 landscape:overflow-hidden md:shrink md:min-h-0 md:overflow-hidden">
          {isCountingIn && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[12px]">
              <span className="text-[6rem] font-bold text-[#d4af37] animate-pulse">
                {currentCount}
              </span>
            </div>
          )}
          <div className="bg-white/5 border border-white/5 rounded-[12px] p-3 backdrop-blur-[10px] flex-1 flex flex-col min-h-[300px] landscape:min-h-0 md:min-h-0">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-[0.65rem] uppercase tracking-[1px] text-[#d4af37]">Active Score</h3>
              <span className="text-xs opacity-50 font-mono">Note {currentNoteIndex + 1}/{notes.length}</span>
            </div>
            
            {viewMode === 'sheet' ? (
              <div className="flex flex-col gap-2 overflow-y-visible landscape:overflow-y-auto md:overflow-y-auto flex-1 min-h-0 landscape:pr-1 md:pr-1 custom-scrollbar">
                <div className="flex justify-end gap-2 items-center shrink-0 flex-wrap">
                  <div className="flex items-center gap-1 mr-auto">
                    <label className="text-[0.65rem] opacity-70">Paper Color:</label>
                    <input 
                      type="color" 
                      value={sheetBgColor} 
                      onChange={e => setSheetBgColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    />
                  </div>
                  <button onClick={handleResetModifications} className="text-[0.65rem] bg-white/10 px-2 py-1.5 rounded-lg hover:bg-white/20 transition-colors">Reset Modifications</button>
                  <button onClick={handleSaveAsNew} className="text-[0.65rem] bg-[#d4af37] text-[#05070a] px-2 py-1.5 rounded-lg hover:bg-[#d4af37]/80 font-bold transition-colors">Save as New Score</button>
                </div>
                <div className="shrink-0 flex-1 flex flex-col">
                  <div className="bg-white rounded-xl overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.1)] mb-2">
                    <SheetMusic 
                      abcNotation={abcNotation} 
                      currentNoteIndex={currentNoteIndex} 
                      transposeSteps={transposeSteps}
                      onNoteSelect={(idx) => {
                        setSelectedNoteIndex(idx);
                        if (idx === null) {
                          setIsEditingNote(false);
                        } else {
                          setCurrentNoteIndex(idx);
                          let timeAcc = 0;
                          for (let i = 0; i < idx; i++) {
                            timeAcc += notes[i].duration;
                          }
                          setPlayheadTime(timeAcc);
                          playheadTimeRef.current = timeAcc;
                        }
                      }}
                      onNoteDoubleClick={(idx) => {
                        setSelectedNoteIndex(idx);
                        setIsEditingNote(true);
                      }}
                      onPlayNote={(index) => {
                        if (autoPlay) return; 
                        const noteData = notes[index];
                        if (noteData) {
                          const baseNote = getNoteByAbc(noteData.abc);
                          const targetNote = baseNote ? transposeNote(baseNote, transposeSteps) : undefined;
                          if (targetNote && soundEnabled) {
                            playNote(targetNote.freq, 0.5);
                          }
                        }
                      }}
                      onPlay={startPlayback}
                      onStop={stopPlayback}
                      paperColor={sheetBgColor}
                    />
                  </div>

                  {/* Note Strip in Sheet Mode */}
                  <div className="h-[90px] bg-black/40 border border-white/10 rounded-xl flex items-center relative overflow-hidden shrink-0 mt-auto">
                    <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[#d4af37]/50 -translate-x-1/2 z-10" />
                    <div 
                      className="flex items-center absolute h-full transition-all duration-300"
                      style={{ left: `calc(50% - ${playheadTime * 80}px)` }}
                    >
                      {notes.map((note, index) => {
                        const baseNote = getNoteByAbc(note.abc);
                        const targetNote = baseNote ? transposeNote(baseNote, transposeSteps || 0) : undefined;
                        const isCurrent = index === currentNoteIndex;
                        const width = note.duration * 80;
                        return (
                          <div key={index} className={`flex flex-col justify-center items-center transition-all ${isCurrent ? 'text-[#d4af37] scale-110' : 'text-white/40'}`} style={{ width: `${width}px` }}>
                            <div className="font-mono text-xl font-bold">{targetNote ? targetNote.name.replace(/\d/, '') : '?'}</div>
                            <div className="text-[0.55rem] font-bold opacity-80 mt-1">
                              {targetNote?.fingering.map((v, i) => v ? i + 1 : '').filter(Boolean).join('-') || '0'}
                            </div>
                            <div className="text-[0.45rem] opacity-50">{targetNote?.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Note Editor Panel */}
                {selectedNoteIndex !== null && (
                  <div className="bg-white/5 border border-white/5 rounded-[12px] p-4 backdrop-blur-[10px] relative shrink-0">
                    <button 
                      onClick={() => { setSelectedNoteIndex(null); setIsEditingNote(false); }}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors text-xs"
                    >
                      ×
                    </button>
                    
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xs font-bold text-[#d4af37] uppercase tracking-wider">Selected Note</h3>
                      <div className="bg-black/50 px-2 py-1 rounded-md font-mono text-lg text-white font-bold">
                        {(() => {
                          const noteObj = getNoteByAbc(notes[selectedNoteIndex]?.abc);
                          if (!noteObj) return '?';
                          const transposed = transposeNote(noteObj, transposeSteps);
                          return transposed ? transposed.name : noteObj.name;
                        })()}
                      </div>
                      {!isEditingNote && (
                        <span className="text-[0.65rem] text-white/40 italic ml-auto">Double-click note to edit</span>
                      )}
                    </div>

                    {isEditingNote && (
                      <div className="flex flex-wrap gap-1.5 items-center pt-3 border-t border-white/10">
                        <button onClick={() => handleModifyNote('transposeUp')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">+ Pitch</button>
                        <button onClick={() => handleModifyNote('transposeDown')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">- Pitch</button>
                        <div className="w-px h-3 bg-white/20 mx-0.5"></div>
                        <button onClick={() => handleModifyNote('addSharp')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">Sharp (#)</button>
                        <button onClick={() => handleModifyNote('addFlat')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">Flat (b)</button>
                        <button onClick={() => handleModifyNote('makeNatural')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">Natural (♮)</button>
                        <div className="w-px h-3 bg-white/20 mx-0.5"></div>
                        <button onClick={() => handleModifyNote('duplicate')} className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 text-[0.65rem]">Duplicate</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-[300px] landscape:min-h-0 md:min-h-0 flex flex-col">
                <GameView 
                  notes={notes} 
                  playheadTime={playheadTime}
                  currentNoteIndex={currentNoteIndex} 
                  tempo={tempo} 
                  transposeSteps={transposeSteps}
                  isPitchMatching={isPitchMatching}
                  currentFreq={currentFreq}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right Panel */}
        <section className="min-w-0 flex flex-col gap-2 w-full landscape:w-auto md:w-auto shrink-0 landscape:shrink landscape:overflow-y-auto landscape:min-h-0 landscape:pr-1 md:shrink md:overflow-y-auto md:min-h-0 md:pr-1 custom-scrollbar">
          <div className="shrink-0">
            <Tuner 
              currentFreq={currentFreq} 
              currentVolume={currentVolume}
              stability={stability}
              targetNote={targetNote} 
              pitchTolerance={pitchTolerance}
              setPitchTolerance={setPitchTolerance}
              micSensitivity={micSensitivity}
              setMicSensitivity={setMicSensitivity}
              noiseSuppression={noiseSuppression}
              setNoiseSuppression={setNoiseSuppression}
            />
          </div>
          
          {targetNote ? (
            <div className="shrink-0">
              <Fingering valves={targetNote.fingering} noteName={targetNote.name} />
            </div>
          ) : (
            <div className="bg-white/5 border border-white/5 rounded-[12px] p-3 lg:p-4 backdrop-blur-[10px] flex items-center justify-center h-[140px] shrink-0">
              <span className="text-white/30 font-mono text-xs">Waiting for note...</span>
            </div>
          )}
        </section>
      </main>

      {showChordDict && <ChordDictionary onClose={() => setShowChordDict(false)} />}
      
      {isLibraryOpen && (
        <LibraryModal 
          customExercises={customExercises}
          onSelect={(id) => {
            setSelectedExerciseId(id);
            setIsLibraryOpen(false);
          }}
          onDelete={handleDeleteExercise}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}

      {pendingUpload && (
        <UploadModal 
          abcData={pendingUpload.abc}
          defaultFilename={pendingUpload.filename}
          onSave={handleSaveUpload}
          onCancel={() => setPendingUpload(null)}
        />
      )}

      {isScaleGeneratorOpen && (
        <ScaleGeneratorModal 
          onGenerate={(exercise) => {
            handleSaveUpload(exercise);
            setIsScaleGeneratorOpen(false);
          }}
          onClose={() => setIsScaleGeneratorOpen(false)}
        />
      )}

      {studioFile && studioInitialAbc && (
        <TranscriptionStudio
          file={studioFile}
          initialAbc={studioInitialAbc}
          onApprove={(finalAbc) => {
            setPendingUpload({ abc: finalAbc, filename: studioFile.name });
            setStudioFile(null);
            setStudioInitialAbc(null);
          }}
          onCancel={() => {
            setStudioFile(null);
            setStudioInitialAbc(null);
          }}
        />
      )}

      {isPasteAbcOpen && (
        <PasteAbcModal
          onSave={(abc, title) => {
            const newExercise: Exercise = {
              id: `custom-${Date.now()}`,
              title: title,
              abc: abc,
              category: 'Custom',
              difficulty: 'Intermediate'
            };
            handleSaveUpload(newExercise);
            setIsPasteAbcOpen(false);
          }}
          onClose={() => setIsPasteAbcOpen(false)}
        />
      )}
    </div>
  );
}

