import type { ApiError } from "@/types/common";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      // Required by the API's CSRF guard on every mutating request.
      "X-WickedHome": "1",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      payload?.error.code ?? "network",
      payload?.error.message ?? response.statusText,
      payload?.error.fields,
    );
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T = void>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = void>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T = void>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

/** A query-string value; `undefined`, `null`, `""` and `false` are left out. */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * `?a=1&b=2` for the values that are set (in the given order), or `""` when none are. Use it for every
 * request with filters instead of building a `URLSearchParams` by hand.
 */
export function queryString(params: Record<string, QueryValue> | object = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** `path` plus its query string (see `queryString`). */
export const withQuery = (path: string, params?: Record<string, QueryValue> | object) => `${path}${queryString(params)}`;

/** `/base/<id>/<sub>…` with every id URL-encoded; a resource path builder for request files. */
export const resourcePath =
  (base: string) =>
  (id: string, ...rest: string[]) =>
    [base, ...[id, ...rest].map(encodeURIComponent)].join("/");

/**
 * The usual REST requests for one resource under `base` (`GET base?query`, `GET base/:id`, `POST base`,
 * `PUT base/:id`, `DELETE base/:id`). A request file exports the ones it needs under domain names:
 * `export const { get: fetchContact, create: createContact } = restResource<Contact, ContactInput>("/contacts")`.
 * Requests that don't fit (sub-resources, other verbs) use `path(id, "sub", subId)` and `api` directly.
 */
export function restResource<TItem, TInput = never, TDetail = TItem, TCreated = TItem>(base: string) {
  const path = resourcePath(base);
  return {
    path,
    list: <TList = TItem[]>(query?: Record<string, QueryValue> | object) => api.get<TList>(withQuery(base, query)),
    get: (id: string) => api.get<TDetail>(path(id)),
    create: (input: TInput) => api.post<TCreated>(base, input),
    update: (id: string, input: TInput) => api.put<TItem>(path(id), input),
    remove: (id: string) => api.delete(path(id)),
  };
}
