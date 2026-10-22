import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { CenteredLayout } from "@/components/layout/centered-layout";
import { PageContainer } from "@/components/layout/page-container";
import { BrandMark } from "@/components/shared/brand-mark";
import { ErrorState } from "@/components/shared/error-state";

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <ErrorState
        title={t("errors.notFoundTitle")}
        description={t("errors.notFoundDescription")}
        action={
          <Button asChild variant="outline">
            <Link to="/">{t("actions.toHome")}</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}

export function CrashScreen() {
  const { t } = useTranslation();
  return (
    <CenteredLayout>
      <ErrorState
        title={t("errors.crashTitle")}
        description={t("errors.crashDescription")}
        action={<Button onClick={() => window.location.reload()}>{t("actions.retry")}</Button>}
      />
    </CenteredLayout>
  );
}

/** Shown while the first route data loads. */
export function SplashScreen() {
  return (
    <CenteredLayout>
      <div className="flex justify-center motion-safe:animate-pulse">
        <BrandMark />
      </div>
    </CenteredLayout>
  );
}
