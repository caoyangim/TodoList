import { fail, ok } from "@/server/http";
import { AppError } from "@/server/errors";
import { noteFileService } from "@/server/services/note-file-service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("FILE_REQUIRED", "缺少文件", 400);
    }
    return ok(await noteFileService.create(file), 201);
  } catch (error) {
    return fail(error);
  }
}
