# ประเมินราคา & Man-day: Lotus Auto-Batching Dashboard

> **หมายเหตุ:** ราคาที่ประเมินนี้อ้างอิงจาก Market Rate ของ Freelance / Software House ในไทย (ระดับ Mid-Senior Developer)
> ปรับ Rate ได้ตามนโยบายของทีม

---

## ส่วนที่ 1: งานที่ทำไปแล้ว (Current Build Estimation)

### 1.1 สรุปสิ่งที่ระบบทำได้

| Feature | รายละเอียด |
|---|---|
| Backend API | Node.js + Express เชื่อมต่อ MongoDB 6 Endpoints |
| Pending Orders | ดึงออเดอร์รอ Job พร้อม Filter / Pagination |
| Rider Pool | แสดง Rider สถานะ Real-time + Idle Time + Map Link |
| Jobs History | ดึง Job ตามช่วงเวลา + Filter Status + Export CSV |
| Order Query | ค้นหาด้วย Consignment/Order ID + Status Timeline Modal |
| Batch Query | ค้นหา Batch ด้วย Order ID |
| Status Timeline | Modal แสดงประวัติสถานะ พร้อม Duration คำนวณ + สีแยก Pickup/Delivery |
| UI/UX | Dark Mode, Responsive, i18n (TH/EN), Column Selector, Fullscreen Mode |
| Input History | จดจำค่าที่เคยกรอกใน Store Code และ Order Query (3 รายการ) |
| Button Cooldown | ป้องกัน Spam Request 3 วินาที |
| Date Validation | จำกัดช่วงวันไม่เกิน 7 วัน |
| Documentation | API Security Spec + System Architecture Plan |

### 1.2 Man-day Breakdown (งานที่ทำไปแล้ว)

| งาน | Man-day |
|---|---|
| วิเคราะห์ระบบ / ศึกษา Business Logic | 1.5 |
| Setup Project (Node.js, Express, MongoDB, .env) | 0.5 |
| Backend API: Pending, Riders, Jobs, Orders, Batches | 3.0 |
| Frontend Foundation (Layout, CSS, Design System, Dark Mode) | 2.0 |
| Table Engine (Sort, Filter, Pagination, Column Selector) | 2.5 |
| Status Timeline Modal + Duration + Color Coding | 1.5 |
| i18n System (TH/EN Toggle) | 0.5 |
| Rider Performance Panel | 0.5 |
| Job Dashboard Summary Bar | 0.5 |
| Date Picker + 7-day Validation + flatpickr | 1.0 |
| Export CSV (Jobs) | 0.5 |
| Input History (localStorage) | 0.5 |
| Button Cooldown / UX Micro-interaction | 0.5 |
| Fullscreen Toggle | 0.5 |
| Testing / Bug Fix / Polish | 2.0 |
| Documentation (API Spec + Architecture Plan) | 1.0 |
| Git Setup + Version Control | 0.5 |
| **รวม** | **19.5 Man-day** |

### 1.3 ราคาประเมิน (Current Build)

| ระดับ Developer | Day Rate | ราคารวม |
|---|---|---|
| Junior Dev | ฿2,000/day | ฿39,000 |
| Mid Dev | ฿3,500/day | **฿68,250** |
| Senior Dev | ฿5,000/day | ฿97,500 |
| Software House (บวก Overhead) | ฿6,000–8,000/day | ฿117,000–฿156,000 |

> **ราคาที่แนะนำ (Mid-Senior, Freelance):** ประมาณ **฿65,000 – ฿85,000**
> **ราคา Software House :** ประมาณ **฿120,000 – ฿160,000**

---

## ส่วนที่ 2: Feature เพิ่มเติมที่วางแผนไว้ (Future Features)

### 2.1 ระบบ Login + Multi-Branch + RBAC

| งาน | Man-day |
|---|---|
| User DB Schema + bcrypt Password | 1.0 |
| POST /auth/login + JWT Issuance | 1.5 |
| Auth Middleware (Token Validation) | 1.0 |
| Refresh Token + HttpOnly Cookie | 1.0 |
| Redis Setup (Cache + Token Blacklist) | 1.5 |
| Rate Limiting (express-rate-limit) | 0.5 |
| Branch Scope Enforcement (RBAC Logic) | 2.0 |
| Admin Panel (Create/Edit User, Assign Store) | 3.0 |
| Frontend: Login Page + Route Guard | 2.0 |
| Frontend: Role-based UI (ซ่อน/แสดง Section) | 1.5 |
| Audit Log System | 1.0 |
| MongoDB Index Optimization | 0.5 |
| Server-side Pagination (ย้ายจาก Client) | 1.5 |
| Testing + Security Review | 2.0 |
| **รวม Phase นี้** | **20.5 Man-day** |

**ราคาประเมิน Phase 2:** ฿72,000 – ฿103,000 (Mid-Senior)

---

## ส่วนที่ 3: ราคารวมทั้งโปรเจกต์ (Full Build)

| Phase | Man-day | ราคา (Mid-Senior) |
|---|---|---|
| Phase 1: Dashboard ปัจจุบัน | 19.5 | ฿68,250 |
| Phase 2: Login + RBAC + Performance | 20.5 | ฿71,750 |
| **รวมทั้งโปรเจกต์** | **40 Man-day** | **฿140,000** |
| **Software House (บวก Margin 40-60%)** | - | **฿200,000 – ฿250,000** |

---

## ส่วนที่ 4: ค่า MA และซ่อม Bug (Maintenance & Support)

### 4.1 โครงสร้างค่า MA แนะนำ

#### Option A: ค่า Retainer รายเดือน (Monthly Package)

| Package | ชั่วโมง/เดือน | ครอบคลุม | ราคา/เดือน |
|---|---|---|---|
| Basic | 8 ชม./เดือน | Bug Fix เร่งด่วน | ฿6,000 – ฿8,000 |
| Standard | 20 ชม./เดือน | Bug Fix + Minor Feature + Update | ฿14,000 – ฿18,000 |
| Premium | 40 ชม./เดือน | ครบทุกอย่าง + Priority Support | ฿26,000 – ฿32,000 |

#### Option B: คิดตาม Ticket / แจ้ง Incident

| ประเภทงาน | ราคา | SLA |
|---|---|---|
| Critical Bug (ระบบล่ม, ใช้งานไม่ได้) | ฿2,000 – ฿3,000 | แก้ภายใน 4 ชม. |
| Major Bug (Feature ใช้งานผิดพลาด) | ฿1,500 – ฿2,000 | แก้ภายใน 1 วันทำการ |
| Minor Bug / UI Tweak | ฿500 – ฿1,000 | แก้ภายใน 3 วันทำการ |
| เพิ่ม Feature เล็ก (< 4 ชม.) | ฿3,000 – ฿5,000 | ตาม Scope |
| เพิ่ม Feature กลาง (4–16 ชม.) | ฿8,000 – ฿20,000 | ตาม Scope |
| เพิ่ม Feature ใหญ่ (> 16 ชม.) | คิดตาม Man-day | ทำ Quotation แยก |

### 4.2 สิ่งที่ต้องระบุในสัญญา MA

1. **ขอบเขตของ Bug:** นับเฉพาะ Bug ที่เกิดจาก Code ที่ทำ ไม่รวม Bug จาก Third-party API / MongoDB หรือ Infrastructure ที่ลูกค้าดูแลเอง
2. **SLA Response Time:** ระบุชัดเจนว่าตอบภายในกี่ชั่วโมง ทำงานวันไหนบ้าง
3. **Change Request ≠ Bug Fix:** ถ้าลูกค้าขอเปลี่ยน Business Logic = คิดเพิ่ม
4. **Version Lock:** ระบุ Node.js version, MongoDB version ที่ Support อยู่
5. **Backup & Uptime:** MA นี้ครอบคลุม Code เท่านั้น ไม่รวม Server Uptime

---

## สรุปสำหรับ Pitch / Proposal

```
┌─────────────────────────────────────────────────────────┐
│              ราคาแนะนำสำหรับ Proposal                   │
│                                                         │
│  📦 Phase 1 (Dashboard ที่ทำแล้ว)                       │
│     Freelance:       ฿65,000 – ฿85,000                  │
│     Software House:  ฿120,000 – ฿160,000                │
│                                                         │
│  🔐 Phase 2 (Login + RBAC + Performance)                │
│     Freelance:       ฿70,000 – ฿105,000                 │
│     Software House:  ฿130,000 – ฿175,000                │
│                                                         │
│  🔧 MA รายเดือน (แนะนำ Standard Package)               │
│     ฿14,000 – ฿18,000/เดือน                            │
│                                                         │
│  💰 Full Package (Phase1 + Phase2 + MA 1 ปี)            │
│     ฿350,000 – ฿500,000                                 │
└─────────────────────────────────────────────────────────┘
```

> **Tip สำหรับ Negotiate:** ถ้าลูกค้าต่อราคา ให้ตัด Scope ออกก่อน เช่น Phase 2 ทำแค่ Login + RBAC แต่ยังไม่ทำ Audit Log หรือ Admin Panel เต็มรูปแบบ แทนที่จะลดราคา
