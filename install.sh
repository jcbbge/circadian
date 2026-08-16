#!/usr/bin/env bash
# Circadian installer — scaffolds a per-user memory substrate from templates/.
#
# Idempotent and non-destructive: it never overwrites an existing mind/ and
# never clobbers existing hooks. Re-running it only fills in what's missing.
#
# What it does:
#   1. resolves CIRCADIAN_HOME (this repo) and checks prerequisites (bun)
#   2. scaffolds $CIRCADIAN_HOME/mind/ from templates/ (personalizing USER.md)
#   3. inits the mind/ git repo (no remote, ever — it holds private memory)
#   4. installs the nightly REM launchd job (macOS) pointed at this repo
#   5. prints the exact Claude Code hook config to add (does not edit it blind)
#
# Usage:
#   ./install.sh                 # interactive: prompts for your name
#   CIRCADIAN_USER_NAME="Ada" ./install.sh   # non-interactive
set -euo pipefail

# ---- resolve paths ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCADIAN_HOME="${CIRCADIAN_HOME:-$SCRIPT_DIR}"
MIND_DIR="$CIRCADIAN_HOME/mind"
TEMPLATES_DIR="$CIRCADIAN_HOME/templates"
LOG_DIR="$CIRCADIAN_HOME/logs"

echo "circadian: installing into $CIRCADIAN_HOME"

# ---- 1. prerequisites ------------------------------------------------------
BUN_BIN="${CIRCADIAN_BUN_BIN:-$(command -v bun || true)}"
if [ -z "$BUN_BIN" ]; then
  echo "circadian: ERROR — 'bun' not found on PATH. Install it: https://bun.sh" >&2
  echo "  then re-run, or set CIRCADIAN_BUN_BIN=/path/to/bun ./install.sh" >&2
  exit 1
fi
echo "circadian: using bun at $BUN_BIN"

# SLEEP/REM drafting call the system local-LLM service (OpenAI-compatible),
# not a cloud CLI. Default endpoint 127.0.0.1:10240 (see llm.ts for the env
# knobs: CIRCADIAN_LLM_BASE_URL / CIRCADIAN_LLM_MODEL). Probe it, warn if down.
LLM_BASE_URL="${CIRCADIAN_LLM_BASE_URL:-${LOCAL_LLM_BASE_URL:-http://127.0.0.1:10240/v1}}"
if ! curl -sS -m 5 "$LLM_BASE_URL/models" >/dev/null 2>&1; then
  echo "circadian: WARNING — local LLM not reachable at $LLM_BASE_URL." >&2
  echo "  SLEEP/REM drafting need it. Start your local LLM service, or point" >&2
  echo "  CIRCADIAN_LLM_BASE_URL / CIRCADIAN_LLM_MODEL at another endpoint." >&2
fi

# ---- 2. scaffold mind/ from templates -------------------------------------
if [ -d "$MIND_DIR" ]; then
  echo "circadian: mind/ already exists at $MIND_DIR — leaving it untouched."
else
  echo "circadian: scaffolding mind/ from templates/"
  mkdir -p "$MIND_DIR/episodes"

  # personalize USER.md
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

  # empty append-only scoreboard
  : > "$MIND_DIR/scoreboard.jsonl"

  # ---- 3. init the mind git repo (private, no remote) ---------------------
  git -C "$MIND_DIR" init -q
  # mind/ is standalone; guard the private file even if the dir is ever nested
  cat > "$MIND_DIR/.gitignore" <<'EOF'
# mind/ is a private git repo (no remote) and never pushed. Two derived,
# rebuildable stores are never committed:
#   meals/  — graze in-session checkpoints SLEEP folds into episodes then deletes.
#   index/  — the relational evidence index (a read-optimized view over
#             episodes/ + beliefs/, rebuilt by `bun src/relindex.ts --reindex`
#             and refreshed each REM run). Per-user derived data; not source.
meals/
index/
EOF
  git -C "$MIND_DIR" add -A
  git -C "$MIND_DIR" commit -q -m "founding: circadian mind scaffolded from templates"
  echo "circadian: mind/ initialized as a private git repo (no remote) for $USER_NAME"
fi

mkdir -p "$LOG_DIR"

# ---- 4. install the nightly REM launchd job (macOS only) ------------------
if [ "$(uname)" = "Darwin" ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST="$PLIST_DIR/com.circadian.rem.plist"
  mkdir -p "$PLIST_DIR"
  if [ -f "$PLIST" ]; then
    echo "circadian: launchd job already installed at $PLIST — leaving it."
  else
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.circadian.rem</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_BIN</string>
        <string>$CIRCADIAN_HOME/src/rem-popmem.ts</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>21</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/rem.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/rem.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.bun/bin</string>
        <key>CIRCADIAN_HOME</key>
        <string>$CIRCADIAN_HOME</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$CIRCADIAN_HOME</string>
</dict>
</plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "circadian: REM job installed (09:00 and 21:00 daily)."
  fi

  # Catch-up agent: runs `rem.ts --if-due` at every login/restart. --if-due
  # runs REM only when the most recent 09:00/21:00 slot was missed, and never
  # double-runs a slot. Together with the scheduled job above and the WAKE
  # hook (which also fires --if-due per session), a slot missed while the
  # laptop was closed runs at the next opportunity: login, restart, wake, or
  # any new session.
  CATCHUP="$PLIST_DIR/com.circadian.rem-catchup.plist"
  if [ -f "$CATCHUP" ]; then
    echo "circadian: catch-up agent already installed at $CATCHUP — leaving it."
  else
    cat > "$CATCHUP" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.circadian.rem-catchup</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_BIN</string>
        <string>$CIRCADIAN_HOME/src/rem-popmem.ts</string>
        <string>--if-due</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/rem.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/rem.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.bun/bin</string>
        <key>CIRCADIAN_HOME</key>
        <string>$CIRCADIAN_HOME</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$CIRCADIAN_HOME</string>
</dict>
</plist>
EOF
    launchctl unload "$CATCHUP" 2>/dev/null || true
    launchctl load "$CATCHUP"
    echo "circadian: catch-up agent installed (runs --if-due at every login/restart)."
  fi
else
  echo "circadian: non-macOS — skipping launchd. Schedule 'CIRCADIAN_HOME=$CIRCADIAN_HOME $BUN_BIN $CIRCADIAN_HOME/src/rem-popmem.ts' via cron/systemd at 09:00 and 21:00, and 'rem-popmem.ts --if-due' at login/wake."
fi

# ---- 5. Claude Code hook wiring (auto-merged, idempotent) ------------------
# WAKE fires on SessionStart, SLEEP on SessionEnd (NOT Stop — Stop fires every
# assistant turn, which misfires and gets deduped; SessionEnd fires once at the
# real end of a session, which is the whole contract). We merge into the user's
# existing settings.json without clobbering their other hooks, and we do it
# ourselves so there is ZERO manual JSON editing.
SETTINGS="$HOME/.claude/settings.json"
WAKE_CMD="$BUN_BIN $CIRCADIAN_HOME/src/wake.ts"
SLEEP_CMD="$BUN_BIN $CIRCADIAN_HOME/src/sleep.ts"
GRAZE_CMD="$BUN_BIN $CIRCADIAN_HOME/src/graze.ts"

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak-$(date +%s)"

"$BUN_BIN" - "$SETTINGS" "$WAKE_CMD" "$SLEEP_CMD" "$GRAZE_CMD" <<'JS'
const [file, wakeCmd, sleepCmd, grazeCmd] = Bun.argv.slice(2);
const s = JSON.parse(await Bun.file(file).text() || "{}");
s.hooks ??= {};
const has = (evt, needle) =>
  (s.hooks[evt] || []).some(g => (g.hooks || []).some(h => (h.command || "").includes(needle)));
const ensure = (evt, cmd, needle, timeout) => {
  s.hooks[evt] ??= [];
  if (!has(evt, needle)) s.hooks[evt].push({ hooks: [{ type: "command", command: cmd, timeout }] });
};
// SLEEP must live on SessionEnd only — strip any legacy copy on Stop.
if (Array.isArray(s.hooks.Stop)) {
  for (const g of s.hooks.Stop) if (Array.isArray(g.hooks))
    g.hooks = g.hooks.filter(h => !(h.command || "").includes("circadian/src/sleep.ts"));
  s.hooks.Stop = s.hooks.Stop.filter(g => (g.hooks || []).length);
  if (!s.hooks.Stop.length) delete s.hooks.Stop;
}
ensure("SessionStart", wakeCmd, "circadian/src/wake.ts", 10);
ensure("SessionEnd", sleepCmd, "circadian/src/sleep.ts", 15);
ensure("PostToolUse", grazeCmd, "circadian/src/graze.ts", 10);
ensure("UserPromptSubmit", grazeCmd, "circadian/src/graze.ts", 10);
await Bun.write(file, JSON.stringify(s, null, 2) + "\n");
console.log("circadian: hooks wired — SessionStart->wake, SessionEnd->sleep, PostToolUse+UserPromptSubmit->graze");
JS

# ---- 6. Pi.dev extension wiring (idempotent) ------------------------------
# Installs the circadian-mind Pi extension that provides WAKE/GRAZE/SLEEP
# coverage for Pi.dev sessions, closing the gap with Claude Code hooks.
# The extension is a thin shim that re-exports from src/circadian-mind.ts
# in the circadian repo, so updates to the source are picked up on /reload.
# (Mirrors the strudel shim pattern at ~/.pi/agent/extensions/strudel/index.ts.)
PI_EXT_DIR="$HOME/.pi/agent/extensions"
PI_EXT="$PI_EXT_DIR/circadian-mind.ts"
if [ -f "$PI_EXT" ]; then
  echo "circadian: Pi extension already installed at $PI_EXT — leaving it."
else
  mkdir -p "$PI_EXT_DIR"
  cat > "$PI_EXT" <<EOF
// Shim: circadian-mind extension. Re-exports from the circadian source repo
// so jiti resolves obs.ts and node: imports from the real location.
// Generated by install.sh — do not edit manually; edit src/circadian-mind.ts
// in the circadian repo and run install.sh to regenerate.
export { default } from "$CIRCADIAN_HOME/src/circadian-mind.ts";
EOF
  echo "circadian: Pi extension installed at $PI_EXT (reload in Pi with /reload)."
fi

echo "circadian: install complete. WAKE/SLEEP now fire automatically — no commands to remember."
echo "circadian: (optional) health check any time: $BUN_BIN $CIRCADIAN_HOME/src/doctor.ts"
