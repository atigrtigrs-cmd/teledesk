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
