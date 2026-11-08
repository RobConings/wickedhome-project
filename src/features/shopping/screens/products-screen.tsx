import { PackageIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { InventoryNavigation } from "@/components/shared/inventory-navigation";
import { useSamePagePending } from "@/lib/pending";
import type { UseSelectionsOptions } from "@/lib/selections";
import { ProductCard } from "../components/product-card";
import { ProductFormDialog } from "../components/product-form-dialog";
import { ProductListItem } from "../components/product-list-item";
import type { ProductsPageData } from "../data/shopping-loaders";

type ProductsScreenProps = {
  data: ProductsPageData;
  canManage: boolean;
  initialSelections?: UseSelectionsOptions["initial"];
};

/** The household's product catalogue with the shops that sell each product. */
export function ProductsScreen({ data, canManage, initialSelections }: ProductsScreenProps) {
  const { t } = useTranslation("shopping");
  const { products, shops } = data;
  const pending = useSamePagePending();

  const addButton = canManage && (
    <ProductFormDialog
      shops={shops}
      initialSelections={initialSelections}
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.addProduct")}
        </Button>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader
        backTo="/shopping"
        title={t("products.title")}
        description={t("products.description")}
        actions={addButton}
      />

      <InventoryNavigation />
      <GeneralList
        label={t("products.title")}
        items={products}
        getKey={(product) => product.id}
        renderRow={(product) => (
          <ProductListItem product={product} shops={shops} products={products} canManage={canManage} initialSelections={initialSelections} />
        )}
        renderTile={(product) => (
          <ProductCard product={product} shops={shops} products={products} canManage={canManage} initialSelections={initialSelections} />
        )}
        search={{ param: "q",
          keys: (product) => [product.name, product.brand, product.barcode, product.qrCode, t(`categories.${product.category}`)],
          label: t("products.search"),
          placeholder: t("products.search"),
        }}
        storageKey="products" viewParam="view"
        defaultView="tiles"
        pending={pending}
        emptyState={
          <EmptyState icon={PackageIcon} title={t("products.empty")} description={t("products.emptyDescription")} action={addButton} />
        }
      />
    </PageContainer>
  );
}
