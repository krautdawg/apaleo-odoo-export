## Context

The scheduler (`src/schedule/`) computes due periods in `schedule.timezone` and holds a period back until it is final in that time zone and in the property's own; the Docker image runs `schedule --once` in a compose loop. Both are target-independent and were renamed in o01. The default time zone is still `Europe/Zurich`; for German hotels it is `Europe/Berlin`. Zurich and Berlin share the same offsets and DST rules, so no due or final date changes for a property in either zone.

## Goals / Non-Goals

**Goals:**
- Defaults and texts that fit a German hotel without editing.
- The Docker guide ends where the hotel's work ends: the CSV and the protocol in a folder, and the pointer to `docs/odoo-import.md`.

**Non-Goals:**
- A cadence per property, an in-process timer, delivery by e-mail or into Odoo.

## Decisions

1. **Change the default, keep the rules.** `Europe/Berlin` replaces `Europe/Zurich` as default; every rule (dayOfMonth, offsetDays, finalAfter, catchUpDays) stays. Alternative: no default, require the key. Rejected: every German user would have to set the same value.
2. **Docker guide in German as used in Germany, linking the Odoo import guide.** The guide shows where the file lands and stops; the import is described once, in `docs/odoo-import.md`.

## Risks / Trade-offs

- [A Swiss user relies on the old default] → no installation exists; `docs/configuration.md` names the key.

## Open Questions

None for this slice.
