# Hirata Cleaning Plan App: Project Plan

**Owner:** Prince Khurana (Admin)
**Status:** Plan approved, build not started
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
| Operator | A person who cleans tools. Identified by an operator ID. |
| Admin | A person who manages tools, users and schedules. Identified by an ID and a PIN. |
| Tool owner / MNT owner | Names shown for information on a tool. Not logins. |
| Schedule rule | Set per tool: "every N weeks on weekday W" **or** "every N months on day D". |
| One-off | A single cleaning the Admin adds by hand on a chosen date, outside the rule. |
| Working day | Monday to Friday. |

## 3. Locked decisions (do not change without asking the owner)

**Platform**
- Local web app first: **Node.js + Express + SQLite + plain HTML/CSS/JavaScript** (no framework). Start with `npm start`. IT will host the same folder later.
- Private GitHub repo `hirata-cleaning-plan`.

**Users**
- About 5–6 operators and 10–12 tools at the start. Operators use their own work PCs (some PCs may be shared).
- **Operators** identify themselves with an **operator ID only** (no PIN in v1). Design so a PIN can be added later without changing other parts.
- **Admin** logs in with **ID + PIN**. At the start the only Admin is Khurana.
- Any operator can clean any tool.
- The Admin can create users and set their role (Operator or Admin) in Settings.
- **Operators do not log in.** The board is open to everyone; the operator ID is typed in each Complete/Postpone action. Only Admins log in (ID + PIN).
- Real company login (SSO) comes later from IT.

**Main screen: weekly grid**
- Tools are **rows**. Monday–Friday are **columns**. A cell shows the cleaning for that tool on that day.
- Week navigation: **previous / next arrows and a "Today" button**, so any week can be opened.
- Status shown by **color and icon**: Upcoming ○, Done ✅, Postponed 🕓, Overdue ⚠️, Tool Down ⛔.
- Toggle: "Show only tools with something due this week". Default: show all tools.
- Clicking a cell opens a small panel with the actions.

**Actions**
- **Complete:** operator ID (required) + comment (optional, used for problems). Records who and when.
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
- Two themes: **Pure White** and **Dark Teal**, switched with a button in the top bar.
- Deleting a tool means **archive** (hidden, history kept).
- **Reminders are not in v1.** A Microsoft Teams webhook hook is built but switched off until a webhook URL is entered in Settings.
- Language: English.

## 4. Out of scope for v1

Do **not** build: PM (preventive maintenance) tasks, drag-and-drop, reminders sent by email or Webex, real SSO login, mobile layout, public holidays, multiple sites, attachments or photos, a PIN for operators, reports and charts. Keep a `task_type` column (default `cleaning`) so PM can be added later.

## 5. Data model (SQLite)

All timestamps are stored as ISO 8601 text. All dates are `YYYY-MM-DD` (local date, Europe/Vienna).

**users**
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| operator_id | text, unique | what people type, for example `OP001` |
| name | text | shown in the app and in history |
| role | text | `operator` or `admin` |
| pin_hash | text, nullable | only for admins in v1. Use a proper password hash (scrypt or bcrypt). Never store the PIN in plain text. |
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
| pattern_date | date | immutable |
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
| action | text | `completed`, `postponed`, `tool_down`, `reactivated`, `reopened`, `task_added`, `task_deleted`, `tool_changed` |
| user_id | integer FK | who did it |
| at | text | timestamp |
| reason | text, nullable | |
| comment | text, nullable | |
| old_date | date, nullable | |
| new_date | date, nullable | |

**settings** (key / value)
`teams_webhook_url` (default empty = off), `theme_default` (`white` or `teal`).

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
- New date: if given and it is a weekend, move it to the following Monday. If not given, use the next working day after the *current due date*.
- Update `due_date`, add 1 to `postpone_count`, store `last_postpone_reason`, add a history row. `pattern_date` does not change.

**R6. Complete.**
- Requires a valid active user (operator ID). Comment optional.
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

**R16. Time zone.** Use the server's local time, Europe/Vienna, for "today".

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

## 8. API (all JSON under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/board?week=YYYY-MM-DD` | tools + stored and projected cells for the week containing that date |
| POST | `/api/tasks/:id/complete` | R6 |
| POST | `/api/tasks/:id/postpone` | R5 |
| POST | `/api/tasks/:id/reopen` | R8 (Admin) |
| PATCH | `/api/tasks/:id` | R10 edit (Admin) |
| DELETE | `/api/tasks/:id` | R10 delete (Admin) |
| POST | `/api/tasks` | R9 one-off (Admin) |
| GET/POST/PATCH | `/api/tools`, `/api/tools/:id` | list, add, edit, archive (Admin for changes) |
| POST | `/api/tools/:id/down`, `/api/tools/:id/reactivate` | R7 (Admin) |
| GET/POST/PATCH | `/api/users`, `/api/users/:id` | Admin |
| POST | `/api/login` | admin ID + PIN → session cookie |
| GET | `/api/history?...` and `/api/history.csv?...` | history and export |
| GET/PATCH | `/api/settings` | Admin |

Every write checks permissions on the **server** (hiding buttons in the UI is not security).

## 9. Repo structure

```
hirata-cleaning-plan/
  PLAN.md            (this file)
  README.md          (how to run, how to back up, how to hand over to IT)
  package.json
  server/
    index.js         (Express app)
    db.js            (SQLite setup, migrations)
    rules.js         (ALL business rules R1–R16 live here, pure functions)
    routes/          (one file per area)
  public/
    index.html, css/, js/   (Board, History, Settings pages)
  data/              (SQLite file, git-ignored)
  seed/seed.js       (creates the starting tools and the first Admin)
  tests/             (tests for rules.js and the API)
```

Rule: **all date and schedule logic lives only in `server/rules.js`** and has tests. The UI never calculates schedule dates itself.

## 10. Starting data (seed)

First Admin: **Khurana**, operator ID `ADMIN01`, role `admin`. The PIN is **not** in the repo. The seed script asks for it when run.

Tools to pre-load (from the old Excel; the Admin can change everything in Settings). Weekday and start date are **to be confirmed by the Admin**; use Tuesday and the next Tuesday as placeholders.

| Tool | Tool owner | MNT owner | Every N weeks (weeks type, Tuesday) |
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

Create 2 test operators (`OP001`, `OP002`) **only in a development seed**, never in a production database.

## 11. Phases and milestones

Each phase ends with a **milestone**. Do not start the next phase until the owner has seen the milestone and approved it.

### Phase 0: Repo and skeleton → M0
- Create the repo, add this PLAN.md, README, `.gitignore` (ignore `data/` and `node_modules/`), empty project that starts with `npm start` and shows "Hirata Cleaning Plan".
- **Done when:** `npm start` opens a page in the browser, and the repo is private on GitHub.

### Phase 1: Database and rules (no screens yet) → M1
- Create the tables, `rules.js` with R1–R16, the seed script, and tests.
- **Done when:** all tests in section 12 pass and the seed creates the Admin and 12 tools.

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
- Teams webhook sender (daily "due today and overdue" message), **off** until a URL is set. README section for IT: how to run, port, backup of the SQLite file, where logs are, and what is needed for SSO.
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
14. An operator calling an admin-only API → 403.

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
- Keep all schedule and status logic in `server/rules.js`. No date math in the UI or in route files.
- Use small commits with clear messages. Do not rewrite or reformat unrelated files.
- Never commit real data, PINs, webhook URLs or the SQLite file.
- Always enforce permissions on the server.
- Never delete history rows.
- Keep dependencies few: Express, SQLite driver, a password hashing library, a test runner.
- Keep the UI plain and fast. No frameworks.

## 14. Open items (owner to confirm during the build)

1. Start date for each seeded tool (placeholder: next Tuesday).
2. Real schedules per tool (seeded as weeks type, Tuesday; the Admin sets the real ones in Settings).
4. Operator IDs format and the list of real operators.
5. When IT hosts it: login method (SSO), server address, backups.
6. Teams channel and webhook URL (after v1 works).
7. A decision on whether Tool Owner (as a person) may later set Tool Down. Not in v1.
