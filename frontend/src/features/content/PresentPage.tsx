/**
 * /content/:id/present — full-screen, tablet-friendly presentation of approved
 * (or already used) content to the child. Drafts can't be presented. Leaving
 * (press and hold) goes back to the review page and opens "How did it go?".
 */
import { useNavigate, useParams } from "react-router";
import { Alert, Button, ButtonLink, FullPageSpinner } from "@/components/ui";
import { PresentFrame, toContentLocale } from "@/features/player";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { contentUrl, isUsable, type ContentResponse } from "./api";
import { ContentPreview } from "./ContentPreview";

export function PresentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const { data, error, reload } = useFetch<ContentResponse>(contentUrl(id));
  const item = data?.content;

  if (!item) {
    if (!error) return <FullPageSpinner />;
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert
          tone="error"
          action={
            error.status === 404 ? (
              <ButtonLink size="sm" variant="outline" to={paths.children()}>
                {t("content.present.back")}
              </ButtonLink>
            ) : (
              <Button size="sm" variant="outline" onClick={reload}>
                {t("common.retry")}
              </Button>
            )
          }
        >
          {toMessage(error)}
        </Alert>
      </div>
    );
  }

  if (!isUsable(item.status)) {
    return (
      <div className="mx-auto max-w-xl p-6" data-testid="present-not-ready">
        <Alert tone="info" action={<ButtonLink size="sm" variant="outline" to={paths.content(item.id)}>{t("content.present.back")}</ButtonLink>}>
          {t("content.present.notReady")}
        </Alert>
      </div>
    );
  }

  return (
    <PresentFrame lang={toContentLocale(item.language)} onExit={() => navigate(`${paths.content(item.id)}?feedback=1`)}>
      <ContentPreview item={item} audience="child" />
    </PresentFrame>
  );
}
