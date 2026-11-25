// ชั้นจัดการข้อมูล: ใช้ Supabase ถ้าตั้งค่าไว้ ไม่งั้นใช้โหมดทดลอง (localStorage)
(function () {
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  // ---------- ตัวช่วยทั่วไป ----------
  const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  const util = {
    normalizePhone(raw) {
      let p = String(raw || "").replace(/\D/g, "");
      if (p.startsWith("66") && p.length === 11) p = "0" + p.slice(2);
      return p;
    },
    isValidPhone(p) { return /^0\d{8,9}$/.test(p); },
    formatPhone(p) {
      if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
      if (p.length === 9) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
      return p;
    },
    monthLabel(ym, short) {
      const [y, m] = ym.split("-").map(Number);
      return `${(short ? TH_MONTHS_SHORT : TH_MONTHS)[m - 1]} ${y + 543}`;
    },
    currentMonth() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },
    money(n) {
      return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    dateLabel(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
    },
    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    summarize(bills) {
      const unpaid = bills.filter((b) => !b.paid).sort((a, b) => a.month.localeCompare(b.month));
      const paid = bills.filter((b) => b.paid);
      return {
        unpaid, paid,
        totalDue: unpaid.reduce((s, b) => s + Number(b.amount), 0),
        totalPaid: paid.reduce((s, b) => s + Number(b.amount), 0),
      };
    },
  };

  // ---------- โหมดทดลอง (localStorage) ----------
  const DEMO_KEY = "debt_lookup_demo_v1";
  const DEMO_ADMIN = { email: "admin@demo.com", password: "admin1234" };

  function seedDemo() {
    const now = new Date();
    const ym = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const id = () => Math.random().toString(36).slice(2, 10);
    const c1 = { id: id(), phone: "0812345678", name: "สมชาย ใจดี", monthly_amount: 500, note: "", active: true };
    const c2 = { id: id(), phone: "0899999999", name: "สมหญิง รักเรียน", monthly_amount: 350, note: "", active: true };
    const c3 = { id: id(), phone: "0861112222", name: "ประยุทธ มั่นคง", monthly_amount: 1200, note: "ผ่อนสินค้า", active: true };
    const bills = [];
    const add = (c, off, paid) => bills.push({
      id: id(), customer_id: c.id, month: ym(off), amount: c.monthly_amount, paid,
      paid_at: paid ? new Date(now.getFullYear(), now.getMonth() - off, 5).toISOString() : null, note: "",
    });
    for (let i = 5; i >= 0; i--) add(c1, i, i >= 2);          // ค้าง 2 เดือนล่าสุด
    for (let i = 5; i >= 0; i--) add(c2, i, true);            // จ่ายครบ
    for (let i = 3; i >= 0; i--) add(c3, i, i === 3);         // ค้าง 3 เดือน
    return { customers: [c1, c2, c3], bills };
  }
  function loadDemo() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const db = seedDemo();
    saveDemo(db);
    return db;
  }
  function saveDemo(db) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const demo = {
    async lookup(phone) {
      const db = loadDemo();
      const c = db.customers.find((x) => x.phone === phone);
      if (!c) return null;
      const bills = db.bills.filter((b) => b.customer_id === c.id)
        .map(({ month, amount, paid, paid_at, note }) => ({ month, amount, paid, paid_at, note }));
      return { name: c.name, phone: c.phone, bills };
    },
    async login(email, password) {
      if (email.trim().toLowerCase() === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
        sessionStorage.setItem("demo_admin", "1");
        return true;
      }
      throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    },
    async logout() { sessionStorage.removeItem("demo_admin"); },
    async isAdmin() { return sessionStorage.getItem("demo_admin") === "1"; },
    async listCustomers() {
      const db = loadDemo();
      return db.customers.map((c) => ({ ...c, bills: db.bills.filter((b) => b.customer_id === c.id) }));
    },
    async saveCustomer(c) {
      const db = loadDemo();
      if (db.customers.some((x) => x.phone === c.phone && x.id !== c.id)) throw new Error("เบอร์โทรนี้มีอยู่ในระบบแล้ว");
      if (c.id) {
        const i = db.customers.findIndex((x) => x.id === c.id);
        db.customers[i] = { ...db.customers[i], ...c };
      } else {
        db.customers.push({ ...c, id: newId() });
      }
      saveDemo(db);
    },
    async deleteCustomer(id) {
      const db = loadDemo();
      db.customers = db.customers.filter((c) => c.id !== id);
      db.bills = db.bills.filter((b) => b.customer_id !== id);
      saveDemo(db);
    },
    async saveBill(b) {
      const db = loadDemo();
      if (db.bills.some((x) => x.customer_id === b.customer_id && x.month === b.month && x.id !== b.id))
        throw new Error("มีบิลของเดือนนี้อยู่แล้ว");
      if (b.id) {
        const i = db.bills.findIndex((x) => x.id === b.id);
        db.bills[i] = { ...db.bills[i], ...b };
      } else {
        db.bills.push({ paid: false, paid_at: null, note: "", ...b, id: newId() });
      }
      saveDemo(db);
    },
    async setPaid(id, paid) {
      const db = loadDemo();
      const b = db.bills.find((x) => x.id === id);
      b.paid = paid;
      b.paid_at = paid ? new Date().toISOString() : null;
      saveDemo(db);
    },
    async deleteBill(id) {
      const db = loadDemo();
      db.bills = db.bills.filter((b) => b.id !== id);
      saveDemo(db);
    },
    async generateMonth(month) {
      const db = loadDemo();
      let n = 0;
      for (const c of db.customers) {
        if (!c.active || !(Number(c.monthly_amount) > 0)) continue;
        if (db.bills.some((b) => b.customer_id === c.id && b.month === month)) continue;
        db.bills.push({ id: newId(), customer_id: c.id, month, amount: Number(c.monthly_amount), paid: false, paid_at: null, note: "" });
        n++;
      }
      saveDemo(db);
      return n;
    },
    async resetDemo() { localStorage.removeItem(DEMO_KEY); },
  };

  // ---------- โหมด Supabase ----------
  let sb = null;
  if (useSupabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => {
    if (error) {
      if (error.code === "23505") throw new Error("ข้อมูลซ้ำ: เบอร์โทรหรือเดือนของบิลนี้มีอยู่แล้ว");
      throw new Error(error.message);
    }
    return data;
  };
  const fromDbBill = (b) => ({ ...b, month: b.bill_month, amount: Number(b.amount) });
  const toDbBill = (b) => {
    const o = { ...b, bill_month: b.month };
    delete o.month;
    return o;
  };

  const remote = {
    async lookup(phone) {
      const data = check(await sb.rpc("lookup_debt", { p_phone: phone }));
      if (!data) return null;
      data.bills = (data.bills || []).map((b) => ({ ...b, amount: Number(b.amount) }));
      return data;
    },
    async login(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }));
      if (!(await remote.isAdmin())) {
        await sb.auth.signOut();
        throw new Error("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ");
      }
      return true;
    },
    async logout() { await sb.auth.signOut(); },
    async isAdmin() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return false;
      const { data } = await sb.rpc("is_admin");
      return data === true;
    },
    async listCustomers() {
      const customers = check(await sb.from("customers").select("*").order("name"));
      const bills = check(await sb.from("bills").select("*").order("bill_month"));
      const byCust = {};
      for (const b of bills) (byCust[b.customer_id] ||= []).push(fromDbBill(b));
      return customers.map((c) => ({ ...c, monthly_amount: Number(c.monthly_amount), bills: byCust[c.id] || [] }));
    },
    async saveCustomer(c) {
      const row = { phone: c.phone, name: c.name, monthly_amount: c.monthly_amount, note: c.note, active: c.active };
      if (c.id) check(await sb.from("customers").update(row).eq("id", c.id));
      else check(await sb.from("customers").insert(row));
    },
    async deleteCustomer(id) { check(await sb.from("customers").delete().eq("id", id)); },
    async saveBill(b) {
      const row = toDbBill(b);
      if (b.id) { delete row.id; check(await sb.from("bills").update(row).eq("id", b.id)); }
      else check(await sb.from("bills").insert(row));
    },
    async setPaid(id, paid) {
      check(await sb.from("bills").update({ paid, paid_at: paid ? new Date().toISOString() : null }).eq("id", id));
    },
    async deleteBill(id) { check(await sb.from("bills").delete().eq("id", id)); },
    async generateMonth(month) {
      return Number(check(await sb.rpc("generate_month_bills", { p_month: month })) || 0);
    },
  };

  window.API = { mode: useSupabase ? "supabase" : "demo", util, ...(useSupabase ? remote : demo) };
  window.API.demoAdmin = useSupabase ? null : DEMO_ADMIN;
})();
