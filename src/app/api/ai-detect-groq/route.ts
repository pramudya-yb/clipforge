import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function GET() {
  return NextResponse.json({ hasToken: !!process.env.GROQ_API_KEY });
}

export async function POST(req: Request) {
  try {
    const { audioBase64, customToken } = await req.json();
    if (!audioBase64) return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });

    const apiKey = customToken || process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 400 });

    const groq = new Groq({ apiKey });

    // Decode base64 WAV → File object for Groq
    const base64Data = audioBase64.split(',')[1] || audioBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const file = new File([buffer], 'audio.wav', { type: 'audio/wav' });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
    });

    // Score each segment by word density + exclamation/question marks (energy proxy)
    const segments = ((transcription as any).segments ?? []).map((seg: { start: number; end: number; text: string }) => {
      const text = seg.text.toLowerCase();
      const energyWords = ['amazing', 'incredible', 'wow', 'yes', 'no', 'stop', 'go', 'run', 'help', 'oh', 'wait'];
      const wordScore = energyWords.filter((w) => text.includes(w)).length * 0.15;
      const punctScore = (text.match(/[!?]/g) || []).length * 0.2;
      const score = Math.min(1, 0.3 + wordScore + punctScore);
      return { start: seg.start, end: seg.end, score, label: seg.text.trim() };
    });

    return NextResponse.json({ result: segments });
  } catch (error) {
    console.error('Groq AI Detect Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
