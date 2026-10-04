/**
 * Development seed. Builds the demo tenant through the real service layer so
 * provenance, audit entries and content versions are exactly what the app
 * itself would produce. Content generation uses the deterministic DEMO engine.
 *
 *   npm run db:seed          (or `npm run db:reset` to wipe + migrate + seed)
 *
 * Demo passwords are for local development only — never use them in production.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

process.env.AI_DEFAULT_PROVIDER = "demo";

// Override with SEED_PASSWORD (deploy/install.sh generates a random one for servers).
const DEV_PASSWORD = process.env.SEED_PASSWORD || "Kidsphere-Dev-2026!";
const prisma = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const yearsAgo = (y: number, extraDays = 0) => new Date(Date.now() - (y * 365.25 + extraDays) * 86_400_000);

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to seed demo data in production.");
  }
  if (await prisma.organization.findUnique({ where: { slug: "alnour" } })) {
    console.log("Demo data already present. Run `npm run db:reset` for a fresh database.");
    return;
  }

  // Services are imported after env setup so the DEMO provider is selected.
  const { saveQuestionnaire } = await import("../src/server/services/questionnaires");
  const { createObservation } = await import("../src/server/services/observations");
  const { createGoal, updateGoal } = await import("../src/server/services/goals");
  const { generateForGoal, approveContent, publishContent } = await import("../src/server/services/content");
  const { recordOutcome } = await import("../src/server/services/outcomes");
  const { createWeeklyPlan } = await import("../src/server/services/weekly-plans");
  const { startOfWeek } = await import("../src/lib/utils");

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  // ── Tenants ──
  const org = await prisma.organization.create({
    data: { name: "Al Nour Early Learning", slug: "alnour", subdomain: "alnour", defaultLocale: "ar", brandColor: "#0f766e" },
  });
  const kg = await prisma.kindergarten.create({
    data: { organizationId: org.id, name: "Al Nour Kindergarten", slug: "al-nour", address: "12 Olive Street" },
  });
  const sunflowers = await prisma.class.create({
    data: { organizationId: org.id, kindergartenId: kg.id, name: "Sunflowers", ageBand: "4-5", contentLocale: "ar" },
  });
  const butterflies = await prisma.class.create({
    data: { organizationId: org.id, kindergartenId: kg.id, name: "Butterflies", ageBand: "3-4", contentLocale: "ar" },
  });

  // Second tenant — used to prove cross-tenant isolation.
  const otherOrg = await prisma.organization.create({ data: { name: "Hadar Kindergartens", slug: "hadar", defaultLocale: "he" } });
  const otherKg = await prisma.kindergarten.create({ data: { organizationId: otherOrg.id, name: "Hadar Garden", slug: "hadar-garden" } });
  const otherClass = await prisma.class.create({ data: { organizationId: otherOrg.id, kindergartenId: otherKg.id, name: "Rimon", contentLocale: "he" } });

  const user = (
    email: string,
    name: string,
    role: Role,
    organizationId: string | null,
    extra: { kindergartenId?: string; uiLocale?: "ar" | "he" | "en" } = {},
  ) =>
    prisma.user.create({
      data: { email, name, role, organizationId, passwordHash, kindergartenId: extra.kindergartenId ?? null, uiLocale: extra.uiLocale ?? "en" },
    });

  await user("superadmin@kidsphere.local", "Platform Admin", "SUPER_ADMIN", null);
  await user("admin@kidsphere.local", "Rana Haddad", "ORGANIZATION_ADMIN", org.id);
  await user("kgadmin@kidsphere.local", "Huda Saleh", "KINDERGARTEN_ADMIN", org.id, { kindergartenId: kg.id });
  const teacher = await user("teacher@kidsphere.local", "Maryam Khalil", "TEACHER", org.id, { kindergartenId: kg.id });
  const teacher2 = await user("teacher2@kidsphere.local", "Dalia Nasser", "TEACHER", org.id, { kindergartenId: kg.id });
  const parent = await user("parent@kidsphere.local", "Samira Aziz", "PARENT", org.id);
  const parent2 = await user("parent2@kidsphere.local", "Yael Cohen", "PARENT", org.id, { uiLocale: "he" });
  const otherTeacher = await user("other-teacher@kidsphere.local", "Noa Levi", "TEACHER", otherOrg.id, { kindergartenId: otherKg.id, uiLocale: "he" });
  const otherParent = await user("other-parent@kidsphere.local", "Avi Ben-David", "PARENT", otherOrg.id, { uiLocale: "he" });

  await prisma.classTeacher.createMany({
    data: [
      { classId: sunflowers.id, userId: teacher.id, organizationId: org.id, isLead: true },
      { classId: butterflies.id, userId: teacher2.id, organizationId: org.id, isLead: true },
      { classId: otherClass.id, userId: otherTeacher.id, organizationId: otherOrg.id, isLead: true },
    ],
  });

  // ── Children ──
  const child = (firstName: string, classId: string, age: number, lang: "ar" | "he" | "en", color: string, orgId = org.id, kgId = kg.id) =>
    prisma.child.create({
      data: {
        organizationId: orgId,
        kindergartenId: kgId,
        classId,
        firstName,
        displayName: firstName,
        dateOfBirth: yearsAgo(age, 60),
        primaryLanguage: lang,
        avatarColor: color,
      },
    });
  const adam = await child("Adam", sunflowers.id, 4, "ar", "#f59e0b");
  const yosef = await child("Yosef", sunflowers.id, 5, "he", "#6366f1");
  const maya = await child("Maya", sunflowers.id, 4, "en", "#ec4899");
  const sami = await child("Sami", sunflowers.id, 4, "ar", "#10b981");
  const lina = await child("Lina", butterflies.id, 3, "ar", "#0ea5e9");
  const noor = await child("Noor", butterflies.id, 3, "ar", "#84cc16");
  const omar = await child("Omar", otherClass.id, 4, "he", "#f97316", otherOrg.id, otherKg.id);

  await prisma.parentChild.createMany({
    data: [
      { parentId: parent.id, childId: adam.id, organizationId: org.id, relation: "MOTHER" },
      { parentId: parent.id, childId: lina.id, organizationId: org.id, relation: "MOTHER" },
      { parentId: parent2.id, childId: yosef.id, organizationId: org.id, relation: "MOTHER" },
      { parentId: otherParent.id, childId: omar.id, organizationId: otherOrg.id, relation: "FATHER" },
    ],
  });

  const actor = (u: { id: string; role: Role; organizationId: string | null; kindergartenId: string | null; name: string; email: string }) => ({
    userId: u.id,
    role: u.role,
    organizationId: u.organizationId,
    kindergartenId: u.kindergartenId,
    name: u.name,
    email: u.email,
    uiLocale: "en" as const,
  });
  const parentActor = actor(parent);
  const parent2Actor = actor(parent2);
  const teacherActor = actor(teacher);

  // ── Adam: Layer 1 — parent knowledge ──
  await saveQuestionnaire(parentActor, adam.id, {
    submit: true,
    currentSection: "partnership",
    answers: {
      preferred_name: "Adam",
      describe_words: "Curious, determined, gentle, builder",
      appreciate: "He never gives up when he is building something.",
      strengths_seen: { selected: ["curiosity"], other: null },
      interests: { selected: ["vehicles", "building"], other: null },
      attracts: "Excavators, trucks and anything he can build with.",
      engaged_activities: "Construction play — he can build with blocks for a long time.",
      good_at: "Building tall towers and garages.",
      helps_when_sad: "A hug and telling him what happens next.",
      calming_supports: { selected: ["hug_comfort", "explain_next_step"], other: null },
      separation: "needs_time",
      separation_helps: "A short goodbye routine and his small toy truck.",
      social_style: { selected: ["plays_with_familiar"], other: null },
      communicates_needs: { selected: ["sentences", "seeks_adult"], other: null },
      enjoys_recounting: "yes",
      home_languages: { selected: ["ar"], other: null },
      stopping_activity: "needs_preparation",
      preparation_helps: "yes",
      preparation_what: { selected: ["advance_warning", "explain_next_step"], other: null },
      preparation_notes: "He does well when an adult explains what will happen next.",
      feel: { selected: ["safe", "capable"], other: null },
      development_areas: { selected: ["emotional"], other: null },
      allergies: "No known allergies.",
      sleep: "Sleeps well, about 10 hours.",
      final_message: "He is a little builder with a big heart — give him a minute's warning and he'll follow you anywhere.",
    },
  });

  // ── Adam: Layer 2 — teacher observation ──
  const obs = async (input: Parameters<typeof createObservation>[2], when: Date) => {
    const r = await createObservation(teacherActor, adam.id, input);
    await prisma.observation.update({ where: { id: r.observation.id }, data: { observedAt: when, createdAt: when } });
    return r.observation;
  };
  await obs(
    {
      kind: "QUICK",
      context: "free_play",
      domains: ["PLAY", "ATTENTION_EF"],
      observedBehavior: "Stayed at the block corner for about 25 minutes building a garage for toy trucks. Rebuilt the tower calmly when it fell.",
      frequencyOrDuration: "25 minutes",
      whatHappenedBefore: null,
      antecedentTags: [],
      supportsTried: [],
      customSupport: null,
      outcome: "not_assessed",
      strengthNoticed: "Kept going after the tower fell.",
      strengthTags: ["persistence"],
      interestTags: ["building", "vehicles"],
      teacherNote: null,
      possiblePatterns: [],
    },
    daysAgo(9),
  );
  await obs(
    {
      kind: "QUICK",
      context: "transition",
      domains: ["ATTENTION_EF", "EMOTIONAL"],
      observedBehavior: "When asked to leave block play for group meeting without warning, protested and continued building for several minutes.",
      frequencyOrDuration: null,
      whatHappenedBefore: "Group meeting was announced suddenly.",
      antecedentTags: ["unexpected_transition"],
      supportsTried: [],
      customSupport: null,
      outcome: "not_assessed",
      strengthNoticed: null,
      strengthTags: [],
      interestTags: [],
      teacherNote: "Moving away from a preferred activity seems hardest without preparation.",
      possiblePatterns: [],
    },
    daysAgo(7),
  );
  await obs(
    {
      kind: "QUICK",
      context: "transition",
      domains: ["ATTENTION_EF"],
      observedBehavior: "Two-minute visual countdown plus one reminder: parked his truck and joined group time on his own.",
      frequencyOrDuration: "2 minutes",
      whatHappenedBefore: "Teacher showed the timer card and said: two minutes, then group time.",
      antecedentTags: [],
      supportsTried: ["visual_countdown", "advance_warning"],
      customSupport: null,
      outcome: "helped",
      strengthNoticed: null,
      strengthTags: [],
      interestTags: [],
      teacherNote: "The picture timer seems to make the change predictable for him.",
      possiblePatterns: [{ category: "LEARNING_PREFERENCE", value: "visual" }],
    },
    daysAgo(5),
  );

  // ── Adam: goals ──
  const goal = await createGoal(teacherActor, adam.id, {
    domain: "ATTENTION_EF",
    statement: "Move from a preferred activity to group time after one reminder and a visual cue.",
    successIndicator: "Successful in at least 3 of 5 observed opportunities.",
    startDate: daysAgo(4),
    reviewDate: daysFromNow(17),
    parentReinforcement: "Before ending play at home, say “two more turns”, count down together, then show what comes next.",
    parentFocus: "We are practicing smooth transitions this week.",
    shareWithParent: true,
    evidenceAttributeIds: (
      await prisma.profileAttribute.findMany({
        where: { childId: adam.id, status: "ACTIVE", value: { in: ["visual_countdown", "advance_warning", "unexpected_transition"] } },
      })
    ).map((a) => a.id),
  });
  const pastGoal = await createGoal(teacherActor, adam.id, {
    domain: "EMOTIONAL",
    statement: "Join the morning circle after a short goodbye routine with a parent.",
    successIndicator: "Joins the circle within 5 minutes on 4 of 5 mornings.",
    startDate: daysAgo(60),
    reviewDate: daysAgo(20),
    parentReinforcement: null,
    parentFocus: null,
    shareWithParent: false,
    evidenceAttributeIds: [],
  });
  await updateGoal(teacherActor, pastGoal.id, { status: "ACHIEVED", parentReinforcement: undefined, parentFocus: undefined });

  // ── Adam: Layer 3 — personalized content (DEMO engine) ──
  const published = await generateForGoal(teacherActor, goal.id, {
    contentType: "INTERACTIVE_STORY",
    language: "ar",
    durationMinutes: 6,
    theme: null,
    include: {
      interests: ["vehicles", "building"],
      strengths: ["persistence"],
      supports: ["visual_countdown", "advance_warning"],
      avoid: ["unexpected_transition"],
    },
    characterAssetIds: [],
    teacherInstruction: null,
  });
  await approveContent(teacherActor, published.id);
  await publishContent(teacherActor, published.id);

  await generateForGoal(teacherActor, goal.id, {
    contentType: "INTERACTIVE_STORY",
    language: "en",
    durationMinutes: 6,
    theme: null,
    include: { interests: ["vehicles"], strengths: ["persistence"], supports: ["visual_countdown"], avoid: [] },
    characterAssetIds: [],
    teacherInstruction: null,
  });

  await recordOutcome(teacherActor, goal.id, {
    result: "HELPED",
    contentId: published.id,
    support: null,
    note: "Read the story before free play; at tidy-up he counted “two, one” and parked his truck.",
    context: "transition",
    durationMinutes: 6,
    observationId: null,
  });

  await createWeeklyPlan(teacherActor, { classId: sunflowers.id, weekStart: startOfWeek(new Date()), notes: "Focus on calm transitions.", goalIds: [goal.id] });
  const monday = await prisma.weeklyPlanItem.findFirst({ where: { goalId: goal.id, dayOfWeek: 1 } });
  if (monday) await prisma.weeklyPlanItem.update({ where: { id: monday.id }, data: { contentId: published.id, status: "DONE" } });

  // ── Other children: lighter profiles ──
  await saveQuestionnaire(parent2Actor, yosef.id, {
    submit: true,
    answers: {
      interests: { selected: ["music", "animals"], other: null },
      strengths_seen: { selected: ["kindness", "musicality"], other: null },
      home_languages: { selected: ["he", "en"], other: null },
      calming_supports: { selected: ["music_song", "quiet_space"], other: null },
      sensory_reactions: { selected: ["noise"], other: null },
    },
  });
  const yosefObs = await createObservation(teacherActor, yosef.id, {
    kind: "QUICK",
    context: "group_time",
    domains: ["SOCIAL", "LANGUAGE"],
    observedBehavior: "Led the welcome song and invited a new child to sit next to him.",
    frequencyOrDuration: null,
    whatHappenedBefore: null,
    antecedentTags: [],
    supportsTried: [],
    customSupport: null,
    outcome: "not_assessed",
    strengthNoticed: "Welcoming to a new friend.",
    strengthTags: ["kindness", "leadership"],
    interestTags: ["music"],
    teacherNote: null,
    possiblePatterns: [],
  });
  void yosefObs;
  const yosefGoal = await createGoal(teacherActor, yosef.id, {
    domain: "SOCIAL",
    statement: "Take turns in a small-group game with one adult prompt.",
    successIndicator: "Waits for his turn in 3 of 5 games.",
    startDate: daysAgo(3),
    reviewDate: daysFromNow(5),
    parentReinforcement: null,
    parentFocus: null,
    shareWithParent: false,
    evidenceAttributeIds: [],
  });
  void yosefGoal;

  await createObservation(teacherActor, maya.id, {
    kind: "QUICK",
    context: "art",
    domains: ["FINE_MOTOR"],
    observedBehavior: "Painted a large sun and explained each colour she chose.",
    frequencyOrDuration: null,
    whatHappenedBefore: null,
    antecedentTags: [],
    supportsTried: [],
    customSupport: null,
    outcome: "not_assessed",
    strengthNoticed: null,
    strengthTags: ["creativity"],
    interestTags: ["drawing_art"],
    teacherNote: null,
    possiblePatterns: [],
  });
  // Sami and Noor intentionally have no recent observations (dashboard "not observed" demo).
  void sami;
  void noor;

  // Reusable organization template (no child data — {{child}} placeholder).
  await prisma.contentTemplate.create({
    data: {
      organizationId: org.id,
      type: "VISUAL_ROUTINE",
      language: "en",
      title: "{{child}}'s calm breathing steps",
      description: "Four picture steps for calming down before group time.",
      domain: "EMOTIONAL",
      ageBand: "3-5",
      createdById: teacher.id,
      body: {
        kind: "routine",
        title: "{{child}}'s calm breathing steps",
        language: "en",
        ageBand: "3-5",
        goalId: "",
        durationMinutes: 3,
        teacherRationale: { goalUsed: "-", interestsUsed: [], strengthsUsed: [], supportsUsed: [], avoided: [], explanation: "Template" },
        steps: [
          { id: "step1", label: "Stop", narration: "Stand still like a tree.", illustration: "🌳" },
          { id: "step2", label: "Smell", narration: "Smell the flower — breathe in.", illustration: "🌸" },
          { id: "step3", label: "Blow", narration: "Blow the candle — breathe out.", illustration: "🕯️" },
          { id: "step4", label: "Smile", narration: "Now you are ready!", illustration: "😊" },
        ],
      },
    },
  });

  console.log("\nSeed complete.");
  console.log(`Demo password for every account: ${DEV_PASSWORD}`);
  console.log("  admin@kidsphere.local · teacher@kidsphere.local · parent@kidsphere.local");
  console.log("  superadmin@ · kgadmin@ · teacher2@ · parent2@ · other-teacher@ · other-parent@ (all @kidsphere.local)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
