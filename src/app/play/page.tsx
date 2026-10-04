import Link from "next/link";
import { redirect } from "next/navigation";
import { getChildSession } from "@/lib/child-session";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { createTranslator } from "@/lib/i18n/translate";
import { childHome } from "@/server/services/child-mode";
import { Avatar } from "@/components/ui/misc";

/** Child home: big picture cards for teacher-approved, published content only. */
export default async function PlayHome() {
  const session = await getChildSession();
  if (!session) redirect("/login");
  const t = createTranslator(DICTIONARIES[session.primaryLanguage], DICTIONARIES.en);
  const items = await childHome(session);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Avatar name={session.displayName} color={session.avatarColor} size="xl" />
        <div>
          <p className="text-4xl font-semibold">{t("child.hello", { name: session.displayName })}</p>
          <p className="text-2xl text-stone-500">{t("child.pick")}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="text-8xl" aria-hidden>
            🌈
          </span>
          <p className="text-2xl text-stone-600">{t("child.nothing")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="play-items">
          {items.map((i) => (
            <Link
              key={i.id}
              href={`/play/${i.id}`}
              className="flex flex-col items-center gap-4 rounded-[2rem] bg-white p-8 text-center shadow-lg ring-4 ring-amber-100 transition active:scale-95"
              data-testid="play-item"
            >
              <span className="text-[6rem] leading-none" aria-hidden>
                {i.illustration}
              </span>
              <span className="text-2xl font-semibold" dir="auto">
                {i.title}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
