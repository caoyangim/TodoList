import { fail, noContent } from "@/server/http";
import { noteFileService } from "@/server/services/note-file-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const file = await noteFileService.get((await context.params).id);
    return new Response(file.bytes, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
        "Content-Length": String(file.size),
        "Content-Type": file.mimeType,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await noteFileService.remove((await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
