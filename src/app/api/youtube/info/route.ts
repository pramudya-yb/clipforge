import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    // Use YouTube oEmbed API (free, no key needed)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);

    if (!oembedRes.ok) {
      return NextResponse.json({ error: 'Video not found or unavailable' }, { status: 404 });
    }

    const oembedData = await oembedRes.json();

    // Get high-res thumbnail
    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return NextResponse.json({
      title: oembedData.title || 'Unknown Title',
      author: oembedData.author_name || 'Unknown',
      thumbnail: thumbnail,
      videoId: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch video info' },
      { status: 500 }
    );
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
