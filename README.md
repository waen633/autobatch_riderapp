# 🚀 Lotus Auto-Batching Dashboard

> Dashboard สำหรับ monitor และจัดการกระบวนการ Auto-Batching, Rider Assignment และ Order Status แบบ Real-time

![Version](https://img.shields.io/badge/version-1.1.0-blue)
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
| 🛠️ **UI/UX** | Fullscreen, collapse, Raw Data expand, Dual-language (TH/EN) |

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB
- **Frontend**: HTML / CSS / JavaScript (Vanilla) + **Leaflet.js** (Maps)

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
สร้างไฟล์ `.env` ที่ root ของโปรเจค แล้วใส่:
```env
MONGO_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/your-db
PORT=3000
```

> ⚠️ **สำคัญ**: ไฟล์ `.env` จะไม่ถูก push ขึ้น GitHub เพื่อความปลอดภัย ต้องสร้างเองทุกเครื่อง

### 4. รัน Server
```bash
npm start
```

เปิด Browser แล้วไปที่ **http://localhost:3000** 🎉

---

## 📁 โครงสร้างไฟล์

```
autobatch_riderapp/
├── public/
│   ├── index.html          # Frontend Dashboard หลัก
│   └── route-viewer.html   # ระบบวาดแผนที่เส้นทาง (Leaflet)
├── server.js               # Backend API (Express)
├── package.json
├── .env                    # ⚠️ ต้องสร้างเอง (ไม่อยู่ใน repo)
└── README.md
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pending` | ดึง Pending Orders |
| GET | `/api/jobs` | ดึง Jobs ตามช่วงเวลา |
| GET | `/api/riders` | ดึงสถานะ Rider Pool |
| GET | `/api/live` | ดึงตำแหน่ง Rider + Store สำหรับ Live Map |
| GET | `/api/orders` | ค้นหา Order |
| GET | `/api/batches` | ค้นหา Batch |

---

## 🖥️ Requirements

- **Node.js** v18 หรือใหม่กว่า → [ดาวน์โหลดที่นี่](https://nodejs.org/)
- **MongoDB** Connection URI (ติดต่อผู้ดูแลระบบ)

---

## 📝 Version History

| Version | Changes |
|---------|---------|
| 1.1.0 | เพิ่ม **Live Rider Map**: แสดง Rider/Store บนแผนที่แบบ Real-time, ไอคอนมอเตอร์ไซต์สีตาม Store, status dot บอกสถานะ Job; เปลี่ยน "See Route" ใน Jobs เป็น modal popup แทนเปิดหน้าใหม่; เพิ่ม API `/api/live` |
| 1.0.5 | ปรับปรุงระบบค้นหา Order: รองรับการใส่หลายรายการพร้อมกัน (สูงสุด 50), เพิ่มสถานะ "No data" สำหรับรายการที่ไม่พบ, และแยกปุ่ม "See Route" (Jobs) กับ "Location" (Order Query) |
| 1.0.4 | ปรับปรุงระบบ Fullscreen: ปิดได้ด้วยการคลิกด้านนอก และเปลี่ยนไอคอนเป็น X เมื่อขยาย |
| 1.0.3 | เพิ่ม Route Viewer (แผนที่), ระบบสลับ Order ID/Consignment ใน Jobs, ปรับปรุง UI ปุ่มดู Raw Data |
| 1.0.2 | เพิ่ม Waiting Duration ใน Pending Orders, Export CSV, Status Timeline |
| 1.0.1 | เพิ่ม Dual-language (TH/EN), Color-coded Timeline |
| 1.0.0 | Initial release |
