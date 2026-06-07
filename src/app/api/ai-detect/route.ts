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

    // Gunakan URL Custom Backend jika Anda mengatur CUSTOM_BACKEND_URL di Vercel (contoh: server Python FastAPI Anda sendiri)
    if (process.env.CUSTOM_BACKEND_URL) {
      const response = await fetch(process.env.CUSTOM_BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ audioBase64 }),
      });
      const data = await response.json();
      return NextResponse.json({ result: data });
    }

    // Call Audio Classification model
    // Jika Anda punya HuggingFace Dedicated Endpoint sendiri, isi HF_ENDPOINT_URL di Vercel
    const modelOrEndpoint = process.env.HF_ENDPOINT_URL || 'ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition';

    const result = await hf.audioClassification({
      data: blob,
      model: modelOrEndpoint,
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
