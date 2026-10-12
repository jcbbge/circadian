import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { atomId, parseAtom, serializeAtom, type Atom, type LedgerEvent } from "./atoms.ts";
import { memoryView, memoryExpand, VIEW_IO_LIMITS, type MemoryView, type MemoryExpansion } from "./views.ts";

function fixture(run: (f: ReturnType<typeof setup>) => void) {
  const f = setup();
  try { run(f); } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
}
function setup() {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-views-")), mind = path.join(home, "mind");
  fs.mkdirSync(path.join(mind, "beliefs"), { recursive: true }); fs.mkdirSync(path.join(mind, "episodes"));
  fs.writeFileSync(path.join(mind, "beliefs.jsonl"), "");
  const event = (event: Omit<LedgerEvent, "ts">) => fs.appendFileSync(path.join(mind, "beliefs.jsonl"), JSON.stringify({ ts: "2026-10-12", ...event }) + "\n");
  const source = (name: string, content: string) => fs.writeFileSync(path.join(mind, "episodes", name), content);
  const atom = (claim: string, changes: Partial<Omit<Atom, "id">> = {}) => {
    const input = { kind: "doctrine" as const, claim, why: "Reason and limits stay with the claim.", quotes: [{ text: "Keep this exact quote.", source: "2026-10-12-source.md" }], eps: ["2026-10-12"], scope: "travel", ...changes };
    const id = atomId(claim), content = serializeAtom(input), file = path.join(mind, "beliefs", `${id}.md`);
    fs.writeFileSync(file, content); event({ ev: "stack", atom: id });
    return { id, file, content };
  };
  source("2026-10-12-source.md", "---\nscope: travel\n---\nKeep this exact quote.\n");
  return { home, mind, event, source, atom };
}
function view(mind: string, scope = "travel", options = {}): MemoryView {
  const result = memoryView(mind, scope, options); expect(result.kind).toBe("view"); return result as MemoryView;
}
function expansion(mind: string, refs: Parameters<typeof memoryExpand>[1], options = {}): MemoryExpansion {
  const result = memoryExpand(mind, refs, options); expect(result.kind).toBe("expansion"); return result as MemoryExpansion;
}

test("scope and ranking select whole stored atoms; expansion supplies exact current sources", () => fixture(f => {
  f.atom("A personal travel constraint"); const highest = f.atom("A more reinforced travel constraint"); f.event({ ev: "potentiate", atom: highest.id });
  f.atom("A family constraint", { scope: "family" });
  const result = view(f.mind);
  expect(result.coverage).toEqual({ inspected: 3, total: 3, eligible: 2, included: 2, omitted: 0, unresolved: 0, complete: true });
  expect(result.records[0].ref.id).toBe(highest.id); expect(result.records[0].atom).toEqual(parseAtom(highest.content));
  expect(result.records[0]).not.toHaveProperty("content");
  expect(result.records[0].atom.why).toBe("Reason and limits stay with the claim.");
  expect(result.records[0].sources[0]).not.toHaveProperty("content");
  const expanded = expansion(f.mind, [result.records[0].ref]);
  expect(expanded.complete).toBe(true); expect(expanded.entries[0].status).toBe("available");
  expect(expanded.entries[0]).toMatchObject({ record: result.records[0], content: highest.content, sources: [{ source: "2026-10-12-source.md", content: fs.readFileSync(path.join(f.mind, "episodes/2026-10-12-source.md"), "utf8") }] });
  expect(view(f.mind, "family").records).toHaveLength(1);
}));

test("explicit scope wins; legacy scope uses available quote sources and missing scope is unresolved", () => fixture(f => {
  f.atom("An explicit family memory", { scope: "family" });
  const legacy = f.atom("A legacy travel memory", { scope: undefined });
  f.atom("An unresolved legacy memory", { scope: undefined, quotes: [{ text: "lost", source: "missing.md" }] });
  const available = f.atom("A preserved memory despite composted source", { quotes: [{ text: "lost", source: "missing.md" }] });
  const result = view(f.mind);
  expect(result.records.map(record => record.ref.id).sort()).toEqual([legacy.id, available.id].sort());
  expect(result.coverage.unresolved).toBe(1); expect(result.coverage.complete).toBe(false);
  const record = result.records.find(record => record.ref.id === available.id)!;
  expect(record.sources).toEqual([{ source: "missing.md", status: "unavailable", reason: "missing" }]);
  expect(expansion(f.mind, [record.ref]).entries[0]).toMatchObject({ status: "available", sources: record.sources });
}));

test("JSON envelope budgeting accounts for escaping and never drops parts of an atom", () => fixture(f => {
  f.atom("Quotes and escapes", { why: '"\\\n'.repeat(200) }); f.atom("A small memory");
  const full = view(f.mind, "travel", { chars: 128000 });
  for (const chars of [200, 500, 1500, 4000, JSON.stringify(full).length, 128000]) {
    const result = memoryView(f.mind, "travel", { chars });
    if (result.kind !== "view") { expect(result.kind).toBe("invalid-budget"); continue; }
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(chars);
    expect(result.coverage.omitted).toBe(2 - result.records.length);
    expect(result.coverage.complete).toBe(result.records.length === 2);
    for (const record of result.records) expect(record.atom).toEqual(parseAtom(fs.readFileSync(path.join(f.mind, "beliefs", `${record.ref.id}.md`), "utf8")));
  }
  expect(memoryView(f.mind, "travel", { chars: 0 }).kind).toBe("invalid-budget");
  expect(view(f.mind, "travel", { maxRecords: 0 }).coverage).toMatchObject({ omitted: 2, complete: false });
}));

test("scan cap bounds inspections and reports unknown candidates, independently of display cap", () => fixture(f => {
  for (let i = 0; i < 4; i++) f.atom(`Bounded memory ${i}`);
  const result = view(f.mind, "travel", { scanCap: 2, maxRecords: 1 });
  expect(result.coverage).toEqual({ total: 4, inspected: 2, eligible: 2, included: 1, omitted: 1, unresolved: 2, complete: false });
  expect(view(f.mind, "travel", { scanCap: 0 }).coverage).toMatchObject({ inspected: 0, unresolved: 4, complete: false });
}));

test("open disagreement stays visible when its opponent is omitted; changing the relation invalidates expansion", () => fixture(f => {
  const a = f.atom("A travel opinion"), b = f.atom("A conflicting opinion");
  f.event({ ev: "contradiction", a: a.id, b: b.id }); f.event({ ev: "potentiate", atom: a.id });
  const result = view(f.mind, "travel", { maxRecords: 1 });
  expect(result.records[0].disagreements).toEqual([{ edge: [a.id, b.id].sort().join(":"), other: b.id }]);
  expect(result.coverage.omitted).toBe(1);
  f.event({ ev: "resolve", edge: [a.id, b.id].sort().join(":"), winner: a.id });
  expect(expansion(f.mind, [result.records[0].ref]).entries[0].status).toBe("changed-revision");
}));

test("changed atom bytes, changed episode bytes, and changed episode availability reject stale references", () => fixture(f => {
  const a = f.atom("A persistent identity"); let ref = view(f.mind).records[0].ref;
  fs.writeFileSync(a.file, a.content.replace("Reason and limits", "Changed reason and limits"));
  expect(expansion(f.mind, [ref]).entries[0].status).toBe("changed-revision");
  ref = view(f.mind).records[0].ref; f.source("2026-10-12-source.md", "scope: travel\nDifferent exact source.\n");
  expect(expansion(f.mind, [ref]).entries[0].status).toBe("changed-revision");
  ref = view(f.mind).records[0].ref; fs.unlinkSync(path.join(f.mind, "episodes/2026-10-12-source.md"));
  expect(expansion(f.mind, [ref]).entries[0].status).toBe("changed-revision");
  ref = view(f.mind).records[0].ref; f.source("2026-10-12-source.md", "scope: travel\nReturned source.\n");
  expect(expansion(f.mind, [ref]).entries[0].status).toBe("changed-revision");
}));

test("fresh forget/supersede statuses withhold all content; pinned atoms remain eligible", () => fixture(f => {
  const a = f.atom("A recalled item"), b = f.atom("A replacement"); const refs = view(f.mind).records.map(record => record.ref);
  f.event({ ev: "forget", atom: a.id, reason: "operator correction" });
  const forgotten = expansion(f.mind, refs.filter(ref => ref.id === a.id)).entries[0];
  expect(forgotten).toEqual({ ref: refs.find(ref => ref.id === a.id)!, status: "ineligible" });
  f.event({ ev: "pin", atom: b.id }); expect(view(f.mind).records.map(record => record.ref.id)).toEqual([b.id]);
  const c = f.atom("A newer replacement"); f.event({ ev: "supersede", winner: c.id, loser: b.id });
  expect(expansion(f.mind, refs.filter(ref => ref.id === b.id)).entries[0].status).toBe("ineligible");
}));

test("expansion acknowledges oversized entries, bounded inspection, and too-small receipt budgets", () => fixture(f => {
  f.atom("First expansion"); f.atom("Second expansion"); const refs = view(f.mind).records.map(record => record.ref);
  const result = expansion(f.mind, refs, { chars: 500 });
  expect(result.entries.map(entry => entry.status)).toEqual(["over-budget", "over-budget"]);
  expect(result.complete).toBe(true); expect(JSON.stringify(result).length).toBeLessThanOrEqual(500);
  expect(expansion(f.mind, refs, { scanCap: 1 }).complete).toBe(false);
  expect(expansion(f.mind, refs, { chars: 100 })).toMatchObject({ entries: [], complete: false });
  expect(memoryExpand(f.mind, refs, { chars: 0 }).kind).toBe("invalid-budget");
}));

test("malformed, mismatched, oversized and symlink atom files remain unresolved without leaking bytes", () => fixture(f => {
  const malformed = f.atom("Malformed atom"), oversized = f.atom("Oversized atom"), linked = f.atom("Linked atom"), mismatch = f.atom("Wrong identity");
  fs.writeFileSync(malformed.file, "not an atom"); fs.writeFileSync(oversized.file, "x".repeat(VIEW_IO_LIMITS.atomBytes + 1));
  const outside = path.join(f.home, "outside.md"); fs.writeFileSync(outside, "private outside bytes"); fs.unlinkSync(linked.file); fs.symlinkSync(outside, linked.file);
  fs.writeFileSync(mismatch.file, serializeAtom({ kind: "doctrine", claim: "Different identity", why: "reason", quotes: [{ text: "quote", source: "2026-10-12-source.md" }], eps: ["2026-10-12"], scope: "travel" }));
  fs.writeFileSync(path.join(f.mind, "beliefs/not-an-id.md"), "unknown candidate");
  expect(view(f.mind).coverage).toMatchObject({ inspected: 5, eligible: 0, unresolved: 5, complete: false });
  expect(JSON.stringify(view(f.mind))).not.toContain("private outside bytes");
}));

test("source size/path constraints are explicit; symlink directories and ledger fail closed", () => fixture(f => {
  f.atom("A memory with constrained sources", { quotes: [
    { text: "one", source: "big.md" }, { text: "two", source: "../outside.md" }, { text: "three", source: "linked.md" },
  ] });
  f.source("big.md", "x".repeat(VIEW_IO_LIMITS.sourceBytes + 1));
  const outside = path.join(f.home, "outside.md"); fs.writeFileSync(outside, "secret source bytes"); fs.symlinkSync(outside, path.join(f.mind, "episodes/linked.md"));
  const result = view(f.mind);
  expect(result.records[0].sources.map(source => source.status)).toEqual(["unavailable", "unavailable", "unavailable"]);
  expect(result.records[0].sources).toContainEqual({ source: "big.md", status: "unavailable", reason: "oversized" });
  expect(JSON.stringify(expansion(f.mind, [result.records[0].ref]))).not.toContain("secret source bytes");
  fs.renameSync(path.join(f.mind, "beliefs"), path.join(f.home, "moved-beliefs")); fs.symlinkSync(path.join(f.home, "moved-beliefs"), path.join(f.mind, "beliefs"));
  expect(memoryView(f.mind, "travel").kind).toBe("unavailable");
  fs.unlinkSync(path.join(f.mind, "beliefs.jsonl")); fs.symlinkSync(outside, path.join(f.mind, "beliefs.jsonl"));
  expect(memoryExpand(f.mind, [result.records[0].ref]).kind).toBe("unavailable");
}));

test("invalid inputs and absent eligibility never permit traversal or orphan expansion", () => fixture(f => {
  const a = f.atom("An orphaned memory"); const ref = view(f.mind).records[0].ref;
  for (const scope of ["../travel", "UPPER", "a".repeat(129)]) expect(memoryView(f.mind, scope).kind).toBe("invalid-input");
  for (const chars of [-1, 1.5, NaN, 128001]) expect(memoryView(f.mind, "travel", { chars }).kind).toBe("invalid-input");
  expect(memoryExpand(f.mind, [{ id: "../../outside", revision: ref.revision }]).kind).toBe("invalid-input");
  expect(memoryExpand(f.mind, [{ id: a.id, revision: "f" }]).kind).toBe("invalid-input");
  expect(memoryExpand(f.mind, [{ id: [a.id], revision: ref.revision }] as any).kind).toBe("invalid-input");
  fs.writeFileSync(path.join(f.mind, "beliefs.jsonl"), "null\nmalformed\n{}");
  expect(view(f.mind).records).toHaveLength(0); expect(expansion(f.mind, [ref]).entries[0].status).toBe("unavailable");
  fs.unlinkSync(path.join(f.mind, "beliefs.jsonl")); expect(memoryView(f.mind, "travel").kind).toBe("unavailable");
}));

test("fixed total read ceiling reports unavailable sources instead of reading an entire large corpus", () => fixture(f => {
  for (let i = 0; i < 70; i++) {
    const name = `source-${i}.md`;
    f.source(name, "scope: travel\n" + "x".repeat(VIEW_IO_LIMITS.sourceBytes - 14));
    f.atom(`Large corpus memory ${i}`, { quotes: [{ text: "x", source: name }] });
  }
  const result = view(f.mind, "travel", { chars: 128000, maxRecords: 100 });
  expect(result.coverage.included).toBe(70);
  const unavailable = result.records.flatMap(record => record.sources).filter(source => source.status === "unavailable");
  expect(unavailable.length).toBeGreaterThan(0);
  expect(unavailable.every(source => source.status === "unavailable" && source.reason === "read-limit")).toBe(true);
}));

test("non-regular source files cannot block a view; invalid ledger numeric state fails closed", () => fixture(f => {
  f.atom("Memory with a FIFO source", { quotes: [{ text: "unavailable", source: "pipe.md" }] });
  execFileSync("mkfifo", [path.join(f.mind, "episodes/pipe.md")]);
  expect(view(f.mind).records[0].sources).toEqual([{ source: "pipe.md", status: "unavailable", reason: "not-regular-file" }]);
  fs.appendFileSync(path.join(f.mind, "beliefs.jsonl"), JSON.stringify({ ev: "decay", factor: "not-a-number" }) + "\n");
  expect(memoryView(f.mind, "travel").kind).toBe("unavailable");
}));

test("view and expansion perform no writes to the mind", () => fixture(f => {
  f.atom("Keep this read-only");
  const snapshot = () => fs.readdirSync(f.mind, { recursive: true }).map(String).sort().flatMap(name => {
    const file = path.join(f.mind, name), stat = fs.lstatSync(file);
    return stat.isFile() ? [[name, stat.mtimeMs, fs.readFileSync(file).toString("base64")]] : [];
  });
  const before = snapshot(); const result = view(f.mind); expansion(f.mind, result.records.map(record => record.ref));
  expect(snapshot()).toEqual(before);
}));
