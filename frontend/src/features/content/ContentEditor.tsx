/**
 * Structured, JSON-free editor for every content type and all 7 game templates.
 * The draft is checked with the player's parse* functions (same limits as the
 * backend) before it is sent; the backend validates again and runs the safety
 * check (400 VALIDATION / 422 UNSAFE_CONTENT are shown inline).
 */
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Users } from "lucide-react";
import { Alert, Button, Field, IconButton, Input, Label, Select, Textarea } from "@/components/ui";
import { isGameTemplate, parseActivity, parseGame, parseStory, parseVideoPlan, toContentLocale } from "@/features/player";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { unsafeIssues, updateContent, type ContentDetail } from "./api";
import { useContentCast } from "./ContentPreview";

type Obj = Record<string, unknown>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {})) as T;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

function isValid(item: ContentDetail, draft: Obj): boolean {
  switch (item.content_type) {
    case "story":
      return parseStory(draft) !== null;
    case "real_world_activity":
      return parseActivity(draft) !== null;
    case "video":
      return parseVideoPlan(draft) !== null;
    default:
      return parseGame(draft) !== null;
  }
}

export function ContentEditor({
  item,
  onSaved,
  onCancel,
}: {
  item: ContentDetail;
  onSaved: (next: ContentDetail) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [draft, setDraft] = useState<Obj>(() => clone(item.content ?? {}));
  const [problem, setProblem] = useState<{ kind: "invalid" | "unsafe"; issues: string[] } | null>(null);
  const lang = toContentLocale(item.language);
  const cast = useContentCast(item);
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setProblem(null);
    if (!isValid(item, draft)) {
      setProblem({ kind: "invalid", issues: [] });
      return;
    }
    await run(() => updateContent(item.id, { content: draft }), {
      errorToast: false,
      success: item.status === "approved" ? t("content.editor.savedBackToDraft") : t("content.editor.saved"),
      onSuccess: (r) => onSaved(r.content),
      onError: (e) => {
        if (isApiError(e, "UNSAFE_CONTENT")) setProblem({ kind: "unsafe", issues: unsafeIssues(e.details) });
        else if (isApiError(e, "VALIDATION")) setProblem({ kind: "invalid", issues: [] });
        else setProblem({ kind: "invalid", issues: [e instanceof Error ? e.message : String(e)] });
      },
    });
  }

  let fields: ReactNode;
  switch (item.content_type) {
    case "story":
      fields = <StoryFields draft={draft} set={set} />;
      break;
    case "real_world_activity":
      fields = <ActivityFields draft={draft} set={set} />;
      break;
    case "video":
      fields = <VideoFields draft={draft} set={set} />;
      break;
    default:
      fields = <GameFields draft={draft} set={set} />;
  }

  return (
    <div className="space-y-6" data-testid="content-editor" lang={lang}>
      {item.status === "approved" && <Alert tone="warning">{t("content.editor.approvedWarning")}</Alert>}
      {cast.members.length > 0 && (
        <div className="rounded-md bg-tray p-3 text-sm text-ink" data-testid="cast-legend">
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4" aria-hidden />
            {t("content.editor.peopleTitle")}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {cast.members.map((m) => (
              <li key={m.token}>
                <code dir="ltr" className="rounded-sm bg-surface px-1.5 py-0.5">
                  {m.token}
                </code>{" "}
                <span dir="auto">{m.name}</span>
              </li>
            ))}
          </ul>
          <p className="text-caption mt-1.5 text-ink-muted">{t("content.editor.peopleHint")}</p>
        </div>
      )}
      <TextField label={t("content.editor.title")} value={str(draft.title)} max={120} onChange={(v) => set("title", v)} />
      {fields}
      {problem && (
        <Alert tone={problem.kind === "unsafe" ? "warning" : "error"} title={problem.kind === "unsafe" ? t("content.editor.unsafeTitle") : undefined}>
          {problem.kind === "unsafe" ? (
            <>
              <p>{t("content.editor.unsafeHint")}</p>
              {problem.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 ps-5" data-testid="unsafe-issues">
                  {problem.issues.map((i) => (
                    <li key={i} dir="auto">
                      {i}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p>{problem.issues[0] ?? t("content.editor.invalid")}</p>
          )}
        </Alert>
      )}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap justify-end gap-2 border-t border-line bg-ground px-1 py-3">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t("content.editor.cancel")}
        </Button>
        <Button size="lg" onClick={() => void save()} loading={pending} icon={<Save className="size-4" aria-hidden />}>
          {t("content.editor.save")}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- building blocks

type SetFn = (key: string, value: unknown) => void;

function TextField({
  label,
  value,
  onChange,
  max,
  multiline,
  rows = 3,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max: number;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <Field label={label}>
      {(p) =>
        multiline ? (
          <Textarea {...p} rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input {...p} dir="auto" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: ReactNode; value: unknown; onChange: (v: number | string) => void; min: number; max: number }) {
  return (
    <Field label={label}>
      {(p) => (
        <Input
          {...p}
          type="number"
          inputMode="numeric"
          dir="ltr"
          className="max-w-40"
          min={min}
          max={max}
          value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value === "" || Number.isNaN(n) ? e.target.value : n);
          }}
        />
      )}
    </Field>
  );
}

/** A list of items with add / remove (and optional reordering). */
function ListEditor({
  label,
  items,
  onChange,
  min,
  max,
  newItem,
  itemLabel,
  render,
  reorder,
  testId,
}: {
  label: ReactNode;
  items: unknown[];
  onChange: (items: unknown[]) => void;
  min: number;
  max: number;
  newItem: () => unknown;
  itemLabel: (i: number) => string;
  render: (item: unknown, update: (v: unknown) => void, i: number) => ReactNode;
  reorder?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const update = (i: number, v: unknown) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <fieldset className="space-y-3" data-testid={testId}>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      {items.map((item, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-muted">{itemLabel(i)}</span>
            <div className="flex gap-1">
              {reorder && (
                <>
                  <IconButton label={t("content.editor.moveUp")} size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton label={t("content.editor.moveDown")} size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" aria-hidden />
                  </IconButton>
                </>
              )}
              <IconButton
                label={`${t("content.editor.remove")}: ${itemLabel(i)}`}
                size="sm"
                disabled={items.length <= min}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </IconButton>
            </div>
          </div>
          {render(item, (v) => update(i, v), i)}
        </div>
      ))}
      {items.length < max && (
        <Button variant="outline" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...items, newItem()])}>
          {t("content.editor.add")}
        </Button>
      )}
    </fieldset>
  );
}

function TextList({ label, items, onChange, min, max, maxLength, itemLabel, multiline }: {
  label: ReactNode;
  items: unknown[];
  onChange: (v: unknown[]) => void;
  min: number;
  max: number;
  maxLength: number;
  itemLabel: (i: number) => string;
  multiline?: boolean;
}) {
  return (
    <ListEditor
      label={label}
      items={items}
      onChange={onChange}
      min={min}
      max={max}
      newItem={() => ""}
      itemLabel={itemLabel}
      render={(v, update, i) => {
        const id = `${itemLabel(i)}`;
        return multiline ? (
          <Textarea aria-label={id} rows={2} value={str(v)} maxLength={maxLength} onChange={(e) => update(e.target.value)} />
        ) : (
          <Input aria-label={id} dir="auto" value={str(v)} maxLength={maxLength} onChange={(e) => update(e.target.value)} />
        );
      }}
    />
  );
}

/** A card label plus an optional emoji picture. */
function ChoiceInputs({ value, onChange, labelMax = 80, name }: { value: unknown; onChange: (v: Obj) => void; labelMax?: number; name: string }) {
  const { t } = useI18n();
  const c = obj(value);
  return (
    <div className="flex gap-2">
      <Input
        aria-label={`${name}: ${t("content.editor.emoji")}`}
        className="w-16 text-center text-xl"
        value={str(c.emoji)}
        maxLength={16}
        onChange={(e) => onChange({ ...c, emoji: e.target.value || null })}
      />
      <Input aria-label={name} dir="auto" value={str(c.label)} maxLength={labelMax} onChange={(e) => onChange({ ...c, label: e.target.value })} />
    </div>
  );
}

// ----------------------------------------------------------------------------- per type

function StoryFields({ draft, set }: { draft: Obj; set: SetFn }) {
  const { t } = useI18n();
  const paragraphs = arr(draft.story);
  const pictures = arr(draft.illustrations);
  const hasPictures = Array.isArray(draft.illustrations);
  const rows = paragraphs.map((p, i) => ({ text: str(p), emoji: str(pictures[i]) }));
  const setRows = (next: { text: string; emoji: string }[]) => {
    set("story", next.map((r) => r.text));
    if (hasPictures || next.some((r) => r.emoji)) set("illustrations", next.map((r) => r.emoji || "📖"));
  };
  const hasPrompts = Array.isArray(draft.discussion_prompts);
  return (
    <>
      <TextField label={t("content.editor.goal")} value={str(draft.goal)} max={300} multiline rows={2} onChange={(v) => set("goal", v)} />
      <ListEditor
        label={t("content.editor.paragraphs")}
        testId="edit-paragraphs"
        items={rows}
        onChange={(v) => setRows(v as { text: string; emoji: string }[])}
        min={2}
        max={6}
        newItem={() => ({ text: "", emoji: "" })}
        itemLabel={(i) => t("content.editor.paragraph", { n: i + 1 })}
        reorder
        render={(v, update, i) => {
          const r = v as { text: string; emoji: string };
          return (
            <div className="flex gap-2">
              <Input
                aria-label={`${t("content.editor.paragraph", { n: i + 1 })}: ${t("content.editor.emoji")}`}
                className="w-16 text-center text-xl"
                value={r.emoji}
                maxLength={16}
                onChange={(e) => update({ ...r, emoji: e.target.value })}
              />
              <Textarea
                aria-label={t("content.editor.paragraph", { n: i + 1 })}
                rows={3}
                value={r.text}
                maxLength={600}
                onChange={(e) => update({ ...r, text: e.target.value })}
              />
            </div>
          );
        }}
      />
      <TextList
        label={t("content.editor.questions")}
        items={arr(draft.questions)}
        onChange={(v) => set("questions", v)}
        min={2}
        max={4}
        maxLength={200}
        itemLabel={(i) => t("content.editor.question", { n: i + 1 })}
      />
      {hasPrompts && (
        <TextList
          label={t("content.editor.discussionPrompts")}
          items={arr(draft.discussion_prompts)}
          onChange={(v) => set("discussion_prompts", v)}
          min={1}
          max={3}
          maxLength={200}
          itemLabel={(i) => t("content.editor.prompt", { n: i + 1 })}
        />
      )}
      <TextField label={t("content.editor.teacherNote")} value={str(draft.teacher_note)} max={800} multiline onChange={(v) => set("teacher_note", v)} />
    </>
  );
}

function ActivityFields({ draft, set }: { draft: Obj; set: SetFn }) {
  const { t } = useI18n();
  return (
    <>
      <TextField label={t("content.editor.goal")} value={str(draft.goal)} max={300} multiline rows={2} onChange={(v) => set("goal", v)} />
      <NumberField label={t("content.editor.duration")} value={draft.duration_minutes} min={3} max={60} onChange={(v) => set("duration_minutes", v)} />
      <TextList
        label={t("content.editor.materials")}
        items={arr(draft.materials)}
        onChange={(v) => set("materials", v)}
        min={0}
        max={10}
        maxLength={120}
        itemLabel={(i) => t("content.editor.material", { n: i + 1 })}
      />
      <TextList
        label={t("content.editor.instructions")}
        items={arr(draft.instructions)}
        onChange={(v) => set("instructions", v)}
        min={2}
        max={10}
        maxLength={400}
        multiline
        itemLabel={(i) => t("content.editor.step", { n: i + 1 })}
      />
      <TextList
        label={t("content.editor.observe")}
        items={arr(draft.what_to_observe)}
        onChange={(v) => set("what_to_observe", v)}
        min={1}
        max={6}
        maxLength={300}
        multiline
        itemLabel={(i) => t("content.editor.observeItem", { n: i + 1 })}
      />
      <TextField label={t("content.editor.adaptation")} value={str(draft.adaptation)} max={600} multiline onChange={(v) => set("adaptation", v)} />
    </>
  );
}

function VideoFields({ draft, set }: { draft: Obj; set: SetFn }) {
  const { t } = useI18n();
  return (
    <>
      <TextField label={t("content.editor.learningGoal")} value={str(draft.learning_goal)} max={300} multiline rows={2} onChange={(v) => set("learning_goal", v)} />
      <NumberField label={t("content.editor.durationSeconds")} value={draft.duration_seconds} min={30} max={90} onChange={(v) => set("duration_seconds", v)} />
      <TextField label={t("content.editor.script")} value={str(draft.script)} max={2500} multiline rows={6} onChange={(v) => set("script", v)} />
      <ListEditor
        label={t("content.editor.scenes")}
        items={arr(draft.scenes)}
        onChange={(v) => set("scenes", v)}
        min={2}
        max={8}
        reorder
        newItem={() => ({ description: "", narration: "", visual_prompt: "" })}
        itemLabel={(i) => t("content.editor.scene", { n: i + 1 })}
        render={(v, update) => {
          const s = obj(v);
          return (
            <div className="space-y-3">
              <TextField label={t("content.editor.sceneDescription")} value={str(s.description)} max={300} multiline rows={2} onChange={(x) => update({ ...s, description: x })} />
              <TextField label={t("content.editor.narration")} value={str(s.narration)} max={400} multiline rows={2} onChange={(x) => update({ ...s, narration: x })} />
              <TextField label={t("content.editor.visualPrompt")} value={str(s.visual_prompt)} max={300} multiline rows={2} onChange={(x) => update({ ...s, visual_prompt: x })} />
              <TextField label={t("content.editor.sceneEmoji")} value={str(s.emoji)} max={16} onChange={(x) => update({ ...s, emoji: x.trim() ? x : null })} />
            </div>
          );
        }}
      />
    </>
  );
}

function ChoicesEditor({ choices, onChange, name }: { choices: unknown[]; onChange: (v: unknown[]) => void; name: (i: number) => string }) {
  const { t } = useI18n();
  return (
    <ListEditor
      label={t("content.editor.choices")}
      items={choices}
      onChange={onChange}
      min={2}
      max={4}
      newItem={() => ({ label: "", emoji: null })}
      itemLabel={name}
      render={(v, update, i) => <ChoiceInputs value={v} onChange={update} name={name(i)} />}
    />
  );
}

function GameFields({ draft, set }: { draft: Obj; set: SetFn }) {
  const { t } = useI18n();
  const template = isGameTemplate(draft.template) ? draft.template : null;
  const intro = (
    <TextField label={t("content.editor.intro")} value={str(draft.intro)} max={300} multiline rows={2} onChange={(v) => set("intro", v || null)} />
  );

  if (template === "multiple_choice" || template === "emotion_choice" || template === "what_happens_next") {
    return (
      <>
        {intro}
        <ListEditor
          label={t("content.editor.rounds")}
          testId="edit-rounds"
          items={arr(draft.rounds)}
          onChange={(v) => set("rounds", v)}
          min={1}
          max={5}
          newItem={() => ({ question: "", choices: [{ label: "", emoji: null }, { label: "", emoji: null }], correct_or_preferred_answer: null, explanation: "" })}
          itemLabel={(i) => t("content.editor.round", { n: i + 1 })}
          render={(v, update) => <RoundFields round={obj(v)} onChange={update} />}
        />
      </>
    );
  }
  if (template === "match_pairs") {
    return (
      <>
        {intro}
        <ListEditor
          label={t("content.editor.pairs")}
          items={arr(draft.pairs)}
          onChange={(v) => set("pairs", v)}
          min={2}
          max={6}
          newItem={() => ({ left: { label: "", emoji: null }, right: { label: "", emoji: null } })}
          itemLabel={(i) => t("content.editor.pair", { n: i + 1 })}
          render={(v, update, i) => {
            const p = obj(v);
            return (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("content.editor.left")}</Label>
                  <ChoiceInputs value={p.left} onChange={(x) => update({ ...p, left: x })} name={`${t("content.editor.pair", { n: i + 1 })} · ${t("content.editor.left")}`} />
                </div>
                <div className="space-y-1">
                  <Label>{t("content.editor.right")}</Label>
                  <ChoiceInputs value={p.right} onChange={(x) => update({ ...p, right: x })} name={`${t("content.editor.pair", { n: i + 1 })} · ${t("content.editor.right")}`} />
                </div>
              </div>
            );
          }}
        />
      </>
    );
  }
  if (template === "sequence") {
    return (
      <>
        {intro}
        <ListEditor
          label={t("content.editor.sequenceItems")}
          items={arr(draft.items)}
          onChange={(v) => set("items", v)}
          min={3}
          max={6}
          reorder
          newItem={() => ({ label: "", emoji: null })}
          itemLabel={(i) => t("content.editor.card", { n: i + 1 })}
          render={(v, update, i) => <ChoiceInputs value={v} onChange={update} name={t("content.editor.card", { n: i + 1 })} />}
        />
      </>
    );
  }
  if (template === "categorize") {
    return <CategorizeFields draft={draft} set={set} intro={intro} />;
  }
  if (template === "story_builder") {
    return (
      <>
        {intro}
        <ListEditor
          label={t("content.editor.storySteps")}
          items={arr(draft.steps)}
          onChange={(v) => set("steps", v)}
          min={3}
          max={5}
          reorder
          newItem={() => ({ prompt: "", choices: [{ label: "", emoji: null }, { label: "", emoji: null }] })}
          itemLabel={(i) => t("content.editor.storyStep", { n: i + 1 })}
          render={(v, update, i) => {
            const s = obj(v);
            return (
              <div className="space-y-3">
                <TextField label={t("content.editor.stepPrompt")} value={str(s.prompt)} max={200} onChange={(x) => update({ ...s, prompt: x })} />
                <ChoicesEditor
                  choices={arr(s.choices)}
                  onChange={(c) => update({ ...s, choices: c })}
                  name={(j) => `${t("content.editor.storyStep", { n: i + 1 })} · ${t("content.editor.choice", { n: j + 1 })}`}
                />
              </div>
            );
          }}
        />
        <TextField label={t("content.editor.closingPrompt")} value={str(draft.closing_prompt)} max={200} onChange={(v) => set("closing_prompt", v)} />
      </>
    );
  }
  return <Alert tone="info">{t("content.editor.invalid")}</Alert>;
}

function RoundFields({ round, onChange }: { round: Obj; onChange: (v: Obj) => void }) {
  const { t } = useI18n();
  const choices = arr(round.choices);
  const answer = typeof round.correct_or_preferred_answer === "number" ? round.correct_or_preferred_answer : null;
  return (
    <div className="space-y-3">
      <TextField label={t("content.editor.roundQuestion")} value={str(round.question)} max={200} onChange={(x) => onChange({ ...round, question: x })} />
      <ChoicesEditor
        choices={choices}
        onChange={(c) =>
          onChange({ ...round, choices: c, correct_or_preferred_answer: answer !== null && answer < c.length ? answer : null })
        }
        name={(j) => t("content.editor.choice", { n: j + 1 })}
      />
      <Field label={t("content.editor.preferred")}>
        {(p) => (
          <Select
            {...p}
            value={answer === null ? "" : String(answer)}
            onChange={(e) => onChange({ ...round, correct_or_preferred_answer: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">{t("content.editor.noPreferred")}</option>
            {choices.map((c, j) => (
              <option key={j} value={j}>
                {str(obj(c).label) || t("content.editor.choice", { n: j + 1 })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <TextField label={t("content.editor.explanation")} value={str(round.explanation)} max={300} multiline rows={2} onChange={(x) => onChange({ ...round, explanation: x })} />
    </div>
  );
}

function CategorizeFields({ draft, set, intro }: { draft: Obj; set: SetFn; intro: ReactNode }) {
  const { t } = useI18n();
  const categories = arr(draft.categories).map(obj);
  const keys = categories.map((c) => str(c.key));
  return (
    <>
      {intro}
      <ListEditor
        label={t("content.editor.categories")}
        items={categories}
        onChange={(v) => {
          const next = v.map(obj).map((c, i) => ({ ...c, key: str(c.key) || `group_${i + 1}_${Math.random().toString(36).slice(2, 6)}` }));
          set("categories", next);
          const valid = new Set(next.map((c) => str(c.key)));
          set("items", arr(draft.items).map(obj).map((it) => (valid.has(str(it.category)) ? it : { ...it, category: str(next[0]?.key) })));
        }}
        min={2}
        max={3}
        newItem={() => ({ key: "", label: "", emoji: null })}
        itemLabel={(i) => t("content.editor.category", { n: i + 1 })}
        render={(v, update, i) => <ChoiceInputs value={v} onChange={update} labelMax={60} name={t("content.editor.category", { n: i + 1 })} />}
      />
      <ListEditor
        label={t("content.editor.categoryItems")}
        items={arr(draft.items)}
        onChange={(v) => set("items", v)}
        min={4}
        max={8}
        newItem={() => ({ label: "", emoji: null, category: keys[0] ?? "" })}
        itemLabel={(i) => t("content.editor.card", { n: i + 1 })}
        render={(v, update, i) => {
          const it = obj(v);
          return (
            <div className="space-y-2">
              <ChoiceInputs value={it} onChange={(x) => update({ ...it, ...x })} name={t("content.editor.card", { n: i + 1 })} />
              <Field label={t("content.editor.itemCategory")}>
                {(p) => (
                  <Select {...p} value={str(it.category)} onChange={(e) => update({ ...it, category: e.target.value })}>
                    {categories.map((c) => (
                      <option key={str(c.key)} value={str(c.key)}>
                        {[str(c.emoji), str(c.label)].filter(Boolean).join(" ") || str(c.key)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          );
        }}
      />
    </>
  );
}
