import { fail, noContent } from "@/server/http";
import { noteFileService } from "@/server/services/note-file-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    const file = await noteFileService.get(user.id, (await context.params).id);
    return new Response(file.bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
        "Content-Length": String(file.size),
        "Content-Type": file.mimeType,
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
    await noteFileService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
