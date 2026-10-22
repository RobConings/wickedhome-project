import { ArrowLeftIcon, PackageIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
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
        eyebrow={
          <Link to="/shopping" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("actions.backToShopping")}
          </Link>
        }
        title={t("products.title")}
        description={t("products.description")}
        actions={addButton}
      />

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
        search={{
          keys: (product) => [product.name, product.barcode, product.qrCode, t(`categories.${product.category}`)],
          label: t("products.search"),
          placeholder: t("products.search"),
        }}
        storageKey="products"
        defaultView="tiles"
        pending={pending}
        emptyState={
          <EmptyState icon={PackageIcon} title={t("products.empty")} description={t("products.emptyDescription")} action={addButton} />
        }
      />
    </PageContainer>
  );
}
