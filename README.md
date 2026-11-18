# Hirata Cleaning Plan

Web app replacing the Excel "Hirata Cleaning Plan": weekly grid of tool cleanings, operators mark Done/Postpone, Admin manages tools, schedules and users.

**Start here:** read [PLAN.md](PLAN.md). It is the single source of truth (decisions, rules, phases, tests).

## Zero install

Same approach as the Metrology Request Tracker: plain files on a shared drive, opened in Microsoft Edge. No server, no Node, no npm, no internet.

## Set up

1. Copy the whole folder to the shared drive (or anywhere for testing), e.g. `Z:\Tools\Hirata Cleaning Plan\`.
2. Double-click **`Hirata Cleaning Plan.cmd`** (or open `index.html` in Edge).
3. First time on a PC: click **Connect data folder** and choose the `data` folder next to `index.html`. Edge remembers it.

Everyone must connect the **same** `data` folder on the share to see the same plan.

## Status

- Phase 0 (skeleton, zero install): done, awaiting approval
- Next: Phase 1 (rules, data file, tests)
