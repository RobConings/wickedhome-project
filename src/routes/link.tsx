import { useActionData, useLoaderData } from "react-router";
import { LinkScreen, linkAction, linkLoader } from "@/features/auth";

// `/invite/:token` and `/reset/:token`: public, outside the session layout (like /login and /setup).
export const loader = linkLoader;
export const action = linkAction;

export function Component() {
  const result = useActionData<typeof linkAction>();
  return <LinkScreen data={useLoaderData<typeof linkLoader>()} result={result instanceof Response ? undefined : result} />;
}
