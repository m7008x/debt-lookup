// ===== ตั้งค่าระบบ =====
// ถ้ายังไม่ใส่ SUPABASE_URL / SUPABASE_ANON_KEY ระบบจะทำงานใน "โหมดทดลอง"
// (เก็บข้อมูลในเบราว์เซอร์เครื่องนั้น ๆ เท่านั้น) — ใช้ทดสอบหน้าตาได้ทันที
// เมื่อจะใช้งานจริง ให้สร้างโปรเจกต์ Supabase แล้วนำค่าจาก
// Project Settings → API มาใส่ด้านล่าง (ดูขั้นตอนใน README.md)
window.APP_CONFIG = {
  SITE_NAME: "ระบบตรวจสอบยอดค้างชำระ",
  SUPABASE_URL: "https://jvdfdbdvyhmlernhvflc.supabase.co",
  // publishable key ใส่ในเว็บได้ (ตารางถูกล็อกด้วย Row Level Security)
  SUPABASE_ANON_KEY: "sb_publishable_Qd7VnRUAN-fAQP0fwPD9RQ_KBuNZALW",
};
