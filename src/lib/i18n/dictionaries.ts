import type { AppLocale } from "./config";
import { ar } from "./messages/ar";
import { en, type Messages } from "./messages/en";
import { he } from "./messages/he";

export const DICTIONARIES: Record<AppLocale, Messages> = { ar, he, en };
