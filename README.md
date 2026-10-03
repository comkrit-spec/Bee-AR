# ระบบบันทึกข้อมูลหน้างาน

หน้าเว็บโฮสต์บน **GitHub Pages** และเก็บข้อมูลใน **Google Sheet ผ่าน Google Apps Script (GAS)**

```
field-app/
├── index.html              หน้าแอปทั้งหมด (HTML + CSS + JS)
├── sw.js                   Service worker: เปิดแอปได้แม้ออฟไลน์
├── manifest.webmanifest    ข้อมูลสำหรับติดตั้งเป็นแอปบนมือถือ
├── icon.svg, icon-*.png    ไอคอนแอป
├── .nojekyll               ให้ GitHub Pages เสิร์ฟไฟล์ตรง ๆ
└── gas/
    ├── Code.gs             ฐานข้อมูลและ API (วางใน Apps Script)
    └── appsscript.json     การตั้งค่าโปรเจกต์ Apps Script
```

---

## ขั้นที่ 1: ตั้งฐานข้อมูลบน Google Apps Script

1. สร้าง Google Sheet ใหม่ (หรือใช้ไฟล์เดิม) แล้วไปที่ **ส่วนขยาย > Apps Script**
2. ลบโค้ดเดิมใน `Code.gs` แล้ววางโค้ดจาก `gas/Code.gs` ทั้งไฟล์ กดบันทึก
3. (แนะนำ) ไปที่ **Project Settings** ⚙️ เลือก *Show "appsscript.json" manifest file in editor*
   แล้ววางเนื้อหาจาก `gas/appsscript.json` เพื่อตั้งเขตเวลาเป็น `Asia/Bangkok`
4. เลือกฟังก์ชัน `setup` ที่แถบด้านบน แล้วกด **Run** หนึ่งครั้ง
   กดอนุญาตสิทธิ์ (Sheet, Drive) ระบบจะสร้างชีตชื่อ **Records** และโฟลเดอร์เก็บรูปใน Drive
5. กด **Deploy > New deployment** เลือกประเภท **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. คัดลอก **Web app URL** ที่ลงท้ายด้วย `/exec`
7. ทดสอบโดยเปิด URL นั้นในเบราว์เซอร์ ต้องเห็น `{"status":"ok","message":"API ระบบหน้างานพร้อมใช้งาน",...}`

> **อัปเดตโค้ด Apps Script ภายหลัง:** ใช้ **Deploy > Manage deployments > ✏️ Edit > Version: New version**
> URL จะเหมือนเดิม ไม่ต้องแก้หน้าเว็บ (ถ้ากด *New deployment* จะได้ URL ใหม่)

### ตั้งค่าเสริม (ไม่บังคับ)

ไปที่ **Project Settings > Script properties > Add script property**

| Property | ใช้ทำอะไร |
|---|---|
| `ADMIN_PIN` | PIN สำหรับแก้ไข/ลบรายการ (ตรวจที่เซิร์ฟเวอร์) |
| `LINE_CHANNEL_TOKEN` | Channel access token ของ LINE Messaging API สำหรับส่งสรุปรายวัน |
| `LINE_REGISTER_CODE` | รหัสลับสำหรับคำสั่ง `ลงทะเบียน <รหัส>` ในกลุ่ม LINE |

---

## ขั้นที่ 2: ใส่ URL ลงในหน้าเว็บ

เปิด `index.html` ค้นหา `DEFAULT_SCRIPT_URL` แล้ววาง URL จากขั้นที่ 1:

```js
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfy..../exec';
```

ทุกเครื่องที่เปิดแอปจะเชื่อมกับ Sheet ได้ทันทีโดยไม่ต้องตั้งค่าเอง
(ถ้าเว้นว่างไว้ ผู้ใช้แต่ละคนต้องวาง URL เองที่ปุ่ม ⚙️)

---

## ขั้นที่ 3: เผยแพร่บน GitHub Pages

1. สร้าง repository ใหม่บน GitHub เช่น `field-app` (เลือก Public)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไปที่ root ของ repo
   (บนเว็บ: **Add file > Upload files** แล้วลากทั้งโฟลเดอร์ลงไป)
   > ไฟล์ `.nojekyll` เป็นไฟล์ซ่อน ถ้าลากแล้วไม่ติดไป ให้สร้างเองด้วย **Add file > Create new file** ตั้งชื่อ `.nojekyll` เว้นเนื้อหาว่าง
3. ไปที่ **Settings > Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** แล้วกด Save
4. รอ 1–2 นาที แอปจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/field-app/`

### อัปเดตหน้าเว็บภายหลัง

แก้ไฟล์แล้วอัปโหลดทับ และ **เปลี่ยนเลขเวอร์ชันใน `sw.js`** ทุกครั้ง เช่น

```js
const CACHE = 'field-app-v5-3';
```

ไม่อย่างนั้นเครื่องที่ติดตั้งแอปไว้อาจยังใช้ไฟล์เก่าอยู่

---

## ขั้นที่ 4 (ไม่บังคับ): สรุปรายวันเข้ากลุ่ม LINE

1. สร้าง **Messaging API channel** ที่ [developers.line.biz](https://developers.line.biz/) แล้วคัดลอก *Channel access token* ไปใส่ใน `LINE_CHANNEL_TOKEN`
2. ตั้ง **Webhook URL** เป็น Web app URL จากขั้นที่ 1 เปิด *Use webhook* และ *Allow bot to join group chats*
3. เชิญบอทเข้ากลุ่ม แล้วพิมพ์ `ลงทะเบียน` (หรือ `ลงทะเบียน <LINE_REGISTER_CODE>`)
4. กลับไปที่ Apps Script แล้ว Run ฟังก์ชัน `setupDailySummaryTrigger` หนึ่งครั้ง
   ระบบจะส่งสรุปทุกวันเวลา 19:00 และพิมพ์ `สรุป` ในกลุ่มเพื่อดูได้ทุกเมื่อ

---

## ใช้ Dashboard ด้วย Looker Studio (ไม่บังคับ)

ไปที่ [lookerstudio.google.com](https://lookerstudio.google.com/) > สร้างรายงาน > เลือก **Google Sheets** > เลือกไฟล์และชีต **Records**

---

## หมายเหตุด้านความปลอดภัย

- `Code.gs` ไม่มีรหัสลับใด ๆ อยู่ในโค้ด รหัสทั้งหมดเก็บใน Script properties จึงเก็บไฟล์นี้ใน repo สาธารณะได้
- Web app URL เป็นข้อมูลที่ใครมีลิงก์ก็ส่งข้อมูลเข้ามาได้ ถ้าต้องการจำกัดการแก้ไข/ลบ ให้ตั้ง `ADMIN_PIN`
- รูปถ่ายถูกแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" เพื่อให้แอปแสดงรูปตัวอย่างได้
  ถ้าไม่ต้องการ ให้แก้ `PHOTO_PUBLIC_LINK: false` ใน `Code.gs`

## แก้ปัญหาเบื้องต้น

| อาการ | วิธีแก้ |
|---|---|
| ส่งข้อมูลแล้วขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" | ตรวจว่า Deploy เป็น *Anyone* และ URL ลงท้ายด้วย `/exec` |
| แก้โค้ด Apps Script แล้วไม่มีผล | ต้อง Deploy เป็น *New version* ทุกครั้ง |
| หน้าเว็บไม่อัปเดตบนมือถือ | เปลี่ยนเลข `CACHE` ใน `sw.js` แล้วอัปโหลดใหม่ ปิดแล้วเปิดแอปสองครั้ง |
| ไม่มีปุ่มติดตั้งแอป | ต้องเปิดผ่าน `https://` (GitHub Pages ใช้ได้) และบน iPhone ให้กด แชร์ > เพิ่มไปยังหน้าจอโฮม |
