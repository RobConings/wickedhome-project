import { api, ApiRequestError } from "@/lib/api-client";
import type { LoginInput, SessionUser, SetupInput, SetupStatus, UpdateAccountInput } from "../types/auth";

export const fetchSetupStatus = () => api.get<SetupStatus>("/auth/setup/status");

/** The logged-in user, or `null` when there is no valid session. */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  try {
    return await api.get<SessionUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export const login = (input: LoginInput) => api.post("/auth/login", input);
export const logout = () => api.post("/auth/logout");
export const setupHousehold = (input: SetupInput) => api.post("/auth/setup", input);
export const updateAccount = (input: UpdateAccountInput) => api.patch<SessionUser>("/auth/me", input);
