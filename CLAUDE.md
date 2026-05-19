# Autobatch Dashboard — CLAUDE.md (Phase 2)

## Project
Last-mile Delivery Dashboard สำหรับ Operations team ของ Lotus's
Monitor & manage: Pending Orders, Rider Pool, Jobs, Auto-assignment diagnostics + AI Chat (น้องบอท)

## Stack
- **Backend**: Node.js + Express (server.js → routes/ + lib/)
- **Frontend**: Vanilla HTML/CSS/JS (public/index.html) — NO framework, NO build tool
- **DB**: MongoDB (read-only, 4 databases owned by client system — ห้าม write)
- **AI Chat**: OpenRouter API → Claude 3 Haiku via OpenAI-compatible SDK
- **Sync**: Google Sheets API (push rider queue every 1hr)
- **Logs**: Tencent Cloud CLS (job diagnostic search)

## Commands
```bash
npm start                              # run server port 3000
pm2 start server.js --name dashboard   # production
pm2 restart dashboard --update-env     # after code or .env change
pm2 logs dashboard                     # view logs
```

## Git Branches
```
main                        # Phase 1 — core dashboard, no AI
feature/phase2-ai-chat      # Phase 2 — AI chat (น้องบอท)  ← you are here
feature/phase3-analytics    # Phase 3 — Analytics tab + AI Insight
```

## File Map
```
server.js               entry point — mounts all routes + starts sheet sync
routes/
  pending.js            GET /api/pending?storeCode=
  jobs.js               GET /api/jobs  /stuck  /job-route  /jobs-km
  orders.js             GET /api/orders  /batches  /order-confirm-check
  riders.js             GET /api/riders  /live  /rider-breaks
  performance.js        GET /api/rider-performance
  diagnostics.js        GET /api/job-diagnostics   (Tencent CLS)
  ai.js                 POST /api/ai/chat           ← Phase 2
lib/
  db.js                 MongoDB singleton → getClient()
  helpers.js            safeStr(), splitCodes()
  eligibility.js        evalEligibility(), buildMapUrl()
  cls.js                Tencent CLS client
  aiTools.js            13 AI tool definitions (OpenAI function-calling format)
  toolExecutor.js       execute tool_call จาก AI → เรียก API จริง
sync/
  sheetsSync.js         push rider queue → Google Sheets tabs per store, hourly
public/
  index.html            entire frontend (~4500 lines, single file)
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
POST /api/ai/chat
  body:     { message, storeCode, history[], model?, noTools? }
  response: { answer, toolsUsed[], model, debugData[] }

Flow: message → inject context → OpenRouter → tool_calls loop (max 6) → answer
noTools: true → ข้าม tool loop (ใช้เมื่อ data ถูก inject เข้า prompt แล้ว)
```

**13 tools:**
```
get_pending_orders     get_jobs              get_job_by_id
get_stuck_jobs         get_order_detail      check_order_confirm
get_riders             get_live_riders       get_rider_performance
get_rider_breaks       get_job_diagnostics   get_rider_jobs
search_rider_by_name
```

**Retry logic:** 3 attempts, 30s → 65s on 429 rate limit

## MongoDB Databases (READ-ONLY)
```
4pl-oms                 orders, batches
4pl-fleet               riders, jobs, riderbreaklogs
lastmile                autobatch assign logs
4pl-address-and-zoning  store/zone geodata
```
⚠️ Never write or modify data.

## Required .env
```env
MONGO_URI=                            # required
PORT=3000

OPENROUTER_API_KEY=                   # required for AI chat
AI_MODEL=anthropic/claude-3-haiku     # ห้ามใช้ free tier

CLS_SECRET_ID=
CLS_SECRET_KEY=
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log
CLS_TOPIC_ID=                         # optional, auto-fetched

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
SYNC_STORE_CODES=1104,5022,6403
SYNC_SHEET_NAME=rider_queue
```

## Key Patterns

**MongoDB** — always use `getClient()` from lib/db.js.

**storeCode** — comma-separated `"1104,5022,6403"`. Use `splitCodes()`.

**Date range** — ISO 8601 with TZ. Stored UTC, display Bangkok (UTC+7).

**storeCode lock** — backend force-overwrites storeCode ใน tool args ด้วยค่าจาก req.body เสมอ. AI ดึงข้อมูลสาขาอื่นไม่ได้.

**toBKK()** — toolExecutor แปลง datetime UTC → Bangkok `"HH:MM น. (DD/MM/YYYY)"` ก่อนส่ง AI ทุกครั้ง.

**Business rule** — 1 rider รับได้ 1 job เท่านั้นในเวลาเดียวกัน.

## Known Gotchas

**1. Date / Buddhist Era** — ใช้ `new Date().getFullYear()` เท่านั้น ห้ามใช้ `toLocaleDateString('th-TH')` สำหรับปี

**2. AI Model — ห้ามใช้ free tier**
```
✅ anthropic/claude-3-haiku   (paid, ~$0.001/call)
❌ qwen/*:free, deepseek/*:free → 404 removed หรือ hallucinate
```

**3. PM2 env** — ต้อง `pm2 restart dashboard --update-env` หลังแก้ `.env`

**4. CLS Topic ID** — optional, auto-fetched จาก `CLS_TOPIC_NAME`

**5. Fuzzy search thresholds**
- `search_rider_by_name`: score > 0.35
- `get_rider_jobs`: score > 0.45

**6. Rider ว่างงาน** — ดูจาก `job_on_hand_id: null` เท่านั้น (inPool: true ≠ ว่าง)

**7. check_order_confirm** — ต้องใช้ internalOrderId (เช่น `26LOTUS-MR525503041`) ไม่ใช่ CPTH/UUID

## Chat Widget Features
- 🗑️ Clear — ล้าง history
- ⤢ Expand — normal → expanded → fullscreen
- 🔍 Debug — toggle raw tool data

## Phase 3
Analytics tab + AI Insight อยู่บน `feature/phase3-analytics` (แยก branch)

## Quick Setup
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout feature/phase2-ai-chat
npm install
cp .env.example .env   # แก้ค่าจริง
npm start
```
