# Autobatch Dashboard — CLAUDE.md (TikTok MVP)

## Project
Last-mile Delivery Dashboard สำหรับ TikTok Express Operations team
Monitor & manage: Zone Polygon Map, Rider Pool, Pending Orders, Jobs, Rider Performance, AI Chat

> ⚠️ Branch นี้ (`tiktok-mvp`) เป็น client ใหม่ TikTok — ใช้ zone polygon แทน storeCode
> Branch เก่า Lotus's อยู่ที่ `feature/phase3-analytics`

## Stack
- **Backend**: Node.js + Express (server.js → routes/ + lib/)
- **Frontend**: Vanilla HTML/CSS/JS (public/index.html) — NO framework, NO build tool
- **DB**: MongoDB (read-only — ห้าม write) — TikTok Dash Production `10.134.4.16:27017`
- **AI**: OpenRouter API → Claude 3 Haiku (paid) via OpenAI-compatible SDK
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
main                        # Phase 1 — Lotus's core dashboard
feature/phase2-ai-chat      # Phase 2 — AI chat widget
feature/phase3-analytics    # Phase 3 — Analytics + AI Insight (Lotus's)
tiktok-mvp                  # TikTok MVP — zone-based dashboard  ← you are here
```

## File Map
```
server.js               entry point — mounts all routes + starts sheet sync
routes/
  zones.js              GET /api/zones                          (TikTok)
  tiktok.js             GET /api/tiktok/*                       (TikTok)
  dispatch.js           GET /api/dispatch/*                     (Dispatcher tab)
  pending.js            GET /api/pending
  jobs.js               GET /api/jobs  /stuck  /job-route  /jobs-km
  orders.js             GET /api/orders  /batches  /order-confirm-check
  riders.js             GET /api/riders  /live  /rider-breaks
  performance.js        GET /api/rider-performance
  diagnostics.js        GET /api/job-diagnostics   (Tencent CLS)
  ai.js                 POST /api/ai/chat
  analytics.js          GET /api/analytics/*
lib/
  db.js                 MongoDB singleton → getClient()  (with reconnect + topology check)
  helpers.js            safeStr(), splitCodes()
  eligibility.js        evalEligibility(), buildMapUrl()
  cls.js                Tencent CLS client
  aiTools.js            tool definitions สำหรับ AI chat
  toolExecutor.js       execute tool_call จาก AI → เรียก API
sync/
  sheetsSync.js         push rider queue → Google Sheets, hourly
public/
  index.html            entire frontend (single file)
  route-viewer.html     delivery route polyline map viewer
```

## API Endpoints

### TikTok MVP
```
GET /api/zones                    zone polygon list (deduplicated, prefer TIKTOK businessUnit)
GET /api/tiktok/live              zone polygons + rider positions — ?zoneName=
GET /api/tiktok/riders            rider pool table — ?zoneName=
GET /api/tiktok/pending           pending orders (serviceType=Tiktok_Express)
GET /api/tiktok/jobs              jobs by date range — ?from=&to=&zoneName=
GET /api/tiktok/performance       rider performance aggregation — ?from=&to=
GET /api/tiktok/config            service type config limits (batch/SLA/routeOpt/autoAssign)
```

### Dispatcher Tab
```
GET  /api/dispatch/orders             pending orders enriched with customer metadata — ?storeCode=
GET  /api/dispatch/eligible-riders    eligible riders for manual assignment — ?storeCode=
POST /api/dispatch/reassign           log manual reassignment (audit trail)
GET  /api/dispatch/activity-log       merged DB + session log — ?storeCode=&days=
GET  /api/dispatch/break-events       break history — ?userIds= or ?storeCode=
GET  /api/dispatch/rider-performance  enhanced metrics (on-time, dist, break) — ?storeCode=&from=&to=
```

### Phase 1 — Core (Lotus's)
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

### AI
```
POST /api/ai/chat         AI chat with tool calling — { message, storeCode, history, noTools? }
```

### Analytics (Lotus's Phase 3)
```
GET /api/analytics/daily-summary    KPI today vs yesterday — ?storeCode=
GET /api/analytics/hourly           hourly demand today — ?storeCode=
GET /api/analytics/rider-score      7-day rider performance — ?storeCode=
GET /api/analytics/delivery-speed   pickup/delivery lag trend — ?storeCode=&days=7
GET /api/analytics/demand-forecast  tomorrow job forecast — ?storeCode=&days=7
```

## MongoDB Databases (READ-ONLY)
```
4pl-oms                 pendingorders, autobatchingjobs, autobatchingriderpools, orders, batches
4pl-fleet               staffs (riders), jobs, riderbreaklogs
lastmile                servicetypes (TikTok config), stores (Lotus's)
4pl-address-and-zoning  geographies (zone polygons + storeCode areas)
```
⚠️ These databases belong to the client system. Never call `.insertOne()`, `.updateOne()`, `.deleteOne()`.

## Required .env
```env
# TikTok Dash Production
MONGO_URI=mongodb://so_user:<password>@10.134.4.16:27017,10.134.4.48:27017/admin?retryWrites=true&loadBalanced=false&replicaSet=cmgo-10k8cip5_0&readPreference=primary&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1
PORT=3000

# Tencent CLS
CLS_SECRET_ID=
CLS_SECRET_KEY=
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log
CLS_TOPIC_ID=                         # optional, auto-fetched

# Google Sheets Sync (Lotus's only — optional for TikTok)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
SYNC_STORE_CODES=1104,5022,6403
SYNC_SHEET_NAME=rider_queue

# AI Chat
OPENROUTER_API_KEY=                   # OpenRouter API key
AI_MODEL=anthropic/claude-3-haiku     # paid model, ห้ามใช้ free tier
```

## Key Patterns

**MongoDB connection** — always use `getClient()` from lib/db.js. Has topology check + reconnect dedup.

**TikTok zone filter** — ไม่มี storeCode. ใช้ `zoneName` (comma-separated zone names) แทน.
- Zones มาจาก `4pl-address-and-zoning.geographies` where `serviceAreaType: "polygon"`
- Rider อยู่ใน zone ไหน → ดูจาก `locationDetail.stores[].name`
- TikTok rider filter → `metaData.serviceTypes: "Tiktok_Express"`
- TikTok job filter → `metadata.serviceTypes: "Tiktok_Express"` ใน `4pl-oms.autobatchingjobs`

**Zone deduplication** — same zone name อาจมีหลาย businessUnit (TIKTOK + AMAZE)
→ `routes/zones.js` dedup by name, prefer `businessUnit === 'TIKTOK'`

**TikTok config** — `lastmile.servicetypes` where `code: "Tiktok_Express"` → `metadata.config`
→ `/api/tiktok/config` returns batch/SLA/routeOptimization/autoAssign/loadCapacity

**Job popup config panel** — `_buildCfgPanel(rowData, cfg)` renders % bars (Orders/max, weight, vol, dist).
For TikTok: frontend caches `_tiktokCfg` from `/api/tiktok/config` and passes it directly.

**Date range params** — ISO 8601 with TZ e.g. `2026-05-17T00:00:00+07:00`. Stored UTC, display Bangkok.

**Rider eligibility** — `evalEligibility(rider)` → `{ ready_for_auto_assign, staff_online, no_active_job, not_on_break, not_banned }`

**AI Chat** — OpenAI-compatible SDK → OpenRouter. Tool calling loop in `routes/ai.js`.

**Business rule** — 1 rider รับได้ 1 job เท่านั้นในเวลาเดียวกัน.

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

**6. TikTok jobs — no storeId**
TikTok jobs ใน `autobatchingjobs` มี `storeId: null` — ต้อง filter ด้วย `metadata.serviceTypes: "Tiktok_Express"` เสมอ.

**7. Zone name vs areaCode**
ใช้ `name` field เป็น key หลัก ไม่ใช่ `areaCode` — rider's `locationDetail.stores[].name` matches zone `name`.

## Quick Setup (new machine — TikTok MVP)
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout tiktok-mvp
npm install
# สร้าง .env ใส่ค่าจริง (ดู Required .env ด้านบน)
pm2 start server.js --name dashboard
pm2 save && pm2 startup
```
