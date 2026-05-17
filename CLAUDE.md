# Autobatch Dashboard — CLAUDE.md

## Project
Last-mile Delivery Dashboard สำหรับ Operations team ของ Lotus's
Monitor & manage: Pending Orders, Rider Pool, Jobs, Auto-assignment, AI Chat Assistant (น้องบอท)

## Stack
- **Backend**: Node.js + Express (server.js → routes/ + lib/)
- **Frontend**: Vanilla HTML/CSS/JS (public/index.html) — NO framework, NO build tool
- **DB**: MongoDB (read-only, 4 databases owned by client system — ห้าม write)
- **AI**: OpenRouter API (Claude-3-haiku default) + OpenAI-compatible tool calling loop
- **Sync**: Google Sheets API (push rider queue every 1hr)
- **Logs**: Tencent Cloud CLS (job diagnostic search)

## Commands
```bash
npm start                              # run server port 3000
pm2 start server.js --name autobatch   # production
pm2 restart autobatch                  # after code change
pm2 logs autobatch                     # view logs
```

## Git Branches
```
main                      # Phase 1 — production, stable
feature/phase2-ai-chat    # Phase 2 — AI chat (น้องบอท) ← active development
```
**Always work on `feature/phase2-ai-chat` for AI features.**

## File Map
```
server.js               entry point, mounts all routes + starts sheet sync
routes/
  pending.js            GET /api/pending?storeCode=
  jobs.js               GET /api/jobs  /stuck  /job-route  /jobs-km
  orders.js             GET /api/orders  /batches  /order-confirm-check
  riders.js             GET /api/riders  /live  /rider-breaks
  performance.js        GET /api/rider-performance
  diagnostics.js        GET /api/job-diagnostics   (Tencent CLS log search)
  ai.js                 POST /api/ai/chat           ← Phase 2 AI endpoint
lib/
  db.js                 MongoDB singleton → getClient()
  helpers.js            safeStr(), splitCodes()
  eligibility.js        evalEligibility(), buildMapUrl()
  cls.js                Tencent CLS client (getClsClient, getClsTopicId)
  aiTools.js            13 AI tool definitions (OpenAI function-calling format)
  toolExecutor.js       execute AI tool calls → call local API → return JSON
sync/
  sheetsSync.js         push rider queue → Google Sheets tabs per store, hourly
public/
  index.html            entire frontend (~5000 lines, single file)
  route-viewer.html     delivery route polyline map viewer
```

## MongoDB Databases (READ-ONLY)
```
4pl-oms                 orders, batches
4pl-fleet               riders, jobs, riderbreaklogs
lastmile                autobatch assign logs
4pl-address-and-zoning  store/zone geodata
```
⚠️ These databases belong to the client system. Never write or modify data.

## Required .env
```env
MONGO_URI=                            # MongoDB connection string (required)
PORT=3000

OPENROUTER_API_KEY=                   # Phase 2 AI (required for /api/ai/chat)
AI_MODEL=anthropic/claude-3-haiku     # default model

CLS_SECRET_ID=                        # Tencent CLS (required for diagnostics)
CLS_SECRET_KEY=
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log
CLS_TOPIC_ID=                         # optional, auto-fetched from topic name

GOOGLE_SERVICE_ACCOUNT_EMAIL=         # required for Google Sheets sync
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
SYNC_STORE_CODES=1104,5022,6403
SYNC_SHEET_NAME=rider_queue
```

## AI Chat — routes/ai.js + lib/aiTools.js + lib/toolExecutor.js
```
POST /api/ai/chat
  body: { message, storeCode, history[], model? }
  response: { answer, toolsUsed[], model }

Flow: user message → inject context → OpenRouter API → tool_calls loop (max 6) → answer
```

**13 tools available:**
```
get_pending_orders     get_jobs              get_job_by_id
get_stuck_jobs         get_order_detail      check_order_confirm
get_riders             get_live_riders       get_rider_performance
get_rider_breaks       get_job_diagnostics   get_rider_jobs
search_rider_by_name
```

**Context injected per request:**
- Gregorian date (NOT Buddhist era year)
- ISO from/to for today
- Thai month → number mapping (มกราคม→01 etc.)
- storeCode from UI

## Known Gotchas

**1. Date / Buddhist Era Bug**
Thai locale `toLocaleDateString('th-TH')` returns year 2569 (Buddhist era).
MongoDB stores Gregorian year 2026.
→ Always use `new Date().getFullYear()` — NEVER `toLocaleDateString('th-TH')` for year

**2. Working AI Models (with workshop OpenRouter key)**
```
✅ anthropic/claude-3-haiku
✅ openai/gpt-4o-mini
✅ openai/gpt-3.5-turbo
❌ qwen/qwen-2.5-7b-instruct:free   → 404 No endpoints
❌ meta-llama/llama-3.1-8b:free     → 404 No endpoints
```

**3. storeCode Override in AI**
If user mentions a store number in the message (e.g. "ของสาขา 6403", "6403 วันนี้")
→ AI must use that number, NOT the context storeCode from the dashboard UI.
Rule is enforced in SYSTEM_PROMPT in routes/ai.js.

**4. get_jobs strips orderIds**
toolExecutor.js get_jobs case explicitly maps fields — orderIds IS included.
If AI can't see orderIds, check the map() in toolExecutor.js get_jobs case.

**5. Fuzzy rider name search threshold**
search_rider_by_name: score > 0.35 (Levenshtein-based)
get_rider_jobs: score > 0.45 (stricter, to avoid false matches)

## Phase 3 — Planned (not started)
- **SQLite**: user login, roles per storeCode, API key settings stored in DB
- **AI Feedback**: thumbs up/down after each reply → store Q&A → few-shot inject
- **Multi-ENV**: VM2 deployment with ENV2 config, frontend ENV switcher toggle
- Database choice for Phase 3: SQLite (users/roles/keys) + optional Chroma (vector memory)

## Quick Setup (new machine)
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout feature/phase2-ai-chat
npm install
cp .env.example .env
# edit .env with real values
npm start
```
