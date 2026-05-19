# Autobatch Dashboard — CLAUDE.md (Phase 1 / main)

## Project
Last-mile Delivery Dashboard สำหรับ Operations team ของ Lotus's
Monitor & manage: Pending Orders, Rider Pool, Jobs, Auto-assignment diagnostics, Store Performance

## Stack
- **Backend**: Node.js + Express (server.js → routes/ + lib/)
- **Frontend**: Vanilla HTML/CSS/JS (public/index.html) — NO framework, NO build tool
- **DB**: MongoDB (read-only, 4 databases owned by client system — ห้าม write)
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
main                        # Phase 1 — core dashboard, no AI  ← you are here
feature/phase2-ai-chat      # Phase 2 — AI chat (น้องบอท)
feature/phase3-analytics    # Phase 3 — Analytics tab + AI Insight
```

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
lib/
  db.js                 MongoDB singleton → getClient()
  helpers.js            safeStr(), splitCodes()
  eligibility.js        evalEligibility(), buildMapUrl()
  cls.js                Tencent CLS client (getClsClient, getClsTopicId)
sync/
  sheetsSync.js         push rider queue → Google Sheets tabs per store, hourly
public/
  index.html            entire frontend (~4000 lines, single file)
  route-viewer.html     delivery route polyline map viewer
```

## API Endpoints
```
GET /api/pending          pending orders waiting for batch — ?storeCode=
GET /api/jobs             jobs by date range — ?storeCode=&from=&to=
GET /api/stuck            jobs not assigned yet — ?storeCode=&from=&to=
GET /api/job-route        route polyline for a job — ?jobId=
GET /api/jobs-km          route distance in km — ?jobId=
GET /api/orders           search orders — ?type=consignment|orderid&values=
GET /api/batches          search batches — ?type=&values=
GET /api/order-confirm-check  check CLS log for customer confirm — ?orderId=
GET /api/riders           rider pool + eligibility flags — ?storeCode=
GET /api/live             real-time rider/store positions — ?storeCode=
GET /api/rider-breaks     rider break history — ?userId=&from=&to=
GET /api/rider-performance  job stats per rider — ?storeCode=&from=&to=
GET /api/job-diagnostics  auto-assign round analysis — ?jobId=&hours=
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

## Key Patterns

**MongoDB connection** — always use `getClient()` from lib/db.js, never create new MongoClient directly.

**storeCode** — comma-separated string e.g. `"1104,5022,6403"`. Use `splitCodes()` from lib/helpers.js to split.

**Date range params** — ISO 8601 with timezone e.g. `2026-05-17T00:00:00+07:00`. All times stored in UTC, display in Asia/Bangkok.

**Rider eligibility** — `evalEligibility(rider)` returns object with flags:
`{ ready_for_auto_assign, staff_online, no_active_job, not_on_break, not_banned }`

## Known Gotchas

**1. Date / Buddhist Era**
Thai locale `toLocaleDateString('th-TH')` returns year 2569 (Buddhist era).
MongoDB stores Gregorian year 2026.
→ Always use `new Date().getFullYear()` — NEVER `toLocaleDateString('th-TH')` for year.

**2. MongoDB is READ-ONLY**
All 4 databases are owned by the Lotus client system.
Never call `.insertOne()`, `.updateOne()`, `.deleteOne()` on these collections.

**3. CLS Topic ID**
`CLS_TOPIC_ID` in .env is optional — lib/cls.js auto-fetches it from `CLS_TOPIC_NAME` on first call.
If diagnostics return empty, check that `CLS_SECRET_ID` / `CLS_SECRET_KEY` are correct.

## Other Phases
- **Phase 2** (`feature/phase2-ai-chat`) — AI chat widget (น้องบอท): `routes/ai.js`, `lib/aiTools.js`, `lib/toolExecutor.js`
- **Phase 3** (`feature/phase3-analytics`) — Analytics tab, AI Insight, Shift Planning, Delivery Speed chart

## Quick Setup (new machine)
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
# main branch is default (Phase 1)
npm install
cp .env.example .env
# edit .env with real values
npm start
```
