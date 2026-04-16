import { GoogleGenAI } from '@google/genai';

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function refineSheetMusicPdf(file: File, currentAbc: string, userCorrection: string): Promise<string> {
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const prompt = `
      You are an expert musician and sheet music transcriber.
      We are refining an ABC notation transcription of the provided PDF.
      
      CURRENT ABC NOTATION:
      ${currentAbc}
      
      USER CORRECTION:
      "${userCorrection}"
      
      Please apply the user's correction to the ABC notation based on the provided PDF image.
      
      CRITICAL REQUIREMENTS:
      1. Output ONLY the valid ABC notation string. No markdown formatting (\`\`\`abc), no explanations, no conversational text.
      2. Maintain the correct Key Signature (K:) and Time Signature (M:).
      3. SINGLE MELODY LINE ONLY. Do NOT include chords.
      4. NO GRACE NOTES. NO MULTIPLE VOICES. NO TEXT ANNOTATIONS.
      5. PAY EXTREME ATTENTION TO RHYTHM: A single beam or flag is an eighth note. Two beams/flags is a sixteenth note.
      6. Fix exactly what the user requested, keeping the rest of the transcription intact.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    let abcText = response.text || '';
    abcText = abcText.replace(/```abc\n?/g, '').replace(/```\n?/g, '').trim();
    
    if (!abcText) {
      throw new Error('Failed to generate refined ABC notation.');
    }

    return abcText;
  } catch (error) {
    console.error('Error refining PDF with Gemini:', error);
    throw new Error('Failed to refine the transcription.');
  }
}

export async function parseSheetMusicPdf(file: File): Promise<string> {
  try {
    // Convert the File to a base64 string
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Extract the base64 part from the data URL
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const prompt = `
      You are an expert musician, conductor, and sheet music transcriber.
      Your task is to transcribe the provided sheet music image into ABC notation.

      To achieve maximum accuracy, you MUST read the sheet music exactly as a professional musician does, following this step-by-step methodology.

      <methodology>
      STEP 1: Global Context (The Header)
      - Clef: Identify the clef (usually Treble/G clef).
      - Key Signature: Look at the sharps or flats immediately after the clef. This defines the K: field.
      - Time Signature: Look at the numbers (e.g., 4/4, 3/4) or the 'C' symbol. This defines the M: field.

      STEP 2: Measure by Measure Analysis
      - Evaluate the music ONE measure at a time.
      - For each measure, mentally count the beats to ensure they sum up exactly to the Time Signature.
      - The bar lines (|) are your absolute boundaries.

      STEP 3: Note by Note Extraction
      - Rests: A half rest sits on the 3rd line. A quarter rest is a squiggly line. An eighth rest has one flag.
      - Notes: Check the exact line or space for the pitch.
      - Duration: Empty notehead = half/whole. Solid + stem = quarter. One beam/flag = eighth (1/8). Two beams/flags = sixteenth (1/16).
      - CRITICAL: Do not hallucinate 16th notes if there is only one beam.
      </methodology>

      <rules>
      1. Monophonic Only: Transcribe ONLY the main melody. Ignore chords (e.g., [CEG]), guitar tabs, or harmony lines.
      2. No Grace Notes: Ignore small grace notes ({c} or similar).
      3. No Text Annotations: Ignore lyrics (w:), chord symbols ("Dm", "G7"), or dynamics ("p", "f").
      4. Octaves: Use strict ABC octave notation (C, D, E for low; c, d, e for middle; c', d' for high).
      </rules>

      <output_format>
      First, use a <thinking> block to analyze the image step-by-step (Key, Time, and measure-by-measure beat counting).
      Then, provide the final ABC notation inside an \`\`\`abc code block.
      </output_format>
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    const fullText = response.text || '';
    
    // Extract only the ABC code block, ignoring the <thinking> block
    const abcMatch = fullText.match(/```abc\n([\s\S]*?)\n```/i);
    let abcText = abcMatch ? abcMatch[1].trim() : fullText.replace(/```abc\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // Failsafe: remove thinking tags if they leaked into the fallback parsing
    abcText = abcText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    
    if (!abcText) {
      throw new Error('Failed to generate ABC notation from the PDF.');
    }

    return abcText;
  } catch (error) {
    console.error('Error parsing PDF with Gemini:', error);
    throw new Error('Failed to parse the PDF. Please ensure it is a clear sheet music document.');
  }
}

export async function convertMusicXmlToAbc(musicXml: string): Promise<string> {
  try {
    const prompt = `
      You are an expert music software specialized in format conversion.
      Convert the following MusicXML content into clean ABC NOTATION.
      
      CRITICAL REQUIREMENTS:
      1. SINGLE MELODY LINE ONLY.
      2. IGNORE CHORDS, LYRICS, AND HARMONIES.
      3. OUTPUT ONLY THE VALID ABC NOTATION. No explanations, no markdown (\`\`\`abc).
      
      MUSICXML CONTENT:
      ${musicXml.substring(0, 15000)} // Chunk if too large, usually enough for simple scores
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    let abcText = response.text || '';
    abcText = abcText.replace(/```abc\n?/g, '').replace(/```\n?/g, '').trim();
    
    return abcText;
  } catch (error) {
    console.error('Error converting MusicXML to ABC:', error);
    throw new Error('Failed to convert MusicXML to ABC notation.');
  }
}
