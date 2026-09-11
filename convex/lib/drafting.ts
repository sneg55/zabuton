export type ApplicationState = "received" | "under_review" | "interviewed" | "appointed" | "declined";

export type NoticeKind = "term_expiry" | "reappointment";

export type ApplicationContext = {
  cityName: string;
  bodyName: string | null;
  seatLabel: string | null;
  applicantName: string;
  statement: string;
  termLength: string | null;
  meetingCadence: string | null;
};

export type NoticeContext = {
  cityName: string;
  bodyName: string;
  seatLabel: string | null;
  memberName: string;
  termEnd: string | null;
  termLength: string | null;
  meetingCadence: string | null;
  kind: NoticeKind;
};

export type Draft = { subject: string; body: string };

const YEAR_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

const TERM_YEARS = /(\d+|one|two|three|four|five)[\s-]*year/i;

export function parseTermYears(termLength: string | null | undefined): number | null {
  if (!termLength) return null;
  const match = TERM_YEARS.exec(termLength);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const years = YEAR_WORDS[token] ?? Number(token);
  if (!Number.isFinite(years) || years <= 0 || years > 20) return null;
  return years;
}

export function addYears(from: number, years: number): number {
  const date = new Date(from);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.getTime();
}

export function termEndFrom(now: number, termLength: string | null | undefined): number | undefined {
  const years = parseTermYears(termLength);
  return years === null ? undefined : addYears(now, years);
}

export function longDate(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function isoDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function sanitizeDraft(text: string): string {
  return text
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function seatPhrase(bodyName: string | null, seatLabel: string | null): string {
  if (bodyName && seatLabel) return `the ${seatLabel} seat on the ${bodyName}`;
  if (bodyName) return `the ${bodyName}`;
  if (seatLabel) return `the ${seatLabel} seat`;
  return "a city board or commission";
}

export function acknowledgementSubject(context: ApplicationContext): string {
  const where = context.bodyName ?? "city boards and commissions";
  return `Your application to ${where}`;
}

export function acknowledgementText(context: ApplicationContext): string {
  return sanitizeDraft(
    [
      `Dear ${context.applicantName},`,
      "",
      `Thank you for applying to serve on ${seatPhrase(context.bodyName, context.seatLabel)} in ${context.cityName}.`,
      "",
      "Your application has been received and is on the clerk's board for review. You will hear from this address as it moves forward, and you can reply here with any questions.",
      "",
      "Sincerely,",
      `Office of the City Clerk, ${context.cityName}`,
    ].join("\n"),
  );
}

const STATE_LINES: Record<ApplicationState, (context: ApplicationContext) => string> = {
  received: (c) =>
    `Your application for ${seatPhrase(c.bodyName, c.seatLabel)} has been received and logged. Nothing is needed from you right now.`,
  under_review: (c) =>
    `Your application for ${seatPhrase(c.bodyName, c.seatLabel)} is now under review. We will let you know as soon as the review is complete.`,
  interviewed: (c) =>
    `Thank you for your interview regarding ${seatPhrase(c.bodyName, c.seatLabel)}. The next step is a decision by the appointing authority, and we will write to you either way.`,
  appointed: (c) =>
    `You have been appointed to ${seatPhrase(c.bodyName, c.seatLabel)}. The clerk's office will follow up with the oath of office and the next meeting date.`,
  declined: (c) =>
    `After review, ${seatPhrase(c.bodyName, c.seatLabel)} has been filled by another applicant. We hope you will apply again, and we will keep your application on file for future openings.`,
};

export function applicationReplyTemplate(context: ApplicationContext, state: ApplicationState): string {
  const lines = [
    `Dear ${context.applicantName},`,
    "",
    STATE_LINES[state](context),
  ];
  if (state === "appointed" && context.termLength) {
    lines.push("", `The term for this seat runs ${context.termLength}.`);
  }
  if (state === "appointed" && context.meetingCadence) {
    lines.push("", `The ${context.bodyName ?? "body"} meets ${context.meetingCadence}.`);
  }
  lines.push("", "Sincerely,", `Office of the City Clerk, ${context.cityName}`);
  return sanitizeDraft(lines.join("\n"));
}

export const DRAFT_INSTRUCTIONS =
  "You write correspondence for a city clerk's office. Plain, warm, specific municipal English. " +
  "Address the recipient by name, name the body and the seat, say exactly what has happened and what the next step is. " +
  "No marketing language, no exclamation marks, no em dashes, no placeholders in brackets. " +
  "Sign off as the Office of the City Clerk. Return the letter text only, no subject line and no preamble.";

export function applicationReplyPrompt(context: ApplicationContext, state: ApplicationState): string {
  return [
    `City: ${context.cityName}`,
    `Body: ${context.bodyName ?? "not specified, the applicant applied to the general pool"}`,
    `Seat: ${context.seatLabel ?? "not specified"}`,
    `Term length as published: ${context.termLength ?? "not stated"}`,
    `Meeting cadence as published: ${context.meetingCadence ?? "not stated"}`,
    `Applicant: ${context.applicantName}`,
    `Applicant statement: ${context.statement}`,
    `New application state: ${state}`,
    "",
    `Write the reply the clerk sends to ${context.applicantName} now that the application is ${state}.`,
  ].join("\n");
}

export function noticeSubject(context: NoticeContext): string {
  const seat = context.seatLabel ? `${context.bodyName}, ${context.seatLabel}` : context.bodyName;
  return context.kind === "term_expiry" ? `Your term on the ${seat} is ending` : `Reappointment to the ${seat}`;
}

export function noticeTemplate(context: NoticeContext): Draft {
  const seat = seatPhrase(context.bodyName, context.seatLabel);
  const ending = context.termEnd ? `ends on ${context.termEnd}` : "is ending";
  const lines =
    context.kind === "term_expiry"
      ? [
          `Dear ${context.memberName},`,
          "",
          `Our records show that your term on ${seat} ${ending}.`,
          "",
          "Please reply to this message to let the clerk's office know whether you would like to be considered for another term. If we do not hear from you, the seat will be posted as an opening.",
        ]
      : [
          `Dear ${context.memberName},`,
          "",
          `Your term on ${seat} ${ending}, and the clerk's office is preparing a reappointment for the council's consideration.`,
          "",
          "Please reply to confirm that you are willing to serve another term, and tell us if any of your contact details have changed.",
        ];
  if (context.termLength) lines.push("", `Terms on this body run ${context.termLength}.`);
  if (context.meetingCadence) lines.push("", `The ${context.bodyName} meets ${context.meetingCadence}.`);
  lines.push("", "Sincerely,", `Office of the City Clerk, ${context.cityName}`);
  return { subject: noticeSubject(context), body: sanitizeDraft(lines.join("\n")) };
}

export function noticePrompt(context: NoticeContext): string {
  return [
    `City: ${context.cityName}`,
    `Body: ${context.bodyName}`,
    `Seat: ${context.seatLabel ?? "not labelled"}`,
    `Member: ${context.memberName}`,
    `Term end as tracked: ${context.termEnd ?? "not known"}`,
    `Term length as published: ${context.termLength ?? "not stated"}`,
    `Meeting cadence as published: ${context.meetingCadence ?? "not stated"}`,
    `Notice kind: ${context.kind}`,
    "",
    context.kind === "term_expiry"
      ? `Write the notice telling ${context.memberName} that the term is ending and asking whether they want to be considered for another term.`
      : `Write the notice telling ${context.memberName} that the clerk is preparing a reappointment and asking them to confirm willingness to serve.`,
  ].join("\n");
}

export const NOTICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
};

export function parseNoticeDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { subject, body } = parsed as { subject?: unknown; body?: unknown };
  if (typeof subject !== "string" || typeof body !== "string") return null;
  if (subject.trim().length === 0 || body.trim().length === 0) return null;
  return { subject: sanitizeDraft(subject), body: sanitizeDraft(body) };
}

export function extractResponseText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) return record.output_text;
  if (!Array.isArray(record.output)) return null;
  const parts: string[] = [];
  for (const item of record.output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      if (typeof chunk !== "object" || chunk === null) continue;
      const typed = chunk as { type?: unknown; text?: unknown };
      if (typed.type === "output_text" && typeof typed.text === "string") parts.push(typed.text);
    }
  }
  const text = parts.join("").trim();
  return text.length > 0 ? text : null;
}

export const DRAFT_MODEL = "gpt-5.4-mini";

export async function requestDraft(
  instructions: string,
  prompt: string,
  schema?: { name: string; schema: unknown },
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const body: Record<string, unknown> = {
    model: DRAFT_MODEL,
    instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
  };
  if (schema) {
    body.text = { format: { type: "json_schema", name: schema.name, strict: true, schema: schema.schema } };
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const text = extractResponseText(await response.json());
    if (text === null) return null;
    return schema ? text : sanitizeDraft(text);
  } catch {
    return null;
  }
}
