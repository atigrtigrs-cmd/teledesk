# TeleDesk — Comprehensive Audit Findings (Mar 15, 2026)

## CRITICAL (Must Fix)

### 1. Render Free Plan = Service Sleeps After 15 Min Inactivity
- render.yaml: `plan: free`
- Free plan spins down after 15 min of no traffic
- Telegram MTProto connections die when service sleeps
- Worker intervals (polling, keepalive, watchdog) all stop
- **Impact**: Real-time messaging completely broken during sleep
- **Fix**: Upgrade to paid plan ($7/mo Starter) or add external keep-alive ping

### 2. No Pagination on Messages (337K+ rows)
- `messages.list` loads ALL messages for a dialog: `db.select().from(messages).where(eq(messages.dialogId, input.dialogId)).orderBy(messages.createdAt)`
- Large dialogs (1000+ messages) = slow response, high memory, bad UX
- **Fix**: Cursor-based pagination (last 50, load more on scroll up)

### 3. debugStatus is publicProcedure — Exposes Server Internals
- Line 150: `debugStatus: publicProcedure.query(async () => {...})`
- Returns: account IDs, usernames, statuses, errors, NODE_ENV, uptime
- Anyone can call this without auth
- **Fix**: Change to protectedProcedure or remove entirely

### 4. Bitrix Webhook URL Exposed to Frontend
- `bitrix.get` returns full settings including webhookUrl
- Webhook URL = full API access to Bitrix24 CRM
- **Fix**: Mask or exclude webhookUrl from frontend response

### 5. No Role-Based Access Control
- All protectedProcedure routes accessible to any logged-in user
- No admin-only checks for: deleting accounts, changing settings, Bitrix config, bot management
- **Fix**: Add adminProcedure middleware, check ctx.user.role

## HIGH (Should Fix Soon)

### 6. Auto-Replies Not Wired to Message Handler
- autoReplies table exists, CRUD in routers works
- But telegram.ts and worker.ts have ZERO references to autoReply logic
- Feature is UI-only — saving rules does nothing
- **Fix**: Add auto-reply trigger in incoming message handler

### 7. 6 Unused/Dead Pages
- AutoReplies.tsx, ComponentShowcase.tsx, Dashboard.tsx, DialogDetail.tsx, Inbox.tsx, QuickReplies.tsx
- Not referenced in App.tsx routes
- Duplicate pages: Settings.tsx vs SettingsPage.tsx, Analytics.tsx vs AnalyticsPage.tsx
- **Fix**: Remove dead pages, consolidate duplicates

### 8. No Mobile Responsiveness
- 12 out of 20 pages have ZERO responsive classes (sm:/md:/lg:)
- Messages.tsx (main page, 1209 lines) has only 1 responsive class
- Sidebar is fixed 60px, no hamburger menu for mobile
- **Fix**: Add responsive breakpoints, collapsible sidebar

### 9. Missing Empty States
- 10 pages have no empty state handling
- ContactsPage, TagsPage, QuickReplies, AutoReplies show nothing when data is empty
- **Fix**: Add "No data yet" placeholders with action CTAs

### 10. Messages.tsx is 1209 Lines — God Component
- Contains: DialogList, ChatView, ContactPanel, AvatarWithFallback, useResizable
- All in one file — hard to maintain, slow to parse
- **Fix**: Split into separate components

### 11. SSE Has No Max Connection Limit
- `const clients = new Set<Response>()` — unbounded
- No per-user limit, no total limit
- Potential DoS vector
- **Fix**: Add max 100 connections, 1 per user

### 12. Worker Intervals Never Cleared
- 4 setInterval calls in worker main() — never cleared on shutdown
- Could cause issues during graceful shutdown
- **Fix**: Store interval IDs, clear in SIGTERM handler

## MEDIUM (Nice to Have)

### 13. Test Coverage is Thin
- Only 6 test files, mostly smoke tests
- No tests for: message sending, dialog CRUD, Bitrix integration, tags, auto-replies
- No integration tests for Telegram flow

### 14. No Rate Limiting on API
- No rate limiting on any tRPC procedure
- AI summary (LLM call) can be spammed
- Message sending has no throttle
- **Fix**: Add rate limiting middleware

### 15. No Input Length Validation
- z.string() without .max() on many inputs
- Could send extremely long strings to DB/LLM
- **Fix**: Add .max(1000) or similar to all string inputs

### 16. Dialogs List Fetches ALL Dialogs
- `dialogs.list` with status filter but no pagination
- 1590 dialogs loaded at once
- **Fix**: Add cursor-based pagination

### 17. Multiple allUsers Fetches
- `db.select().from(users)` called in 3+ different procedures
- Could be cached or joined

### 18. ErrorBoundary Shows Stack Trace
- Production users see full error.stack
- **Fix**: Show generic error in production, stack only in dev

## LOW (Future Improvements)

### 19. FunnelsPage is Empty Placeholder
- Shows "Воронки" header but no content
- Nav item exists but page is stub

### 20. No Keyboard Shortcuts
- No Ctrl+K search, no Escape to close panels
- Common in messaging apps

### 21. No Message Search
- Can search dialogs/contacts but not message content

### 22. No File/Image Sending
- Only text messages supported

### 23. No Notification Sound
- SSE events arrive silently

### 24. Accessibility: Only 8 aria attributes across all pages
