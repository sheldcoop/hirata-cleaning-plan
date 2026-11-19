# Hirata Cleaning Plan App: Project Plan

**Owner:** Prince Khurana (Admin)
**Status:** Version 1 built (all phases 0–8). Awaiting the owner's test on the real share.
**Read this first.** This document is the single source of truth. Anyone (human or AI agent) building this app must follow it. If something is unclear or missing, **ask the owner. Do not guess.**

---

## 1. Purpose

Replace the very wide Excel file `Hirata Cleaning Plan.xlsx` (one column per day, about 500 columns) with a small web app that:

1. Shows the **cleaning schedule of the Hirata loader tools** on one page per week.
2. Lets **operators mark a cleaning as done** (or postpone it), recording who did it, when, and any problem.
3. Lets the **Admin easily add and change tools and their schedules**, with no code changes.

The app must stay **simple**. When in doubt, choose the simpler option.

## 2. Glossary

| Term | Meaning |
|---|---|
| Tool | One machine on the plan, for example LAC901. |
| Cleaning (task) | One planned cleaning of one tool on one date. |
| Pattern date | The date a cleaning *should* happen according to the tool's schedule. Never changes. |
| Due date | The date the cleaning is currently planned for. Starts equal to the pattern date. Changes when postponed. |
| Operator | A person who cleans tools. Chooses their name from a list (added by the Admin in Settings → Users). |
| Admin | A person who manages tools, users and schedules. Identified by an ID and a PIN. |
| Tool owner / MNT owner | Names shown for information on a tool. Not logins. |
| Schedule rule | Set per tool: "every N weeks on weekday W" **or** "every N months on day D". |
| One-off | A single cleaning the Admin adds by hand on a chosen date, outside the rule. |
| Working day | Monday to Friday. |

## 3. Locked decisions (do not change without asking the owner)

**Platform**
- **Zero install, same approach as the Metrology Request Tracker:** static HTML/CSS/JavaScript files on a **shared network drive**, opened in **Microsoft Edge**. No server, no Node, no npm, no build step, no internet.
- Data is **one JSON file** (`hirata_data.json`) in a `data\` folder next to `index.html` on the share, read and written by the page through Edge's File System Access API. The folder is picked once per PC; Edge remembers it.
- A launcher `Hirata Cleaning Plan.cmd` opens the app in Edge.
- All file access goes through one **storage adapter** with a fixed interface, so it can be swapped for a server API later (if IT hosts it) without changing screens or rules.
- Private GitHub repo `hirata-cleaning-plan`.

**Users**
- About 5–6 operators and 10–12 tools at the start. Operators use their own work PCs (some PCs may be shared).
- **Operators** identify themselves by **choosing their name from a list** (no PIN in v1). Each person also gets an automatic short ID (OP001…) used in exports. Design so a PIN can be added later without changing other parts.
- **Admin** logs in by choosing their name + **PIN**. At the start the only Admin is Khurana.
- Any operator can clean any tool.
- The Admin can create users and set their role (Operator or Admin) in Settings.
- **Operators do not log in.** The board is open to everyone; the person chooses their name in each Complete/Postpone action. Only Admins log in (name + PIN).
- Real company login (SSO) comes later, only if IT hosts it on a server.

**Main screen: weekly grid**
- Tools are **rows**. Monday–Friday are **columns**. A cell shows the cleaning for that tool on that day.
- Week navigation: **previous / next arrows and a "Today" button**, so any week can be opened.
- Status shown by **color and icon**: Upcoming ○, Done ✅, Postponed 🕓, Overdue ⚠️, Tool Down ⛔.
- Toggle: "Show only tools with something due this week". Default: show all tools.
- Clicking a cell opens a small panel with the actions.

**Actions**
- **Complete:** name from the list (required) + comment (optional, used for problems). Records who and when.
- **Postpone:** reason is free text and **optional**. New date is **optional**. If no date is given, the due date moves to the **next working day**. A chosen weekend date moves to the following Monday, and the user is told.
- **Tool Down:** Admin only in v1 (tool owners are names, not logins). Cleanings pause. On reactivation the Admin chooses a new start date.
- **Admin only:** reopen a completed cleaning, reactivate a Tool Down, add a one-off, edit or delete a single cleaning.

**Schedule**
- Defined per tool, fully editable by the Admin. Two rule types:
  - **Weekly type:** every N weeks (any N ≥ 1) on a fixed weekday (Mon–Fri).
  - **Monthly type:** every N months (any N ≥ 1) on day D of the month (1–31). If that day does not exist (e.g. 31 in April) use the last day of the month. If it falls on a weekend, use the **next working day**.
- Plus one-off cleanings on any working day. Never on a weekend.
- After a cleaning is done late or postponed, the next cleaning goes **back to the normal pattern** (see section 6).

**Other**
- History page with **Export to CSV (opens in Excel)**.
- Two themes: **Light** and **Dark (graphite)**, switched with a button in the top bar.
- Deleting a tool means **archive** (hidden, history kept).
- **Reminders are not in v1.** A Microsoft Teams webhook hook is built but switched off until a webhook URL is entered in Settings.
- Language: English.

## 4. Out of scope for v1

Do **not** build: PM (preventive maintenance) tasks, drag-and-drop, reminders sent by email or Webex, real SSO login, mobile layout, public holidays, multiple sites, attachments or photos, a PIN for operators, reports and charts. Keep a `task_type` column (default `cleaning`) so PM can be added later.

## 5. Data model (one JSON file)

The file holds one object: `{ schema_version, revision, saved_at, saved_by, users: [], tools: [], tasks: [], history: [], settings: {} }`. Each list below is an array of records with the listed fields (designed so they map 1:1 to database tables later). IDs are text, e.g. `tool_ab12cd`. All timestamps are stored as ISO 8601 text. All dates are `YYYY-MM-DD` (local date, Europe/Vienna).

**users**
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| operator_id | text, unique | automatic short ID, e.g. `OP001` (used in exports) |
| name | text | shown in the app and in history |
| role | text | `operator` or `admin` |
| pin_hash | text, nullable | only for admins. Salted SHA-256 via the browser's built-in Web Crypto (PBKDF2). Never store the PIN in plain text. |
| active | integer 0/1 | inactive users cannot act but stay in history |

**tools**
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| name | text, unique | for example `LAC901` |
| tool_owner | text | free text name |
| mnt_owner | text | free text name |
| schedule_type | text | `weeks` or `months` |
| interval | integer | N (≥ 1): every N weeks or every N months |
| weekday | integer, nullable | weeks type: 1 = Monday … 5 = Friday |
| month_day | integer, nullable | months type: 1–31 |
| start_date | date | first pattern date |
| status | text | `active` or `down` |
| down_reason | text, nullable | |
| down_since | text, nullable | |
| archived | integer 0/1 | archived tools are hidden but kept |

**tasks** (one row per cleaning)
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| tool_id | integer FK | |
| task_type | text | default `cleaning` |
| pattern_date | date | the schedule date (only changed by R7/R11) |
| nominal_date | date | monthly rules: the date before the weekend shift, so the pattern never drifts |
| generated_from | id, nullable | the completed task this one was created from (used by R8) |
| due_date | date | changes on postpone |
| status | text | `open` or `completed` (only these two are stored) |
| is_one_off | integer 0/1 | one-offs do not generate a next cleaning |
| postpone_count | integer | default 0 |
| last_postpone_reason | text, nullable | |
| completed_by | integer FK users, nullable | |
| completed_at | text, nullable | |
| completion_comment | text, nullable | |

**history** (append only: never edited or deleted)
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| tool_id | integer FK | |
| task_id | integer FK, nullable | |
| action | text | `completed`, `postponed`, `tool_down`, `reactivated`, `reopened`, `task_added`, `task_edited`, `task_deleted`, `tool_changed`, `user_changed` |
| user_id | integer FK | who did it |
| at | text | timestamp |
| reason | text, nullable | |
| comment | text, nullable | |
| old_date | date, nullable | |
| new_date | date, nullable | |

**settings** (key / value object)
`teams_webhook_url`, `last_daily_message_date` (default empty = off), `theme_default` (`white` or `teal`).

## 6. Business rules

These are exact. Implement and test them literally.

**R1. Derived statuses (never stored).**
- *Overdue:* task `open` and `due_date` < today.
- *Due today:* task `open` and `due_date` = today.
- *Postponed:* task `open` and `postpone_count` > 0.
- *Tool Down:* the tool's `status` is `down`.

**R2. One open scheduled cleaning per tool.** For a tool with a schedule rule there is at most one open non-one-off task. When it is completed, the next one is created.

**R3. First task.** When a tool is created, create its first task with `pattern_date` = the first rule date on or after `start_date`. Weeks type: first date with the tool's weekday. Months type: day D of the start month (or the next month if already past), adjusted as in section 3. `due_date` = `pattern_date`.

**R4. Next task (after Complete).** Weeks type: `next_pattern = previous.pattern_date + interval × 7 days`. Months type: day D of the month that is `interval` months after the month of the previous *unadjusted* rule date, then adjusted (last day of month / next working day); always compute from the unadjusted date so the pattern never drifts. If `next_pattern` is on or before the completion date, add another interval repeatedly until it is **after** the completion date (so a cleaning done today never creates another one due today). Create the new task with `due_date` = `next_pattern`.

**Example.** Tool every 2 weeks on Tuesday. Pattern date Tue 24 Nov 2026. Completed on Thu 26 Nov. Next pattern date is Tue 8 Dec 2026 (not 10 Dec).

**R5. Postpone.**
- Reason and new date are both optional.
- New date: if given and it is a weekend, move it to the following Monday. If not given, use the next working day after the current due date, or after today if the cleaning is already overdue.
- Update `due_date`, add 1 to `postpone_count`, store `last_postpone_reason`, add a history row. `pattern_date` does not change.

**R6. Complete.**
- Requires a valid active user (chosen from the name list). Comment optional.
- Set `status = completed`, `completed_by`, `completed_at`, `completion_comment`. Add a history row. Then apply R4 (unless one-off).
- A completed task cannot be completed again.

**R7. Tool Down.**
- Admin only in v1. Set tool `status = down`, store reason and `down_since`. The tool's open task stays but is shown as Tool Down and is ignored by Overdue and by any reminders.
- **Reactivate** (Admin): the Admin picks a new date (must be a working day). Set tool `status = active`, set the open task's `pattern_date` and `due_date` to that date. History rows for both actions.

**R8. Reopen (Admin).** Only the most recent completed task of a tool can be reopened. Set it back to `open`, clear the completed fields, and delete the next task that was generated from it **only if** that next task has no postponements and is still open. Add a history row.

**R9. One-off (Admin).** The Admin adds a task for any tool on any working date with `is_one_off = 1`. Completing it does not create a next task.

**R10. Edit or delete a single task (Admin).** Edit `due_date` (working days only), or delete the task. Deleting the open scheduled task of a tool automatically creates the next pattern task by R4 so the tool never loses its schedule. Add history rows.

**R11. Changing a tool's schedule (Admin).** If `schedule_type`, `interval`, `weekday` or `month_day` changes, apply it from the open task's `pattern_date` forward: set the open task's `pattern_date` and `due_date` to the first rule date of the new rule on or after the old pattern date (or a date the Admin picks). History row `tool_changed`.

**R12. Archive a tool.** Sets `archived = 1`. It disappears from the grid and from Settings lists by default (with a "show archived" toggle). Its tasks and history stay.

**R13. Future weeks in the grid.** Only one open task per tool is stored, so for weeks beyond it the grid shows **projected** cells computed from the rule (R4 repeatedly). Projected cells are drawn lighter, show the date, and are **not clickable**. A projected date on or before the open task's current due date is skipped (avoids two cells when a task was postponed far). Past weeks show stored tasks and completed ones.

**R14. Completed tasks visibility.** A completed cleaning is shown in the cell of the day it was **completed**, permanently (the grid is the history view per week).

**R14b. Overdue carry-over.** An open task whose due date is before today is also shown in the **current week** view, in today's column of that tool's row, marked ⚠️ "Overdue" with its original due date (for example "Overdue since 12 Nov"). It is clickable there (Complete / Postpone). It stays in its original past cell as well.

**R14c. Postponed display.** A postponed task appears only in its new due-date cell (🕓). The original cell stays empty; the move is visible in History.

**R15. Weekends.** No cleaning is ever stored or shown with a weekend date.

**R16. Time zone.** Use the PC's local date (Europe/Vienna) for "today".

**R17. Saving safely (several people, one file).** Every action is saved like this: (1) re-read the file from the share, (2) apply the action to that fresh copy (re-checking it is still allowed, e.g. the task is still open), (3) increase `revision`, (4) copy the old file to `hirata_data.prev.json`, (5) write. If step 2 fails because someone else already changed it (e.g. already completed), tell the user and refresh the board. If the live file is unreadable, load the `.prev.json` copy and warn. Never keep a long-lived copy in memory as the truth.

**R18. Refresh.** The board re-reads the file every 60 seconds and when the window gets focus, so everyone sees others' changes.

## 7. Screens

1. **Top bar:** app name, current user (or "Sign in"), theme toggle, links: Board, History, Settings (Settings only for Admin).
2. **Board (weekly grid):** week label (for example "Week 47 · 16–20 Nov 2026"), arrows, Today button, toggle "only tools with something due". Click a cell → action panel.
3. **Action panel:** Complete (operator ID + comment), Postpone (optional date, optional reason, operator ID), and for Admins: Tool Down, Reopen, Edit date, Delete. Always asks for confirmation before saving.
4. **History:** table (date, tool, action, who, comment/reason), filters by tool, action and date range, **Export CSV** button.
5. **Settings (Admin only), tabs:**
   - **Tools:** add, edit, archive. Fields: name, tool owner, MNT owner, schedule type (weeks / months), N, weekday or day of month, start date, active. Shows a preview of the next 5 cleaning dates before saving.
   - **Users:** add, edit, deactivate. Fields: operator ID, name, role, PIN (admins).
   - **One-offs:** add a single cleaning for a tool and date.
   - **General:** Teams webhook URL, default theme.

## 8. Store and storage (instead of a server API)

All screens call **one module, `js/store.js`**, never the file directly. Store functions (all return Promises):

| Function | Purpose |
|---|---|
| `load()` | read the file (R17 fallback) |
| `board(weekDate)` | tools + stored, overdue (R14b) and projected cells for that week |
| `complete(taskId, operatorId, comment)` | R6 |
| `postpone(taskId, operatorId, newDate?, reason?)` | R5 |
| `reopen`, `editTask`, `deleteTask`, `addOneOff` | R8, R10, R9 (Admin) |
| `saveTool`, `archiveTool`, `toolDown`, `reactivate` | tools, R11, R12, R7 (Admin) |
| `saveUser`, `setPin` | users (Admin) |
| `adminLogin(id, pin)` | checks the PIN, keeps an admin session in this browser tab only |
| `history(filters)`, `historyCsv(filters)` | history and export |
| `saveSettings` | Admin |

The store uses the **storage adapter** `js/adapters/storage-folder.js` (copied from the Metrology Request Tracker): `isSupported, hasSaved, connect, reconnect, read, write, list, remove`.

**Security note (accepted for a small team, as in the Metrology tracker):** with a shared file there is no server to enforce rights; the app checks roles and the Admin PIN, but someone with write access to the share could edit the file by hand. Real enforcement comes only if IT hosts it on a server later.

## 9. Repo structure

```
hirata-cleaning-plan/
  PLAN.md                     (this file)
  README.md                   (how to install on the share, use, back up)
  index.html                  (the app, opened in Edge)
  Hirata Cleaning Plan.cmd    (launcher)
  css/                        (styles, two themes)
  js/
    config.js                 (file names, constants)
    rules.js                  (ALL business rules R1–R16, pure functions, no file access)
    store.js                  (load/save R17, actions, uses rules.js)
    adapters/storage-folder.js
    views/                    (board.js, history.js, settings.js)
    app.js                    (start-up, connect folder, navigation)
  tests/
    index.html                (open in Edge: runs all rule tests, shows pass/fail)
    rules.test.js
  data/                       (git-ignored: the live data file on the share)
```

Rule: **all date and schedule logic lives only in `js/rules.js`** and has tests. Views never calculate schedule dates.

## 10. Starting data (seed)

**First run:** when the app opens a data folder with no data file, it offers "Create new plan": it asks for the first Admin's PIN and creates the file with the Admin and the tools below. First Admin: **Khurana**, operator ID `ADMIN01`, role `admin`. The PIN is never in the repo.

Tools to pre-load (from the old Excel; the Admin can change everything in Settings). Weekday and start week are **placeholders spread over Monday–Friday** (weekly and bi-weekly mixed, as in the Excel); the Admin sets the real ones in Settings.

| Tool | Tool owner | MNT owner | Every N weeks (weekday: see js/store.js SEED_TOOLS) |
|---|---|---|---|
| AOP901 | Hammad Ali | Breitenberger Gerhard | 2 |
| BLY901 | Marco Trummer | Corpuz Jomari | 1 |
| LAC901 | Peng Chongnan | Chen Cong | 1 |
| DEY901 | Valeriia Kyrychenko | Edina Vunic | 2 |
| ACY901 | Karam / Eric Zeichner | Breitenberger Gerhard | 2 |
| DPM901 | Jovan Tosic | Anand Gopal | 2 |
| ECP901 | Marcin Sliwowski | Mokhberi Alireza | 2 |
| DFS901 | Hammad Ali | Thomas Kelly | 2 (placeholder) |
| AOI901 | Juliet Raya | Khaled Ismail | 4 |
| NCC901 | Govardhna Rao Bondalapati | Mokhberi Alireza | 2 |
| TLA901 | Lukas Bursch | Aboutahir Fatima Zahra | 4 |
| CPM901 | Petar Jurjevic | De Los Santos Tristan | 2 |

The 6 real operators are created too (OP001–OP006): Valeriia Kyrychenko, Mohamed Ibrahem, Kent Derrens Plugio, Anja KRALJ, Volodymyr SAMBURSKYI, Talal AL-EFFAH. No demo/test people. Settings → General has "Add missing standard operators" for a plan created before this list existed.

## 11. Phases and milestones

Each phase ends with a **milestone**. Do not start the next phase until the owner has seen the milestone and approved it.

### Phase 0: Repo and skeleton → M0
- Repo, PLAN.md, README, `.gitignore` (ignore `data/`), launcher, `index.html`, storage adapter, a start page that connects a data folder and reads/writes a test file.
- **Done when:** double-clicking the launcher opens the page in Edge, the person picks the `data` folder once, the page shows "Data folder connected" and survives a reload without asking again.

### Phase 1: Database and rules (no screens yet) → M1
- `rules.js` (R1–R16), `store.js` with load/save (R17), first-run creation, tests page.
- **Done when:** `tests/index.html` shows all rule tests green, and first run creates the file with the Admin and 12 tools.

### Phase 2: Read-only weekly grid → M2
- Board page with the grid, week arrows, Today button, status colors, projected cells, "only tools due" toggle.
- **Done when:** the owner can browse weeks and see correct dates and colors for the seeded tools.

### Phase 3: Operator actions → M3
- Action panel, Complete (R6) and Postpone (R5) with confirmation, operator ID check, history rows.
- **Done when:** a test operator can complete and postpone, the grid updates, and the next cleaning appears on the correct pattern date.

### Phase 4: Settings for the Admin → M4
- Admin login (ID + PIN), Settings tabs: Tools, Users, One-offs, General. Archive, edit schedule (R11), one-off (R9), edit and delete task (R10).
- **Done when:** the Admin adds a new tool, changes its schedule, adds a user, and makes a one-off, all without touching code or files.

### Phase 5: History and export → M5
- History page with filters and CSV export (UTF-8 with BOM so Excel opens it correctly).
- **Done when:** the exported CSV opens in Excel with correct columns and special characters.

### Phase 6: Tool Down and Reopen → M6
- R7 and R8 with screens and history rows.
- **Done when:** a tool can be set down, shows ⛔, is skipped in overdue, and can be reactivated with a new date; a completed task can be reopened.

### Phase 7: Look and polish → M7
- Pure White and Dark Teal themes, theme toggle, empty states, clear error messages.
- **Done when:** both themes look right and every error message is understandable to an operator.

### Phase 8: Teams hook and handover → M8
- Teams webhook sender (daily "due today and overdue" message), **off** until a URL is set. Sent from the browser: the first person to open the app on a working day sends the day's message and records `last_daily_message_date` so it goes only once. README: how to put it on the share, backups (the `.prev.json` copy plus copying the data folder), and what changes if IT later hosts it on a server.
- **Done when:** with a test webhook URL, a message posts to the Teams channel; with no URL nothing is sent.

## 12. Test checklist (must pass before each milestone is approved)

**Rules (Phase 1)**
1. Tool every 2 weeks, Tuesday, start 2026-11-18 → first pattern date is Tue 2026-11-24.
2. Complete on Thu 2026-11-26 → next pattern date is Tue 2026-12-08.
3. Complete a task that is 5 weeks late, interval 2 → next pattern date is the first pattern date after today.
4. Postpone with no date, due Fri → new due date is the next Monday.
5. Postpone with a Saturday date → saved as the following Monday.
6. Postpone twice → `postpone_count` = 2, `pattern_date` unchanged, two history rows.
7. Complete an already completed task → rejected.
8. Complete with an unknown or inactive operator ID → rejected.
9. Complete a one-off → no next task created.
10. Reopen → task open again, empty completed fields, the generated next task removed only if untouched.
11. Tool Down → no overdue; reactivate with a weekend date → rejected.
12. Change a tool's weekday → open task moves to the new weekday, no weekend date ever saved.
12b. Months type, every 1 month on day 31 → Apr 30; day 15 falling on Saturday → Monday 17th; the next month goes back to day 15 (no drift).
13. Archive a tool → gone from the grid, history intact.
14. Admin-only actions are refused without a valid Admin login (in the store, not only by hiding buttons).
14b. Two browsers complete the same task at nearly the same time → only one succeeds, the other is told and refreshed (R17).
14c. Corrupt live file → app loads `.prev.json` and warns.

**Screens**
15. Week arrows and Today button work; the week label is correct (Monday–Friday).
16. Projected cells are lighter and not clickable.
17. Confirmation appears before every save.
18. CSV opens correctly in Excel (umlauts, commas in comments).
19. Both themes readable; toggle remembered in the browser.

## 13. Rules for AI agents and engineers

- Follow this plan literally. If a rule is missing or unclear, **stop and ask the owner**. Do not invent behavior.
- Do not add features from section 4 (out of scope).
- Work **one phase at a time**. At the end of each phase, run the tests, summarize what changed in plain words, and wait for approval.
- Keep all schedule and status logic in `js/rules.js`. No date math in views or in the store's file code.
- Use small commits with clear messages. Do not rewrite or reformat unrelated files.
- Never commit real data, PINs, webhook URLs or the data file.
- Check roles in `store.js` for every action (not only in the UI). Follow the save rule R17 for every write.
- Never delete history rows.
- **Zero install:** no npm, no build, no CDN, no internet. Only plain files that run in Edge. Any library must be a single vendored file and approved by the owner.
- Keep the UI plain and fast. No frameworks.

## 13b. Version 0.3 additions (owner asked for visual polish)

Summary strip with week progress ring and clickable status tiles (highlight on the board); drawn SVG icons instead of emoji (`js/icons.js`); richer cells (who and time on Done, "since" on overdue, "from" on postponed); today column marker; status dot and red stripe for tools down; sticky tool column; Undo (10 s) after Complete/Postpone (`store.undo`, refused if changed meanwhile, history action `undone`); print layout; modal and toast motion (off with reduced motion).

## 13c. Version 0.5 additions

- **Names:** Scheduled (open, day not reached), Today, Overdue, Postponed, Done, Tool down, **Next cycle** (future date from the schedule), Skipped.
- **White theme:** AT&S blue header and Scheduled colour (`--ats-blue: #0057a8` in `css/app.css`, one place to change), light blue-grey page, blue today band.
- **R19 Future cycles (Admin):** click or drag a Next cycle to **move** it to another working day (after the open cleaning) or **skip** it, and **Back to normal date** to undo. Stored in `exceptions` `{id, tool_id, nominal, action: move|skip, new_date}`; used (and removed) when that cycle becomes the open cleaning; Undo/Reopen give them back; a schedule change clears the tool's exceptions. History: `cycle_moved`, `cycle_skipped`, `cycle_restored`.
- **Drag and drop:** drag an open cleaning to another day in the same row (today or later, Mon–Fri) → the Postpone/Move form opens with the date filled in; nothing is saved without the name and confirmation. Admins can drag a Next cycle → the Move form. Mouse only; the date field still works for other weeks.

## 13d. Version 0.6: reports and analytics

- `js/analytics.js` (pure): `reportRows` (one row per cleaning: planned, current, done date/time, days late, who, postponed, reason, comment, status) and `stats` (KPIs, per tool, per week, per operator, top postpone reasons). "On time" = done on or before the planned (schedule) date; days late in calendar days.
- `js/xlsx.js`: own dependency-free .xlsx writer (no SheetJS needed): several sheets, bold AT&S-blue header, frozen header, filter, column widths, real Excel dates.
- Analytics page (nav): period presets + custom range, KPI tiles, done-per-week chart (SVG), bars per tool / reason / operator, per-tool table, downloads (Excel workbook, cleaning report CSV).

## 13e. Version 0.8: PM plan (second tab)

Decided with the owner on 19 Nov 2026 (one question at a time):

1. **Second tab "PM plan"** next to the cleaning Board: the same weekly grid (tools x Mon-Fri), for preventive maintenance.
2. **Not installed (red):** a tool that is not there yet (to be bought). Whole row red, no PM, no schedule. Tool status `planned`.
3. **Down (D):** the tool is there but broken; no PM while down. The Admin sets **Down from [date]** with an optional **until [date]** and a reason; the grid shows D on every working day of that period by itself. **Back up** ends it and asks for the next PM date. Stored on the tool: `status: 'down'`, `down_from`, `down_until` (optional), `down_reason`.
4. **Who:** only the Admin (logged in with PIN) marks a PM Done (optional comment), postpones it, changes or deletes it, sets Down / Back up and edits PM tools. The MNT owner is information on each tool. Everyone else sees the PM tab read-only.
5. **Schedule:** the same rule as cleaning (every N weeks on a weekday, or every N months on day D, never on a weekend; after a late PM the next one goes back to the pattern; postpone works the same). A PM tool may have **no schedule** ("-" in the Excel, e.g. FIB901) or no start date yet: then it is listed but gets no PM until the Admin sets one.
6. **Separate PM tool list:** PM tools are records in `tools` with `kind: 'pm'` (cleaning tools have no `kind`). Names only need to be unique within the same list (AOP901 can be in both). Settings has its own **PM tools** tab.
7. **Starting data:** the 23 rows from the owner's PM Excel (WW47 2026) with real names, MNT owners and frequencies. LXP902 = Not installed; DFS901 and PNP901 = Down from 16 Nov 2026; start dates where the sheet shows a PM (AOP901 and CPM901 on 26 Nov, QVM901 and PRF901 on 19 Nov, all Thursdays). Other tools: no start date yet, the Admin sets it in Settings. A new plan gets them automatically; an existing plan gets a button in Settings > PM tools ("Add PM tools from the Excel"). The first PM is never put in the past: the pattern is stepped forward to today or later.
8. **Reports:** PMs go in the **same Excel file** on their own **PMs** sheet; History (page, CSV and sheet) gets a **Type** column (Cleaning / PM) with a filter. The Cleanings sheet, cleaning report and Analytics page stay cleaning only. The Teams message stays cleaning only.

## 13f. Version 0.9: Magazines tab (owner: "go with your best decision")

- **Own tab "Magazines"** next to Cleaning and PM plan. A **list, one row per magazine** (not a weekly grid): checks happen for many magazines on one day, not on a fixed weekday each.
- Each row: S/N + CR type, status, last check (date, who, how long ago), lot status, location / comment, cart, production use. Status (derived, `rules.magStatus`): **Repair needed** > **Never checked** > **Check due** (last check older than N weeks, Settings → Magazines, default 4, 0 = off) > **OK**. Repairs are listed first.
- **Check** (anyone, chooses their name like a cleaning): cart, production use, lot status, location / comment, **Cleaned**, **Repair needed** (then a comment is required). **Repair done** (anyone, with name, optional comment) clears the flag.
- **Admin:** add / edit / archive magazines and set the check interval in Settings → Magazines.
- Data: `magazines` (current state) and `mag_events` (every check and repair, append only); history rows carry `magazine_id`, Type **Magazine**. Excel: sheets **Magazines** and **Magazine checks**.
- Starting data: the 35 magazines of "RnD_Magazines_checking_16-11-26.xlsx" with the check of 16 Nov 2026 (Talal / Mohamed mapped to the operator list). Existing plans: button in Settings → Magazines.
- PM plan: down days show **Down** (not "D"); PM tools keep the **order of the Excel**.

## 13g. Version 0.10: drag and drop in PM plan, Magazine week plan

- **PM plan drag (Admin only):** drag an open PM to another day in its row (today or later, not on a Down day) → the Move form opens with the date filled in; nothing is saved without confirming.
- **Magazines → Week plan** (switch List / Week plan): the next cleaning of each magazine = last check + N weeks (weekend → Monday); never checked = due today; overdue is carried into today; next cleanings from the cycle are shown lighter; done checks show on their day. Click a due magazine → Check; **drag** it to another day in its row → Plan form (name, optional reason) stores `planned_date` (history `mag_planned`); the next check clears it.

## 14. Open items (owner to confirm during the build)

1. Start date for each seeded tool (placeholder: next Tuesday).
2. Real schedules per tool (seeded as weeks type, Tuesday; the Admin sets the real ones in Settings).
4. Operator IDs format and the list of real operators.
5. The share path for the app and the data folder, and who has write access to it.
6. Teams channel and webhook URL (after v1 works).
7. A decision on whether Tool Owner (as a person) may later set Tool Down. Not in v1.
