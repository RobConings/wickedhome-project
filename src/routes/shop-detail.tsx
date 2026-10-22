import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ShopShoppingList } from "@/features/shopping";
import { ShopDetailScreen, canAddShops, canDeleteShop, canEditShop, canSetIngredientSearch, shopAction, shopLoader } from "@/features/shops";
import { screenHandle } from "@/lib/screen-context";

export const loader = shopLoader;
export const action = shopAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "shop", id: data.id, label: data.name }));

export function Component() {
  const user = useCurrentUser();
  const shop = useLoaderData<typeof shopLoader>();
  return (
    <ShopDetailScreen
      key={shop.id}
      shop={shop}
      canEdit={canEditShop(user.role, shop)}
      canDelete={canDeleteShop(user.role, shop)}
      canRefreshIcon={canAddShops(user.role)}
      canSetIngredientSearch={canSetIngredientSearch(user.role)}
      shoppingItems={<ShopShoppingList shopId={shop.id} />}
    />
  );
}
