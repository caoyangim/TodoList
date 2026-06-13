export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
