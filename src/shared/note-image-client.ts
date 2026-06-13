import { ApiClientError } from "@/shared/api-client";
import { ApiFailure, ApiSuccess } from "@/shared/types/api";
import { NoteImageDto } from "@/shared/types/models";

export async function uploadNoteImage(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/note-images", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as ApiSuccess<NoteImageDto> | ApiFailure;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { code: "UNKNOWN", message: "图片上传失败" };
    throw new ApiClientError(error.message, error.code, response.status, error.fields);
  }
  return payload.data;
}
