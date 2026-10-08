import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Texto requerido" }, { status: 400 });
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "IKne3meq5aSn9XLyUdCD";
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY no configurada", fallback: true },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errDetail = await response.text();
      console.warn("[ELEVENLABS_TTS_ERROR]", response.status, errDetail);
      return NextResponse.json(
        { error: "Error en ElevenLabs", details: errDetail, fallback: true },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error("[TTS_ROUTE_EXCEPTION]", err);
    return NextResponse.json(
      { error: "Fallo de conexión", message: err?.message, fallback: true },
      { status: 500 }
    );
  }
}
