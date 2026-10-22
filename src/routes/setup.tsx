import { useActionData } from "react-router";
import { SetupScreen, setupAction, setupLoader } from "@/features/auth";

export const loader = setupLoader;
export const action = setupAction;

export function Component() {
  return <SetupScreen result={useActionData<typeof setupAction>()} />;
}
