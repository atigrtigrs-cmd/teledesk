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
- [ ] Explore all bot API endpoints (admins, templates, chats, moderation actions)
- [ ] Add tRPC proxy procedures for all missing bot endpoints
- [ ] Rebuild LeadCashBot page: Overview, Moderation, Groups, Categories, Admins, Templates, Logs, Chats tabs — all native in TeleDesk dark design
- [ ] Remove iframe tab

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
- [ ] Add tRPC procedure: accounts.sendPhoneCode (send SMS/Telegram code via GramJS)
- [ ] Add tRPC procedure: accounts.verifyPhoneCode (verify code, handle 2FA password)
- [ ] Add phone login UI: phone input step → code input step → optional 2FA password step
- [ ] Show both options in Accounts page: "По QR-коду" and "По номеру телефона"
