/**
 * ============================================================
 * SIMPRO -- simpro-qc
 * ============================================================
 * Halaman QC INSPEKSI (qc.html).
 *
 * MODE A (qc-panel-input): checker isi hasil pemeriksaan per tahap
 * (Potong/Jahit/Finishing). MODE B (qc-panel-ringkasan): owner/leader lihat
 * defect rate per tahap & per operator.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard, Daftar Order, Pengiriman, &
 * Invoice (localStorage "db_session").
 *
 * DIMUAT DI : qc.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const QC_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const QC_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let QC_ID_TOKEN = null;
let QC_MASTER = null;       // hasil getMasterQC, dipuat ulang tiap qcMulai()
let QC_DAFTAR_PO = [];      // hasil getDaftarPO (action YANG SUDAH ADA -- dipakai juga oleh Dashboard/Orderan)
let QC_PO_TERPILIH = null;  // { idPurchaseOrder, namaKlien, artikel } -- null = BELUM dipilih dari daftar
let QC_TAHAP_DIPILIH = "";  // Tahap yang lagi aktif di form (kosong = belum pilih)
let QC_RINGKASAN_DIMUAT = false; // cegah fetch ulang tiap ganti tab kalau filter belum berubah

function qcShow(id) {
  ["qc-login-box", "qc-loading", "qc-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function qcBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  } catch (e) { return null; }
}

function qcSimpanSesi_(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  } catch (e) { }
}

function qcHandleGoogleLogin(response) {
  QC_ID_TOKEN = response.credential;
  qcSimpanSesi_(response.credential);
  qcMulai();
}

function qcLogout() {
  QC_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  ["qc-nav-logout", "qc-nav-refresh"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  qcShow("qc-login-box");
}

function qcMulai() {
  qcShow("qc-loading");
  ["qc-nav-logout", "qc-nav-refresh"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  });
  QC_MASTER = null;
  QC_RINGKASAN_DIMUAT = false;
  qcMuatMaster_();
}

function qcRefresh() {
  const ikon = document.getElementById("qc-refresh-icon");
  if (ikon) ikon.classList.add("spinning");
  QC_MASTER = null;
  QC_RINGKASAN_DIMUAT = false;
  qcShow("qc-loading");
  qcMuatMaster_();
  setTimeout(function () { if (ikon) ikon.classList.remove("spinning"); }, 1200);
}

// ============ MUAT MASTER (jenis cacat per tahap, daftar operator, dst) ============

function qcMuatMaster_() {
  Promise.all([
    fetch(QC_API_URL, { method: "POST", body: JSON.stringify({ idToken: QC_ID_TOKEN, action: "getMasterQC" }) }).then(function (r) { return r.json(); }),
    fetch(QC_API_URL, { method: "POST", body: JSON.stringify({ idToken: QC_ID_TOKEN, action: "getDaftarPO" }) }).then(function (r) { return r.json(); })
  ])
    .then(function (hasil) {
      const d = hasil[0], dPO = hasil[1];
      if (!d || !d.success) {
        qcShow("qc-isi");
        document.getElementById("qc-panel-input").innerHTML =
          '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat data QC.") + '</p>';
        return;
      }
      QC_MASTER = d;
      qcIsiDaftarOperator_();

      // Daftar PO dipakai kotak cari PO -- kalau gagal dimuat, kotak PO
      // DIKUNCI (bukan jatuh ke ketik manual). Itu justru sumber masalah
      // yang mau dihindari: ID PO ketik manual rawan typo, datanya jadi
      // tidak terkoneksi ke PO asli di SD Purchase Order.
      const inputPO = document.getElementById("qc-po");
      if (dPO && dPO.success) {
        QC_DAFTAR_PO = dPO.daftar || [];
        if (inputPO) { inputPO.disabled = false; inputPO.placeholder = "Ketik nama klien / artikel / ID PO..."; }
      } else {
        QC_DAFTAR_PO = [];
        if (inputPO) { inputPO.disabled = true; inputPO.placeholder = "Daftar PO gagal dimuat -- coba muat ulang halaman."; }
      }

      qcShow("qc-isi");
    })
    .catch(function () {
      qcShow("qc-isi");
      document.getElementById("qc-panel-input").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
    });
}

function qcIsiDaftarOperator_() {
  const dl = document.getElementById("qc-operator-list");
  if (!dl || !QC_MASTER) return;
  dl.innerHTML = (QC_MASTER.daftarOperator || []).map(function (op) {
    return '<option value="' + rjdEscapeHtml_(op) + '"></option>';
  }).join("");
}

// ============ KOTAK CARI PO (anti-typo -- WAJIB pilih dari daftar, bukan ketik bebas) ============

function qcCariPO() {
  const teks = document.getElementById("qc-po").value.trim().toLowerCase();
  const dropdown = document.getElementById("qc-po-dropdown");
  if (!teks) { dropdown.classList.add("hidden"); dropdown.innerHTML = ""; return; }

  const cocok = QC_DAFTAR_PO.filter(function (po) {
    const gabungan = [po.idPurchaseOrder, po.namaKlien, (po.artikel || []).join(" ")].join(" ").toLowerCase();
    return gabungan.indexOf(teks) !== -1;
  }).slice(0, 8);

  if (!cocok.length) {
    dropdown.innerHTML = '<div class="qc-po-kosong">Tidak ketemu. Cek ejaan, atau pastikan PO-nya sudah ada di Daftar PO.</div>';
    dropdown.classList.remove("hidden");
    return;
  }

  dropdown.innerHTML = cocok.map(function (po, i) {
    const artikelTeks = (po.artikel || []).join(", ") || "-";
    return '<div class="qc-po-opsi" onclick="qcPilihPO(' + i + ')">' +
      '<div class="qc-po-opsi-id">' + rjdEscapeHtml_(po.idPurchaseOrder) + '</div>' +
      '<div class="qc-po-opsi-sub">' + rjdEscapeHtml_(po.namaKlien) + ' &middot; ' + rjdEscapeHtml_(artikelTeks) + '</div>' +
      '</div>';
  }).join("");
  dropdown.dataset.hasilCocok = JSON.stringify(cocok.map(function (po) { return po.idPurchaseOrder; }));
  dropdown.classList.remove("hidden");
}

function qcPilihPO(indexTampil) {
  const teks = document.getElementById("qc-po").value.trim().toLowerCase();
  const cocok = QC_DAFTAR_PO.filter(function (po) {
    const gabungan = [po.idPurchaseOrder, po.namaKlien, (po.artikel || []).join(" ")].join(" ").toLowerCase();
    return gabungan.indexOf(teks) !== -1;
  }).slice(0, 8);
  const po = cocok[indexTampil];
  if (!po) return;

  QC_PO_TERPILIH = po;
  document.getElementById("qc-po-dropdown").classList.add("hidden");
  document.getElementById("qc-po").value = "";
  document.getElementById("qc-po").classList.add("hidden");
  document.getElementById("qc-po-terpilih-id").textContent = po.idPurchaseOrder;
  document.getElementById("qc-po-terpilih-sub").textContent =
    po.namaKlien + (po.artikel && po.artikel.length ? " \u00b7 " + po.artikel.join(", ") : "");
  document.getElementById("qc-po-terpilih").classList.add("show");
}

function qcGantiPO() {
  QC_PO_TERPILIH = null;
  document.getElementById("qc-po-terpilih").classList.remove("show");
  const input = document.getElementById("qc-po");
  input.classList.remove("hidden");
  input.value = "";
  input.focus();
}

// ============ TAB SWITCHER ============

function qcSwitchTab(tab) {
  document.querySelectorAll(".qc-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("qc-panel-input").classList.toggle("hidden", tab !== "input");
  document.getElementById("qc-panel-ringkasan").classList.toggle("hidden", tab !== "ringkasan");
  if (tab === "ringkasan" && !QC_RINGKASAN_DIMUAT) qcMuatRingkasan();
}

// ============ MODE A: FORM INPUT ============

function qcPilihTahap(tahap) {
  QC_TAHAP_DIPILIH = tahap;
  document.querySelectorAll(".qc-tahap-btn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.t === tahap);
  });
  // Ganti tahap = daftar jenis cacat yang relevan ikut ganti -- baris yang
  // sudah diisi dikosongkan lagi, biar tidak ada baris "jenis cacat Jahit"
  // nyangkut padahal tahap sudah dipindah ke Finishing.
  document.getElementById("qc-detail-rows").innerHTML = "";
  const tambahBtn = document.getElementById("qc-detail-tambah");
  const hint = document.getElementById("qc-detail-hint");
  if (tambahBtn) tambahBtn.disabled = false;
  if (hint) hint.classList.add("hidden");
}

function qcRecalc() {
  const p = Number(document.getElementById("qc-periksa").value) || 0;
  const l = Number(document.getElementById("qc-lolos").value) || 0;
  const c = Math.max(p - l, 0);
  const box = document.getElementById("qc-cacat-angka");
  box.textContent = c;
  box.parentElement.classList.toggle("qc-cacat-nol", c === 0);
  qcUpdatePreviewKeputusan_(p, c);
}

function qcUpdatePreviewKeputusan_(qtyDiperiksa, qtyCacat) {
  const el = document.getElementById("qc-keputusan-preview");
  if (!qtyDiperiksa) { el.classList.remove("show"); return; }
  const batas = (QC_MASTER && QC_MASTER.batasToleransiDefect) || 0.10;
  const rate = qtyCacat / qtyDiperiksa;
  let kelas, teks;
  if (qtyCacat === 0) {
    kelas = "lolos"; teks = "Lolos -- tidak ada cacat ditemukan.";
  } else if (rate <= batas) {
    kelas = "bersyarat"; teks = "Lolos bersyarat -- defect rate " + (rate * 100).toFixed(1) + "%, di bawah batas toleransi " + (batas * 100).toFixed(0) + "%.";
  } else {
    kelas = "reject"; teks = "Reject-Rework -- defect rate " + (rate * 100).toFixed(1) + "%, di atas batas toleransi " + (batas * 100).toFixed(0) + "%.";
  }
  el.className = "qc-keputusan-preview show " + kelas;
  el.textContent = teks;
}

function qcTambahBarisCacat() {
  if (!QC_TAHAP_DIPILIH) {
    const hint = document.getElementById("qc-detail-hint");
    if (hint) hint.classList.remove("hidden");
    return;
  }
  const daftarJenis = (QC_MASTER && QC_MASTER.jenisCacatPerTahap && QC_MASTER.jenisCacatPerTahap[QC_TAHAP_DIPILIH]) || [];
  const wrap = document.getElementById("qc-detail-rows");
  const row = document.createElement("div");
  row.className = "qc-detail-row";
  row.innerHTML =
    '<select>' + daftarJenis.map(function (j) { return '<option value="' + rjdEscapeHtml_(j) + '">' + rjdEscapeHtml_(j) + '</option>'; }).join("") + '</select>' +
    '<input min="0" type="number" value="1"/>' +
    '<button onclick="this.closest(\'.qc-detail-row\').remove(); qcRecalc();" type="button" title="Hapus baris">&times;</button>';
  wrap.appendChild(row);
}

function qcKumpulkanDetailCacat_() {
  const hasil = [];
  document.querySelectorAll("#qc-detail-rows .qc-detail-row").forEach(function (row) {
    const jenis = row.querySelector("select").value;
    const qty = Number(row.querySelector("input").value) || 0;
    if (jenis && qty > 0) hasil.push({ jenisCacat: jenis, qty: qty });
  });
  return hasil;
}

function qcTampilkanError_(pesan) {
  const el = document.getElementById("qc-submit-error");
  el.textContent = pesan;
  el.classList.remove("hidden");
  document.getElementById("qc-submit-sukses").classList.add("hidden");
}

function qcResetForm_() {
  qcGantiPO();
  document.getElementById("qc-operator").value = "";
  document.getElementById("qc-periksa").value = "";
  document.getElementById("qc-lolos").value = "";
  document.getElementById("qc-detail-rows").innerHTML = "";
  document.getElementById("qc-keputusan-override").value = "";
  document.getElementById("qc-catatan").value = "";
  document.getElementById("qc-cacat-angka").textContent = "0";
  document.getElementById("qc-keputusan-preview").classList.remove("show");
  // Tahap SENGAJA TIDAK direset -- checker biasanya periksa banyak PO
  // berturut-turut di tahap yang SAMA, jadi lebih cepat kalau tetap terpilih.
}

function qcSubmitInspeksi() {
  document.getElementById("qc-submit-error").classList.add("hidden");
  document.getElementById("qc-submit-sukses").classList.add("hidden");

  const idPO = QC_PO_TERPILIH ? QC_PO_TERPILIH.idPurchaseOrder : "";
  const operator = document.getElementById("qc-operator").value.trim();
  const qtyDiperiksa = Number(document.getElementById("qc-periksa").value) || 0;
  const qtyLolos = Number(document.getElementById("qc-lolos").value) || 0;
  const qtyCacat = Math.max(qtyDiperiksa - qtyLolos, 0);
  const detailCacat = qcKumpulkanDetailCacat_();
  const totalDetail = detailCacat.reduce(function (s, d) { return s + d.qty; }, 0);

  if (!idPO) return qcTampilkanError_("Pilih PO dari daftar (ketik lalu tap hasilnya) -- jangan dikosongkan.");
  if (!QC_TAHAP_DIPILIH) return qcTampilkanError_("Pilih tahap (Potong/Jahit/Finishing) dulu.");
  if (!operator) return qcTampilkanError_("Operator / line wajib diisi.");
  if (qtyDiperiksa <= 0) return qcTampilkanError_("Qty diperiksa harus lebih dari 0.");
  if (qtyLolos < 0 || qtyLolos > qtyDiperiksa) return qcTampilkanError_("Qty lolos tidak masuk akal (harus 0..Qty Diperiksa).");
  if (qtyCacat > 0 && totalDetail !== qtyCacat) {
    return qcTampilkanError_("Total qty jenis cacat (" + totalDetail + ") harus sama dengan Qty Cacat (" + qtyCacat + "). Cek lagi rincian jenis cacat.");
  }

  const btn = document.getElementById("qc-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  fetch(QC_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: QC_ID_TOKEN,
      action: "submitInspeksiQC",
      payload: {
        idPurchaseOrder: idPO,
        tahap: QC_TAHAP_DIPILIH,
        operator: operator,
        qtyDiperiksa: qtyDiperiksa,
        qtyLolos: qtyLolos,
        detailCacat: detailCacat,
        catatan: document.getElementById("qc-catatan").value.trim(),
        keputusanOverride: document.getElementById("qc-keputusan-override").value || ""
      }
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      btn.textContent = "Simpan inspeksi";
      if (!d || !d.success) {
        qcTampilkanError_((d && d.error) || "Gagal menyimpan inspeksi. Coba lagi.");
        return;
      }
      const el = document.getElementById("qc-submit-sukses");
      el.textContent = "Tersimpan (" + d.idQC + ") -- " + d.keputusan + ", defect rate " + d.defectRate + "%.";
      el.classList.remove("hidden");
      qcResetForm_();
      // Operator baru yang barusan diketik ikut masuk daftar autocomplete
      // tanpa perlu refresh halaman -- kecil, tapi lumayan buat checker yang
      // input banyak PO berturut-turut dengan operator yang sama.
      if (QC_MASTER && QC_MASTER.daftarOperator && QC_MASTER.daftarOperator.indexOf(operator) === -1) {
        QC_MASTER.daftarOperator.push(operator);
        qcIsiDaftarOperator_();
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = "Simpan inspeksi";
      qcTampilkanError_("Gagal menghubungi server. Coba beberapa saat lagi.");
    });
}

// ============ MODE B: RINGKASAN & DASHBOARD ============

function qcMuatRingkasan() {
  QC_RINGKASAN_DIMUAT = true;
  const wadah = document.getElementById("qc-ringkasan-isi");
  wadah.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft)">Memuat ringkasan...</p>';

  fetch(QC_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: QC_ID_TOKEN,
      action: "getRingkasanQC",
      payload: {
        periode: document.getElementById("qc-filter-periode").value,
        tahap: document.getElementById("qc-filter-tahap").value,
        cari: document.getElementById("qc-filter-cari").value.trim()
      }
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.success) {
        wadah.innerHTML = '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat ringkasan.") + '</p>';
        return;
      }
      qcRenderRingkasan_(d);
    })
    .catch(function () {
      wadah.innerHTML = '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
    });
}

function qcKelasBar_(rate) {
  if (rate <= 3) return "ok";
  if (rate <= 7) return "warn";
  return "bahaya";
}

function qcRenderRingkasan_(d) {
  const wadah = document.getElementById("qc-ringkasan-isi");

  if (!d.totalDiperiksa) {
    wadah.innerHTML = '<div class="qc-kosong">Belum ada data inspeksi untuk filter ini.</div>';
    return;
  }

  const kartu =
    '<div class="qc-kartu-grid">' +
    '<div class="qc-kartu"><div class="qc-kartu-label">Defect rate keseluruhan</div>' +
    '<div class="qc-kartu-angka' + (d.defectRateKeseluruhan > 7 ? ' bahaya' : '') + '">' + d.defectRateKeseluruhan + '%</div></div>' +
    '<div class="qc-kartu"><div class="qc-kartu-label">First pass yield</div>' +
    '<div class="qc-kartu-angka">' + d.firstPassYield + '%</div></div>' +
    '<div class="qc-kartu"><div class="qc-kartu-label">PO reject terbanyak</div>' +
    '<div class="qc-kartu-angka" style="font-size:15px">' + rjdEscapeHtml_(d.poRejectTerbanyak || "-") + '</div></div>' +
    '<div class="qc-kartu"><div class="qc-kartu-label">Jenis cacat dominan</div>' +
    '<div class="qc-kartu-angka" style="font-size:15px">' + rjdEscapeHtml_(d.jenisCacatDominan || "-") + '</div></div>' +
    '</div>';

  const barTahap =
    '<div class="qc-subjudul">Defect rate per tahap</div>' +
    '<div class="qc-bar-list">' +
    d.perTahap.map(function (t) {
      const kelas = qcKelasBar_(t.defectRate);
      return '<div class="qc-bar-row">' +
        '<span class="qc-bar-label">' + rjdEscapeHtml_(t.tahap) + '</span>' +
        '<div class="qc-bar-track"><div class="qc-bar-fill ' + kelas + '" style="width:' + Math.min(t.defectRate * 4, 100) + '%"></div></div>' +
        '<span class="qc-bar-angka">' + t.defectRate + '%</span></div>';
    }).join("") +
    '</div>';

  const perOperator = d.perOperator.length
    ? '<table class="qc-operator-tabel">' + d.perOperator.map(function (o) {
      const kelas = qcKelasBar_(o.defectRate);
      return '<tr><td>' + rjdEscapeHtml_(o.operator) + '</td>' +
        '<td><span class="qc-operator-mini-bar"><span class="qc-operator-mini-fill ' + kelas + '" style="width:' + Math.min(o.defectRate * 4, 100) + '%"></span></span></td>' +
        '<td>' + o.defectRate + '%</td></tr>';
    }).join("") + '</table>'
    : '<div class="qc-kosong">Belum ada data.</div>';

  const jenisCacat = d.topJenisCacat.length
    ? '<div class="qc-jenis-list">' + d.topJenisCacat.map(function (j) {
      return '<div class="qc-jenis-row"><span>' + rjdEscapeHtml_(j.jenis) + '</span><span>' + j.jumlah + 'x</span></div>';
    }).join("") + '</div>'
    : '<div class="qc-kosong">Belum ada data.</div>';

  wadah.innerHTML = kartu + barTahap +
    '<div class="qc-dua-kolom">' +
    '<div><div class="qc-subjudul">Defect rate per operator</div>' + perOperator + '</div>' +
    '<div><div class="qc-subjudul">Top jenis cacat</div>' + jenisCacat + '</div>' +
    '</div>';
}

function qcSetupTombolGoogle() {
  if (typeof google === "undefined" || !google.accounts) return;
  google.accounts.id.initialize({
    client_id: QC_OAUTH_CLIENT_ID,
    callback: qcHandleGoogleLogin
  });
  const wadah = document.getElementById("qc-google-btn");
  if (wadah) google.accounts.id.renderButton(wadah, { theme: "outline", size: "large", width: 260 });
}

window.onload = function () {
  qcSetupTombolGoogle();
  const token = qcBacaSesi_();
  if (token) {
    QC_ID_TOKEN = token;
    qcMulai();
  } else {
    qcShow("qc-login-box");
  }
};
