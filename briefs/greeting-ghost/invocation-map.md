# Greeting writer — circadian hops only

Harness adapters are not this repo. Invented filenames are not this repo.

| # | process | absolute-path | line |
|---|---|---|---|
| 1 | `buildGreetingPrompt` | `/Users/jrg/circadian/src/rem-popmem.ts` | 630 |
| 2 | `complete` then `parseGreetingResponse` | `/Users/jrg/circadian/src/rem-popmem.ts` | 1281, 1290 |
| 3 | `greetingHasAnchor` — path-shaped token is an anchor only if it is a file on disk; path-shaped backticks are not commands | `/Users/jrg/circadian/src/rem-popmem.ts` | 525, 535–544, 548–553, 603–609 |
| 4 | `atomicWrite` of `mind/greeting.md` | `/Users/jrg/circadian/src/rem-popmem.ts` | 1303 |
| 5 | wake reads `greeting.md` | `/Users/jrg/circadian/src/wake.ts` | 113, 285 |
| 6 | `buildPayload` emits `<mind:greeting>` only when the greeting is non-empty | `/Users/jrg/circadian/src/wake-payload.ts` | 147–154 |

Stamp: `greetingPathTokenExists` + `greetingHasCommandAnchor`. No commit.
