/**
 * Mail delivery abstraction. Development logs messages to the server console
 * (never to the client). Production should register an SMTP/API transport via
 * `setMailTransport` at startup; see ROADMAP.md.
 */
export type Mail = { to: string; subject: string; text: string };
export type MailTransport = (mail: Mail) => Promise<void>;

let transport: MailTransport = async (mail) => {
  if (process.env.NODE_ENV !== "test") {
    console.info(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
};

export function setMailTransport(t: MailTransport) {
  transport = t;
}

export async function sendMail(mail: Mail) {
  await transport(mail);
}
