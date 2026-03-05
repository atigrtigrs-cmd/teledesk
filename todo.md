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
