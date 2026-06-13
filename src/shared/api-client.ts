import { ApiFailure, ApiSuccess } from "./types/api";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { code: "UNKNOWN", message: "请求失败" };
    throw new ApiClientError(error.message, error.code, response.status, error.fields);
  }
  return payload.data;
}
