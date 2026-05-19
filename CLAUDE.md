# Autobatch Dashboard — CLAUDE.md (Phase 3)

## Project
Last-mile Delivery Dashboard สำหรับ Operations team ของ Lotus's
Monitor & manage: Pending Orders, Rider Pool, Jobs, Auto-assignment diagnostics, Store Analytics, AI Insight

## Stack
- **Backend**: Node.js + Express (server.js → routes/ + lib/)
- **Frontend**: Vanilla HTML/CSS/JS (public/index.html) — NO framework, NO build tool
- **DB**: MongoDB (read-only, 4 databases owned by client system — ห้าม write)
- **AI**: OpenRouter API → Claude 3 Haiku (paid) via OpenAI-compatible SDK
- **Sync**: Google Sheets API (push rider queue every 1hr)
- **Logs**: Tencent Cloud CLS (job diagnostic search)

## Commands
```bash
npm start                              # run server port 3000
pm2 start server.js --name dashboard   # production
pm2 restart dashboard --update-env     # after code change or .env change
pm2 logs dashboard                     # view logs
```

## Git Branches
```
main                        # Phase 1 — core dashboard, no AI
feature/phase2-ai-chat      # Phase 2 — AI chat widget (น้องบอท)
feature/phase3-analytics    # Phase 3 — Analytics tab + AI Insight  ← you are here
```

## File Map
```
server.js               entry point — mounts all routes + starts sheet sync
routes/
  pending.js            GET /api/pending
  jobs.js               GET /api/jobs  /stuck  /job-route  /jobs-km
  orders.js             GET /api/orders  /batches  /order-confirm-check
  riders.js             GET /api/riders  /live  /rider-breaks
  performance.js        GET /api/rider-performance
  diagnostics.js        GET /api/job-diagnostics   (Tencent CLS)
  ai.js                 POST /api/ai/chat            (Phase 2+)
  analytics.js          GET /api/analytics/*         (Phase 3)
lib/
  db.js                 MongoDB singleton → getClient()
  helpers.js            safeStr(), splitCodes()
  eligibility.js        evalEligibility(), buildMapUrl()
  cls.js                Tencent CLS client
  aiTools.js            tool definitions สำหรับ AI chat    (Phase 2+)
  toolExecutor.js       execute tool_call จาก AI → เรียก API  (Phase 2+)
sync/
  sheetsSync.js         push rider queue → Google Sheets, hourly
public/
  index.html            entire frontend (~5000 lines, single file)
  route-viewer.html     delivery route polyline map viewer
```

## API Endpoints

### Phase 1 — Core
```
GET /api/pending          pending orders — ?storeCode=
GET /api/jobs             jobs by date range — ?storeCode=&from=&to=
GET /api/stuck            unassigned jobs — ?storeCode=&from=&to=
GET /api/job-route        route polyline — ?jobId=
GET /api/jobs-km          route distance km — ?jobId=
GET /api/orders           search orders — ?type=consignment|orderid&values=
GET /api/batches          search batches — ?type=&values=
GET /api/order-confirm-check  CLS log check — ?orderId=
GET /api/riders           rider pool + eligibility — ?storeCode=
GET /api/live             real-time positions — ?storeCode=
GET /api/rider-breaks     break history — ?userId=&from=&to=
GET /api/rider-performance  job stats per rider — ?storeCode=&from=&to=
GET /api/job-diagnostics  auto-assign round log — ?jobId=&hours=
```

### Phase 2 — AI Chat
```
POST /api/ai/chat         AI chat with tool calling — { message, storeCode, history, noTools? }
```

### Phase 3 — Analytics
```
GET /api/analytics/daily-summary    KPI today vs yesterday — ?storeCode=
GET /api/analytics/hourly           hourly demand today — ?storeCode=
GET /api/analytics/rider-score      7-day rider performance — ?storeCode=
GET /api/analytics/delivery-speed   pickup/delivery lag trend — ?storeCode=&days=7&mode=daily|hourly&date=
GET /api/analytics/demand-forecast  tomorrow job forecast — ?storeCode=&days=7
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
MONGO_URI=                            # required
PORT=3000

CLS_SECRET_ID=                        # Tencent CLS
CLS_SECRET_KEY=
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log
CLS_TOPIC_ID=                         # optional, auto-fetched

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
SYNC_STORE_CODES=1104,5022,6403
SYNC_SHEET_NAME=rider_queue

OPENROUTER_API_KEY=                   # Phase 2+ — OpenRouter API key
AI_MODEL=anthropic/claude-3-haiku     # paid model, ห้ามใช้ free tier
```

## Key Patterns

**MongoDB connection** — always use `getClient()` from lib/db.js.

**storeCode** — comma-separated e.g. `"1104,5022,6403"`. Use `splitCodes()` from lib/helpers.js.

**Date range params** — ISO 8601 with TZ e.g. `2026-05-17T00:00:00+07:00`. Stored UTC, display Bangkok.

**Rider eligibility** — `evalEligibility(rider)` → `{ ready_for_auto_assign, staff_online, no_active_job, not_on_break, not_banned }`

**AI Chat (Phase 2+)** — uses OpenAI-compatible SDK pointing at OpenRouter. Tool calling loop in `routes/ai.js`. Tool executor in `lib/toolExecutor.js`. Use `noTools: true` to skip tool loop (e.g. AI Insight pre-fetches data itself).

**AI Insight (Phase 3)** — frontend pre-fetches 3 APIs (hourly, rider-score, delivery-speed), embeds real data into prompt, sends with `noTools: true`. Follow-up chat injects `_anAiDataContext` on every message.

**Business rule** — 1 rider รับได้ 1 job เท่านั้นในเวลาเดียวกัน. Job ใหม่ได้หลังปิด job เดิมแล้วเท่านั้น.

**Rider count recommendation** — ใช้ correlation จาก data จริง: วันที่ pickup lag ต่ำ activeRiderCount เป็นเท่าไหร่ ไม่ใช่สูตรทฤษฎี.

## Known Gotchas

**1. Date / Buddhist Era**
`toLocaleDateString('th-TH')` → year 2569 (Buddhist era). MongoDB stores Gregorian.
→ Always use `new Date().getFullYear()` — NEVER `toLocaleDateString('th-TH')` for year.

**2. MongoDB is READ-ONLY**
Never call `.insertOne()`, `.updateOne()`, `.deleteOne()`.

**3. AI Model — ห้ามใช้ free tier**
Free models (qwen, deepseek free) ถูก remove หรือ rate-limit 1 req/min.
ใช้ `anthropic/claude-3-haiku` (paid, ~$0.001/call) เท่านั้น.

**4. PM2 env vars**
หลังแก้ `.env` ต้อง `pm2 restart dashboard --update-env` — `pm2 restart` อย่างเดียวไม่โหลด env ใหม่.

**5. CLS Topic ID**
`CLS_TOPIC_ID` optional — auto-fetched จาก `CLS_TOPIC_NAME` on first call.

## Quick Setup (new machine)
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout feature/phase3-analytics
npm install
cp .env.example .env   # แก้ค่าจริง
npm start
```
