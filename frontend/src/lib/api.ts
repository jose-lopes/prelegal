import type { Draft } from "./agreement";

export type Account = { id: number; email: string };
export type SavedAgreement = { id: number; documentId: string; title: string; fields: Draft; createdAt: string; updatedAt: string };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    const result = await response.json();
    throw new ApiError(result.error || "Something went wrong. Please retry.", response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}
