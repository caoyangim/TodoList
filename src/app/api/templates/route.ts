import { fail, ok, readJson } from "@/server/http";
import { templateService } from "@/server/services/template-service";

export async function GET() {
  try {
    return ok(await templateService.list());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return ok(await templateService.create(await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
