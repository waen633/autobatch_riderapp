# คู่มือจัดการ User — Autobatch Dashboard

## Overview ระบบ

```
Keycloak (port 8080)  →  สร้าง User / กำหนด Role
Dashboard Admin Panel →  assign สาขา + เปิด/ปิด Feature ต่อ User
```

- **Keycloak** จัดการ: login, password, role (admin / user)
- **Dashboard → ปุ่ม Users** จัดการ: สาขาที่เข้าได้, เมนูที่เห็น

---

## ส่วนที่ 1 — เพิ่ม User ใหม่ใน Keycloak

### 1. เปิด Keycloak Admin Console
```
http://localhost:8080
```
Login ด้วย `admin` / `admin`

### 2. เลือก Realm ให้ถูก
- มุมบนซ้าย dropdown เลือก **`autobatch`**
- (ถ้าเลือก `master` จะแก้ผิด realm)

### 3. สร้าง User ใหม่
1. เมนูซ้าย → **Users** → **Create user**
2. กรอก:
   - **Username**: ชื่อ login เช่น `komet.store1104`
   - **Email**: อีเมลจริง
   - **First name / Last name**: ชื่อที่จะแสดงใน dashboard
3. คลิก **Create**

### 4. ตั้ง Password
1. Tab **Credentials** → **Set password**
2. กรอก Password → ปิด **Temporary** (ถ้าไม่ต้องการให้เปลี่ยนตอน login ครั้งแรก)
3. คลิก **Save password**

### 5. กำหนด Role
1. Tab **Role mapping** → **Assign role**
2. เลือก:
   - `admin` → สำหรับ Ops Lead / ผู้ดูแลระบบ (เห็นทุกเมนู, จัดการ user ได้)
   - `user` → สำหรับ Staff ทั่วไป (เห็นเฉพาะที่ admin อนุญาต)
3. คลิก **Assign**

---

## ส่วนที่ 2 — กำหนดสาขาและเมนูให้ User

หลัง User login ครั้งแรกแล้ว ให้ทำขั้นตอนนี้:

### 1. Login เข้า Dashboard ด้วย Account Admin
```
http://localhost:3000
```
Login ด้วย `dashboard-admin` / `Admin@1234`

### 2. เปิด User Management
- Navbar → ปุ่ม **Users** (เห็นเฉพาะ admin)

### 3. กด Refresh เพื่อโหลดรายชื่อ

> User จะปรากฏในรายการ **หลังจาก login เข้า dashboard ครั้งแรกเท่านั้น**
> ถ้ายังไม่เห็น → บอก user ให้ login ก่อน แล้วค่อย refresh

### 4. ตั้งค่าสาขา (Allowed Stores)
- ช่อง **Allowed Stores** → ใส่รหัสสาขาที่อนุญาต
- หลายสาขาคั่นด้วย `,` เช่น `1104,5022,6403`
- ใส่ `*` = อนุญาตทุกสาขา (เหมาะกับ admin เท่านั้น)
- เว้นว่าง = ยังไม่ได้ assign (user จะเข้าไม่ได้)

### 5. เปิด/ปิด Feature (Feature Flags)
เลือก checkbox ที่ต้องการให้ user เห็น:

| Feature | คืออะไร |
|---------|---------|
| Tab: Dashboard | หน้าหลัก dashboard |
| Tab: Analytics | หน้า Analytics & Report |
| Pending Orders | card Pending Orders |
| Rider Pool | card Rider Pool |
| Jobs | card Jobs |
| Stuck Jobs | card Stuck Jobs |
| Order Query | card ค้นหา Order |
| Batch Query | card ค้นหา Batch |
| AI Chat | ปุ่มน้องบอท (AI Chat) |
| Live Map | แผนที่ rider live |

### 6. กด Save
- กด **Save** ที่แถวของ user นั้น
- มีผลทันที — user ต้อง logout แล้ว login ใหม่เพื่อเห็นการเปลี่ยนแปลง

---

## ตารางสรุป Role vs สิทธิ์

| สิ่งที่ทำได้ | admin | user |
|------------|:-----:|:----:|
| เห็นปุ่ม 🛡 Admin Settings | ✅ | ❌ |
| เห็นปุ่ม Users (จัดการ user) | ✅ | ❌ |
| กรอก Store Code เองได้ | ✅ | ❌ |
| เปลี่ยนสาขาได้ | ✅ | ❌ ล็อคตาม assign |
| เข้าได้ทุก API | ✅ | เฉพาะสาขาที่ assign |

---

## แก้ไข / Reset Password

1. Keycloak → **Users** → ค้นหา user
2. Tab **Credentials** → **Reset password**

---

## ลบ User

- Keycloak → **Users** → คลิก user → **Action** → **Delete**
- (ไม่ต้องลบใน Dashboard — จะหายเองเมื่อ token หมดอายุ)

---

## Accounts เริ่มต้น (Dev/Test)

| Username | Password | Role | สาขา |
|----------|----------|------|------|
| `dashboard-admin` | `Admin@1234` | admin | ทุกสาขา (*) |
| `dashboard-user` | `User@1234` | user | 1104 |

> ⚠️ เปลี่ยน password ก่อนใช้งาน production
