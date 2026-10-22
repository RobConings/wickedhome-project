import { useActionData } from "react-router";
import { LoginScreen, loginAction, loginLoader } from "@/features/auth";

export const loader = loginLoader;
export const action = loginAction;

export function Component() {
  return <LoginScreen result={useActionData<typeof loginAction>()} />;
}
