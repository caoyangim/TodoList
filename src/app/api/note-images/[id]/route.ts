import { fail, noContent } from "@/server/http";
import { noteImageService } from "@/server/services/note-image-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const image = await noteImageService.get((await context.params).id);
    return new Response(image.bytes, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(image.size),
        "Content-Type": image.mimeType,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await noteImageService.remove((await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
