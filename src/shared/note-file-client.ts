import { ApiClientError } from "@/shared/api-client";
import { ApiFailure, ApiSuccess } from "@/shared/types/api";
import { NoteFileDto } from "@/shared/types/models";

export async function uploadNoteFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/note-files", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as ApiSuccess<NoteFileDto> | ApiFailure;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { code: "UNKNOWN", message: "文件上传失败" };
    if (response.status === 401) window.location.assign("/login");
    if (error.code === "PASSWORD_CHANGE_REQUIRED") window.location.assign("/change-password");
    throw new ApiClientError(error.message, error.code, response.status, error.fields);
  }
  return payload.data;
}
