#!/usr/bin/env bash
# Circadian installer — scaffolds a per-user memory substrate and wires the
# supported harnesses plus scheduled metabolism. Idempotent and non-destructive
# for private memory: it never overwrites an existing mind/.
set -euo pipefail

# ---- operator-tunable schedule --------------------------------------------
# Mac and VPS/Linux consolidation must not overlap. Keep these obvious and
# centralized; override with CIRCADIAN_MAC_NIGHTLY_{HOUR,MINUTE} or
# CIRCADIAN_LINUX_NIGHTLY_{HOUR,MINUTE} while the final slots are being decided.
CIRCADIAN_MAC_NIGHTLY_HOUR="${CIRCADIAN_MAC_NIGHTLY_HOUR:-3}"
CIRCADIAN_MAC_NIGHTLY_MINUTE="${CIRCADIAN_MAC_NIGHTLY_MINUTE:-0}"
CIRCADIAN_LINUX_NIGHTLY_HOUR="${CIRCADIAN_LINUX_NIGHTLY_HOUR:-4}"
CIRCADIAN_LINUX_NIGHTLY_MINUTE="${CIRCADIAN_LINUX_NIGHTLY_MINUTE:-30}"

# Standalone doctor watchdog. The unified nightly job also runs doctor after
# harvest+REM; this extra watchdog preserves the hand-built health job.
CIRCADIAN_DOCTOR_HOUR="${CIRCADIAN_DOCTOR_HOUR:-9}"
CIRCADIAN_DOCTOR_MINUTE="${CIRCADIAN_DOCTOR_MINUTE:-5}"

# ---- resolve paths ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCADIAN_HOME="${CIRCADIAN_HOME:-$SCRIPT_DIR}"
MIND_DIR="$CIRCADIAN_HOME/mind"
TEMPLATES_DIR="$CIRCADIAN_HOME/templates"
LOG_DIR="$CIRCADIAN_HOME/logs"

platform="$(uname)"
case "$platform" in
  Darwin) DEFAULT_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.bun/bin" ;;
  *) DEFAULT_PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin" ;;
esac
CIRCADIAN_JOB_PATH="${CIRCADIAN_JOB_PATH:-$DEFAULT_PATH}"

printf 'circadian: installing into %s\n' "$CIRCADIAN_HOME"

# ---- 1. prerequisites ------------------------------------------------------
BUN_BIN="${CIRCADIAN_BUN_BIN:-$(command -v bun || true)}"
if [ -z "$BUN_BIN" ]; then
  echo "circadian: ERROR — 'bun' not found on PATH. Install it: https://bun.sh" >&2
  echo "  then re-run, or set CIRCADIAN_BUN_BIN=/path/to/bun ./install.sh" >&2
  exit 1
fi
echo "circadian: using bun at $BUN_BIN"

LLM_BASE_URL="${CIRCADIAN_LLM_BASE_URL:-${LOCAL_LLM_BASE_URL:-http://127.0.0.1:10240/v1}}"
if ! curl -sS -m 5 "$LLM_BASE_URL/models" >/dev/null 2>&1; then
  echo "circadian: WARNING — local LLM not reachable at $LLM_BASE_URL." >&2
  echo "  SLEEP/REM/doctor drafting need it. Start the service or set CIRCADIAN_LLM_BASE_URL." >&2
fi

# ---- 2. scaffold mind/ from templates -------------------------------------
if [ -d "$MIND_DIR" ]; then
  echo "circadian: mind/ already exists at $MIND_DIR — leaving it untouched."
else
  echo "circadian: scaffolding mind/ from templates/"
  mkdir -p "$MIND_DIR/episodes" "$MIND_DIR/beliefs"

  USER_NAME="${CIRCADIAN_USER_NAME:-}"
  if [ -z "$USER_NAME" ]; then
    if [ -t 0 ]; then
      read -r -p "Your name (for USER.md relational memory): " USER_NAME
    fi
    [ -z "$USER_NAME" ] && USER_NAME="$(id -un)"
  fi

  for f in SELF.md NOW.md greeting.md compost.md MIND-SPEC.md; do
    cp "$TEMPLATES_DIR/$f" "$MIND_DIR/$f"
  done
  sed "s/{{USER_NAME}}/$USER_NAME/g" "$TEMPLATES_DIR/USER.md" > "$MIND_DIR/USER.md"
  : > "$MIND_DIR/scoreboard.jsonl"

  git -C "$MIND_DIR" init -q -b main
  cat > "$MIND_DIR/.gitignore" <<'EOF'
# mind/ is a private git repo (no remote) and never pushed. Two derived,
# rebuildable stores are never committed:
#   meals/  — graze in-session checkpoints SLEEP folds into episodes then deletes.
#   index/  — the relational evidence index, rebuilt by relindex.ts.
meals/
index/
# Local CAS publication metadata, never part of a mind commit.
intents/
receipts/
EOF
  git -C "$MIND_DIR" add -A
  git -C "$MIND_DIR" commit -q -m "founding: circadian mind scaffolded from templates"
  echo "circadian: mind/ initialized as a private git repo (no remote) for $USER_NAME"
fi

mkdir -p "$LOG_DIR" "$HOME/.local/bin"
if [ ! -e "$HOME/.local/bin/circadian" ] && [ ! -L "$HOME/.local/bin/circadian" ]; then
  ln -s "$CIRCADIAN_HOME/bin/circadian" "$HOME/.local/bin/circadian"
fi

write_if_changed() {
  local path="$1" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if [ ! -f "$path" ] || ! cmp -s "$tmp" "$path"; then
    mkdir -p "$(dirname "$path")"
    mv "$tmp" "$path"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

plist_calendar() {
  local hour="$1" minute="$2"
  cat <<EOF
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$hour</integer>
        <key>Minute</key>
        <integer>$minute</integer>
    </dict>
EOF
}

install_launch_agent() {
  local plist="$1" label="$2"
  if write_if_changed "$plist"; then
    echo "circadian: wrote launchd agent $plist"
  else
    echo "circadian: launchd agent already current at $plist"
  fi
  if command -v launchctl >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
    if launchctl bootstrap "gui/$(id -u)" "$plist"; then
      echo "circadian: launchd agent loaded: $label"
    else
      echo "circadian: WARNING — launchd agent written but not loaded: $label" >&2
    fi
  fi
  return 0
}

# ---- 3. scheduled metabolism ----------------------------------------------
install_macos_jobs() {
  local plist_dir="$HOME/Library/LaunchAgents"
  mkdir -p "$plist_dir"

  install_launch_agent "$plist_dir/com.circadian.rem.plist" "com.circadian.rem" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.circadian.rem</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-lc</string>
        <string>$BUN_BIN $CIRCADIAN_HOME/src/harvest.ts &amp;&amp; $BUN_BIN $CIRCADIAN_HOME/src/rem-popmem.ts --drain &amp;&amp; $BUN_BIN $CIRCADIAN_HOME/src/doctor.ts --alert</string>
    </array>
$(plist_calendar "$CIRCADIAN_MAC_NIGHTLY_HOUR" "$CIRCADIAN_MAC_NIGHTLY_MINUTE")
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/nightly-consolidation.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/nightly-consolidation.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$CIRCADIAN_JOB_PATH</string>
        <key>CIRCADIAN_HOME</key>
        <string>$CIRCADIAN_HOME</string>
        <key>CIRCADIAN_BUN_BIN</key>
        <string>$BUN_BIN</string>
        <key>CIRCADIAN_LLM_BASE_URL</key>
        <string>$LLM_BASE_URL</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$CIRCADIAN_HOME</string>
</dict>
</plist>
EOF

  install_launch_agent "$plist_dir/com.circadian.doctor.plist" "com.circadian.doctor" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.circadian.doctor</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_BIN</string>
        <string>$CIRCADIAN_HOME/src/doctor.ts</string>
        <string>--alert</string>
    </array>
$(plist_calendar "$CIRCADIAN_DOCTOR_HOUR" "$CIRCADIAN_DOCTOR_MINUTE")
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/doctor.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/doctor.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$CIRCADIAN_JOB_PATH</string>
        <key>CIRCADIAN_HOME</key>
        <string>$CIRCADIAN_HOME</string>
        <key>CIRCADIAN_BUN_BIN</key>
        <string>$BUN_BIN</string>
        <key>CIRCADIAN_LLM_BASE_URL</key>
        <string>$LLM_BASE_URL</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$CIRCADIAN_HOME</string>
</dict>
</plist>
EOF
}

install_linux_jobs() {
  local unit_dir service timer doctor_service doctor_timer
  unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  service="$unit_dir/circadian-rem.service"
  timer="$unit_dir/circadian-rem.timer"
  doctor_service="$unit_dir/circadian-doctor.service"
  doctor_timer="$unit_dir/circadian-doctor.timer"
  mkdir -p "$unit_dir"

  write_if_changed "$service" <<EOF || true
[Unit]
Description=Circadian nightly consolidation (harvest, REM drain, doctor)

[Service]
Type=oneshot
WorkingDirectory=$CIRCADIAN_HOME
Environment=CIRCADIAN_LLM_BASE_URL=$LLM_BASE_URL
Environment=CIRCADIAN_HOME=$CIRCADIAN_HOME
Environment=CIRCADIAN_BUN_BIN=$BUN_BIN
Environment=PATH=$CIRCADIAN_JOB_PATH
TimeoutStartSec=0
ExecStart=$BUN_BIN $CIRCADIAN_HOME/src/harvest.ts
ExecStart=$BUN_BIN $CIRCADIAN_HOME/src/rem-popmem.ts --drain
ExecStart=$BUN_BIN $CIRCADIAN_HOME/src/doctor.ts --alert
StandardOutput=append:$LOG_DIR/nightly-consolidation.log
StandardError=append:$LOG_DIR/nightly-consolidation.error.log
EOF

  write_if_changed "$timer" <<EOF || true
[Unit]
Description=Circadian nightly consolidation at ${CIRCADIAN_LINUX_NIGHTLY_HOUR}:${CIRCADIAN_LINUX_NIGHTLY_MINUTE}

[Timer]
OnCalendar=*-*-* ${CIRCADIAN_LINUX_NIGHTLY_HOUR}:${CIRCADIAN_LINUX_NIGHTLY_MINUTE}:00
Persistent=true
Unit=circadian-rem.service

[Install]
WantedBy=timers.target
EOF

  write_if_changed "$doctor_service" <<EOF || true
[Unit]
Description=Circadian health watchdog

[Service]
Type=oneshot
WorkingDirectory=$CIRCADIAN_HOME
Environment=CIRCADIAN_LLM_BASE_URL=$LLM_BASE_URL
Environment=CIRCADIAN_HOME=$CIRCADIAN_HOME
Environment=CIRCADIAN_BUN_BIN=$BUN_BIN
Environment=PATH=$CIRCADIAN_JOB_PATH
ExecStart=$BUN_BIN $CIRCADIAN_HOME/src/doctor.ts --alert
StandardOutput=append:$LOG_DIR/doctor.log
StandardError=append:$LOG_DIR/doctor.error.log
EOF

  write_if_changed "$doctor_timer" <<EOF || true
[Unit]
Description=Run Circadian doctor watchdog

[Timer]
OnCalendar=*-*-* ${CIRCADIAN_DOCTOR_HOUR}:${CIRCADIAN_DOCTOR_MINUTE}:00
Persistent=true
Unit=circadian-doctor.service

[Install]
WantedBy=timers.target
EOF

  if systemctl --user daemon-reload && systemctl --user enable --now circadian-rem.timer circadian-doctor.timer; then
    echo "circadian: systemd user timers active (nightly consolidation + doctor)."
  else
    echo "circadian: WARNING — systemd user timers written but not activated; run systemctl --user enable --now circadian-rem.timer circadian-doctor.timer when the user bus is available." >&2
  fi
}

case "$platform" in
  Darwin) install_macos_jobs ;;
  Linux) install_linux_jobs ;;
  *) echo "circadian: unsupported scheduler on $platform; configure nightly consolidation manually." >&2 ;;
esac

# ---- 4. Claude Code hook wiring -------------------------------------------
SETTINGS="$HOME/.claude/settings.json"
WAKE_CMD="$BUN_BIN $CIRCADIAN_HOME/src/wake.ts"
SLEEP_CMD="$BUN_BIN $CIRCADIAN_HOME/src/sleep.ts"
GRAZE_CMD="$BUN_BIN $CIRCADIAN_HOME/src/graze.ts"
GATE_CMD="CIRCADIAN_HOME=$CIRCADIAN_HOME CIRCADIAN_BUN_BIN=$BUN_BIN $CIRCADIAN_HOME/bin/circadian-graze-gate"
STATUS_CMD="$BUN_BIN $CIRCADIAN_HOME/src/status.ts --line"
STATUSLINE_CMD="CIRCADIAN_HOME=$CIRCADIAN_HOME $CIRCADIAN_HOME/bin/circadian-statusline"

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak-$(date +%s)"

"$BUN_BIN" - "$SETTINGS" "$WAKE_CMD" "$SLEEP_CMD" "$GRAZE_CMD" "$BUN_BIN" "$CIRCADIAN_HOME" "$SCRIPT_DIR" "$GATE_CMD" "$STATUS_CMD" "$STATUSLINE_CMD" "$LLM_BASE_URL" <<'JS'
const [file, wakeCmd, sleepCmd, grazeCmd, bunBin, home, scriptDir, gateCmd, statusCmd, statuslineCmd, llmBaseUrl] = Bun.argv.slice(2);
const { WAKE_PARTS } = await import(scriptDir + "/src/wake-payload.ts");
const s = JSON.parse(await Bun.file(file).text() || "{}");
s.hooks ??= {};
const has = (evt, needle) => (s.hooks[evt] || []).some(g => (g.hooks || []).some(h => (h.command || "").includes(needle)));
const hasCmd = (evt, suffix) => (s.hooks[evt] || []).some(g => (g.hooks || []).some(h => (h.command || "").trimEnd().endsWith(suffix)));
const ensure = (evt, cmd, needle, timeout, present = has) => {
  s.hooks[evt] ??= [];
  if (!present(evt, needle)) s.hooks[evt].push({ hooks: [{ type: "command", command: cmd, timeout }] });
};
if (Array.isArray(s.hooks.Stop)) {
  for (const g of s.hooks.Stop) if (Array.isArray(g.hooks)) g.hooks = g.hooks.filter(h => !(h.command || "").includes("/src/sleep.ts"));
  s.hooks.Stop = s.hooks.Stop.filter(g => (g.hooks || []).length);
  if (!s.hooks.Stop.length) delete s.hooks.Stop;
}
ensure("SessionStart", wakeCmd, "/src/wake.ts", 10, hasCmd);
for (let k = 2; k <= WAKE_PARTS; k++) ensure("SessionStart", `${wakeCmd} --part ${k}`, `/src/wake.ts --part ${k}`, 10, hasCmd);
ensure("SessionStart", statusCmd, "/src/status.ts --line", 10);
s.statusLine ??= { type: "command", command: statuslineCmd };
ensure("SessionEnd", sleepCmd, "/src/sleep.ts", 15);
const hasGraze = evt => has(evt, "/src/graze.ts") || has(evt, "circadian-graze-gate");
for (const evt of ["PostToolUse", "UserPromptSubmit"]) {
  for (const g of s.hooks[evt] || []) for (const h of g.hooks || []) if ((h.command || "").trim() === grazeCmd) h.command = gateCmd;
  ensure(evt, gateCmd, "", 10, hasGraze);
}
await Bun.write(file, JSON.stringify(s, null, 2) + "\n");
const registry = process.env.HOME + "/.claude.json";
const user = JSON.parse(await Bun.file(registry).text().catch(() => "{}") || "{}");
user.mcpServers ??= {};
user.mcpServers.circadian ??= { command: bunBin, args: [home + "/src/serve.ts"], env: { CIRCADIAN_HOME: home, CIRCADIAN_LLM_BASE_URL: llmBaseUrl } };
await Bun.write(registry, JSON.stringify(user, null, 2) + "\n");
console.log(`circadian: Claude Code wired — wake parts 1-${WAKE_PARTS}, status, graze gate, sleep, MCP`);
JS

# ---- 5. Pi.dev extension wiring -------------------------------------------
PI_EXT_DIR="$HOME/.pi/agent/extensions"
PI_EXT="$PI_EXT_DIR/circadian-mind.ts"
mkdir -p "$PI_EXT_DIR"
write_if_changed "$PI_EXT" <<EOF || true
// Shim: circadian-mind extension. Re-exports from the circadian source repo
// so jiti resolves obs.ts and node: imports from the real location.
// Generated by install.sh — do not edit manually; edit src/circadian-mind.ts
// in the circadian repo and run install.sh to regenerate.
export { default } from "$CIRCADIAN_HOME/src/circadian-mind.ts";
EOF
echo "circadian: Pi extension installed/current at $PI_EXT (reload in Pi with /reload)."

# ---- 6. Codex hook wiring + MCP -------------------------------------------
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CODEX_HOOKS="$CODEX_HOME/hooks.json"
CODEX_CONFIG="$CODEX_HOME/config.toml"
mkdir -p "$CODEX_HOME"
[ -f "$CODEX_HOOKS" ] || echo '{"hooks":{}}' > "$CODEX_HOOKS"
[ -f "$CODEX_CONFIG" ] || : > "$CODEX_CONFIG"

"$BUN_BIN" - "$CODEX_HOOKS" "$CODEX_CONFIG" "$BUN_BIN" "$CIRCADIAN_HOME" <<'JS'
const [hooksFile, configFile, bunBin, home] = Bun.argv.slice(2);
const hooks = JSON.parse(await Bun.file(hooksFile).text().catch(() => '{"hooks":{}}') || '{"hooks":{}}');
hooks.hooks ??= {};
const want = {
  SessionStart: [{ type: "command", command: `${bunBin} ${home}/src/circadian-codex.ts --wake`, timeout: 30, statusMessage: "Circadian wake" }],
  UserPromptSubmit: [{ type: "command", command: `${bunBin} ${home}/src/circadian-codex.ts --graze`, timeout: 30, statusMessage: "Circadian graze" }],
  PostToolUse: [{ type: "command", command: `${bunBin} ${home}/src/circadian-codex.ts --graze`, timeout: 30, statusMessage: "Circadian graze" }],
  SessionEnd: [{ type: "command", command: `${bunBin} ${home}/src/circadian-codex.ts --sleep`, timeout: 3, statusMessage: "Circadian sleep" }],
};
for (const [evt, hs] of Object.entries(want)) {
  hooks.hooks[evt] ??= [];
  for (const h of hs) {
    const exists = hooks.hooks[evt].some(g => (g.hooks || []).some(x => (x.command || "") === h.command));
    if (!exists) hooks.hooks[evt].push({ hooks: [h] });
  }
}
await Bun.write(hooksFile, JSON.stringify(hooks, null, 2) + "\n");
let toml = await Bun.file(configFile).text().catch(() => "");
if (!/^\[mcp_servers\.circadian\]/m.test(toml)) {
  if (toml && !toml.endsWith("\n")) toml += "\n";
  toml += `\n[mcp_servers.circadian]\ncommand = ${JSON.stringify(bunBin)}\nargs = [${JSON.stringify(home + "/src/serve.ts")}]\n\n[mcp_servers.circadian.env]\nCIRCADIAN_HOME = ${JSON.stringify(home)}\n`;
  await Bun.write(configFile, toml);
}
console.log("circadian: Codex wired — hooks.json lifecycle hooks + MCP server");
JS

echo "circadian: NOTE — Codex requires new hooks to be trusted in its hook-state hash store. Start Codex and accept the Circadian hook trust prompts after install."

# ---- 7. Slate / opencode plugin wiring ------------------------------------
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
OPENCODE_CONFIG="$OPENCODE_CONFIG_DIR/opencode.jsonc"
mkdir -p "$OPENCODE_CONFIG_DIR"
"$BUN_BIN" - "$OPENCODE_CONFIG" "$CIRCADIAN_HOME/src/circadian-opencode.ts" <<'JS'
const [file, plugin] = Bun.argv.slice(2);
let s = {};
try {
  const text = await Bun.file(file).text();
  s = JSON.parse(text.replace(/\/\/.*$/gm, ""));
} catch {}
s.$schema ??= "https://opencode.ai/config.json";
s.plugin ??= [];
if (!s.plugin.includes(plugin)) s.plugin.push(plugin);
await Bun.write(file, JSON.stringify(s, null, 2) + "\n");
console.log("circadian: Slate/opencode plugin wired");
JS

echo "circadian: install complete. WAKE/GRAZE/SLEEP now fire automatically in Claude Code, Pi, Codex and Slate/opencode."
echo "circadian: (optional) health check any time: $BUN_BIN $CIRCADIAN_HOME/src/doctor.ts"
