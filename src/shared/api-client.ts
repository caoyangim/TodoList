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

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : fallback;
  }

  const fieldMessage = Object.values(error.fields ?? {}).flat().find(Boolean);
  return fieldMessage ?? error.message;
}

type ApiRequestOptions = RequestInit & {
  redirectOnAuthError?: boolean;
};

export async function apiRequest<T>(path: string, init?: ApiRequestOptions): Promise<T> {
  const { redirectOnAuthError = true, ...requestInit } = init ?? {};
  const response = await fetch(path, {
    ...requestInit,
    headers: {
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...requestInit.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : { code: "UNKNOWN", message: "请求失败" };
    if (redirectOnAuthError && typeof window !== "undefined") {
      if (response.status === 401) window.location.assign("/login");
      if (error.code === "PASSWORD_CHANGE_REQUIRED") {
        window.location.assign("/change-password");
      }
    }
    throw new ApiClientError(error.message, error.code, response.status, error.fields);
  }
  return payload.data;
}
