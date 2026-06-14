import { fail, noContent } from "@/server/http";
import { noteImageService } from "@/server/services/note-image-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    const image = await noteImageService.get(user.id, (await context.params).id);
    return new Response(image.bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.size),
        "Content-Type": image.mimeType,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    await noteImageService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
