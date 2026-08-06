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
let QC_RINGKASAN_DIMUAT = false;
// Rincian warna+size PO yang dipilih. Dipakai dropdown Warna & input qty lolos
// per size -- itu yang menyambungkan QC ke stok siap kirim di hilir.
let QC_RINCIAN_PO = null;
let QC_WARNA_DIPILIH = null; // cegah fetch ulang tiap ganti tab kalau filter belum berubah

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
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke qcMulaiIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(QC_ID_TOKEN, QC_API_URL, qcMulaiIsi_);
  } else {
    qcMulaiIsi_();
  }
}

function qcMulaiIsi_() {
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
    qcIsiDropdownLine_();

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
  qcMuatRincianPO_(po.idPurchaseOrder);
}

/**
 * Ambil rincian Warna + Size PO yang dipilih.
 *
 * SENGAJA memakai rute "getPOUntukCutting" yang sudah ada, bukan bikin rute
 * baru: keluarannya persis yang dibutuhkan di sini (daftar warna beserta size
 * yang benar-benar dipesan), dan menambah rute kembar cuma menambah tempat
 * yang harus ikut diperbaiki kalau cara baca Rincian SO berubah.
 */
function qcMuatRincianPO_(idPO) {
  QC_RINCIAN_PO = null;
  QC_WARNA_DIPILIH = null;
  const sel = document.getElementById("qc-warna");
  if (sel) sel.innerHTML = '<option value="">Memuat warna...</option>';
  qcRenderSizeLolos_();

  fetch(QC_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: QC_ID_TOKEN, action: "getPOUntukCutting", idPurchaseOrder: idPO })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      if (sel) sel.innerHTML = '<option value="">Gagal memuat warna</option>';
      qcTampilkanError_((d && d.error) || "Gagal memuat rincian warna PO ini.");
      return;
    }
    QC_RINCIAN_PO = d;
    qcIsiDropdownWarna_();
  })
  .catch(function () {
    if (sel) sel.innerHTML = '<option value="">Gagal memuat warna</option>';
    qcTampilkanError_("Gagal menghubungi server saat memuat rincian PO.");
  });
}

function qcIsiDropdownWarna_() {
  const sel = document.getElementById("qc-warna");
  if (!sel || !QC_RINCIAN_PO) return;
  sel.innerHTML = '<option value="">-- Pilih warna --</option>' +
    QC_RINCIAN_PO.baris.map(function (b, i) {
      return '<option value="' + i + '">' + rjdEscapeHtml_(b.warna || "(tanpa warna)") +
        ' &#183; ' + rjdEscapeHtml_([b.artikel, b.style].filter(Boolean).join(" / ")) +
        ' (' + b.totalOrder + ' pcs)</option>';
    }).join("");
}

function qcPilihWarna() {
  const v = document.getElementById("qc-warna").value;
  QC_WARNA_DIPILIH = (v === "" || !QC_RINCIAN_PO) ? null : QC_RINCIAN_PO.baris[Number(v)];
  qcRenderSizeLolos_();
}

/**
 * Input qty lolos PER SIZE.
 *
 * Cuma qty LOLOS yang dirinci per size, bukan diperiksa & cacat sekaligus --
 * kalau ketiganya, checker harus mengisi 30 angka per sesi dan form ini akan
 * ditinggalkan. Yang dibutuhkan hilir (stok siap kirim, pengiriman) memang
 * qty lolos per size; defect rate cukup di tingkat sesi.
 */
function qcRenderSizeLolos_() {
  const wadah = document.getElementById("qc-size-rows");
  if (!wadah) return;
  if (!QC_WARNA_DIPILIH) {
    wadah.innerHTML = '<p class="qc-hint">Pilih warna dulu untuk merinci qty lolos per size.</p>';
    qcHitungTotalSize_();
    return;
  }
  const sizes = Object.keys(QC_WARNA_DIPILIH.sizeQty);
  if (!sizes.length) {
    wadah.innerHTML = '<p class="qc-hint">Warna ini tidak punya rincian size di Rincian SO.</p>';
    qcHitungTotalSize_();
    return;
  }
  wadah.innerHTML = '<div class="qc-size-grid">' +
    sizes.map(function (sz) {
      return '<div class="qc-size-sel"><label>' + rjdEscapeHtml_(sz) + '</label>' +
        '<input class="qc-size-qty" type="number" min="0" data-size="' + rjdEscapeHtml_(sz) + '"' +
        ' oninput="qcHitungTotalSize_()" placeholder="0"/>' +
        '<div class="qc-size-order">order ' + QC_WARNA_DIPILIH.sizeQty[sz] + '</div></div>';
    }).join("") + '</div>';
  qcHitungTotalSize_();
}

/**
 * Cocokkan jumlah per size dengan Qty Lolos. Ditandai di layar SEBELUM submit
 * -- backend juga menolak kalau tidak sama, tapi memberi tahu setelah gagal
 * simpan itu terlambat buat checker yang sedang buru-buru di lantai.
 */
function qcHitungTotalSize_() {
  let total = 0;
  document.querySelectorAll(".qc-size-qty").forEach(function (inp) {
    total += Number(inp.value) || 0;
  });
  const qtyLolos = Number((document.getElementById("qc-lolos") || {}).value) || 0;
  const el = document.getElementById("qc-size-total");
  if (!el) return;
  if (!QC_WARNA_DIPILIH) { el.textContent = ""; el.className = "qc-hint"; return; }
  if (total === qtyLolos) {
    el.textContent = "Rincian size: " + total + " (cocok dengan Qty Lolos)";
    el.className = "qc-size-total ok";
  } else {
    el.textContent = "Rincian size: " + total + " -- Qty Lolos: " + qtyLolos + " (harus sama)";
    el.className = "qc-size-total beda";
  }
}

function qcKumpulkanLolosPerSize_() {
  const hasil = {};
  document.querySelectorAll(".qc-size-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v > 0) hasil[inp.dataset.size] = v;
  });
  return hasil;
}

/** Isi dropdown Line dari master. Kosong = distribusi-potongan.gs belum terpasang. */
function qcIsiDropdownLine_() {
  const sel = document.getElementById("qc-line");
  if (!sel || !QC_MASTER) return;
  const daftar = QC_MASTER.daftarLine || [];
  sel.innerHTML = '<option value="">-- Pilih line --</option>' +
    daftar.map(function (l) {
      return '<option value="' + rjdEscapeHtml_(l.idLine) + '">' + rjdEscapeHtml_(l.namaLine) +
        (l.lokasi ? " (" + rjdEscapeHtml_(l.lokasi) + ")" : "") + '</option>';
    }).join("");
}

function qcGantiPO() {
  QC_PO_TERPILIH = null;
  QC_RINCIAN_PO = null;
  QC_WARNA_DIPILIH = null;
  const selWarna = document.getElementById("qc-warna");
  if (selWarna) selWarna.innerHTML = '<option value="">-- Pilih PO dulu --</option>';
  qcRenderSizeLolos_();
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
  // Qty Lolos berubah -> pembanding rincian size ikut berubah.
  if (typeof qcHitungTotalSize_ === "function") setTimeout(qcHitungTotalSize_, 0);
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
  const idLine = (document.getElementById("qc-line") || {}).value || "";
  const qtyDiperiksa = Number(document.getElementById("qc-periksa").value) || 0;
  const qtyLolos = Number(document.getElementById("qc-lolos").value) || 0;
  const qtyCacat = Math.max(qtyDiperiksa - qtyLolos, 0);
  const detailCacat = qcKumpulkanDetailCacat_();
  const totalDetail = detailCacat.reduce(function (s, d) { return s + d.qty; }, 0);
  const lolosPerSize = qcKumpulkanLolosPerSize_();
  const totalSize = Object.keys(lolosPerSize).reduce(function (s, k) { return s + lolosPerSize[k]; }, 0);

  if (!idPO) return qcTampilkanError_("Pilih PO dari daftar (ketik lalu tap hasilnya) -- jangan dikosongkan.");
  if (!QC_TAHAP_DIPILIH) return qcTampilkanError_("Pilih tahap (Potong/Jahit/Finishing) dulu.");
  if (!QC_WARNA_DIPILIH) return qcTampilkanError_("Pilih warna dulu -- tanpa warna, qty lolos tidak bisa dihubungkan ke stok siap kirim.");
  // Line WAJIB di Jahit & Finishing, opsional di Potong -- cutting bukan line
  // jahit. Aturan yang sama ditegakkan backend, ini cuma supaya checker tahu
  // sebelum menekan simpan.
  if (QC_TAHAP_DIPILIH !== "Potong" && !idLine) {
    return qcTampilkanError_("Pilih line untuk tahap " + QC_TAHAP_DIPILIH + ".");
  }
  if (qtyDiperiksa <= 0) return qcTampilkanError_("Qty diperiksa harus lebih dari 0.");
  if (qtyLolos < 0 || qtyLolos > qtyDiperiksa) return qcTampilkanError_("Qty lolos tidak masuk akal (harus 0..Qty Diperiksa).");
  if (qtyLolos > 0 && totalSize !== qtyLolos) {
    return qcTampilkanError_("Rincian qty lolos per size (" + totalSize + ") harus sama dengan Qty Lolos (" + qtyLolos + ").");
  }
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
        idLine: idLine,
        operator: operator,
        brand: QC_WARNA_DIPILIH.brand || "",
        artikel: QC_WARNA_DIPILIH.artikel || "",
        style: QC_WARNA_DIPILIH.style || "",
        warna: QC_WARNA_DIPILIH.warna || "",
        qtyDiperiksa: qtyDiperiksa,
        qtyLolos: qtyLolos,
        lolosPerSize: lolosPerSize,
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
