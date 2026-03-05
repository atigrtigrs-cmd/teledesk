# TeleDesk — Telegram → Bitrix24 Platform TODO

## Phase 2: Setup
- [x] Database schema (accounts, dialogs, messages, contacts, tags, quick_replies, auto_replies, team_members, bitrix_settings, analytics_events)
- [x] DB push migrations
- [x] Global theme (dark, lead-cash.com inspired, yellow/orange accent)
- [x] DashboardLayout with sidebar

## Phase 3: Core UI
- [x] Landing page (public, lead-cash.com style)
- [x] Auth (email/password with JWT)
- [x] Sidebar navigation
- [x] Inbox page — unified list of all dialogs from all Telegram accounts
- [x] Telegram Accounts page — connect/disconnect accounts (QR code flow UI)
- [x] Dialog detail view — full chat history, reply input

## Phase 4: Dialogs & Messaging Features
- [x] Quick replies — templates with one-click send
- [x] Auto-replies — rules for working hours, first message greeting
- [x] Tags — create/assign tags to dialogs
- [x] Filters — by tag, status, manager, account
- [x] Assign dialog to manager
- [x] Mark dialog as resolved/open

## Phase 5: Analytics & AI
- [x] Analytics dashboard — total dialogs, response time, resolution rate
- [x] Charts: dialogs per day, by account, by manager
- [x] AI summary — generate dialog summary via LLM
- [x] Sentiment analysis — positive/negative/neutral per dialog
- [x] Auto-tags via AI classification
- [x] Daily digest — unresolved dialogs count

## Phase 6: Settings & Integrations
- [x] Bitrix24 integration settings (domain, webhook, pipeline selection)
- [x] Auto-create deal in Bitrix24 on new dialog
- [x] Write AI summary to Bitrix24 deal card
- [x] Team members management (invite, roles: admin/agent)
- [x] Working hours settings (for auto-replies)
- [x] Notification settings

## Phase 7: Tests & Delivery
- [x] Vitest unit tests for server routers (7 tests passing)
- [x] Checkpoint save
- [x] Deploy to GitHub + Render (https://github.com/atigrtigrs-cmd/teledesk, https://teledesk.onrender.com)
- [x] Deliver to user

## Auth Fix (Standalone Render Deploy)
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
