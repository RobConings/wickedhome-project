import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ProductsScreen, canManageShopping, productsAction, productsLoader } from "@/features/shopping";
import { screenHandle } from "@/lib/screen-context";

export const loader = productsLoader;
export const action = productsAction;
export const handle = screenHandle(({ t }) => ({ kind: "products", label: t("screen.products") }));

export function Component() {
  const user = useCurrentUser();
  return <ProductsScreen data={useLoaderData<typeof productsLoader>()} canManage={canManageShopping(user.role)} />;
}
