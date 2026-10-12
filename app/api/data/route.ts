import { getPermanentMemories, savePermanentMemory, getNotes, addNote, deleteNote } from "@/lib/storage";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (type === "memories") {
    return Response.json({ memories: getPermanentMemories() });
  }
  if (type === "notes") {
    return Response.json({ notes: getNotes() });
  }

  return Response.json({
    memories: getPermanentMemories(),
    notes: getNotes(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (action === "add_memory" && payload?.text) {
      const updated = savePermanentMemory(payload.text);
      return Response.json({ success: true, memories: updated });
    }

    if (action === "add_note" && payload?.text) {
      const updated = addNote(payload.text);
      return Response.json({ success: true, notes: updated });
    }

    if (action === "delete_note" && payload?.id) {
      const updated = deleteNote(payload.id);
      return Response.json({ success: true, notes: updated });
    }

    return Response.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
