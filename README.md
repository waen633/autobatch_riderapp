# TikTok MVP Dashboard

> Last-mile Delivery Dashboard สำหรับ TikTok Express Operations team
> Monitor & manage: Zone Polygon Map, Rider Pool, Pending Orders, Jobs, Rider Performance

![Version](https://img.shields.io/badge/version-4.0.0--tiktok-fe2c55)
![Node](https://img.shields.io/badge/node-%3E%3D18.x-green)
![Branch](https://img.shields.io/badge/branch-tiktok--mvp-fe2c55)

---

## ✨ Features

### 🗺️ Zone-Based Live Map
| ส่วน | รายละเอียด |
|------|-----------|
| **Zone Polygon** | แสดง Zone polygon แบบ GeoJSON บนแผนที่ ระบายสีแยกตาม zone |
| **Rider Markers** | แสดง firstname label ใต้ icon มอเตอร์ไซค์ + dot สีแสดงสถานะ (พร้อม / รับของ / ส่ง / ยุ่ง) |
| **GPS Tooltip** | hover ดูเวลา GPS อัพเดตล่าสุด (HH:MM:SS Bangkok) |
| **Zone Legend** | Legend สีแสดงชื่อ zone ที่กำลังดูอยู่ |

### 📊 Dashboard
| ส่วน | รายละเอียด |
|------|-----------|
| 📦 **Pending Orders** | TikTok Express orders ที่รอสร้าง Job |
| 🏍️ **Rider Pool** | สถานะ Rider ทุกคนที่ service type = Tiktok_Express |
| 📋 **Jobs** | Jobs ตามช่วงเวลา + Config Bar (batch/SLA/max orders/radius) |
| 📊 **Rider Performance** | aggregation จาก autobatchingjobs — accept rate, cancel rate |
| 🤖 **AI Chat** | Floating chat widget — function calling เรียก API จริง |

### ⚙️ Job Config Panel (popup)
กดที่แถว Job ใดก็ได้จะเปิด popup แสดง:
- **Orders/Job** — X / 10 max พร้อม % bar
- **ระยะทาง / เวลาเดินทาง** จาก routeOptimization result
- Chips: `BATCH 7 min` · `SLA 240 min` · `AUTO-ASSIGN 2 min` · `RADIUS 20 km` · `BUFFER 10 min` · `BOX 57×58×42 cm` · `MAX WEIGHT 80 kg`

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB read-only — TikTok Dash Production `10.134.4.16:27017`
  - `4pl-oms` — autobatchingjobs, pendingorders
  - `4pl-fleet` — staffs (riders), jobs, riderbreaklogs
  - `lastmile` — servicetypes (TikTok config)
  - `4pl-address-and-zoning` — geographies (zone polygons)
- **Frontend**: Vanilla HTML/CSS/JS + **Leaflet.js** (zone polygon map) + **Chart.js v4**
- **Libraries**: Bootstrap 5, flatpickr
- **AI**: OpenRouter API (claude-3-haiku) + Function Calling
- **Log Search**: Tencent Cloud CLS

---

## 📥 Quick Start (TikTok MVP)

```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout tiktok-mvp
npm install
```

สร้างไฟล์ `.env`:
```env
MONGO_URI=mongodb://so_user:<password>@10.134.4.16:27017,10.134.4.48:27017/admin?retryWrites=true&loadBalanced=false&replicaSet=cmgo-10k8cip5_0&readPreference=primary&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1
PORT=3000

CLS_SECRET_ID=...
CLS_SECRET_KEY=...
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log

OPENROUTER_API_KEY=...
AI_MODEL=anthropic/claude-3-haiku
```

```bash
# Production
pm2 start server.js --name dashboard
pm2 save && pm2 startup
```

เปิด Browser: **http://localhost:3000**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                           │
│                                                                     │
│   public/index.html  (Vanilla JS — Single File ~5,500 lines)        │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│   │ Zone Map │ │  Riders  │ │ Pending  │ │  Jobs    │ │ Perf.  │  │
│   │ Leaflet  │ │  Pool    │ │ Orders   │ │+ Config  │ │ Chart  │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│   ┌────────────────────────────────────┐  ┌────────────────────┐   │
│   │       AI Chat Widget (floating)    │  │  Dispatcher Tab    │   │
│   │  OpenRouter → claude-3-haiku       │  │  Manual Reassign   │   │
│   └────────────────────────────────────┘  └────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / REST  (fetch + polling 30s)
┌────────────────────────────▼────────────────────────────────────────┐
│                     Node.js + Express  (server.js)                  │
│                                                                     │
│  routes/                                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │
│  │  zones.js  │ │ tiktok.js  │ │dispatch.js │ │  jobs / riders  │  │
│  │/api/zones  │ │/api/tiktok/│ │/api/dispatch│ │ orders/pending  │  │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────────────┐  │
│  │   ai.js    │ │analytics.js│ │        diagnostics.js          │  │
│  │/api/ai/chat│ │/api/analyt.│ │    /api/job-diagnostics        │  │
│  └─────┬──────┘ └────────────┘ └───────────────┬────────────────┘  │
│        │                                        │                   │
│  lib/  │                                        │                   │
│  ┌─────▼──────┐ ┌────────────┐ ┌───────────────▼────────────────┐  │
│  │ aiTools.js │ │eligibility │ │           cls.js               │  │
│  │toolExecutor│ │    .js     │ │     Tencent Cloud CLS          │  │
│  └────────────┘ └────────────┘ └────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                         db.js                                  │ │
│  │          MongoDB Singleton — getClient() with reconnect        │ │
│  └───────────────────────────┬────────────────────────────────────┘ │
└──────────────────────────────│─────────────────────────────────────┘
                               │ MongoDB Driver (READ-ONLY)
┌──────────────────────────────▼─────────────────────────────────────┐
│              MongoDB Replica Set  10.134.4.16:27017                 │
│                                                                     │
│  ┌─────────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │    4pl-oms       │  │  4pl-fleet    │  │       lastmile       │  │
│  │ pendingorders    │  │  staffs       │  │   servicetypes       │  │
│  │ autobatchingjobs │  │  jobs         │  │   (TikTok config)    │  │
│  │ orders / batches │  │  riderbreaklg │  └──────────────────────┘  │
│  └─────────────────┘  └───────────────┘  ┌──────────────────────┐  │
│                                           │ 4pl-address-and-     │  │
│                                           │      zoning          │  │
│                                           │   geographies        │  │
│                                           │  (zone polygons)     │  │
│                                           └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

External Services
  ┌─────────────────────────┐   ┌──────────────────────────┐
  │   OpenRouter API        │   │   Tencent Cloud CLS       │
  │  anthropic/claude-3-    │   │  allnow-prod-log topic    │
  │  haiku (paid)           │   │  (job diagnostic search)  │
  └─────────────────────────┘   └──────────────────────────┘
```

### Data Flow — Zone Live Map
```
Browser                     Express                    MongoDB
  │                            │                          │
  ├─ GET /api/zones ──────────►│                          │
  │                            ├─ geographies.find() ────►│
  │                            │◄─ polygon docs ──────────┤
  │◄─ zone list (GeoJSON) ─────┤                          │
  │                            │                          │
  ├─ GET /api/tiktok/live ────►│                          │
  │   ?zoneName=BKK-N          ├─ staffs.find() ─────────►│
  │                            │   serviceTypes=Tiktok    │
  │                            │◄─ rider positions ───────┤
  │◄─ { zones[], riders[] } ───┤                          │
  │                            │                          │
  │  Leaflet renders polygons  │                          │
  │  + places rider markers    │                          │
```

### Data Flow — AI Chat (Tool Calling)
```
Browser                    routes/ai.js               External
  │                            │                          │
  ├─ POST /api/ai/chat ───────►│                          │
  │  { message, history }      ├─ OpenRouter API ────────►│
  │                            │  (claude-3-haiku)        │
  │                            │◄─ tool_call response ────┤
  │                            │                          │
  │                            ├─ toolExecutor.js         │
  │                            │  (calls internal APIs)   │
  │                            │                          │
  │                            ├─ OpenRouter API ────────►│
  │                            │  (tool result + context) │
  │                            │◄─ final text response ───┤
  │◄─ { reply } ───────────────┤                          │
```

---

## 📁 โครงสร้างไฟล์

```
autobatch_riderapp/
├── public/
│   ├── index.html              # Frontend — single file (~5,500 lines)
│   └── route-viewer.html       # Route polyline map viewer
├── lib/
│   ├── db.js                   # MongoDB singleton (reconnect + topology check)
│   ├── helpers.js              # safeStr, splitCodes
│   ├── eligibility.js          # evalEligibility, buildMapUrl
│   ├── cls.js                  # Tencent CLS client
│   ├── aiTools.js              # AI tool definitions
│   └── toolExecutor.js         # AI tool executor
├── routes/
│   ├── zones.js                # GET /api/zones
│   ├── tiktok.js               # GET /api/tiktok/*
│   ├── dispatch.js             # GET /api/dispatch/*
│   ├── pending.js              # GET /api/pending
│   ├── jobs.js                 # GET /api/jobs, stuck, job-route, jobs-km
│   ├── orders.js               # GET /api/orders, batches, order-confirm-check
│   ├── riders.js               # GET /api/riders, live, rider-breaks
│   ├── performance.js          # GET /api/rider-performance
│   ├── diagnostics.js          # GET /api/job-diagnostics
│   ├── analytics.js            # GET /api/analytics/*
│   └── ai.js                   # POST /api/ai/chat
├── sync/
│   └── sheetsSync.js           # Auto-sync rider queue → Google Sheets
├── server.js
├── .env.example
└── README.md
```

---

## 🌐 API Endpoints

### TikTok MVP
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/zones` | Zone polygon list (deduplicated, prefer TIKTOK businessUnit) |
| GET | `/api/tiktok/live` | Zone polygons + rider positions — `?zoneName=` |
| GET | `/api/tiktok/riders` | Rider pool table — `?zoneName=` |
| GET | `/api/tiktok/pending` | Pending orders (Tiktok_Express) |
| GET | `/api/tiktok/jobs` | Jobs by date range — `?from=&to=&zoneName=` |
| GET | `/api/tiktok/performance` | Rider performance aggregation — `?from=&to=` |
| GET | `/api/tiktok/config` | Service config limits (batch/SLA/routeOpt/autoAssign/loadCapacity) |

### Dispatcher Tab
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dispatch/orders` | Pending orders + customer metadata — `?storeCode=` |
| GET | `/api/dispatch/eligible-riders` | Eligible riders — `?storeCode=` |
| POST | `/api/dispatch/reassign` | Log manual reassignment (audit trail) |
| GET | `/api/dispatch/activity-log` | Merged DB + session log — `?storeCode=&days=` |
| GET | `/api/dispatch/break-events` | Break history — `?userIds=` or `?storeCode=` |
| GET | `/api/dispatch/rider-performance` | Enhanced metrics (on-time, dist, break) — `?storeCode=&from=&to=` |

### Core (Lotus's — Phase 1–3)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pending` | Pending orders — `?storeCode=` |
| GET | `/api/jobs` | Jobs by date range — `?storeCode=&from=&to=` |
| GET | `/api/riders` | Rider pool + eligibility — `?storeCode=` |
| GET | `/api/live` | Real-time rider positions — `?storeCode=` |
| GET | `/api/rider-performance` | Job stats per rider — `?storeCode=&from=&to=` |
| GET | `/api/job-diagnostics` | Auto-assign round log (CLS) — `?jobId=&hours=` |
| GET | `/api/analytics/*` | Analytics endpoints (5 total) |
| POST | `/api/ai/chat` | AI chat with tool calling |

---

## 🌿 Git Branches

| Branch | สถานะ | รายละเอียด |
|--------|-------|-----------|
| `tiktok-mvp` | **Active** | TikTok MVP — zone-based dashboard ← current |
| `feature/phase3-analytics` | Stable | Lotus's Phase 3 — Analytics + AI Insight |
| `feature/phase2-ai-chat` | Stable | Lotus's Phase 2 — AI Chat น้องบอท |
| `main` | Stable | Lotus's Phase 1 — Core dashboard |

---

## 📝 Version History

| Version | Branch | Changes |
|---------|--------|---------|
| **4.0.0** | tiktok-mvp | **TikTok MVP**: Zone polygon map แทน storeCode; rider firstname label + GPS time; Config bar ใน Jobs; Job popup % bars vs limits (orders/weight/vol/dist); `/api/tiktok/*` endpoints 7 ตัว; `/api/dispatch/*` endpoints 6 ตัว |
| **3.0.0** | phase3-analytics | Analytics & Report Tab: KPI cards, hourly chart, demand forecast, rider score, AI Insight |
| **2.1.0** | phase2-ai-chat | AI Chat น้องบอท: function calling 13 tools |
| **1.7.0** | main | Diagnostic Assign Track: CLS log + assigned events |
| **1.0.0** | main | Initial release |
