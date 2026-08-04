/**
 * ============================================================
 * SIMPRO -- simpro-spk
 * ============================================================
 * Halaman LANTAI PRODUKSI (produksi.html; URL lama spk.html masih dilayani).
 *
 * Semula halaman ini cuma soal SPK per line, lalu tumbuh jadi tempat mencatat
 * SELURUH pergerakan barang di lantai: hasil cutting, pembagian ke line,
 * setoran balik ke finishing, konfirmasi terima, dan riwayat/koreksi. Nama
 * "SPK" sudah tidak mewakili -- SPK kini cuma salah satu keluaran dari tab
 * "Bagi ke Line".
 *
 * Nama file (simpro-spk.js) SENGAJA tidak ikut diganti: mengganti nama file
 * berarti semua tag CDN lama menunjuk file yang hilang, dan itu risiko yang
 * tidak sepadan dengan kerapian nama.
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
 * TAB SENGAJA TIDAK BERNOMOR. Penomoran cocok untuk wizard -- langkah
 * berurutan yang dilalui SATU orang dalam SATU sesi. Halaman ini bukan itu:
 * lima tabnya adalah lima pintu untuk lima momen & peran berbeda (cutting,
 * kepala produksi, finishing, kepala line, siapa pun yang mengoreksi). Tidak
 * ada yang melalui 1-2-3-4 berurutan, dan nomor justru menyiratkan "harus
 * mulai dari 1". Urutan kiri-ke-kanan sudah cukup menunjukkan alurnya.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard, Daftar Order, Pengiriman,
 * Invoice (localStorage "db_session").
 *
 * DIMUAT DI : produksi.html (dan spk.html, URL lama)
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
  spMuatDaftarLine_();
}

/** Daftar line untuk filter di tab Konfirmasi. */
function spMuatDaftarLine_() {
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getDaftarLine" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d && d.success) {
      window.SP_DAFTAR_LINE = d.daftar || [];
      spIsiFilterLineKonf_(window.SP_DAFTAR_LINE);
      spMuatLineSetoran_();
    }
  })
  .catch(function () { /* filter line opsional -- halaman tetap jalan */ });
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
  window.SP_SETOR = null;
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
        return '<div class="sp-ringkas-item"><span>' + rjdEscapeHtml_(l.namaLine) +
          (l.targetSelesai
            ? ' <span class="sp-ringkas-target">target ' + rjdEscapeHtml_(l.targetSelesai) + '</span>'
            : ' <span class="sp-ringkas-target kosong">target belum diisi</span>') + '</span>' +
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
        targetSelesai: (document.getElementById("sp-target") || {}).value || "",
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
  document.getElementById("sp-panel-konf").classList.toggle("hidden", tab !== "konf");
  document.getElementById("sp-panel-riw").classList.toggle("hidden", tab !== "riw");
  document.getElementById("sp-panel-setor").classList.toggle("hidden", tab !== "setor");
  // Kartu "Pilih PO" cuma relevan untuk dua tab pertama. Tab Konfirmasi
  // melihat semua yang menunggu LINTAS ORDER -- memaksa pilih PO dulu di situ
  // justru membalik cara kepala line bekerja (dia pegang beberapa order).
  const kartuPO = document.getElementById("sp-kartu-po");
  if (kartuPO) kartuPO.classList.toggle("hidden", tab === "konf" || tab === "riw");

  if (tab === "konf") { spMuatKonfirmasi(); return; }
  if (tab === "riw") { spMuatRiwayat(); return; }
  if (tab === "setor") { spMuatLineSetoran_(); spMuatSetoran(); return; }
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

/* ============================================================
 * TAB 3 -- KONFIRMASI TERIMA (kepala line)
 * ============================================================
 * Kontrol pihak kedua. Cutting yang MENCATAT serah-terima, line yang
 * MEMBENARKAN -- kalau line mencatat sendiri jatahnya, tidak ada pembanding
 * saat terjadi sengketa, padahal angka ini nanti jadi dasar upah borongan.
 *
 * Selisih TIDAK mengedit angka asli: backend membuat baris KOREKSI berisi
 * selisihnya, sehingga total alokasi jadi benar TANPA menghapus jejak "cutting
 * menyerahkan sekian, line mengaku terima sekian". Justru selisih itulah datanya.
 *
 * Tab ini TIDAK butuh PO dipilih -- kepala line melihat semua yang menunggu
 * untuknya, lintas order.
 * ============================================================ */

function spMuatKonfirmasi() {
  const wadah = document.getElementById("sp-konf-daftar");
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat daftar...</p>';
  const idLine = (document.getElementById("sp-konf-line") || {}).value || "";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getMenungguKonfirmasi", idLine: idLine })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar konfirmasi.") + '</p>';
      return;
    }
    window.SP_KONF = d.daftar || [];
    spRenderKonfirmasi();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

/** Isi dropdown filter line di tab konfirmasi (dari daftar line aktif). */
function spIsiFilterLineKonf_(daftarLine) {
  const sel = document.getElementById("sp-konf-line");
  if (!sel) return;
  const terpilih = sel.value;
  sel.innerHTML = '<option value="">Semua line</option>' +
    (daftarLine || []).map(function (l) {
      return '<option value="' + rjdEscapeHtml_(l.idLine) + '">' + rjdEscapeHtml_(l.namaLine) + '</option>';
    }).join("");
  if (terpilih) sel.value = terpilih;
}

function spRenderKonfirmasi() {
  const wadah = document.getElementById("sp-konf-daftar");
  if (!wadah) return;
  const daftar = window.SP_KONF || [];

  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">Tidak ada serah-terima yang menunggu konfirmasi.</p>';
    return;
  }

  wadah.innerHTML = daftar.map(function (k, i) {
    const sizes = Object.keys(k.sizeQty || {});
    return '<div class="sp-konf-kartu" id="sp-konf-' + i + '">' +
      '<div class="sp-konf-head">' +
        '<div>' +
          '<div class="sp-konf-line">' + rjdEscapeHtml_(k.namaLine || k.idLine || "-") + '</div>' +
          '<div class="sp-konf-sub">' + rjdEscapeHtml_(k.idPurchaseOrder) +
            ' &#183; ' + rjdEscapeHtml_(k.tanggalSerah || "-") +
            (k.diserahkanOleh ? ' &#183; dari ' + rjdEscapeHtml_(k.diserahkanOleh) : '') + '</div>' +
        '</div>' +
        '<div class="sp-konf-qty">' + k.totalQty + '<span>pcs</span></div>' +
      '</div>' +
      '<div class="sp-konf-artikel">' +
        rjdEscapeHtml_([k.artikel, k.style].filter(Boolean).join(" / ")) +
        ' &#183; <b>' + rjdEscapeHtml_(k.warna || "-") + '</b></div>' +
      // Rincian size ditampilkan supaya kepala line bisa mencocokkan bundel
      // fisik dengan angkanya, bukan cuma total.
      '<div class="sp-konf-sizes">' +
        sizes.map(function (sz) {
          return '<span class="sp-konf-size">' + rjdEscapeHtml_(sz) + ' <b>' + k.sizeQty[sz] + '</b></span>';
        }).join("") +
      '</div>' +
      (k.catatan ? '<div class="sp-konf-catatan">' + rjdEscapeHtml_(k.catatan) + '</div>' : '') +

      '<div class="sp-konf-aksi">' +
        '<button class="sp-konf-btn terima" data-i="' + i + '" onclick="spKonfirmasiCocok(this.dataset.i)" type="button">Terima sesuai</button>' +
        '<button class="sp-konf-btn selisih" data-i="' + i + '" onclick="spBukaSelisih(this.dataset.i)" type="button">Ada selisih</button>' +
      '</div>' +

      // Panel selisih: isi qty yang BENAR-BENAR diterima per size.
      '<div class="sp-konf-selisih hidden" id="sp-konf-selisih-' + i + '">' +
        '<p class="sp-konf-hint">Isi jumlah yang benar-benar diterima. Angka asli tidak diubah &#8212; selisihnya dicatat sebagai baris koreksi tersendiri.</p>' +
        '<div class="sp-konf-size-grid">' +
          sizes.map(function (sz) {
            return '<div class="sp-konf-size-sel"><label>' + rjdEscapeHtml_(sz) + '</label>' +
              '<input class="sp-konf-qty-input" type="number" min="0" data-kartu="' + i + '"' +
              ' data-size="' + rjdEscapeHtml_(sz) + '" value="' + k.sizeQty[sz] + '"/>' +
              '<div class="sp-konf-size-asal">dari ' + k.sizeQty[sz] + '</div></div>';
          }).join("") +
        '</div>' +
        '<div class="sp-field" style="margin-top:10px">' +
          '<label>Catatan (kenapa berbeda)</label>' +
          '<input id="sp-konf-catatan-' + i + '" placeholder="mis. 3 pcs kain cacat, dikembalikan ke cutting" type="text"/>' +
        '</div>' +
        '<div class="sp-konf-aksi">' +
          '<button class="sp-konf-btn batal" data-i="' + i + '" onclick="spTutupSelisih(this.dataset.i)" type="button">Batal</button>' +
          '<button class="sp-konf-btn selisih" data-i="' + i + '" onclick="spKonfirmasiSelisih(this.dataset.i)" type="button">Simpan selisih</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

function spBukaSelisih(i) {
  const el = document.getElementById("sp-konf-selisih-" + i);
  if (el) el.classList.remove("hidden");
}
function spTutupSelisih(i) {
  const el = document.getElementById("sp-konf-selisih-" + i);
  if (el) el.classList.add("hidden");
}

function spKonfirmasiCocok(i) {
  const k = (window.SP_KONF || [])[i];
  if (!k) return;
  spKirimKonfirmasi_({ idDistribusi: k.idDistribusi, cocok: true });
}

function spKonfirmasiSelisih(i) {
  const k = (window.SP_KONF || [])[i];
  if (!k) return;

  const sizeQtyDiterima = {};
  let ada = false;
  document.querySelectorAll('.sp-konf-qty-input[data-kartu="' + i + '"]').forEach(function (inp) {
    const v = Number(inp.value) || 0;
    sizeQtyDiterima[inp.dataset.size] = v;
    if (v !== (k.sizeQty[inp.dataset.size] || 0)) ada = true;
  });
  if (!ada) {
    alert("Angkanya sama persis dengan yang dicatat.\n\nKalau memang cocok, pakai tombol \"Terima sesuai\".");
    return;
  }
  const catatan = (document.getElementById("sp-konf-catatan-" + i) || {}).value || "";
  if (!catatan.trim()) {
    alert("Isi dulu catatan kenapa jumlahnya berbeda.\n\nStatus \"ada selisih\" tanpa keterangan tidak menolong siapa pun saat ditelusuri nanti.");
    return;
  }
  spKirimKonfirmasi_({
    idDistribusi: k.idDistribusi,
    cocok: false,
    sizeQtyDiterima: sizeQtyDiterima,
    catatan: catatan.trim()
  });
}

function spKirimKonfirmasi_(payload) {
  payload.diterimaOleh = (document.getElementById("sp-konf-nama") || {}).value || "";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "konfirmasiTerima", payload: payload })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    if (!h || !h.success) {
      alert((h && h.error) || "Gagal menyimpan konfirmasi.");
      return;
    }
    // Konfirmasi mengubah alokasi (kalau ada koreksi), jadi cache tab Bagi ke
    // Line dikosongkan -- kalau tidak, sisa di sana memakai angka sebelum koreksi.
    window.SP_PO = null;
    spMuatKonfirmasi();
  })
  .catch(function () { alert("Gagal menghubungi server."); });
}

/* ============================================================
 * TAB 4 -- RIWAYAT & KOREKSI
 * ============================================================
 * Menjawab dua kebutuhan yang selama ini tidak ada tempatnya:
 *
 *   1. "Apa saja yang sudah dicatat?" -- sebelumnya harus pilih PO dulu, jadi
 *      pertanyaan sehari-hari ("apa yang dibagi hari ini", "mana yang barusan
 *      saya input") tidak bisa dijawab tanpa tahu PO-nya lebih dulu.
 *   2. "Saya salah input, bagaimana membetulkannya?"
 *
 * SENGAJA TIDAK ADA TOMBOL EDIT. Kalau baris lama bisa ditimpa, jejak "siapa
 * mencatat apa kapan" hilang -- padahal itu dasar upah borongan nanti, dan
 * justru alasan seluruh struktur ini dibuat sebagai ledger.
 *
 * Gantinya BATALKAN: barisnya tetap ada tapi dilewati saat dijumlahkan, alasan
 * wajib diisi, lalu input ulang yang benar. Fakta "pernah ada kesalahan" tetap
 * tercatat -- itu yang dibutuhkan saat ditelusuri, bukan disembunyikan.
 * ============================================================ */

function spSwitchRiwayat(jenis) {
  window.SP_RIW_JENIS = jenis;
  document.querySelectorAll(".sp-riw-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.jenis === jenis);
  });
  spMuatRiwayat();
}

function spMuatRiwayat() {
  const jenis = window.SP_RIW_JENIS || "distribusi";
  const wadah = document.getElementById("sp-riw-daftar");
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat riwayat...</p>';

  const cari = (document.getElementById("sp-riw-cari") || {}).value || "";
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: jenis === "cutting" ? "getRiwayatCutting" : "getRiwayatDistribusi",
      opsi: { idPurchaseOrder: cari.trim() }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat riwayat.") + '</p>';
      return;
    }
    window.SP_RIW = d.daftar || [];
    spRenderRiwayat();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

function spRenderRiwayat() {
  const wadah = document.getElementById("sp-riw-daftar");
  if (!wadah) return;
  const jenis = window.SP_RIW_JENIS || "distribusi";
  const daftar = window.SP_RIW || [];

  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">Belum ada catatan.</p>';
    return;
  }

  wadah.innerHTML = daftar.map(function (k, i) {
    const dibatalkan = k.status === "Dibatalkan";
    // Serah-terima yang SUDAH dikonfirmasi kepala line tidak bisa dibatalkan --
    // begitu pihak kedua membenarkan, catatan itu bukan lagi input sepihak.
    const terkunci = jenis === "distribusi" &&
      (k.status === "Diterima" || k.status === "Ada Selisih");
    const id = jenis === "cutting" ? k.idCutting : k.idDistribusi;
    const total = jenis === "cutting" ? k.totalPotong : k.totalQty;
    const tanggal = jenis === "cutting" ? k.tanggalPotong : k.tanggalSerah;
    const oleh = jenis === "cutting" ? k.dipotongOleh : k.diserahkanOleh;

    return '<div class="sp-riw-kartu' + (dibatalkan ? ' batal' : '') + '">' +
      '<div class="sp-riw-head">' +
        '<div>' +
          '<div class="sp-riw-id">' + rjdEscapeHtml_(id) + '</div>' +
          '<div class="sp-riw-sub">' + rjdEscapeHtml_(k.idPurchaseOrder) +
            ' &#183; ' + rjdEscapeHtml_(tanggal || "-") +
            (oleh ? ' &#183; ' + rjdEscapeHtml_(oleh) : '') + '</div>' +
        '</div>' +
        '<div class="sp-riw-qty">' + total + '<span>pcs</span></div>' +
      '</div>' +
      '<div class="sp-riw-artikel">' + rjdEscapeHtml_(k.artikel) +
        ' &#183; <b>' + rjdEscapeHtml_(k.warna || "-") + '</b>' +
        (jenis === "distribusi" ? ' &#8594; ' + rjdEscapeHtml_(k.namaLine) : '') + '</div>' +
      '<div class="sp-riw-sizes">' +
        (k.rincian || []).map(function (x) {
          return '<span class="sp-konf-size">' + rjdEscapeHtml_(x.size) + ' <b>' + x.qty + '</b></span>';
        }).join("") +
      '</div>' +
      '<div class="sp-riw-status-row">' +
        '<span class="sp-riw-status' + (dibatalkan ? ' batal' : '') + '">' +
          rjdEscapeHtml_(k.status || "-") + '</span>' +
        (dibatalkan
          ? ''
          : (terkunci
              ? '<span class="sp-riw-kunci">sudah dikonfirmasi, tidak bisa dibatalkan</span>'
              : '<button class="sp-riw-btn" data-i="' + i + '" onclick="spBatalkanCatatan(this.dataset.i)" type="button">Batalkan</button>')) +
      '</div>' +
      (k.catatan ? '<div class="sp-riw-catatan">' + rjdEscapeHtml_(k.catatan) + '</div>' : '') +
    '</div>';
  }).join("");
}

function spBatalkanCatatan(i) {
  const jenis = window.SP_RIW_JENIS || "distribusi";
  const k = (window.SP_RIW || [])[i];
  if (!k) return;
  const id = jenis === "cutting" ? k.idCutting : k.idDistribusi;

  const alasan = prompt("Batalkan catatan " + id + "?\n\n" +
    "Barisnya TIDAK dihapus \u2014 ditandai batal dan tidak ikut dihitung, " +
    "supaya jelas pernah ada kesalahan.\n\nAlasan pembatalan:");
  if (alasan === null) return;
  if (!alasan.trim()) { alert("Alasan wajib diisi."); return; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: jenis === "cutting" ? "batalkanHasilCutting" : "batalkanDistribusi",
      payload: jenis === "cutting"
        ? { idCutting: id, alasan: alasan.trim() }
        : { idDistribusi: id, alasan: alasan.trim() }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    if (!h || !h.success) { alert((h && h.error) || "Gagal membatalkan."); return; }
    // Pembatalan mengubah angka di tab lain -- cache dikosongkan supaya sisa &
    // total tidak menampilkan angka sebelum pembatalan.
    window.SP_PO = null;
    window.SP_CUT = null;
    spMuatRiwayat();
  })
  .catch(function () { alert("Gagal menghubungi server."); });
}

/* ============================================================
 * TAB -- SETORAN HASIL (line/subkon -> Finishing)
 * ============================================================
 * Menutup lubang di tengah rantai: potongan keluar sudah tercatat, barang jadi
 * masuk kembali belum. Tanpa ini, WIP per line tidak terlihat dan upah borongan
 * tidak punya dasar yang benar -- dasarnya harus qty DISETOR, bukan qty yang
 * dibagikan (line yang kehilangan 5 pcs jangan sampai dibayar penuh).
 *
 * Yang ditampilkan sebagai batas adalah SISA DI TANGAN LINE, bukan qty order.
 * Line tidak mungkin menyetor lebih dari yang dia terima -- angka yang melebihi
 * pasti salah input, dan backend menolaknya.
 * ============================================================ */

function spMuatLineSetoran_() {
  // Dropdown line diisi dari daftar yang sudah dimuat untuk tab Konfirmasi --
  // satu sumber, tidak perlu panggil server dua kali.
  const sel = document.getElementById("sp-setor-line");
  if (!sel || !window.SP_DAFTAR_LINE) return;
  const terpilih = sel.value;
  sel.innerHTML = '<option value="">-- Pilih line penyetor --</option>' +
    window.SP_DAFTAR_LINE.map(function (l) {
      return '<option value="' + rjdEscapeHtml_(l.idLine) + '">' + rjdEscapeHtml_(l.namaLine) +
        (l.lokasi ? " (" + rjdEscapeHtml_(l.lokasi) + ")" : "") + '</option>';
    }).join("");
  if (terpilih) sel.value = terpilih;
}

function spMuatSetoran() {
  const wadah = document.getElementById("sp-setor-tabel");
  if (!window.SP_PO_AKTIF) {
    if (wadah) wadah.innerHTML = '<p class="sp-info">Pilih Purchase Order dulu di atas.</p>';
    return;
  }
  const idLine = (document.getElementById("sp-setor-line") || {}).value || "";
  if (!idLine) {
    if (wadah) wadah.innerHTML = '<p class="sp-info">Pilih line yang menyetor.</p>';
    window.SP_SETOR = null;
    spHitungTotalSetor();
    return;
  }
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat...</p>';

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getLineUntukSetoran",
      idPurchaseOrder: window.SP_PO_AKTIF, idLine: idLine
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat data setoran.") + '</p>';
      window.SP_SETOR = null;
      spHitungTotalSetor();
      return;
    }
    window.SP_SETOR = d;
    spRenderFormSetoran();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

function spRenderFormSetoran() {
  const po = window.SP_SETOR;
  if (!po) return;

  const dipakai = {};
  po.baris.forEach(function (b) {
    Object.keys(b.dipegang).forEach(function (sz) { dipakai[sz] = true; });
  });
  const kolom = po.sizeKolom.filter(function (sz) { return dipakai[sz]; });

  const wip = po.totalDipegang - po.totalSudahSetor;
  document.getElementById("sp-setor-ringkas").innerHTML =
    '<div class="sp-ringkas-judul">' + rjdEscapeHtml_(po.namaLine) +
      ' <span class="sp-setor-jenis">' + rjdEscapeHtml_(po.jenisLine) + '</span></div>' +
    '<div class="sp-ringkas-list">' +
      '<div class="sp-ringkas-item"><span>Diterima line ini</span><b>' + po.totalDipegang + ' pcs</b></div>' +
      '<div class="sp-ringkas-item"><span>Sudah disetor</span><b>' + po.totalSudahSetor + ' pcs</b></div>' +
      '<div class="sp-ringkas-item"><span>Masih di tangan line</span><b>' + wip + ' pcs</b></div>' +
    '</div>';
  document.getElementById("sp-setor-ringkas").classList.remove("hidden");

  document.getElementById("sp-setor-tabel").innerHTML =
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
          '<div class="sp-sisa-info">' + (habis ? 'sudah disetor semua'
            : ('sisa ' + b.totalSisa + ' dari ' + b.totalDipegang + ' pcs')) + '</div></td>' +
        kolom.map(function (sz) {
          const dipegangSz = b.dipegang[sz] || 0;
          if (!dipegangSz) return '<td class="num sp-kosong">&#183;</td>';
          const sisa = b.sisa[sz] === undefined ? 0 : b.sisa[sz];
          if (sisa <= 0) return '<td class="num sp-kosong" title="sudah disetor semua">0</td>';
          return '<td class="num"><input class="sp-setor-qty" type="number" min="0" max="' + sisa + '"' +
            ' data-baris="' + i + '" data-size="' + rjdEscapeHtml_(sz) + '"' +
            ' oninput="spHitungTotalSetor()" placeholder="0"/>' +
            '<div class="sp-maks">/' + sisa + '</div></td>';
        }).join("") +
        '<td class="num sp-total-baris" id="sp-setor-tot-' + i + '">0</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';

  const t = new Date();
  const inp = document.getElementById("sp-setor-tanggal");
  if (inp && !inp.value) {
    inp.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") +
      "-" + String(t.getDate()).padStart(2, "0");
  }
  spHitungTotalSetor();
}

function spHitungTotalSetor() {
  const po = window.SP_SETOR;
  const perBaris = {};
  let total = 0;
  document.querySelectorAll(".sp-setor-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    const maks = Number(inp.max) || 0;
    inp.classList.toggle("sp-lebih", v > maks);
    perBaris[inp.dataset.baris] = (perBaris[inp.dataset.baris] || 0) + v;
    total += v;
  });
  if (po) {
    po.baris.forEach(function (b, i) {
      const el = document.getElementById("sp-setor-tot-" + i);
      if (el) el.textContent = perBaris[i] || 0;
    });
  }
  const elTotal = document.getElementById("sp-setor-total");
  if (elTotal) elTotal.textContent = total;
  const btn = document.getElementById("sp-setor-simpan-btn");
  if (btn) btn.disabled = (total <= 0);
}

function spSimpanSetoran() {
  const po = window.SP_SETOR;
  if (!po) return;

  const perBaris = {};
  document.querySelectorAll(".sp-setor-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v <= 0) return;
    const i = inp.dataset.baris;
    if (!perBaris[i]) perBaris[i] = {};
    perBaris[i][inp.dataset.size] = v;
  });
  const barisKirim = Object.keys(perBaris).map(function (i) {
    const b = po.baris[i];
    return { brand: b.brand, artikel: b.artikel, style: b.style, warna: b.warna, sizeQty: perBaris[i] };
  });
  if (!barisKirim.length) { alert("Belum ada qty yang diisi."); return; }

  const btn = document.getElementById("sp-setor-simpan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "simpanSetoranHasil",
      payload: {
        idPurchaseOrder: po.idPurchaseOrder,
        idLine: po.idLine,
        tanggalSetor: (document.getElementById("sp-setor-tanggal") || {}).value || "",
        disetorkanOleh: (document.getElementById("sp-setor-dari") || {}).value || "",
        diterimaOleh: (document.getElementById("sp-setor-penerima") || {}).value || "",
        catatan: (document.getElementById("sp-setor-catatan") || {}).value || "",
        baris: barisKirim
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    btn.disabled = false;
    btn.textContent = "Simpan Setoran";
    if (!h || !h.success) { alert((h && h.error) || "Gagal menyimpan setoran."); return; }
    const kotak = document.getElementById("sp-setor-sukses");
    kotak.innerHTML = '<div class="sp-sukses-isi"><b>' + h.totalQty +
      ' pcs</b> disetor oleh <b>' + rjdEscapeHtml_(h.namaLine) + '</b>. ' +
      'Sisa di tangan line: <b>' + h.sisaDiTangan + ' pcs</b>.</div>';
    kotak.classList.remove("hidden");
    spMuatSetoran();
  })
  .catch(function () {
    btn.disabled = false;
    btn.textContent = "Simpan Setoran";
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
