import { fail, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";

export async function GET() {
  try {
    return ok(await runService.list());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return ok(await runService.create(await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
