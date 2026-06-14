import { fail, ok } from "@/server/http";
import { AppError } from "@/server/errors";
import { noteFileService } from "@/server/services/note-file-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("FILE_REQUIRED", "缺少文件", 400);
    }
    return ok(await noteFileService.create(user.id, file), 201);
  } catch (error) {
    return fail(error);
  }
}
