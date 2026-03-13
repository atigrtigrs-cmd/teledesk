# TeleDesk TODO

## Auth System
- [x] Replace Manus OAuth with email/password auth (bcrypt + JWT)
- [x] Add Login page with email/password form
- [x] Add Register page (first user becomes admin)
- [x] Update server auth routes via tRPC (auth.login, auth.register, auth.me, auth.logout)
- [x] Update useAuth hook to work with custom JWT cookie
- [x] Remove Manus OAuth dependency from frontend (DashboardLayout, main.tsx)
- [x] Deploy updated code to Render

## QR Code Enhancement
- [x] Install qrcode.react for real QR code rendering
- [x] Update Accounts page to show real Telegram QR code
- [x] Auto-refresh QR on expiry
- [x] Poll for account becoming active after scan
- [x] Fix @import order in index.css
- [x] Align COOKIE_NAME in shared/const.ts (all 7 tests passing)

## LeadCash Bot Integration
- [x] Add tRPC proxy procedures for bot API (groups, categories, logs, admins)
- [x] Create LeadCashBot page with Groups / Pending / Logs tabs
- [x] Add "LeadCash Bot" entry to sidebar navigation
- [x] Register /bot route in App.tsx
- [x] Add "Админ панель" iframe tab to LeadCashBot page (embed /admin from bot server)

## Per-Account Bitrix24 Pipeline Settings
- [x] Add bitrixPipelineId, bitrixPipelineName, bitrixStageId, bitrixResponsibleId, bitrixResponsibleName columns to telegramAccounts schema
- [x] Run migration via direct SQL
- [x] Add tRPC procedure accounts.updateBitrixSettings
- [x] Add tRPC procedures bitrix.getPipelines, bitrix.getPipelineStages, bitrix.getUsers
- [x] Add "Воронка Битрикс24" modal in Accounts page with pipeline/stage/responsible selectors
- [ ] Use per-account pipeline when creating deals in Bitrix24 (pending: deal creation logic)

## Native Bot Admin Panel (replace iframe)
- [x] Explore all bot API endpoints (admins, templates, chats, moderation actions)
- [x] Add tRPC proxy procedures for all bot endpoints
- [x] Rebuild LeadCashBot page: Overview, Moderation, Groups, Categories, Admins, Templates, Logs, Broadcast tabs — all native in TeleDesk dark design
- [x] Remove iframe tab

## Bot Admin Panel — Edit Functionality
- [x] Groups tab: edit category and language per group
- [x] Groups tab: remove group from bot
- [x] Categories tab: edit category name (RU/EN) and line_id
- [x] Admins tab: add new admin by Telegram user ID
- [x] Admins tab: remove admin
- [x] Templates tab: edit RU/EN text works end-to-end
- [x] Add tRPC procedures: updateGroup, removeGroup, updateCategory, addAdmin, removeAdmin

## Bot Broadcast (Рассылка)
- [x] Store LEADCASH_BOT_TOKEN as env secret
- [x] Add tRPC leadcashBot.broadcast procedure (category, text, lang filter)
- [x] Add Broadcast tab to LeadCashBot page (category selector, template picker, custom text, preview, send)
- [x] Show per-group send results (success/fail count)

## Bug Fixes
- [x] Fix TypeError: h.map is not a function crash on /bot page (unsafe .map() on non-array data)

## QR Code Login UX Fix
- [x] Add clear instructions in QR dialog: scan only from Telegram Desktop or web.telegram.org (not mobile app)
- [x] Add links to getdesktop.telegram.org and web.telegram.org in the dialog

## Phone Number Login (alternative to QR)
- [x] Add tRPC procedure: accounts.sendPhoneCode (send SMS/Telegram code via GramJS)
- [x] Add tRPC procedure: accounts.verifyPhoneCode (verify code, handle 2FA password)
- [x] Add tRPC procedure: accounts.verifyTwoFA (2FA cloud password)
- [x] Add phone login functions to telegram.ts (startPhoneLogin, verifyPhoneCode, verifyTwoFAPassword)
- [x] Add phone login UI: choose mode screen → phone input → SMS code → optional 2FA password
- [x] Show both options in Accounts page: "По номеру телефона" and "QR-код"

## Bug: Phone Code Not Sent
- [ ] Debug why Telegram code is not arriving when entering phone number
- [ ] Fix startPhoneLogin in telegram.ts

## Per-Account Pipeline: Apply to Deal Creation
- [ ] Find deal creation code in telegram.ts / bitrix.ts
- [ ] Load per-account bitrix settings when creating deal
- [ ] Pass pipeline ID, stage ID, responsible ID to Bitrix24 crm.deal.add call

## Critical Bug Fix: Messages Not Saving
- [x] Diagnose why incoming messages don't appear in chat (dialog created but messages table empty)
- [x] Found root cause: Drizzle mysql2 returns [ResultSetHeader, null] array, but code accessed .insertId directly on array (undefined), causing dialogId=0 and FK constraint failure on message insert
- [x] Fixed: changed (inserted as any).insertId to (inserted as any)[0]?.insertId for both contacts and dialogs inserts
- [x] Added validation: if dialogId is 0, log error and return early instead of silently failing
- [x] Added detailed logging: "Created new dialog #X", "Saved message to dialog #X"
- [x] Manually restored missing message for existing dialog #2 (text: "Hi")

## One Dialog Per Contact (Persistent History)
- [x] Remove status filter from dialog lookup — find ANY existing dialog for contact, not just "open"
- [x] If dialog exists (any status), reopen it and append message — never create a new dialog
- [x] Update Bitrix deal creation: only create deal if no dialog existed before (truly new contact)

## Manager Oversight & Analytics
- [ ] Dialog assignment: UI to assign dialog to a manager (assigneeId already in schema)
- [ ] "My dialogs" filter in inbox sidebar
- [ ] Internal notes: add direction='note' type to messages (visible only to managers)
- [ ] Search dialogs by contact name, username, last message text
- [ ] Filter inbox by status, assignee, tag
- [ ] Tags/labels on dialogs (color-coded)
- [ ] Manager analytics page: dialogs handled, avg response time, messages sent, closed today/week
- [ ] Contact profile sidebar in dialog view: name, username, phone, total dialogs, notes
- [ ] First response time tracking (store firstResponseAt on dialog)
- [ ] Inbox UX: show assignee avatar on dialog card

## History Sync (MTProto)
- [x] Add syncAccountHistory() function to telegram.ts (getDialogs + getMessages)
- [x] Save outgoing messages from history with direction=outgoing
- [x] Deduplicate by telegramMessageId
- [x] Add real-time outgoing message handler (NewMessage outgoing:true)
- [x] Add syncStatus field to telegramAccounts schema
- [x] Add manual re-sync tRPC procedure
- [x] Add sync status + re-sync button to Accounts page UI

## Inbox Telegram Account Filter
- [x] Add telegramAccountId filter to dialogs.list backend procedure
- [x] Add Telegram account filter dropdown to Inbox UI

## Custom Auth (Email/Password)
- [ ] Add passwordHash field to users table
- [ ] Add auth.login procedure (email + password)
- [ ] Add auth.register procedure (admin-only)
- [ ] Update auth.me to work without Manus OAuth
- [ ] Update Home.tsx with login form
- [ ] Update DashboardLayout to use custom auth
- [ ] Remove Manus OAuth dependency from frontend

## Bulk Dialog Actions
- [x] Add dialogs.bulkUpdateStatus tRPC procedure
- [x] Add dialogs.bulkAssign tRPC procedure
- [x] Add checkbox on each dialog card in Inbox
- [x] Add select-all checkbox in Inbox header
- [x] Add floating bulk action toolbar (change status, assign manager)

## UX: Exact Date in Dialog Cards
- [x] Show exact date (dd.mm HH:MM or dd.mm.yyyy HH:MM) on dialog cards instead of relative time
- [x] Show full datetime on hover (tooltip)

## Sender Names in Chat
- [x] Add senderName column to messages table
- [x] Show sender name above each message bubble in DialogDetail
- [x] Re-import exports with senderName from JSON

## Auto Dialog Status Assignment
- [x] SQL: set status=needs_reply where last msg is incoming and < 30 days
- [x] SQL: set status=waiting where last msg is outgoing and < 30 days
- [x] SQL: set status=archived where last msg > 30 days
- [x] Add needs_reply and archived to dialog status enum in schema
- [x] Add "Требует ответа" and "Архив" filter tabs in Inbox
- [x] Color-code status badges in dialog cards

## Smart Heuristic Dialog Status
- [ ] Re-assign statuses using keyword heuristics (resolved/needs_reply/waiting/archived)
- [ ] Add heuristic auto-update on every new message in telegram.ts

## Fix: Accounts Showing Disconnected
- [x] Disable restoreAllSessions() in development mode (NODE_ENV=development) to prevent AUTH_KEY_DUPLICATED conflicts with Render
- [x] Fix restoreAllSessions() to not mark accounts as disconnected on AUTH_KEY_DUPLICATED (session valid but already in use)
- [x] Restore all 4 account statuses to 'active' in database

## Analytics Page
- [x] Add analytics.accountStats tRPC procedure (messages sent/received, dialogs, avg response time)
- [x] Build Analytics page with period filter (today/week/month/all)
- [x] Per-account stats table with all metrics
- [x] Add Analytics link to sidebar navigation (already existed)

## Analytics Enhancements
- [ ] Backend: messageActivityByDay procedure (sent/received per day per account)
- [ ] Backend: statusDistribution procedure (count by dialog status)
- [ ] Backend: topContacts procedure (most active contacts by message count)
- [ ] UI: Replace "dialogs per day" chart with "messages per day" (sent vs received stacked bars)
- [ ] UI: Dialog status distribution donut chart
- [ ] UI: Top active partners table (contact name, account, messages, last message date)
- [ ] UI: Fix account stats table to use period filter from top selector

## Telegram Account = Affiliate Manager
- [x] Add managerId column (FK to users) to telegramAccounts schema
- [x] Run DB migration (pnpm db:push)
- [x] Add accounts.assignManager tRPC procedure
- [x] Add manager selector dropdown in Accounts page (per account card)
- [x] Analytics: show manager name from account.managerId (not assigneeId on dialog)
- [x] Analytics: managerStats procedure uses account.managerId for grouping
- [ ] Inbox: show manager name on dialog card based on account (pending)

## Fix: Real-time Message Sync (All Accounts)
- [x] Audit telegram.ts: how newMessage events are captured per account
- [x] Check why some dialogs/messages from some accounts are missing — was filtering only User entities, skipping groups/channels
- [x] Fix: ensure all dialogs are synced on account connect (not just history import)
- [x] Fix: real-time newMessage handler saves ALL message types (private, group, channel)
- [x] Fix: sync missed messages on reconnect (gap fill using lastSyncAt)

## Analytics: Replace Manager Table with Telegram Account Table
- [x] Replace "Эффективность аффилейт-менеджеров" table to show stats per Telegram account (using accountStats)
- [x] Columns: аккаунт, менеджер, диалогов, открытых, отправлено, получено, требуют ответа, ср. время ответа

## Bug Fixes (feedback from colleague)
- [x] Bug 1: No dates shown in chat messages (need date separators in dialog view)
- [x] Bug 2: Back button from dialog shows ALL dialogs instead of account-filtered list
- [x] Bug 3: Accounts keep disconnecting — added auto-reconnect watchdog every 5 min on Render

## Critical Bugs (Mar 11)
- [x] Accounts keep showing "Отключён" on Render — fixed: skip already-connected, only disconnect on SESSION_REVOKED/AUTH_KEY_INVALID
- [ ] Delete account button not working — fix the delete mutation/handler

## Sync All + Keep-Alive (Mar 11)
- [x] Add accounts.syncAll tRPC procedure (runs syncAccountHistory for all connected accounts)
- [x] Add "Обновить входящие" button in Inbox page header
- [x] Fix keep-alive: don't set status=disconnected on transient errors (AUTH_KEY_DUPLICATED, network timeout)
- [x] Add silent ping every 2 min to keep MTProto connections alive on Render

## Fix Sync All Dialogs (Mar 11)
- [x] Diagnose why syncAccountHistory misses dialogs — check limit, client availability, error handling
- [x] Fix syncAll to reconnect accounts if not in activeClients before syncing (forceSyncAll)
- [x] Remove 500 dialog limit or paginate properly to get ALL dialogs
- [x] Add progress/result feedback: show how many dialogs/messages were synced
- [x] Ensure syncAll works even when accounts show "disconnected" in DB

## Double-Check Audit (Mar 11)
- [x] Removed broken raw API (require() calls) from forceSyncAll — now uses only getDialogs(limit=1000)
- [x] Fixed delete account: now properly deletes messages, dialogTags, dialogs, autoReplies before deleting account (FK cascade)
- [x] Added onError handler to delete mutation in Accounts.tsx
- [x] Verified TypeScript compiles cleanly (0 errors)

## Fix forceSyncAll errors on Render (Mar 12)
- [x] Check Render logs for exact error from forceSyncAll (AUTH_KEY_DUPLICATED — duplicate connection attempt)
- [x] Fix root cause: rewrote forceSyncAll to reuse connectAccount() + syncAccountHistory() instead of duplicating all logic
- [x] Verify sync actually works after deploy (deployed, live on Render)

## Fix AUTH_KEY_DUPLICATED (Mar 12)
- [x] Understand why AUTH_KEY_DUPLICATED happens on every connect attempt on Render
- [x] Fix connectAccount: retry with 30s/60s/90s backoff instead of failing immediately
- [x] Add detailed logging to restoreAllSessions (shows uptime, accounts found, success/fail per account)
- [x] Reduce startup grace period to 30s (connectAccount handles retries internally now)
- [x] Reduce watchdog to 5 min interval
- [x] Add /api/debug/tg-status HTTP endpoint (no auth required) to check activeClients on Render
- [x] Make syncAll async (background) - returns immediately, result comes via SSE sync_complete event
- [x] Add SSE sync_progress events for real-time feedback during sync
- [x] Update Inbox.tsx to show toast when SSE sync_complete arrives
- [x] Implement process lock (processLock.ts) — new process waits for old to die before connecting MTProto
- [x] Simplify connectAccount — remove retry backoff (lock guarantees single process)
- [ ] Verify sync returns non-zero dialog count after deploy

## Fix Sender Attribution in Chat (Mar 12)
- [ ] Fix sender attribution in chat view — show who sent each message (account owner vs contact vs other group member)
- [ ] Ensure senderName is saved correctly during sync and real-time message handling
- [x] Sync progress indicator — show synced/total dialogs with animated progress bar
- [x] Auto-refresh Inbox dialog list every 30 seconds

## Filter Supergroups from Sync (Mar 13)
- [x] Skip supergroups and channels in syncAccountHistory (only sync User dialogs + small groups)
- [x] Clean existing supergroup dialogs from DB

## Move Worker into Main Server (Mar 13)
- [x] Move Worker startup into main Express server process (fix AUTH_KEY_DUPLICATED on Render)
- [x] Remove separate background worker service from Render
- [ ] Verify sync starts automatically after deploy

## Full Code Audit — 12 Bug Fixes (Mar 12)
- [x] BUG-1: processLock.ts is dead code — not imported anywhere, wire it into worker.ts main()
- [x] BUG-2: messages.send race condition — returns last msg from entire table, not this dialog
- [x] BUG-3: dialogs.list has no LIMIT — loads all dialogs into memory, add SQL LIMIT 500 + push filters to SQL
- [x] BUG-4: Raw SQL uses dialog_id/tag_id (snake_case) but actual columns are dialogId/tagId (camelCase)
- [x] BUG-5: analytics.accountStats — N+1 × 6 queries per account, consolidate into 3 bulk queries
- [x] BUG-6: analytics.managerStats — N+1 × 5 queries per manager, consolidate into 2 bulk queries
- [x] BUG-7: syncAccountHistory — syncedDialogs only updated at end, add incremental update every 100 dialogs
- [x] BUG-8: shouldStopAfterBatch uses continue instead of break — changed to break immediately
- [x] BUG-9: messages.send firstResponseAt check includes just-inserted message — moved check BEFORE insert
- [x] BUG-10: SSE /api/events has no auth — added JWT cookie verification before allowing subscription
- [x] BUG-11: broadcast uses 50ms delay which is too aggressive — changed to 100ms + retry_after backoff on 429
- [x] BUG-12: workingHours.upsert does N+1 SELECT+UPDATE/INSERT per day — replaced with INSERT...ON DUPLICATE KEY UPDATE

## Real Sync Progress (Mar 13)
- [ ] Add totalTgDialogs column to telegramAccounts schema (stores real count from Telegram)
- [ ] Save totalTgDialogs at start of syncAccountHistory (after getDialogs fetches all)
- [ ] Update syncProgress API to return totalTgDialogs per account
- [ ] Update Inbox progress bar: show "X из Y диалогов в CRM" where Y = real Telegram count
- [ ] Auto-refresh progress every 10s while sync is active

## Fix 2FA in QR Login (Mar 13, 2026)

- [ ] Fix QR login flow to handle SESSION_PASSWORD_NEEDED (2FA) after QR scan
- [ ] Add 2FA password input step in frontend Accounts.tsx after QR scan
- [ ] Add 2FA password handling in worker.ts / telegram.ts QR login procedure


## UI Redesign: Messenger-Style Layout (Mar 13, 2026)

### Phase 1: Core Layout
- [x] New AppLayout component: thin icon sidebar (60px) + content area
- [x] Icon sidebar with sections: Messages, Contacts, Kanban, Analytics, Tags, Bot, Accounts, Settings
- [x] Active state highlighting with orange accent
- [x] User avatar at bottom of sidebar
- [x] Update App.tsx routing to use new layout

### Phase 2: Messages Section (Messenger-style)
- [x] 3-column layout: dialog list (320px) + chat view (flex) + contact info panel (280px)
- [x] Dialog list with search, filters (status, account)
- [x] Dialog list items: avatar, name, last message preview, time, unread badge
- [x] Chat view: message bubbles, date separators, send input
- [x] Contact info panel: avatar, details, tags, status, assignee
- [x] Real-time SSE updates integration
- [x] Quick replies panel in chat
- [x] Internal notes support

### Phase 3: Contacts Section
- [x] Contacts list with search and filters
- [x] Contact card with full info

### Phase 4: Analytics Dashboard
- [x] KPI cards (dialogs, messages, deals, active accounts)
- [x] Period filter (today/week/month/all)
- [x] Account stats table
- [x] Manager leaderboard table
- [ ] Activity chart (bar/line) — future
- [ ] Recent dialogs requiring attention — future

### Phase 5: Tags Section
- [x] Tags list with CRUD operations
- [x] Tag color picker
- [ ] Dialog count per tag — future

### Phase 6: Accounts Section
- [x] Connected accounts list with status (reused existing page)
- [x] Sync progress indicators
- [x] Add account (QR login) flow

### Phase 7: Bot Admin Section
- [x] Reused existing LeadCashBot page (all tabs: Overview, Moderation, Groups, Categories, Admins, Templates, Logs, Broadcast)
- [x] Removed DashboardLayout wrapper

### Phase 8: Settings Section
- [x] Quick replies management
- [x] Working hours management
- [x] Bitrix24 integration settings

### Phase 9: Polish
- [x] Consistent dark theme with orange accents throughout
- [x] Loading states and skeletons
- [x] Empty states for all sections
- [x] All 20 vitest tests passing

## Deploy UI Redesign to Render (Mar 13, 2026)
- [ ] Push updated code to GitHub
- [ ] Trigger deploy on Render
- [ ] Verify deployment
