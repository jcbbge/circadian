import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

test("fresh Linux install enables a visible persistent twice-daily user timer; reinstall preserves units", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "circ-linux-install-"));
  try {
    const home = path.join(root, "home"), config = path.join(root, "config"), install = path.join(root, "install"), bin = path.join(root, "bin");
    fs.mkdirSync(bin); fs.mkdirSync(home);
    fs.cpSync(path.join(import.meta.dir, "..", "templates"), path.join(install, "templates"), { recursive: true });
    fs.writeFileSync(path.join(bin, "curl"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "systemctl"), `#!/bin/sh\necho "$*" >> '${root}/systemctl.log'\nif [ "$2" = list-timers ]; then [ -f '${root}/enabled' ] && echo circadian-rem.timer; fi\nif [ "$2" = enable ]; then touch '${root}/enabled'; fi\n`, { mode: 0o755 });
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), CIRCADIAN_HOME: install, CIRCADIAN_BUN_BIN: process.execPath, CIRCADIAN_USER_NAME: "Tester", GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid", PATH: `${bin}:${process.env.PATH}` };
    const run = () => spawnSync("bash", [path.join(import.meta.dir, "..", "install.sh")], { env, encoding: "utf8" });
    expect(run().status).toBe(0);
    const dir = path.join(config, "systemd/user");
    const service = fs.readFileSync(path.join(dir, "circadian-rem.service"), "utf8");
    const timer = fs.readFileSync(path.join(dir, "circadian-rem.timer"), "utf8");
    expect(service).toContain(`ExecStart=${process.execPath} ${install}/src/rem-popmem.ts`);
    expect(service).toContain(`Environment=CIRCADIAN_HOME=${install}`);
    expect(service).toContain(`Environment=CIRCADIAN_BUN_BIN=${process.execPath}`);
    expect(timer).toContain("OnCalendar=*-*-* 09:00:00");
    expect(timer).toContain("OnCalendar=*-*-* 21:00:00");
    expect(timer).toContain("Persistent=true");
    expect(spawnSync("systemctl", ["--user", "list-timers"], { env, encoding: "utf8" }).stdout).toContain("circadian-rem.timer");
    expect(run().status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "circadian-rem.service"), "utf8")).toBe(service);
    expect(fs.readFileSync(path.join(dir, "circadian-rem.timer"), "utf8")).toBe(timer);
    expect((fs.readFileSync(path.join(root, "systemctl.log"), "utf8").match(/enable --now circadian-rem.timer/g) ?? []).length).toBe(2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
