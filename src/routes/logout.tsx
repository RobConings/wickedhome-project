import { redirect } from "react-router";
import { logoutAction } from "@/features/auth";

export const action = logoutAction;
export const loader = () => redirect("/");
