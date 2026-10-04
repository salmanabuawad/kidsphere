import Link from "next/link";
import { BookOpen, Camera, ChevronRight, ClipboardList } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getParentProfile } from "@/server/services/profile";
import { listParentGoals } from "@/server/services/goals";
import { publishedForChild } from "@/server/services/content";
import { listParentMessages } from "@/server/services/parent-messages";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { VocabChip } from "@/features/child-understanding/vocab-chip";
import { vocabEntry, vocabLabel } from "@/features/child-understanding/vocabulary";
import { LaunchChildMode } from "@/features/child-mode/launch-child-mode";
import { MessageTeacher } from "@/features/parents/message-teacher";

export default async function ParentChildPage({ params }: PageProps<"/parent/children/[childId]">) {
  const actor = await requirePageActor(["PARENT"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const profile = await getParentProfile(actor, childId);
  const child = profile.child;
  const [goals, content, messages, questionnaire] = await Promise.all([
    listParentGoals(actor, childId),
    publishedForChild(child.id, child.classId),
    listParentMessages(actor, childId),
    db.parentQuestionnaire.findFirst({ where: { childId, parentId: actor.userId }, select: { status: true } }),
  ]);
  const childFacing = content.filter((c) => c.kind !== "guide");
  const homeActivities = [
    ...goals.filter((g) => g.parentReinforcement).map((g) => ({ key: g.id, title: g.parentFocus ?? "", text: g.parentReinforcement! })),
    ...content.filter((c) => c.homeActivity).map((c) => ({ key: c.id, title: c.homeActivity!.title, text: c.homeActivity!.instructions })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={child.displayName} color={child.avatarColor} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{child.displayName}</h1>
          <div className="mt-2">
            <LaunchChildMode childId={child.id} variant="primary" />
          </div>
        </div>
      </div>

      {/* Strengths lead every parent-facing summary. */}
      <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50 to-white">
        <CardHeader title={t("parent.child.strengths", { name: child.displayName })} className="border-emerald-100" />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profile.strengths.length === 0 && <p className="text-muted col-span-full text-sm">{t("teacher.child.strengthsEmpty")}</p>}
          {profile.strengths.map((s) => (
            <div key={s} className="rounded-2xl bg-white p-3 text-center shadow-sm">
              <div className="text-3xl" aria-hidden>
                {vocabEntry("STRENGTH", s)?.emoji ?? "⭐"}
              </div>
              <p className="mt-1 text-sm font-medium">{vocabLabel("STRENGTH", s, locale)}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {profile.interests.length > 0 && (
        <div>
          <p className="text-muted mb-2 text-sm font-semibold">{t("parent.child.interests")}</p>
          <div className="flex flex-wrap gap-2">
            {profile.interests.map((i) => (
              <VocabChip key={i} category="INTEREST" value={i} locale={locale} size="lg" />
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader title={t("parent.child.focus")} />
        <CardBody className="space-y-2">
          {goals.filter((g) => g.parentFocus).length === 0 && <p className="text-muted text-sm">{t("parent.child.focusEmpty")}</p>}
          {goals
            .filter((g) => g.parentFocus)
            .map((g) => (
              <p key={g.id} className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950" data-testid="parent-focus">
                🌱 {g.parentFocus}
              </p>
            ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parent.child.homeActivities")} />
        <CardBody className="space-y-3">
          {homeActivities.length === 0 && <p className="text-muted text-sm">{t("parent.child.homeEmpty")}</p>}
          {homeActivities.map((h) => (
            <div key={h.key} className="border-line rounded-xl border p-3" dir="auto">
              {h.title && <p className="text-sm font-medium">{h.title}</p>}
              <p className="text-sm text-stone-600">{h.text}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parent.child.stories")} />
        <CardBody className="space-y-2">
          {childFacing.length === 0 && <p className="text-muted text-sm">{t("parent.child.storiesEmpty")}</p>}
          {childFacing.map((c) => (
            <Link key={c.id} href={`/parent/children/${child.id}/content/${c.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-stone-50">
              <span className="flex size-12 items-center justify-center rounded-xl bg-amber-50 text-2xl" aria-hidden>
                {c.illustration}
              </span>
              <span className="min-w-0 flex-1 font-medium" dir="auto">
                {c.title}
              </span>
              <BookOpen className="text-muted size-4" />
            </Link>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/parent/children/${child.id}/questionnaire`}>
          <Card className="flex h-full items-center gap-3 p-4 hover:shadow-md">
            <ClipboardList className="text-brand size-6" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("parent.child.questionnaire")}</p>
              <p className="text-muted text-xs">
                {questionnaire?.status === "SUBMITTED" ? t("parent.child.questionnaireDone") : t("parent.dashboard.onboardingBody")}
              </p>
            </div>
            <ChevronRight className="text-muted size-4 rtl:rotate-180" />
          </Card>
        </Link>
        <Link href={`/parent/children/${child.id}/characters`}>
          <Card className="flex h-full items-center gap-3 p-4 hover:shadow-md">
            <Camera className="text-brand size-6" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("parent.child.characters")}</p>
              <p className="text-muted text-xs">{t("parent.child.charactersHint")}</p>
            </div>
            <ChevronRight className="text-muted size-4 rtl:rotate-180" />
          </Card>
        </Link>
      </div>

      <MessageTeacher childId={child.id} messages={messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString() }))} />
    </div>
  );
}
