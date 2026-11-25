(function () {
  const { util } = API;
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};

  if (cfg.SITE_NAME) { $("siteName").textContent = cfg.SITE_NAME; document.title = cfg.SITE_NAME; }
  if (API.mode === "demo") $("demoBanner").classList.remove("hidden");

  function showMsg(text, type = "error") {
    const m = $("msg");
    m.className = `msg ${type}`;
    m.textContent = text;
  }
  function hideMsg() { $("msg").className = "msg hidden"; }

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMsg();
    $("result").classList.add("hidden");
    const phone = util.normalizePhone($("phone").value);
    if (!util.isValidPhone(phone)) {
      showMsg("กรุณากรอกเบอร์โทรให้ถูกต้อง (9–10 หลัก ขึ้นต้นด้วย 0)");
      return;
    }
    const btn = $("searchBtn");
    btn.disabled = true;
    btn.textContent = "กำลังค้นหา...";
    try {
      const data = await API.lookup(phone);
      if (!data) {
        showMsg("ไม่พบข้อมูลของเบอร์นี้ในระบบ กรุณาตรวจสอบเบอร์อีกครั้ง หรือติดต่อผู้ดูแล");
        return;
      }
      render(data);
    } catch (err) {
      showMsg("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "ตรวจสอบ";
    }
  });

  function render(data) {
    const s = util.summarize(data.bills);
    $("rName").textContent = data.name;
    $("rPhone").textContent = "โทร " + util.formatPhone(data.phone);
    $("rChecked").textContent = "ข้อมูล ณ " + util.dateLabel(new Date().toISOString());

    const box = $("dueBox");
    if (s.totalDue > 0) {
      box.className = "due-box has-due";
      $("dueLabel").textContent = "ยอดค้างชำระทั้งหมด";
      $("dueAmount").textContent = util.money(s.totalDue) + " บาท";
      $("dueNote").textContent = `ค้างชำระ ${s.unpaid.length} เดือน`;
      $("unpaidChips").innerHTML = s.unpaid
        .map((b) => `<span class="chip">${util.esc(util.monthLabel(b.month))} · ${util.money(b.amount)} ฿</span>`)
        .join("");
      $("unpaidWrap").classList.remove("hidden");
    } else {
      box.className = "due-box no-due";
      $("dueLabel").textContent = "สถานะ";
      $("dueAmount").textContent = "ไม่มียอดค้างชำระ";
      $("dueNote").textContent = "ชำระครบทุกเดือนแล้ว ขอบคุณค่ะ";
      $("unpaidWrap").classList.add("hidden");
    }

    const bills = [...data.bills].sort((a, b) => b.month.localeCompare(a.month));
    $("historySub").textContent = bills.length
      ? `ชำระแล้ว ${s.paid.length} เดือน (${util.money(s.totalPaid)} บาท) · ค้างชำระ ${s.unpaid.length} เดือน`
      : "ยังไม่มีบิลในระบบ";
    $("billRows").innerHTML = bills.length
      ? bills.map((b) => `
        <tr>
          <td>${util.esc(util.monthLabel(b.month))}</td>
          <td class="num">${util.money(b.amount)}</td>
          <td>${b.paid ? '<span class="badge paid">ชำระแล้ว</span>' : '<span class="badge unpaid">ค้างชำระ</span>'}</td>
          <td>${b.paid ? util.esc(util.dateLabel(b.paid_at)) || "-" : "-"}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="small-muted">ไม่มีข้อมูล</td></tr>`;

    $("result").classList.remove("hidden");
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
