(function () {
  const { util } = API;
  const $ = (id) => document.getElementById(id);
  let customers = [];
  let current = null; // ลูกหนี้ที่เปิดอยู่ใน modal

  // ---------- ทั่วไป ----------
  if (API.mode === "demo") {
    $("demoBanner").classList.remove("hidden");
    $("resetDemo").addEventListener("click", async () => {
      if (!confirm("ล้างข้อมูลทั้งหมดและกลับไปใช้ข้อมูลตัวอย่าง?")) return;
      await API.resetDemo();
      if (await API.isAdmin()) await refresh();
    });
  }
  function msg(el, text, type = "error") { el.className = `msg ${type}`; el.textContent = text; }
  function hide(el) { el.className = "msg hidden"; }
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(b.closest(".modal-bg").id)));
  document.querySelectorAll(".modal-bg").forEach((bg) =>
    bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(bg.id); }));

  // ---------- เข้าสู่ระบบ ----------
  async function showAdmin() {
    $("loginView").classList.add("hidden");
    $("adminView").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");
    await refresh();
  }
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hide($("loginMsg"));
    const btn = $("loginBtn");
    btn.disabled = true;
    try {
      await API.login($("email").value, $("password").value);
      await showAdmin();
    } catch (err) {
      msg($("loginMsg"), err.message);
    } finally {
      btn.disabled = false;
    }
  });
  $("logoutBtn").addEventListener("click", async () => {
    await API.logout();
    location.reload();
  });

  // ---------- รายการลูกหนี้ ----------
  async function refresh() {
    try {
      customers = await API.listCustomers();
    } catch (err) {
      alert("โหลดข้อมูลไม่สำเร็จ: " + err.message);
      return;
    }
    renderStats();
    renderList();
    if (current) {
      current = customers.find((c) => c.id === current.id) || null;
      if (current) renderBills();
    }
  }

  function renderStats() {
    let due = 0, paid = 0, debtors = 0;
    for (const c of customers) {
      const s = util.summarize(c.bills);
      due += s.totalDue; paid += s.totalPaid;
      if (s.totalDue > 0) debtors++;
    }
    $("stCount").textContent = customers.length.toLocaleString("th-TH");
    $("stDue").textContent = util.money(due);
    $("stDebtors").textContent = debtors.toLocaleString("th-TH");
    $("stPaid").textContent = util.money(paid);
  }

  function renderList() {
    const q = $("q").value.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const f = $("filter").value;
    const rows = customers
      .map((c) => ({ c, s: util.summarize(c.bills) }))
      .filter(({ c, s }) => {
        if (q && !(c.name.toLowerCase().includes(q) || (qDigits && c.phone.includes(qDigits)))) return false;
        if (f === "due" && s.totalDue <= 0) return false;
        if (f === "clear" && s.totalDue > 0) return false;
        return true;
      })
      .sort((a, b) => b.s.totalDue - a.s.totalDue || a.c.name.localeCompare(b.c.name, "th"));

    $("custRows").innerHTML = rows.length ? rows.map(({ c, s }) => `
      <tr class="clickable" data-id="${util.esc(c.id)}">
        <td>${util.esc(c.name)} ${c.active ? "" : '<span class="badge muted">ปิดใช้งาน</span>'}</td>
        <td>${util.esc(util.formatPhone(c.phone))}</td>
        <td class="num">${util.money(c.monthly_amount)}</td>
        <td>${s.unpaid.length
          ? s.unpaid.map((b) => util.esc(util.monthLabel(b.month, true))).join(", ")
          : '<span class="badge paid">ไม่มีค้าง</span>'}</td>
        <td class="num" style="${s.totalDue > 0 ? "color:var(--danger);font-weight:700" : ""}">${util.money(s.totalDue)}</td>
        <td class="num"><button class="btn ghost small">จัดการ</button></td>
      </tr>`).join("")
      : `<tr><td colspan="6" class="small-muted">ไม่พบข้อมูล</td></tr>`;
  }
  $("q").addEventListener("input", renderList);
  $("filter").addEventListener("change", renderList);
  $("custRows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) openCustomer(customers.find((c) => c.id === tr.dataset.id));
  });

  // ---------- เพิ่ม/แก้ไขลูกหนี้ ----------
  $("addBtn").addEventListener("click", () => openCustomer(null));

  function openCustomer(c) {
    current = c;
    hide($("custMsg"));
    $("custTitle").textContent = c ? "ข้อมูลลูกหนี้" : "เพิ่มลูกหนี้";
    $("cName").value = c ? c.name : "";
    $("cPhone").value = c ? c.phone : "";
    $("cMonthly").value = c ? c.monthly_amount : 0;
    $("cNote").value = c ? c.note || "" : "";
    $("cActive").checked = c ? !!c.active : true;
    $("delCust").classList.toggle("hidden", !c);
    $("billSection").classList.toggle("hidden", !c);
    if (c) {
      $("bMonth").value = util.currentMonth();
      $("bAmount").value = c.monthly_amount || "";
      renderBills();
    }
    openModal("custModal");
  }

  $("custForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hide($("custMsg"));
    const phone = util.normalizePhone($("cPhone").value);
    if (!util.isValidPhone(phone)) return msg($("custMsg"), "เบอร์โทรไม่ถูกต้อง (9–10 หลัก ขึ้นต้นด้วย 0)");
    const data = {
      id: current?.id,
      name: $("cName").value.trim(),
      phone,
      monthly_amount: Number($("cMonthly").value) || 0,
      note: $("cNote").value.trim(),
      active: $("cActive").checked,
    };
    try {
      await API.saveCustomer(data);
      const wasNew = !current;
      await refresh();
      if (wasNew) {
        const created = customers.find((c) => c.phone === phone);
        openCustomer(created);
        msg($("custMsg"), "เพิ่มลูกหนี้แล้ว — เพิ่มบิลรายเดือนได้ด้านล่าง", "info");
      } else {
        msg($("custMsg"), "บันทึกแล้ว", "info");
      }
    } catch (err) {
      msg($("custMsg"), err.message);
    }
  });

  $("delCust").addEventListener("click", async () => {
    if (!current) return;
    if (!confirm(`ลบ "${current.name}" และบิลทั้งหมดของคนนี้? การลบนี้ย้อนกลับไม่ได้`)) return;
    try {
      await API.deleteCustomer(current.id);
      current = null;
      closeModal("custModal");
      await refresh();
    } catch (err) {
      msg($("custMsg"), err.message);
    }
  });

  // ---------- บิล ----------
  function renderBills() {
    const bills = [...current.bills].sort((a, b) => b.month.localeCompare(a.month));
    const s = util.summarize(bills);
    $("billSummary").textContent = `ค้าง ${s.unpaid.length} เดือน · ${util.money(s.totalDue)} บาท`;
    $("billRows").innerHTML = bills.length ? bills.map((b) => `
      <tr data-bill="${util.esc(b.id)}">
        <td>${util.esc(util.monthLabel(b.month))}</td>
        <td class="num">${util.money(b.amount)}</td>
        <td>${b.paid
          ? `<span class="badge paid">ชำระแล้ว</span> <span class="small-muted">${util.esc(util.dateLabel(b.paid_at))}</span>`
          : '<span class="badge unpaid">ค้างชำระ</span>'}</td>
        <td class="num">
          ${b.paid
            ? '<button class="btn ghost small" data-act="unpay">ยกเลิกการชำระ</button>'
            : '<button class="btn ok small" data-act="pay">รับชำระแล้ว</button>'}
          <button class="btn ghost small" data-act="del" title="ลบบิล">ลบ</button>
        </td>
      </tr>`).join("")
      : `<tr><td colspan="4" class="small-muted">ยังไม่มีบิล</td></tr>`;
  }

  $("billRows").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest("tr").dataset.bill;
    const act = btn.dataset.act;
    try {
      btn.disabled = true;
      if (act === "pay") await API.setPaid(id, true);
      else if (act === "unpay") await API.setPaid(id, false);
      else if (act === "del") {
        if (!confirm("ลบบิลนี้?")) { btn.disabled = false; return; }
        await API.deleteBill(id);
      }
      await refresh();
    } catch (err) {
      btn.disabled = false;
      msg($("custMsg"), err.message);
    }
  });

  $("billForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hide($("custMsg"));
    try {
      await API.saveBill({ customer_id: current.id, month: $("bMonth").value, amount: Number($("bAmount").value) });
      await refresh();
    } catch (err) {
      msg($("custMsg"), err.message);
    }
  });

  // ---------- ออกบิลประจำเดือน ----------
  $("genBtn").addEventListener("click", () => {
    hide($("genMsg"));
    $("gMonth").value = util.currentMonth();
    openModal("genModal");
  });
  $("genForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const month = $("gMonth").value;
    try {
      const n = await API.generateMonth(month);
      msg($("genMsg"), n
        ? `ออกบิลเดือน ${util.monthLabel(month)} แล้ว ${n} รายการ`
        : `ทุกคนมีบิลเดือน ${util.monthLabel(month)} อยู่แล้ว (หรือไม่มีลูกหนี้ที่ตั้งยอดต่อเดือนไว้)`, "info");
      await refresh();
    } catch (err) {
      msg($("genMsg"), err.message);
    }
  });

  // ---------- เริ่มต้น ----------
  (async () => {
    try { if (await API.isAdmin()) await showAdmin(); } catch (e) { /* แสดงหน้าล็อกอิน */ }
  })();
})();
