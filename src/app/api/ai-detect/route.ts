import { NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { audioBase64, customToken } = body;

    if (!audioBase64) {
      return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });
    }

    // Use custom token if provided, otherwise use server's env var or anonymous
    const token = customToken || process.env.HF_TOKEN || '';
    const hf = new HfInference(token);

    // Convert base64 back to blob
    const base64Data = audioBase64.split(',')[1] || audioBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'audio/wav' });

    // Call Audio Classification model for emotion recognition
    // We use a wav2vec2 model fine-tuned for speech emotion
    const result = await hf.audioClassification({
      data: blob,
      model: 'ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition',
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error('AI Detect API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error during AI processing' },
      { status: 500 }
    );
  }
}
