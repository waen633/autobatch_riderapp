# 🚀 Lotus Auto-Batching Dashboard

> Dashboard สำหรับ monitor และจัดการกระบวนการ Auto-Batching, Rider Assignment และ Order Status แบบ Real-time

![Version](https://img.shields.io/badge/version-1.4.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.x-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## ✨ Features

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
| 🛠️ **UI/UX** | Fullscreen, collapse, Raw Data expand, Dual-language (TH/EN) |

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
- **Frontend**: HTML / CSS / JavaScript (Vanilla) + **Leaflet.js** (Maps) + **Chart.js v4** (Donuts)
- **Libraries**: Bootstrap 5, flatpickr, chartjs-plugin-datalabels, googleapis
- **Auto-sync**: Google Sheets API — push rider queue ทุก 1 ชม. ตรง :00

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
CLS_TOPIC_ID=...

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
│   ├── index.html              # Frontend Dashboard หลัก
│   └── route-viewer.html       # ระบบวาดแผนที่เส้นทาง (Leaflet)
├── lib/
│   ├── db.js                   # MongoDB client singleton
│   ├── helpers.js              # safeStr, splitCodes
│   └── eligibility.js          # evalEligibility, buildMapUrl
├── routes/
│   ├── pending.js              # GET /api/pending
│   ├── jobs.js                 # GET /api/jobs, stuck, job-route, jobs-km
│   ├── orders.js               # GET /api/orders, batches
│   ├── riders.js               # GET /api/riders, live
│   ├── performance.js          # GET /api/rider-performance
│   └── diagnostics.js          # GET /api/job-diagnostics (Tencent CLS)
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

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pending` | ดึง Pending Orders |
| GET | `/api/jobs` | ดึง Jobs ตามช่วงเวลา |
| GET | `/api/stuck` | ดึง Stuck Jobs |
| GET | `/api/job-route` | ดึง Route ของ Job |
| GET | `/api/jobs-km` | ดึงระยะทาง (km) ของ Job |
| GET | `/api/riders` | ดึงสถานะ Rider Pool + Eligibility |
| GET | `/api/live` | ดึงตำแหน่ง Rider + Store สำหรับ Live Map |
| GET | `/api/rider-performance` | ดึงข้อมูล Store Performance (Jobs + Workload Share per Rider) |
| GET | `/api/job-diagnostics` | ดึง Auto-Assign Diagnostic log จาก Tencent CLS (`?jobId=`, `?hours=`) |
| GET | `/api/orders` | ค้นหา Order |
| GET | `/api/batches` | ค้นหา Batch |

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

## 📝 Version History

| Version | Changes |
|---------|---------|
| 1.5.0 | **Refactor + Google Sheets Sync**: แยก `server.js` เป็น `lib/`, `routes/`, `sync/` — เพิ่ม `sync/sheetsSync.js` push rider queue ขึ้น Google Sheets แยก tab ต่อ Store ทุก 1 ชม. ตรง :00 |
| 1.4.0 | เพิ่ม **Auto-Assign Diagnostic**: ปุ่ม 📋 ใน column SEE ROUTE เปิด modal วิเคราะห์รอบ scan ทั้งหมดของ job, แสดงสถานะ rider แต่ละคน (not_in_pool / offline / shift_inactive / on_break), แสดงชื่อ rider ที่ assigned สำเร็จ (ดึงจาก DB), pagination 10 รอบ/หน้า พร้อม dropdown เลือกหน้า + ปุ่มหน้าแรก/สุดท้าย; เพิ่ม API `/api/job-diagnostics` (Tencent CLS); install `tencentcloud-sdk-nodejs-cls` |
| 1.3.0 | เพิ่ม **Store Performance**: Donut 2 ชุดต่อสาขา (Jobs Overview + Workload Share), layout Map 1/3 / Store Perf 2/3, pizza hover effect, collapse/expand ต่อสาขา; เพิ่ม **Auto-Refresh** dropdown 4 sections; Date picker reset ล้างวันได้อิสระ + 7-day max cap; แก้ Rider name ตัด prefix (LT)/(SVD); เปลี่ยน label เป็น job status จริง |
| 1.2.0 | เพิ่ม API `/api/riderperf`; Rider Performance table แยกตามสาขา; แสดง Accept Rate / Cancel Rate bar |
| 1.1.0 | เพิ่ม **Live Rider Map**: แสดง Rider/Store บนแผนที่แบบ Real-time, ไอคอนมอเตอร์ไซต์สีตาม Store, status dot บอกสถานะ Job; เปลี่ยน "See Route" ใน Jobs เป็น modal popup แทนเปิดหน้าใหม่; เพิ่ม API `/api/live` |
| 1.0.5 | ปรับปรุงระบบค้นหา Order: รองรับการใส่หลายรายการพร้อมกัน (สูงสุด 50), เพิ่มสถานะ "No data" สำหรับรายการที่ไม่พบ, และแยกปุ่ม "See Route" (Jobs) กับ "Location" (Order Query) |
| 1.0.4 | ปรับปรุงระบบ Fullscreen: ปิดได้ด้วยการคลิกด้านนอก และเปลี่ยนไอคอนเป็น X เมื่อขยาย |
| 1.0.3 | เพิ่ม Route Viewer (แผนที่), ระบบสลับ Order ID/Consignment ใน Jobs, ปรับปรุง UI ปุ่มดู Raw Data |
| 1.0.2 | เพิ่ม Waiting Duration ใน Pending Orders, Export CSV, Status Timeline |
| 1.0.1 | เพิ่ม Dual-language (TH/EN), Color-coded Timeline |
| 1.0.0 | Initial release |
