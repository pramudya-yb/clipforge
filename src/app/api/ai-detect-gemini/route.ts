import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function GET() {
  return NextResponse.json({ hasToken: !!process.env.GEMINI_API_KEY });
}

export async function POST(req: Request) {
  try {
    const { audioBase64, customToken } = await req.json();
    if (!audioBase64) return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });

    const apiKey = customToken || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const base64Data = audioBase64.split(',')[1] || audioBase64;

    const prompt = `Analyze this audio clip and identify emotionally engaging or high-energy moments.
Return ONLY a JSON array (no markdown) with objects: { "start": number, "end": number, "score": number (0-1), "label": string }
If you cannot determine timestamps, return segments of roughly 5-10 seconds. Estimate based on audio energy/emotion.
Example: [{"start":0,"end":8,"score":0.9,"label":"High energy moment"}]`;

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/wav', data: base64Data } },
      prompt,
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ result: [] });

    const segments = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ result: segments });
  } catch (error) {
    console.error('Gemini AI Detect Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
