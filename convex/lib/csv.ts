import { canonicalName, type DraftInput } from "./draftTypes";

export const CSV_COLUMNS = ["body", "member", "role", "appointed", "term_end", "source_url"] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    pushField();
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

export function csvToDrafts(text: string, fallbackSourceUrl: string): DraftInput[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("The CSV is empty");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const columnAt = (column: string) => header.indexOf(column);
  if (columnAt("body") === -1 || columnAt("member") === -1) {
    throw new Error(`The CSV needs the columns ${CSV_COLUMNS.join(", ")}`);
  }
  const cell = (row: string[], column: string): string => {
    const at = columnAt(column);
    return at === -1 ? "" : (row[at] ?? "").trim();
  };
  const drafts: DraftInput[] = [];
  const byName = new Map<string, DraftInput>();
  for (const row of rows.slice(1)) {
    const bodyName = cell(row, "body");
    if (bodyName === "") continue;
    const key = canonicalName(bodyName);
    let draft = byName.get(key);
    if (!draft) {
      draft = {
        name: bodyName,
        meetingCadence: null,
        termLength: null,
        termLimit: null,
        seatCount: null,
        members: [],
        snippet: `Imported from CSV: ${bodyName}`,
        sourceUrl: cell(row, "source_url") || fallbackSourceUrl,
      };
      byName.set(key, draft);
      drafts.push(draft);
    }
    const memberName = cell(row, "member");
    if (memberName === "") continue;
    const role = cell(row, "role");
    const appointed = cell(row, "appointed");
    const termEnd = cell(row, "term_end");
    draft.members.push({
      name: memberName,
      role: role === "" ? null : role,
      appointed: appointed === "" ? null : appointed,
      termEnd: termEnd === "" ? null : termEnd,
      snippet: [bodyName, memberName, role, appointed, termEnd].filter((v) => v !== "").join(" | "),
      confidence: "grounded",
    });
  }
  return drafts;
}
