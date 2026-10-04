import { authed } from "@/lib/route";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";

export const GET = authed(async (_req, actor) => listNotifications(actor));
export const POST = authed(async (_req, actor) => markNotificationsRead(actor));
