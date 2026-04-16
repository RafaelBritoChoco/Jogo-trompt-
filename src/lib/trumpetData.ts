export type TrumpetNote = {
  name: string;
  abc: string;
  fingering: [boolean, boolean, boolean]; // [valve1, valve2, valve3] - true means pressed
  freq: number; // Expected frequency in Hz (sounding pitch)
};

// Trumpet is in Bb. Written C4 sounds as Bb3.
// Frequencies are based on A4 = 440Hz.
export const TRUMPET_NOTES: TrumpetNote[] = [
  { name: "F#3", abc: "^F,", fingering: [true, true, true], freq: 164.81 },
  { name: "G3", abc: "G,", fingering: [true, false, true], freq: 174.61 },
  { name: "G#3", abc: "^G,", fingering: [false, true, true], freq: 185.00 },
  { name: "A3", abc: "A,", fingering: [true, true, false], freq: 196.00 },
  { name: "Bb3", abc: "_B,", fingering: [true, false, false], freq: 207.65 },
  { name: "B3", abc: "B,", fingering: [false, true, false], freq: 220.00 },
  { name: "C4", abc: "C", fingering: [false, false, false], freq: 233.08 }, // Sounds Bb3
  { name: "C#4", abc: "^C", fingering: [true, true, true], freq: 246.94 }, // Sounds B3
  { name: "D4", abc: "D", fingering: [true, false, true], freq: 261.63 }, // Sounds C4
  { name: "Eb4", abc: "_E", fingering: [false, true, true], freq: 277.18 }, // Sounds Db4
  { name: "E4", abc: "E", fingering: [true, true, false], freq: 293.66 }, // Sounds D4
  { name: "F4", abc: "F", fingering: [true, false, false], freq: 311.13 }, // Sounds Eb4
  { name: "F#4", abc: "^F", fingering: [false, true, false], freq: 329.63 }, // Sounds E4
  { name: "G4", abc: "G", fingering: [false, false, false], freq: 349.23 }, // Sounds F4
  { name: "G#4", abc: "^G", fingering: [false, true, true], freq: 369.99 }, // Sounds Gb4
  { name: "A4", abc: "A", fingering: [true, true, false], freq: 392.00 }, // Sounds G4
  { name: "Bb4", abc: "_B", fingering: [true, false, false], freq: 415.30 }, // Sounds Ab4
  { name: "B4", abc: "B", fingering: [false, true, false], freq: 440.00 }, // Sounds A4
  { name: "C5", abc: "c", fingering: [false, false, false], freq: 466.16 }, // Sounds Bb4
  { name: "C#5", abc: "^c", fingering: [true, true, false], freq: 493.88 }, // Sounds B4
  { name: "D5", abc: "d", fingering: [true, false, false], freq: 523.25 }, // Sounds C5
  { name: "Eb5", abc: "_e", fingering: [false, true, false], freq: 554.37 }, // Sounds Db5
  { name: "E5", abc: "e", fingering: [false, false, false], freq: 587.33 }, // Sounds D5
  { name: "F5", abc: "f", fingering: [true, false, false], freq: 622.25 }, // Sounds Eb5
  { name: "F#5", abc: "^f", fingering: [false, true, false], freq: 659.25 }, // Sounds E5
  { name: "G5", abc: "g", fingering: [false, false, false], freq: 698.46 }, // Sounds F5
  { name: "G#5", abc: "^g", fingering: [false, true, true], freq: 739.99 }, // Sounds Gb5
  { name: "A5", abc: "a", fingering: [true, true, false], freq: 783.99 }, // Sounds G5
  { name: "Bb5", abc: "_b", fingering: [true, false, false], freq: 830.61 }, // Sounds Ab5
  { name: "B5", abc: "b", fingering: [false, true, false], freq: 880.00 }, // Sounds A5
  { name: "C6", abc: "c'", fingering: [false, false, false], freq: 932.33 }, // Sounds Bb5
];

export function getNoteByAbc(abc: string): TrumpetNote | undefined {
  return TRUMPET_NOTES.find(n => n.abc === abc);
}

export function getNoteByFreq(freq: number): TrumpetNote | undefined {
  if (freq === -1) return undefined;
  
  // Find the closest note
  let closestNote = TRUMPET_NOTES[0];
  let minDiff = Math.abs(freq - closestNote.freq);
  
  for (let i = 1; i < TRUMPET_NOTES.length; i++) {
    const diff = Math.abs(freq - TRUMPET_NOTES[i].freq);
    if (diff < minDiff) {
      minDiff = diff;
      closestNote = TRUMPET_NOTES[i];
    }
  }
  
  // Only return if it's reasonably close (within a semitone roughly)
  // A semitone ratio is ~1.059. Let's say within 3% error.
  if (minDiff / closestNote.freq < 0.03) {
    return closestNote;
  }
  
  return undefined;
}

export function transposeNote(note: TrumpetNote, steps: number): TrumpetNote | undefined {
  const index = TRUMPET_NOTES.findIndex(n => n.name === note.name);
  if (index === -1) return undefined;
  const newIndex = index + steps;
  if (newIndex < 0 || newIndex >= TRUMPET_NOTES.length) return undefined;
  return TRUMPET_NOTES[newIndex];
}

export type ChordDef = {
  name: string;
  notes: string[]; // Note names like "C4", "E4", "G4"
};

export const CHORD_DICTIONARY: ChordDef[] = [
  { name: "C Major", notes: ["C4", "E4", "G4", "C5"] },
  { name: "C Minor", notes: ["C4", "Eb4", "G4", "C5"] },
  { name: "D Major", notes: ["D4", "F#4", "A4", "D5"] },
  { name: "D Minor", notes: ["D4", "F4", "A4", "D5"] },
  { name: "E Major", notes: ["E4", "G#4", "B4", "E5"] },
  { name: "F Major", notes: ["F4", "A4", "C5", "F5"] },
  { name: "G Major", notes: ["G3", "B3", "D4", "G4"] },
  { name: "G7", notes: ["G3", "B3", "D4", "F4"] },
  { name: "A Major", notes: ["A3", "C#4", "E4", "A4"] },
  { name: "A Minor", notes: ["A3", "C4", "E4", "A4"] },
  { name: "Bb Major", notes: ["Bb3", "D4", "F4", "Bb4"] },
];
