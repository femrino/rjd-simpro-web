/**
 * ============================================================
 * SIMPRO -- simpro-spk
 * ============================================================
 * Halaman PEMBAGIAN POTONGAN & SPK PER LINE (spk.html).
 *
 * Menjawab satu urutan kerja yang selama ini tidak punya tempat di sistem:
 * setelah cutting selesai, potongan dibagi ke beberapa line jahit -- lalu tiap
 * line perlu SPK yang memuat JATAHNYA SENDIRI, bukan qty PO penuh.
 *
 * Sebelum ini SPK yang beredar di lantai selalu memuat qty PO penuh, jadi
 * penjahit membaca angka yang bukan jatahnya, dan output per line tidak punya
 * pembanding sama sekali.
 *
 * SENGAJA HALAMAN TERSENDIRI, bukan tab di Daftar Order: ini alur PRODUKSI.
 * Kepala produksi bisa membukanya tanpa melihat data harga & daftar order
 * lengkap. Pola sama dengan qc.html.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard, Daftar Order, Pengiriman,
 * Invoice (localStorage "db_session").
 *
 * DIMUAT DI : spk.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const SP_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const SP_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let SP_ID_TOKEN = null;

function spShow(id) {
  ["sp-login-box", "sp-loading", "sp-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function spBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  } catch (e) { return null; }
}

function spSimpanSesi_(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  } catch (e) {}
}

function spHandleGoogleLogin(response) {
  SP_ID_TOKEN = response.credential;
  spSimpanSesi_(response.credential);
  spMulai();
}

function spLogout() {
  SP_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) {}
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const el = document.getElementById("sp-nav-logout");
  if (el) el.classList.add("hidden");
  spShow("sp-login-box");
}

function spMulai() {
  spShow("sp-isi");
  const el = document.getElementById("sp-nav-logout");
  if (el) el.classList.remove("hidden");
  spMuatDaftarPO();
}

/* ============================================================
 * LANGKAH 1 -- PILIH PO
 * ============================================================
 * Memakai rute getDaftarPO yang SUDAH ADA (daftar-po.gs), tidak bikin rute
 * baru. Daftarnya bisa ratusan baris, jadi dipakai kotak cari + dropdown
 * hasil, bukan <select> native -- pola yang sama dengan pemilih PO di qc.html.
 * ============================================================ */

function spMuatDaftarPO() {
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getDaftarPO" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      spPesan_("sp-po-pesan", (d && d.error) || "Gagal memuat daftar PO.", true);
      return;
    }
    // Order yang sudah Selesai tidak perlu dibagi lagi -- menyembunyikannya
    // membuat daftar jauh lebih pendek & relevan untuk lantai produksi.
    window.SP_DAFTAR_PO = (d.daftar || []).filter(function (p) {
      return String(p.status || "").toLowerCase() !== "selesai";
    });
  })
  .catch(function () {
    spPesan_("sp-po-pesan", "Gagal menghubungi server.", true);
  });
}

function spCariPO() {
  const q = (document.getElementById("sp-po-cari").value || "").trim().toLowerCase();
  const dd = document.getElementById("sp-po-dropdown");
  if (!dd) return;
  if (!q) { dd.classList.add("hidden"); return; }

  const semua = window.SP_DAFTAR_PO || [];
  const hasil = semua.filter(function (p) {
    return [p.idPurchaseOrder, p.noSO, p.namaKlien, (p.artikel || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  }).slice(0, 25);

  dd.classList.remove("hidden");
  if (!hasil.length) {
    dd.innerHTML = '<div class="sp-po-kosong">Tidak ada PO yang cocok.</div>';
    return;
  }
  dd.innerHTML = hasil.map(function (p) {
    return '<div class="sp-po-opsi" data-id="' + rjdEscapeHtml_(p.idPurchaseOrder) +
      '" onclick="spPilihPO(this.dataset.id)">' +
      '<div class="sp-po-opsi-id">' + rjdEscapeHtml_(p.idPurchaseOrder) + '</div>' +
      '<div class="sp-po-opsi-sub">' + rjdEscapeHtml_(p.namaKlien) +
        ' &#183; ' + (p.jumlah || 0) + ' pcs' +
        (p.deadline ? ' &#183; deadline ' + rjdEscapeHtml_(p.deadline) : '') + '</div>' +
    '</div>';
  }).join("");
}

/**
 * PO dipilih SEKALI, dipakai bersama kedua tab. Alur di lantai memang satu
 * rangkaian (potong -> bagi -> cetak SPK), jadi memaksa cari PO dua kali cuma
 * jadi friksi tanpa manfaat.
 */
function spPilihPO(idPO) {
  document.getElementById("sp-po-dropdown").classList.add("hidden");
  document.getElementById("sp-po-cari").value = idPO;
  spPesan_("sp-po-pesan", "", false);
  window.SP_PO_AKTIF = idPO;
  window.SP_PO = null;
  window.SP_CUT = null;
  document.getElementById("sp-tabs").classList.remove("hidden");
  spSwitchTab(window.SP_TAB || "cutting");
}

/** Muat data tab "Bagi ke Line" (perilaku lama spPilihPO). */
function spMuatDistribusi() {
  const idPO = window.SP_PO_AKTIF;
  if (!idPO) return;
  document.getElementById("sp-form").classList.add("hidden");
  document.getElementById("sp-memuat-po").classList.remove("hidden");

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getPOUntukDistribusi", idPurchaseOrder: idPO })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    document.getElementById("sp-memuat-po").classList.add("hidden");
    if (!d || !d.success) {
      spPesan_("sp-po-pesan", (d && d.error) || "Gagal memuat rincian PO.", true);
      return;
    }
    window.SP_PO = d;
    spRenderForm();
    document.getElementById("sp-form").classList.remove("hidden");
  })
  .catch(function () {
    document.getElementById("sp-memuat-po").classList.add("hidden");
    spPesan_("sp-po-pesan", "Gagal menghubungi server.", true);
  });
}

/* ============================================================
 * LANGKAH 2 -- ISI PEMBAGIAN
 * ============================================================ */

/**
 * Tabel isian. Tiap sel menampilkan SISA yang belum dibagi, dan input dibatasi
 * ke angka itu (max). Petugas tidak perlu menghitung sendiri berapa yang masih
 * boleh dibagi -- itu justru sumber kesalahan yang mau dihilangkan.
 */
function spRenderForm() {
  const po = window.SP_PO;
  if (!po) return;

  // Dropdown line
  const selLine = document.getElementById("sp-line");
  selLine.innerHTML = '<option value="">-- Pilih line penerima --</option>' +
    (po.daftarLine || []).map(function (l) {
      return '<option value="' + rjdEscapeHtml_(l.idLine) + '">' +
        rjdEscapeHtml_(l.namaLine) + (l.lokasi ? " (" + rjdEscapeHtml_(l.lokasi) + ")" : "") +
        '</option>';
    }).join("");
  if (!(po.daftarLine || []).length) {
    spPesan_("sp-po-pesan", "Belum ada line terdaftar. Isi dulu sheet SD Master Line.", true);
  }

  // Ringkasan pembagian yang sudah ada
  const rk = document.getElementById("sp-ringkas");
  if ((po.perLine || []).length) {
    rk.innerHTML = '<div class="sp-ringkas-judul">Sudah dibagi ke</div>' +
      '<div class="sp-ringkas-list">' +
      po.perLine.map(function (l) {
        // Dua tautan, dua peran: SPK = dokumen kerja PO ini untuk line itu;
        // Rekap = semua PO yang dipegang line itu (lintas order).
        return '<div class="sp-ringkas-item"><span>' + rjdEscapeHtml_(l.namaLine) + '</span>' +
          '<b>' + l.qty + ' pcs</b>' +
          '<a href="/p/cetak.html?jenis=spk&amp;id=' + encodeURIComponent(po.idPurchaseOrder) +
            '&amp;line=' + encodeURIComponent(l.idLine) + '" target="_blank">Cetak SPK</a>' +
          '<a class="sp-rekap-link" href="/p/cetak.html?jenis=rekapline&amp;line=' +
            encodeURIComponent(l.idLine) + '" target="_blank">Rekap Line</a></div>';
      }).join("") + '</div>';
    rk.classList.remove("hidden");
  } else {
    rk.innerHTML = '';
    rk.classList.add("hidden");
  }

  // Kolom size yang BENAR-BENAR dipakai PO ini saja -- kalau semua 10 kolom
  // ditampilkan, tabelnya penuh kolom kosong dan sulit dibaca di HP.
  const dipakai = {};
  po.baris.forEach(function (b) {
    Object.keys(b.sizeQty).forEach(function (sz) { dipakai[sz] = true; });
  });
  const kolom = po.sizeKolom.filter(function (sz) { return dipakai[sz]; });
  window.SP_KOLOM = kolom;

  document.getElementById("sp-tabel").innerHTML =
    '<div class="sp-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Artikel / Warna</th>' +
      kolom.map(function (sz) { return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="num">Total</th>' +
    '</tr></thead><tbody>' +
    po.baris.map(function (b, i) {
      const habis = b.totalSisa <= 0;
      return '<tr' + (habis ? ' class="sp-habis"' : '') + '>' +
        '<td><div class="sp-warna">' + rjdEscapeHtml_(b.warna || "-") + '</div>' +
          '<div class="sp-artikel">' + rjdEscapeHtml_([b.artikel, b.style].filter(Boolean).join(" / ")) + '</div>' +
          '<div class="sp-sisa-info">' + (habis ? 'sudah dibagi semua'
            : ('sisa ' + b.totalSisa + ' dari ' + b.totalQty + ' pcs')) + '</div></td>' +
        kolom.map(function (sz) {
          const order = b.sizeQty[sz] || 0;
          const sisa = b.sisa[sz] === undefined ? 0 : b.sisa[sz];
          if (!order) return '<td class="num sp-kosong">&#183;</td>';
          if (sisa <= 0) return '<td class="num sp-kosong" title="sudah dibagi semua">0</td>';
          return '<td class="num"><input class="sp-qty" type="number" min="0" max="' + sisa + '"' +
            ' data-baris="' + i + '" data-size="' + rjdEscapeHtml_(sz) + '"' +
            ' oninput="spHitungTotal()" placeholder="0"/>' +
            '<div class="sp-maks">/' + sisa + '</div></td>';
        }).join("") +
        '<td class="num sp-total-baris" id="sp-tot-' + i + '">0</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';

  // Tanggal serah default hari ini
  const t = new Date();
  const inp = document.getElementById("sp-tanggal");
  if (inp && !inp.value) {
    inp.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") +
      "-" + String(t.getDate()).padStart(2, "0");
  }
  spHitungTotal();
}

/** Hitung ulang total per baris & keseluruhan tiap ada ketikan. */
function spHitungTotal() {
  const po = window.SP_PO;
  if (!po) return;
  const perBaris = {};
  let total = 0;

  document.querySelectorAll(".sp-qty").forEach(function (inp) {
    const i = inp.dataset.baris;
    const v = Number(inp.value) || 0;
    const maks = Number(inp.max) || 0;
    // Tandai kalau melebihi sisa. Backend tetap menolaknya juga (pengaman
    // berlapis), tapi memberi tahu di layar jauh lebih baik daripada
    // memberi tahu setelah gagal simpan.
    inp.classList.toggle("sp-lebih", v > maks);
    perBaris[i] = (perBaris[i] || 0) + v;
    total += v;
  });

  po.baris.forEach(function (b, i) {
    const el = document.getElementById("sp-tot-" + i);
    if (el) el.textContent = perBaris[i] || 0;
  });

  document.getElementById("sp-total").textContent = total;
  const btn = document.getElementById("sp-simpan-btn");
  if (btn) btn.disabled = (total <= 0);
}

function spSimpan() {
  const po = window.SP_PO;
  if (!po) return;

  const idLine = document.getElementById("sp-line").value;
  if (!idLine) { alert("Pilih dulu line yang menerima potongan."); return; }

  // Kumpulkan per baris warna
  const perBaris = {};
  document.querySelectorAll(".sp-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v <= 0) return;
    const i = inp.dataset.baris;
    if (!perBaris[i]) perBaris[i] = {};
    perBaris[i][inp.dataset.size] = v;
  });

  const barisKirim = Object.keys(perBaris).map(function (i) {
    const b = po.baris[i];
    return {
      noSO: b.noSO, brand: b.brand, artikel: b.artikel, style: b.style,
      warna: b.warna, sizeQty: perBaris[i]
    };
  });
  if (!barisKirim.length) { alert("Belum ada qty yang diisi."); return; }

  const btn = document.getElementById("sp-simpan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: "simpanDistribusiPotongan",
      payload: {
        idPurchaseOrder: po.idPurchaseOrder,
        idLine: idLine,
        tanggalSerah: document.getElementById("sp-tanggal").value || "",
        diterimaOleh: document.getElementById("sp-diterima").value || "",
        catatan: document.getElementById("sp-catatan").value || "",
        baris: barisKirim
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    btn.disabled = false;
    btn.textContent = "Simpan Pembagian";
    if (!h || !h.success) {
      alert((h && h.error) || "Gagal menyimpan pembagian.");
      return;
    }
    // Tautan cetak langsung muncul -- itu tujuan seluruh halaman ini.
    const kotak = document.getElementById("sp-sukses");
    kotak.innerHTML =
      '<div class="sp-sukses-isi">' +
        '<b>' + h.totalQty + ' pcs</b> tersimpan untuk <b>' + rjdEscapeHtml_(h.namaLine) + '</b>' +
        ' (' + h.jumlahBaris + ' baris warna).' +
        '<a class="sp-cetak-btn" target="_blank" href="/p/cetak.html?jenis=spk&amp;id=' +
          encodeURIComponent(h.idPurchaseOrder) + '&amp;line=' + encodeURIComponent(h.idLine) + '">' +
          'Cetak SPK ' + rjdEscapeHtml_(h.namaLine) + '</a>' +
      '</div>';
    kotak.classList.remove("hidden");
    // Muat ulang supaya kolom sisa & ringkasan line ikut ter-update -- kalau
    // tidak, layar menampilkan sisa yang sudah basi dan pembagian berikutnya
    // dihitung dari angka salah.
    window.SP_PO = null;
    spMuatDistribusi();
  })
  .catch(function () {
    btn.disabled = false;
    btn.textContent = "Simpan Pembagian";
    alert("Gagal menghubungi server.");
  });
}

/* ============================================================
 * TAB 1 -- HASIL CUTTING (qty potong AKTUAL)
 * ============================================================
 * Titik kontrol kuantitas yang selama ini hilang dari sistem:
 *
 *     qty order  ->  QTY POTONG  ->  dibagi ke line  ->  output
 *
 * Tanpa angka potong, saat barang kirim tidak sama dengan order, tidak ada
 * yang bisa menjawab di titik mana selisihnya lahir. Untuk order CMT (kain
 * dari klien) ini lebih penting lagi: tanpa catatan potong + kain terpakai,
 * RJD tidak punya dasar apa pun saat klien menagih kekurangan barang.
 *
 * BEDA SIKAP dengan tab Bagi ke Line: di sini TIDAK ADA batas atas. Overcut
 * (potong lebih untuk cadangan) itu praktik normal, dan memblokirnya cuma
 * akan bikin petugas mengisi angka bohong supaya tersimpan. Selisih terhadap
 * order tetap ditampilkan, tapi sebagai INFORMASI, bukan penghalang.
 * ============================================================ */

/** Pindah tab. Data tiap tab dimuat MALAS -- baru diambil saat tabnya dibuka. */
function spSwitchTab(tab) {
  window.SP_TAB = tab;
  document.querySelectorAll(".sp-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("sp-panel-cutting").classList.toggle("hidden", tab !== "cutting");
  document.getElementById("sp-panel-bagi").classList.toggle("hidden", tab !== "bagi");
  if (!window.SP_PO_AKTIF) return;
  if (tab === "cutting" && !window.SP_CUT) spMuatCutting();
  if (tab === "bagi" && !window.SP_PO) spMuatDistribusi();
}

function spMuatCutting() {
  const wadah = document.getElementById("sp-cut-tabel");
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat rincian PO...</p>';
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getPOUntukCutting",
      idPurchaseOrder: window.SP_PO_AKTIF
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat rincian PO.") + '</p>';
      return;
    }
    window.SP_CUT = d;
    spRenderFormCutting();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

/**
 * Tabel isian hasil potong. Tiap sel menampilkan qty ORDER sebagai acuan dan
 * berapa yang SUDAH tercatat dipotong -- supaya petugas tahu ini pencatatan
 * ke berapa, bukan mengira harus mengisi total dari nol tiap kali.
 */
function spRenderFormCutting() {
  const po = window.SP_CUT;
  if (!po) return;

  const dipakai = {};
  po.baris.forEach(function (b) {
    Object.keys(b.sizeQty).forEach(function (sz) { dipakai[sz] = true; });
  });
  const kolom = po.sizeKolom.filter(function (sz) { return dipakai[sz]; });

  // Ringkasan catatan yang sudah ada -- konteks sebelum mengisi.
  const rk = document.getElementById("sp-cut-ringkas");
  if (po.sudahAdaCatatan) {
    const kain = Object.keys(po.kainTotal || {});
    rk.innerHTML = '<div class="sp-ringkas-judul">Sudah tercatat dipotong</div>' +
      '<div class="sp-ringkas-list"><div class="sp-ringkas-item">' +
        '<span>' + po.jumlahBarisCatatan + ' catatan' +
          (po.tanggalTerakhir ? ' &#183; terakhir ' + rjdEscapeHtml_(po.tanggalTerakhir) : '') + '</span>' +
        '<b>' + po.totalPotong + ' pcs</b></div>' +
        (kain.length ? '<div class="sp-ringkas-item"><span>Kain terpakai</span><b>' +
          kain.map(function (s) { return po.kainTotal[s] + " " + rjdEscapeHtml_(s); }).join(", ") +
          '</b></div>' : '') +
      '</div>';
    rk.classList.remove("hidden");
  } else {
    rk.innerHTML = '';
    rk.classList.add("hidden");
  }

  document.getElementById("sp-cut-tabel").innerHTML =
    '<div class="sp-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Artikel / Warna</th>' +
      kolom.map(function (sz) { return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="num">Total</th>' +
    '</tr></thead><tbody>' +
    po.baris.map(function (b, i) {
      const s = b.totalSelisih;
      return '<tr>' +
        '<td><div class="sp-warna">' + rjdEscapeHtml_(b.warna || "-") + '</div>' +
          '<div class="sp-artikel">' + rjdEscapeHtml_([b.artikel, b.style].filter(Boolean).join(" / ")) + '</div>' +
          '<div class="sp-sisa-info">order ' + b.totalOrder + ' &#183; potong ' + b.totalPotong +
            (b.totalPotong ? (s === 0 ? ' (pas)' : (s > 0 ? ' (+' + s + ' overcut)' : ' (' + s + ')')) : '') +
          '</div></td>' +
        kolom.map(function (sz) {
          const order = b.sizeQty[sz] || 0;
          if (!order) return '<td class="num sp-kosong">&#183;</td>';
          const sudah = b.sudahPotong[sz] || 0;
          return '<td class="num"><input class="sp-cut-qty" type="number"' +
            ' data-baris="' + i + '" data-size="' + rjdEscapeHtml_(sz) + '"' +
            ' oninput="spHitungTotalCutting()" placeholder="0"/>' +
            '<div class="sp-maks">order ' + order + (sudah ? ' &#183; ada ' + sudah : '') + '</div></td>';
        }).join("") +
        '<td class="num sp-total-baris" id="sp-cut-tot-' + i + '">0</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';

  const t = new Date();
  const inp = document.getElementById("sp-cut-tanggal");
  if (inp && !inp.value) {
    inp.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") +
      "-" + String(t.getDate()).padStart(2, "0");
  }
  spHitungTotalCutting();
}

function spHitungTotalCutting() {
  const po = window.SP_CUT;
  if (!po) return;
  const perBaris = {};
  let total = 0;
  document.querySelectorAll(".sp-cut-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    perBaris[inp.dataset.baris] = (perBaris[inp.dataset.baris] || 0) + v;
    total += v;
  });
  po.baris.forEach(function (b, i) {
    const el = document.getElementById("sp-cut-tot-" + i);
    if (el) el.textContent = perBaris[i] || 0;
  });
  document.getElementById("sp-cut-total").textContent = total;
  const btn = document.getElementById("sp-cut-simpan-btn");
  if (btn) btn.disabled = (total === 0);
}

function spSimpanCutting() {
  const po = window.SP_CUT;
  if (!po) return;

  const perBaris = {};
  document.querySelectorAll(".sp-cut-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v === 0) return;
    const i = inp.dataset.baris;
    if (!perBaris[i]) perBaris[i] = {};
    perBaris[i][inp.dataset.size] = v;
  });
  const barisKirim = Object.keys(perBaris).map(function (i) {
    const b = po.baris[i];
    return {
      noSO: b.noSO, brand: b.brand, artikel: b.artikel, style: b.style,
      warna: b.warna, sizeQty: perBaris[i]
    };
  });
  if (!barisKirim.length) { alert("Belum ada qty yang diisi."); return; }

  const btn = document.getElementById("sp-cut-simpan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "simpanHasilCutting",
      payload: {
        idPurchaseOrder: po.idPurchaseOrder,
        tanggalPotong: (document.getElementById("sp-cut-tanggal") || {}).value || "",
        dipotongOleh: (document.getElementById("sp-cut-oleh") || {}).value || "",
        lokasi: (document.getElementById("sp-cut-lokasi") || {}).value || "",
        kainDipakai: (document.getElementById("sp-cut-kain") || {}).value || "",
        satuanKain: (document.getElementById("sp-cut-satuan") || {}).value || "meter",
        catatan: (document.getElementById("sp-cut-catatan") || {}).value || "",
        baris: barisKirim
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    btn.disabled = false;
    btn.textContent = "Simpan Hasil Potong";
    if (!h || !h.success) {
      alert((h && h.error) || "Gagal menyimpan hasil potong.");
      return;
    }
    const kotak = document.getElementById("sp-cut-sukses");
    kotak.innerHTML = '<div class="sp-sukses-isi"><b>' + h.totalQty +
      ' pcs</b> tersimpan (' + h.jumlahBaris + ' baris warna). Total potong PO ini sekarang <b>' +
      h.totalPotongKumulatif + ' pcs</b>.</div>';
    kotak.classList.remove("hidden");
    // KEDUANYA dikosongkan: catatan potong baru mengubah "sisa yang boleh
    // dibagi" di tab sebelah. Kalau tidak direset, tab Bagi ke Line masih
    // memakai angka lama dan pembagian berikutnya dihitung dari dasar salah.
    window.SP_CUT = null;
    window.SP_PO = null;
    spMuatCutting();
  })
  .catch(function () {
    btn.disabled = false;
    btn.textContent = "Simpan Hasil Potong";
    alert("Gagal menghubungi server.");
  });
}

function spPesan_(id, teks, bahaya) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!teks) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = teks;
  el.classList.toggle("sp-galat", !!bahaya);
  el.classList.remove("hidden");
}

function spSetupTombolGoogle() {
  if (typeof google === "undefined" || !google.accounts) return;
  google.accounts.id.initialize({ client_id: SP_OAUTH_CLIENT_ID, callback: spHandleGoogleLogin });
  const wadah = document.getElementById("sp-google-btn");
  if (wadah) google.accounts.id.renderButton(wadah, { theme: "outline", size: "large", width: 260 });
}

window.onload = function () {
  spSetupTombolGoogle();
  const token = spBacaSesi_();
  if (token) { SP_ID_TOKEN = token; spMulai(); }
  else spShow("sp-login-box");

  // Tutup dropdown PO kalau klik di luar kotaknya.
  document.addEventListener("click", function (e) {
    const wrap = document.getElementById("sp-po-field");
    const dd = document.getElementById("sp-po-dropdown");
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.add("hidden");
  });
};
