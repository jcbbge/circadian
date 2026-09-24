import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { serializeAtom, parseAtom } from "./atoms.ts";
import { stackEpisode } from "./stack.ts";

const A = "The cliff of complexity keeps accreting inside every system we ship.";
const B = "The cliff is complexity accretion across the whole system.";

test("stack COMPARE routes through the decision transport and degrades on invalid response", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circ-decide-"));
  const priorHome = process.env.CIRCADIAN_HOME;
  process.env.CIRCADIAN_HOME = home;
  const mindDir = path.join(home, "mind");
  const beliefsDir = path.join(mindDir, "beliefs");
  const ledgerPath = path.join(mindDir, "beliefs.jsonl");
  const ioLogPath = path.join(home, "logs", "stacker-io.jsonl");
  try {
    fs.mkdirSync(path.join(mindDir, "episodes"), { recursive: true });
    fs.mkdirSync(beliefsDir);
    const atom = parseAtom(serializeAtom({ kind: "doctrine", claim: B, why: "source", quotes: [{ text: "source", source: "old.md" }], eps: ["2026-09-23"] }));
    fs.writeFileSync(path.join(beliefsDir, `${atom.id}.md`), serializeAtom({ kind: "doctrine", claim: B, why: "source", quotes: [{ text: "source", source: "old.md" }], eps: ["2026-09-23"] }));
    fs.writeFileSync(ledgerPath, JSON.stringify({ ev: "stack", atom: atom.id, ep: "old.md", ts: "2026-09-23T00:00:00Z" }) + "\n");
    fs.writeFileSync(path.join(mindDir, "episodes", "new.md"), `---\ndate: 2026-09-24\n---\n${A}\n`);
    execFileSync("git", ["init", "-q", mindDir]);
    for (const args of [["config", "user.name", "Test"], ["config", "user.email", "test@localhost"], ["add", "."], ["commit", "-qm", "seed"]]) {
      execFileSync("git", ["-C", mindDir, ...args]);
    }
    let calls = 0;
    const result = await stackEpisode({ mindDir, beliefsDir, ledgerPath, ioLogPath, filename: "new.md", correlationId: "decision-test",
      extract: async () => `kind: doctrine\nclaim: ${JSON.stringify(A)}\nwhy: "source"\nquote: ${JSON.stringify(A)}\n`,
      decisionTransport: async ({ options, evidence }) => {
        calls++;
        expect(options).toEqual(["SAME", "DISTINCT", "SUPERSEDES_A", "SUPERSEDES_B"]);
        expect(evidence).toEqual({ A, B });
        return { option: "nonsense" };
      },
    });
    expect(calls).toBe(1);
    expect(result.counts?.compareInvalid).toBe(1);
    expect(result.counts?.new).toBe(1);
    const event = fs.readFileSync(path.join(home, "logs", "circadian.events.jsonl"), "utf8").trim().split("\n").map(JSON.parse).at(-1);
    expect(event.outcome).toBe("degraded");
    expect(event.cause).toContain("coerced to DISTINCT");
    expect(JSON.parse(fs.readFileSync(ioLogPath, "utf8").trim().split("\n").at(-1)!).completion).toBe("nonsense");
  } finally {
    if (priorHome === undefined) delete process.env.CIRCADIAN_HOME;
    else process.env.CIRCADIAN_HOME = priorHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
