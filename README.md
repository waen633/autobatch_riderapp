# 🚀 Lotus Auto-Batching Dashboard

> Dashboard สำหรับ monitor และจัดการกระบวนการ Auto-Batching, Rider Assignment และ Order Status แบบ Real-time

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.x-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## ✨ Features

### 📊 Dashboard Tab (Phase 1–2)

| ส่วน | รายละเอียด |
|------|-----------|
| 🗺️ **Live Rider Map** | แสดงตำแหน่ง Rider + Store แบบ Real-time บนแผนที่ กด **Get + Map** โหลดได้ทันที พร้อม collapse/fullscreen |
| 📦 **Pending Orders** | ดู Order ที่รอสร้าง Job พร้อม Waiting Duration แบบ Real-time |
| 🏍️ **Rider Pool** | สถานะ Rider ทุกคนในพื้นที่ พร้อม Idle Time และ Flags |
| 📋 **Jobs** | ค้นหา Job ตามช่วงเวลา ดู Rider / SLA / Status / Route และ **สลับ Order ID/Consignment** ได้ |
| 🔍 **Order Query** | ค้นหา Order ด้วย Consignment หรือ Order ID |
| 📦 **Batch Query** | ดูข้อมูล Batch ที่มี Order ID นั้น |
| 📊 **Store Performance** | Donut chart สรุปงานและ Workload Share ต่อ Rider แยกตามสาขา พร้อม collapse/expand |
| 🔄 **Auto-Refresh** | ตั้งเวลา refresh อัตโนมัติแยกต่อหัวข้อ (Off / 5 / 10 / 30 นาที) |
| 🔎 **Auto-Assign Diagnostic** | วิเคราะห์ทุกรอบ scan ของ job ว่าทำไมถึง assign ไม่ได้ — แสดงสถานะ rider แต่ละคน, ชื่อ rider ที่ assigned สำเร็จ, พร้อม pagination 10 รอบ/หน้า |
| ☕ **Break Log** | กดไอคอนกาแฟบน Rider → Modal แสดงประวัติ break ตาม date range ที่เลือก (จำนวนครั้ง, Start/End, Duration, Created At) |
| 🛠️ **UI/UX** | Fullscreen, collapse, Raw Data expand, Dual-language (TH/EN) |
| 🤖 **น้องบอท AI Chat** | Floating chat widget — ถามข้อมูลสาขา เช่น "pending มีเท่าไหร่", "job ค้างกี่อัน", "rider พร้อมรับงานกี่คน" — ใช้ function calling เรียก API จริง ไม่ตอบจากความจำ |

### 📈 Analytics & Report Tab (Phase 3)

| ส่วน | รายละเอียด |
|------|-----------|
| 📊 **KPI Cards** | เปรียบเทียบ today vs yesterday — Total Jobs, Completion Rate, SLA Breaches, Avg Pickup Lag พร้อม delta arrow |
| 🕐 **Hourly Demand Chart** | Bar chart แสดงปริมาณงานรายชั่วโมง — วันนี้ vs เมื่อวาน + เส้นคาดการณ์พรุ่งนี้ (สีม่วงประ) highlight peak (ส้ม) และช่วงรับงานช้า (แดง, lag > 15 นาที) |
| 🔮 **Demand Forecast** | คาดการณ์ job พรุ่งนี้รายชั่วโมง จาก avg 7 วันที่ผ่านมา แสดง total + peak hours |
| 👥 **Rider Performance Score** | Composite score 0–100 ต่อ rider (7 วัน) — `accept×0.4 + completion×0.4 - SLAbreach×0.2` — แสดง progress bar + recommendation |
| 📅 **Shift Planning** | แนะนำ rider ที่ควรพักจาก workload 7 วัน vs rider ที่เพิ่ม shift ได้ พร้อม estimated rider count พรุ่งนี้ |
| 📈 **Delivery Speed Trend** | Line chart 7 วัน + เส้น dash predictive พรุ่งนี้ (rolling avg 3 วัน) — แสดงทั้ง Pickup Lag และ Delivery Lag |
| 🤖 **AI Insight Panel** | วิเคราะห์อัตโนมัติ 3 ด้าน (peak hours → rider evaluation → trend & forecast) โหลดเมื่อเปิด tab + follow-up chat |

---

## 📊 Store Performance

หัวข้อใหม่แสดงสถิติแต่ละสาขาแบบ side-by-side กับ Live Map (Map 1/3 — Store Performance 2/3)

**แต่ละสาขามี 2 Donut chart:**

| Chart | รายละเอียด |
|-------|-----------|
| **Jobs Overview** | สัดส่วน job_active / job_delivered / job_cancelled / job_other |
| **Workload Share** | สัดส่วนงานของ Rider แต่ละคน เรียงมากไปน้อย |

- Pizza hover effect — ชิ้นส่วน pop-out พร้อม tooltip แสดงชื่อ + %
- Collapse/expand ต่อสาขา
- Rider name แสดงเป็นชื่อจริง (ตัด prefix `(LT)`, `[SVD]` และรหัสสาขาออก)

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB (`4pl-oms`, `4pl-fleet`, `lastmile`, `4pl-address-and-zoning`)
- **Frontend**: HTML / CSS / JavaScript (Vanilla) + **Leaflet.js** (Maps) + **Chart.js v4** (Bar, Line, Donut)
- **Libraries**: Bootstrap 5, flatpickr, chartjs-plugin-datalabels, googleapis
- **Auto-sync**: Google Sheets API — push rider queue ทุก 1 ชม. ตรง :00
- **AI**: OpenRouter API (claude-3-haiku) + Function Calling — tools 17 ตัว เรียก dashboard API จริง
- **Log Search**: Tencent Cloud CLS — job diagnostic log search (30 วัน)

---

## 📥 การติดตั้ง (Quick Start)

### 1. Clone โปรเจค
```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
```

### 2. ติดตั้ง Dependencies
```bash
npm install
```

### 3. สร้างไฟล์ `.env`
copy จาก `.env.example` แล้วใส่ค่าจริง:
```bash
cp .env.example .env
```

```env
# MongoDB
MONGO_URI=mongodb://user:pass@host:27017/...

# Tencent CLS (job diagnostics)
CLS_SECRET_ID=...
CLS_SECRET_KEY=...
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log
CLS_TOPIC_ID=...          # optional — auto-fetch จาก topic name

# AI Chat (Phase 2+)
OPENROUTER_API_KEY=...
AI_MODEL=anthropic/claude-3-haiku   # เปลี่ยน model ได้

# Google Sheets Auto-sync
SYNC_STORE_CODES=1104,5022,6403
GOOGLE_SHEET_ID=...
SYNC_SHEET_NAME=rider_queue
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ **สำคัญ**: ไฟล์ `.env` จะไม่ถูก push ขึ้น GitHub เพื่อความปลอดภัย ต้องสร้างเองทุกเครื่อง

### 4. รัน Server
```bash
# Development
npm start

# Production (PM2)
pm2 start server.js --name dashboard
```

เปิด Browser แล้วไปที่ **http://localhost:3000** 🎉

---

## 📁 โครงสร้างไฟล์

```
autobatch_riderapp/
├── public/
│   ├── index.html              # Frontend — Dashboard + Analytics tab (~4,200 lines)
│   └── route-viewer.html       # ระบบวาดแผนที่เส้นทาง (Leaflet)
├── lib/
│   ├── db.js                   # MongoDB client singleton
│   ├── helpers.js              # safeStr, splitCodes
│   ├── eligibility.js          # evalEligibility, buildMapUrl
│   ├── cls.js                  # Tencent CLS client (getClsClient, getClsTopicId)
│   ├── aiTools.js              # AI tool definitions (Phase 2+) — 17 tools
│   └── toolExecutor.js         # AI tool executor — เรียก dashboard API จริง
├── routes/
│   ├── pending.js              # GET /api/pending
│   ├── jobs.js                 # GET /api/jobs, stuck, job-route, jobs-km
│   ├── orders.js               # GET /api/orders, batches, order-confirm-check
│   ├── riders.js               # GET /api/riders, live, rider-breaks
│   ├── performance.js          # GET /api/rider-performance
│   ├── diagnostics.js          # GET /api/job-diagnostics (Tencent CLS)
│   ├── analytics.js            # GET /api/analytics/* (Phase 3) — 5 endpoints
│   └── ai.js                   # POST /api/ai/chat (Phase 2+) — OpenRouter + tools
├── sync/
│   └── sheetsSync.js           # Auto-sync rider queue → Google Sheets ทุก 1 ชม.
├── server.js                   # Express setup + mount routes
├── package.json
├── .env.example                # Template env vars
├── .env                        # ⚠️ ต้องสร้างเอง (ไม่อยู่ใน repo)
└── README.md
```

---

## 🌐 API Endpoints

### Dashboard APIs (Phase 1–2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pending` | ดึง Pending Orders — `?storeCode=` |
| GET | `/api/jobs` | ดึง Jobs ตามช่วงเวลา — `?storeCode=&from=&to=` |
| GET | `/api/stuck` | ดึง Stuck Jobs — `?storeCode=&from=&to=` |
| GET | `/api/job-route` | ดึง Route polyline ของ Job — `?jobId=` |
| GET | `/api/jobs-km` | ดึงระยะทาง (km) ของ Job — `?jobId=` |
| GET | `/api/riders` | ดึงสถานะ Rider Pool + Eligibility flags — `?storeCode=` |
| GET | `/api/live` | ดึงตำแหน่ง Rider + Store สำหรับ Live Map — `?storeCode=` |
| GET | `/api/rider-performance` | ดึง Store Performance (Jobs + Workload Share per Rider) — `?storeCode=&from=&to=` |
| GET | `/api/job-diagnostics` | Auto-Assign Diagnostic log จาก Tencent CLS — `?jobId=&hours=` (default 720h) return `rounds[]`, `assignedEvent`, `assignedEvents[]` |
| GET | `/api/orders` | ค้นหา Order — `?type=consignment\|orderid&values=` |
| GET | `/api/batches` | ค้นหา Batch — `?type=&values=` |
| GET | `/api/order-confirm-check` | เช็ค CLS log ว่าลูกค้ายืนยันสินค้าหรือยัง — `?orderId=` (internalOrderId) |
| GET | `/api/rider-breaks` | ประวัติ Break ของ Rider — `?userId=&from=&to=` จาก `4pl-fleet.riderbreaklogs` |
| POST | `/api/ai/chat` | AI Chat — `{ message, storeCode, history[] }` return `{ answer, toolsUsed[], debugData[] }` |

### Analytics APIs (Phase 3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/daily-summary` | KPI วันนี้ vs เมื่อวาน — `?storeCode=` return `{ today, yesterday, delta }` |
| GET | `/api/analytics/hourly` | ปริมาณงานรายชั่วโมง — `?storeCode=&from=&to=` return 24 buckets + `isPeak`, `isSlowPickup` |
| GET | `/api/analytics/rider-score` | Composite score ต่อ rider (7 วัน default) — `?storeCode=&from=&to=` return `score`, `recommendation` |
| GET | `/api/analytics/delivery-speed` | Pickup + delivery lag trend — `?storeCode=&days=` (default 7) + predictive rolling avg |
| GET | `/api/analytics/demand-forecast` | คาดการณ์ job พรุ่งนี้รายชั่วโมง — `?storeCode=&days=` (avg N วันที่ผ่านมา) |

---

## 🔧 Dev TODO — สิ่งที่ยังต้องทำ

รายการนี้มาจากการวิเคราะห์เคสที่ L1 Support พบบ่อย + แผนพัฒนาต่อ

| Priority | Feature | รายละเอียด |
|----------|---------|-----------|
| 🔴 High | **Rider Ban History** | `GET /api/rider-ban-history?userId=&from=&to=` — ดูว่า rider ถูก ban กี่ครั้ง ช่วงไหน เพราะ reject job ไหน (ข้อมูลใน `4pl-fleet`) |
| 🔴 High | **Job Cancel Reason** | เพิ่ม field `cancelReason` ใน `/api/jobs` — ตอนนี้รู้แค่ `job_cancelled` แต่ไม่รู้สาเหตุ (`no_rider` / `customer_cancel` / `sla_exceeded`) |
| 🟡 Medium | **Store Performance AI Tool** | เพิ่ม tool `get_store_performance` ใน `lib/aiTools.js` — AI ยังตอบเรื่อง accept rate / workload share ไม่ได้ |
| 🟡 Medium | **Rider Shift Calendar** | UI ปฏิทิน shift ต่อ rider แสดง 7 วัน — อิงจาก `staffshifts` collection ใน `4pl-fleet` |
| 🟢 Low | **Multi-store Analytics Compare** | เปรียบเทียบ KPI ข้ามสาขา side-by-side ใน Analytics tab |

> ทุกรายการไม่กระทบ production — เพิ่มเป็น read-only endpoint / UI ได้เลย

---

## 📊 Google Sheets Auto-sync

ระบบ push ข้อมูล Rider Queue ขึ้น Google Sheets อัตโนมัติ **ทุก 1 ชั่วโมงที่ :00**

- แยก tab ต่อ Store (`Store 1104`, `Store 5022`, `Store 6403`)
- แสดง `🕐 Updated:` timestamp ที่ row บนสุดของแต่ละ tab
- Columns: ลำดับคิว, ชื่อ Rider, พร้อม Auto-Assign, ไม่โดน Ban, ไม่มีงานในมือ, ไม่ได้พัก, Job ปัจจุบัน, สถานะ Job, แผนที่

---

## 📅 Date Range Picker

- เลือกวันเริ่มต้น **อิสระ** (ไม่จำกัดปี)
- กด **Reset** → clear ทั้ง From/To ออก พร้อมลบ limit ทั้งหมด
- ช่วงสูงสุด **7 วัน** (To ถูกล็อคอัตโนมัติหลังจากเลือก From)
- Preset: **Today**, **3 Days**, **7 Days**

---

## 🖥️ Requirements

- **Node.js** v18 หรือใหม่กว่า → [ดาวน์โหลดที่นี่](https://nodejs.org/)
- **MongoDB** Connection URI (ติดต่อผู้ดูแลระบบ)

---

## 🌿 Git Branches

| Branch | Version | สถานะ |
|--------|---------|-------|
| `main` | 1.7.0 | Production stable — Dashboard เต็มรูปแบบ ไม่มี AI |
| `feature/phase2-ai-chat` | 2.1.0 | Phase 2 — เพิ่ม AI Chat น้องบอท (function calling) |
| `feature/phase3-analytics` | 3.0.0 | Phase 3 — เพิ่ม Analytics & Report tab (current) |

---

## 📝 Version History

| Version | Branch | Changes |
|---------|--------|---------|
| **3.0.0** | phase3-analytics | **Analytics & Report Tab**: Tab navigation แยก Dashboard / Analytics; KPI cards today vs yesterday; Hourly bar chart + tomorrow forecast (สีม่วง); Demand forecast รายชั่วโมง (avg 7 วัน); Rider score 7 วัน + shift planning (ใครควรพัก/เพิ่ม shift); Delivery speed trend 7 วัน + predictive dash; AI Insight panel auto-load 3 ด้าน + follow-up chat; 5 analytics API endpoints; AI tools 14-17 |
| **2.1.0** | phase2-ai-chat | **AI Chat น้องบอท**: Floating chat widget, function calling 13 tools เรียก dashboard API จริง, eligibility source of truth = `eligible:true`, system prompt กระชับ ≤4 บรรทัด, async job timeline แสดงชื่อ rider + badge "ไม่รับงาน", diagnostic assign track ทุกรอบ |
| **1.7.0** | main | **Diagnostic Assign Track**: ดึง assigned events ทุกรอบ, แสดงชื่อ rider ที่ assign + reject, CLS log range 720h, แยก query assigned/rounds |
| **1.6.0** | main | **Break Log Modal**: ☕ icon → modal ประวัติ break; API `/api/rider-breaks`; `lib/cls.js` Tencent CLS |
| **1.5.0** | main | **Refactor + Google Sheets Sync**: แยก lib/routes/sync, push rider queue → Sheets ทุก 1 ชม. |
| **1.4.0** | main | **Auto-Assign Diagnostic**: modal วิเคราะห์รอบ scan, pagination, API `/api/job-diagnostics` |
| **1.3.0** | main | **Store Performance**: Donut 2 ชุด, Auto-Refresh dropdown, Date picker reset |
| **1.2.0** | main | Rider Performance table, Accept/Cancel Rate |
| **1.1.0** | main | Live Rider Map, See Route modal, API `/api/live` |
| **1.0.0** | main | Initial release |
