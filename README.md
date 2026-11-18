# Hirata Cleaning Plan

Replaces the Excel "Hirata Cleaning Plan": a weekly grid of tool cleanings. Operators mark a cleaning **Done** or **Postpone** it; the Admin manages tools, schedules and users. Everything is recorded in History (who, when, comment) and can be exported to Excel.

**For developers and AI agents:** read [PLAN.md](PLAN.md) first. It is the single source of truth.

## Zero install

Same approach as the Metrology Request Tracker: plain files on a shared drive, opened in **Microsoft Edge**. No server, no Node, no npm, no internet. The data is one file, `data\hirata_data.json`.

## Set up (once)

1. Copy the whole folder to the shared drive, e.g. `Z:\Tools\Hirata Cleaning Plan\`. Everyone who uses it needs read/write access to the `data` folder.
2. Double-click **`Hirata Cleaning Plan.cmd`** (or open `index.html` in Edge).
3. Click **Connect data folder** and choose the `data` folder next to `index.html`. Edge remembers it on this PC (it may ask "allow" once per session).
4. The first time, the folder is empty: click **Create new plan** and choose the Admin PIN. The plan starts with the 12 loader tools (weekly, bi-weekly or 4-weekly, on different weekdays as placeholders) and Admin **Khurana, ID `ADMIN01`**.
5. The 6 operators are already in the list. Add or change people in **Settings → Users** (just the name; a short ID is filled in automatically). In **Settings → Tools**, set each tool's real schedule.

Every PC must connect the **same** `data` folder on the share to see the same plan.

## Daily use

- **Board:** one week, tools as rows, Monday–Friday as columns. ‹ › change the week, **Today** jumps back.
  Statuses: Scheduled · Today · Overdue · Postponed · Done · Tool down · Next cycle (future date from the schedule) · Skipped.
- Click a cleaning → **Complete** (choose your name + optional comment) or **Postpone** (optional new date and reason; empty date = next working day).
- Overdue cleanings from earlier weeks also show in today's column.
- **Drag** a cleaning to another day in its row to postpone or move it (you still choose your name and confirm).
- **Admin:** click or drag a *Next cycle* to move or skip that one future cleaning; *Back to normal date* undoes it.
- Click a tool name → details; Admin can set **Tool down** / **Reactivate**.
- **History:** every action, with filters and **Export CSV** (opens in Excel).
- **Analytics:** pick a period (4 weeks, 3 months, 12 months or custom) to see on-time rate, average days late, postponements, overdue, done per week, on-time per tool, top postpone reasons and cleanings per operator.
  - **Excel workbook (.xlsx):** sheets Summary, Cleanings, Operators, Postpone reasons, History, Tools — with filters, frozen header and real dates.
  - **Cleaning report (CSV):** one row per cleaning (planned date, done date, days late, who, times postponed, reason, comment, status).
- **Admin login** (top right): choose your name + PIN. Settings: Tools, Users, One-off cleaning, General (Teams reminder, default theme).
- Summary strip at the top: week progress, due today, overdue, postponed, done, tools down. Click a tile to highlight those cleanings on the board.
- After Complete or Postpone an **Undo** button shows for 10 seconds.
- **Print** prints the week (A4 landscape).
- The board refreshes every minute, so changes from other PCs appear.

## Teams reminder (optional)

In the Teams channel: **Workflows → "Post to a channel when a webhook request is received"**, copy the URL into **Settings → General**, then press **Send test message**. Once per working day, the first person who opens the app sends "due today and overdue". (The page cannot read Teams' answer, so check the channel after the test.)

## Backups

Every save keeps the previous version as `data\hirata_data.prev.json`. If the main file is ever damaged, the app loads the backup and warns. For a full backup, copy the `data` folder (e.g. weekly).

## Tests

Open `tests/index.html` in Edge: it runs all rule and save tests in memory (your data is not touched) and shows pass/fail.
Developers with Node can also run `node tests/run-node.js`; `tests/dev/ui-smoke.js` clicks through the screens with jsdom.

## Known limits (v1)

- Identity is "soft": people choose their name from a list; anyone with write access to the share could edit the data file by hand. Admin actions need the PIN.
- No public holidays, no PM tasks, no email/Webex reminders (see PLAN.md section 4).
