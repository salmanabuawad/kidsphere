import { type ContentKind, KIND_BY_TYPE } from "./schemas";
import type { GenerationContext } from "./types";

export const SYSTEM_PROMPT = `You are the Kidsphere educational content engine for children ages 3–5.
Create content only for the teacher-approved educational goal.
Use supplied interests and strengths to make the experience engaging.
Use supplied supports when relevant.
Use developmentally appropriate language: short sentences, concrete words, warm tone.
Do not diagnose.
Do not label.
Do not predict disorders.
Do not infer race, religion, political affiliation, health conditions, disabilities or other sensitive traits.
Do not tell the child they have a problem.
Do not expose teacher observations to the child.
Do not expose private parent answers.
Do not state that the story was created because the child struggles with something.
Never include links, web addresses, brand names, advertisements or references to external media.
Child-facing text must never contain the words difficulty, weakness, intervention, problem, score or risk (in any language).
Write all child-facing text in the requested content language.
Return content matching the required structured schema.
Also return a short teacher-only explanation (teacherRationale) describing exactly what personalization was used.`;

const FORMAT_GUIDE: Record<ContentKind, string> = {
  story:
    'Return kind "story": 4–8 scenes. Each scene has a short narration (1–3 sentences), an "illustration" (one emoji), a "visualPrompt" describing a gentle illustration, and "characterIds" (only ids from approvedCharacters, or []). Interactive stories must include at least one scene with 2 simple "choices" whose nextSceneId points to an existing scene; every path must reach a calm ending.',
  routine: 'Return kind "routine": 3–6 short steps a child can follow, each with a 1–3 word "label", a one-sentence "narration" and one emoji "illustration".',
  activity:
    'Return kind "activity": 2–4 rounds. Each round has a short prompt, 2–3 picture options (one emoji each, exactly one with isPreferred true) and gentle "encouragement" that praises trying, never right/wrong scoring.',
  guide:
    'Return kind "guide": instructions for an adult (audience "teacher", or "parent" for home activities) with 2–6 clear steps and a short materials list. Keep language positive and practical.',
};

export function generationPrompt(ctx: GenerationContext): string {
  const kind = KIND_BY_TYPE[ctx.format];
  return [
    `Create a ${ctx.format.toLowerCase().replaceAll("_", " ")} in language "${ctx.contentLanguage}" for a child aged ${ctx.ageBand}.`,
    FORMAT_GUIDE[kind],
    `Difficulty level ${ctx.difficulty} of 3 (1 = simplest). Target duration about ${ctx.durationMinutes} minutes.`,
    "Use at most the 1–2 interests listed; do not invent other personal details.",
    "Personalization context (JSON):",
    JSON.stringify(ctx, null, 2),
    `Set goalId to "${ctx.goalId}", language to "${ctx.contentLanguage}", ageBand to "${ctx.ageBand}".`,
  ].join("\n\n");
}

export function repairPrompt(original: string, issues: string[]): string {
  return [
    "Your previous answer did not match the required schema or safety rules.",
    "Problems found:",
    ...issues.map((i) => `- ${i}`),
    "Return a corrected version of the full JSON object only.",
    "Previous answer:",
    original.slice(0, 20_000),
  ].join("\n");
}

export const SUGGEST_SYSTEM_PROMPT = `You help kindergarten teachers organise their own observations into neutral, educational profile notes.
Only suggest attributes clearly supported by the observation text. Never diagnose, never name conditions, never infer sensitive traits.
Use only the allowed category/value keys provided. Suggestions are reviewed by the teacher before use.`;
