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
 * "Loading" (data-tab tetap "bagi" -- nama teknis tidak diubah).
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
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke spMulaiIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(SP_ID_TOKEN, SP_API_URL, spMulaiIsi_);
  } else {
    spMulaiIsi_();
  }
}

function spMulaiIsi_() {
  spShow("sp-isi");
  const el = document.getElementById("sp-nav-logout");
  if (el) el.classList.remove("hidden");
  spMuatDaftarPO();
  spMuatDaftarLine_();

  // Saring tab per bagian. Memakai rjdAmbilPeran_ yang SUDAH di-cache oleh
  // satpam halaman -- jadi tidak menembak getPeranSaya untuk kedua kalinya.
  //
  // Dibungkus typeof: kalau simpro-global.js gagal dimuat, halaman tetap jalan
  // dengan semua tab terlihat. Backend tetap menolak yang bukan bagiannya, jadi
  // yang hilang cuma kenyamanan -- bukan pengamannya.
  if (typeof rjdAmbilPeran_ !== "function") {
    // simpro-global.js gagal dimuat. Tanpa ini halaman menunggu selamanya
    // dan tabnya tidak pernah muncul sama sekali.
    document.body.classList.add("sp-siap");
  }
  if (typeof rjdAmbilPeran_ === "function") {
    rjdAmbilPeran_(SP_API_URL, SP_ID_TOKEN)
      .then(function (d) { spTerapkanBagian_(d); })
      .catch(function () {
        // Gagal ambil peran -> tampilkan semua tab. Backend tetap menjaga,
        // dan halaman yang tabnya tidak pernah muncul jauh lebih buruk
        // daripada tab yang sesekali kelebihan.
        document.body.classList.add("sp-siap");
      });
  }
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
    // TAPI disimpan terpisah, bukan dibuang: kasus Sienna (Agu 2026) -- PO
    // sudah Selesai, tim marker masih perlu membuat marker furing untuknya,
    // dan picker menjawab "tidak ditemukan" seolah datanya lenyap. Mengetik
    // NOMOR PO-nya adalah niat eksplisit; untuk itu pintunya tetap terbuka
    // (lihat spCariPO).
    const semuaPO = d.daftar || [];
    window.SP_DAFTAR_PO = semuaPO.filter(function (p) {
      return String(p.status || "").toLowerCase() !== "selesai";
    });
    window.SP_DAFTAR_PO_SELESAI = semuaPO.filter(function (p) {
      return String(p.status || "").toLowerCase() === "selesai";
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
  });
  // PO Selesai: hanya kalau ketikan cocok dengan NOMOR PO-nya sendiri --
  // bukan nama klien / artikel, supaya penjelajahan biasa tetap bersih.
  (window.SP_DAFTAR_PO_SELESAI || []).forEach(function (p) {
    if (String(p.idPurchaseOrder || "").toLowerCase().indexOf(q) !== -1) {
      hasil.push(Object.assign({}, p, { spSelesai: true }));
    }
  });
  const potong = hasil.slice(0, 25);

  dd.classList.remove("hidden");
  if (!potong.length) {
    dd.innerHTML = '<div class="sp-po-kosong">Tidak ada PO yang cocok.</div>';
    return;
  }
  dd.innerHTML = potong.map(function (p) {
    return '<div class="sp-po-opsi" data-id="' + rjdEscapeHtml_(p.idPurchaseOrder) +
      '" onclick="spPilihPO(this.dataset.id)"' +
      (p.spSelesai ? ' style="opacity:.75"' : '') + '>' +
      '<div class="sp-po-opsi-id">' + rjdEscapeHtml_(p.idPurchaseOrder) +
        (p.spSelesai ? ' <span style="font-weight:600;color:#8F2C22">&#183; Selesai</span>' : '') + '</div>' +
      '<div class="sp-po-opsi-sub">' + rjdEscapeHtml_(p.namaKlien) +
        ' &#183; ' + (p.jumlah || 0) + ' pcs' +
        (p.deadline ? ' &#183; deadline ' + rjdEscapeHtml_(p.deadline) : '') +
        (p.spSelesai ? ' &#183; order sudah Selesai &#8212; lanjutkan hanya untuk marker/re-cut susulan' : '') + '</div>' +
    '</div>';
  }).join("");
}

/**
 * PO dipilih SEKALI, dipakai bersama kedua tab. Alur di lantai memang satu
 * rangkaian (potong -> bagi -> cetak SPK), jadi memaksa cari PO dua kali cuma
 * jadi friksi tanpa manfaat.
 */
/**
 * Tab yang sedang aktif. window.SP_TAB baru terisi setelah spSwitchTab
 * pertama kali dipanggil -- padahal SATU tab sudah aktif dari HTML (class
 * "active" bawaan template) tanpa pernah diklik. Fallback lama hardcode
 * "cutting": buka halaman -> tab Gelaran aktif bawaan -> pilih PO ->
 * halaman LOMPAT ke Hasil Cutting. Sumber kebenarannya tombol yang
 * benar-benar aktif di DOM, bukan tebakan.
 */
function spTabAktif_() {
  if (window.SP_TAB) return window.SP_TAB;
  const btn = document.querySelector(".sp-tab.active");
  return (btn && btn.dataset && btn.dataset.tab) || "cutting";
}

function spPilihPO(idPO) {
  document.getElementById("sp-po-dropdown").classList.add("hidden");
  document.getElementById("sp-po-cari").value = idPO;
  spPesan_("sp-po-pesan", "", false);
  window.SP_PO_AKTIF = idPO;
  window.SP_PO = null;
  window.SP_CUT = null;
  window.SP_SETOR = null;
  spSwitchTab(spTabAktif_());
}

/** Muat data tab "Loading" (perilaku lama spPilihPO). */
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
    po.baris.map(function (b, i, semua) {
      const habis = b.totalSisa <= 0;
      // ---- Kelompok per ITEM (v108) ----
      // Baris dikelompokkan per (artikel+style) dengan baris header + subtotal
      // sisa item. DIPILIH kelompok, BUKAN filter: satu serahan ke line sering
      // campuran beberapa item -- filter memaksa admin submit berkali-kali
      // untuk satu serahan (mengubah alur kerja), kelompok hanya merapikan
      // pandangan. Nama item tidak diulang lagi di tiap baris warna.
      const kunciItem = [b.artikel, b.style].filter(Boolean).join(" / ") || "(tanpa nama)";
      const kunciSebelum = i > 0
        ? ([semua[i-1].artikel, semua[i-1].style].filter(Boolean).join(" / ") || "(tanpa nama)")
        : null;
      let kepala = "";
      if (kunciItem !== kunciSebelum) {
        let sisaItem = 0, qtyItem = 0;
        semua.forEach(function (x) {
          const k = [x.artikel, x.style].filter(Boolean).join(" / ") || "(tanpa nama)";
          if (k !== kunciItem) return;
          sisaItem += (x.totalSisa > 0 ? x.totalSisa : 0);
          qtyItem += (x.totalQty || 0);
        });
        kepala = '<tr class="sp-grup-item"><td colspan="' + (kolom.length + 2) + '">' +
          rjdEscapeHtml_(kunciItem) +
          '<span class="sp-grup-sisa">' + (sisaItem > 0
            ? 'sisa ' + sisaItem + ' dari ' + qtyItem + ' pcs'
            : 'sudah dibagi semua') + '</span></td></tr>';
      }
      return kepala + '<tr' + (habis ? ' class="sp-habis"' : '') + '>' +
        '<td><div class="sp-warna">' + rjdEscapeHtml_(b.warna || "-") + '</div>' +
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
 * BEDA SIKAP dengan tab Loading: di sini TIDAK ADA batas atas. Overcut
 * (potong lebih untuk cadangan) itu praktik normal, dan memblokirnya cuma
 * akan bikin petugas mengisi angka bohong supaya tersimpan. Selisih terhadap
 * order tetap ditampilkan, tapi sebagai INFORMASI, bukan penghalang.
 * ============================================================ */

/** Pindah tab. Data tiap tab dimuat MALAS -- baru diambil saat tabnya dibuka. */
/**
 * ============================================================
 * PENYARINGAN TAB PER BAGIAN
 * ============================================================
 * Tab yang bukan bagiannya TIDAK ditampilkan. Ini menyelesaikan sebagian besar
 * masalah, karena penyebab data dobel/kosong biasanya kebingungan siapa yang
 * bertanggung jawab -- bukan niat mengisi punya orang lain.
 *
 * MURNI KENYAMANAN. Penolakan sebenarnya ada di pastikanBagianBoleh_
 * (akses-role.gs): siapa pun yang tahu nama rutenya bisa memanggilnya
 * langsung, dan menyembunyikan tombol tidak menghalangi itu.
 *
 * Tab "Riwayat" TIDAK pernah disembunyikan -- melihat catatan bagian lain itu
 * justru yang membuat serah terima antar bagian bisa diperiksa.
 */
/**
 * ============================================================
 * NAVIGASI DUA TINGKAT (v110) -- fase di atas, langkah di bawah
 * ============================================================
 * Peta tab hidup di SINI SAJA; kedua bar dirender dari peta ini
 * (markup template cuma dua wadah kosong). Aturan nama dari
 * KAMUS-ISTILAH-SIMPRO: fase = nama divisi, subtab = Indonesia.
 *
 * Subtab memakai ID TAB LAMA apa adanya -- spSwitchTab, wildcard panel
 * sp-panel-* (v105), penyaring bagian, dan semua pemanggil programatik
 * (mis. lompatan gelaran->cutting) bekerja tanpa diubah.
 *
 * "konf" sengaja muncul di DUA fase (Sewing & Finishing) dengan label
 * berbeda: panelnya satu, gabungan dua alur, dan penyaring bagian
 * internal panel yang menentukan alur mana yang tampil per pemakai.
 * Memecah panelnya jadi dua = operasi lain hari, bukan syarat IA ini.
 *
 * Approval (Sampel) & Packing/Stok BELUM di peta -- cetak biru melarang
 * tab lahir kosong; masuk begitu form-nya jadi.
 */
const SP_FASE_PETA = [
  ["polamarker", "Pola & Marker", [["pola", "Pola"], ["marker", "Marker"]]],
  ["sampel",     "Sampel",        [["sampel", "Sampel"]]],
  ["cutting",    "Cutting",       [["gelar", "Gelaran"], ["cutting", "Hasil Potong"]]],
  ["loading",    "Loading",       [["bagi", "Bagi ke Line"]]],
  ["sewing",     "Sewing",        [["konf", "Konfirmasi Potongan"], ["setor", "Setoran ke Finishing"]]],
  ["finishing",  "Finishing",     [["konf", "Konfirmasi Setoran"], ["qc", "QC"]]],
  ["riw",        "Riwayat",       [["riw", "Riwayat"]]]
];

/** Boleh-tidaknya satu tab untuk pemakai -- dari peta bagian, BUKAN dari DOM. */
function spTabBoleh_(tab) {
  if (window.SP_BAGIAN_SEMUA !== false) return true;   // peran belum datang / admin
  const perlu = SP_BAGIAN_TAB[tab];
  const bagian = window.SP_BAGIAN || [];
  return !perlu || (Array.isArray(perlu)
    ? perlu.some(function (p) { return bagian.indexOf(p) !== -1; })
    : bagian.indexOf(perlu) !== -1);
}

function spFaseBoleh_(f) {
  return f[2].some(function (s) { return spTabBoleh_(s[0]); });
}

/** Fase pemilik sebuah tab -- fase aktif menang kalau memuat tab itu (kasus konf ganda). */
function spFaseDariTab_(tab) {
  const skrg = SP_FASE_PETA.filter(function (f) { return f[0] === window.SP_FASE; })[0];
  if (skrg && skrg[2].some(function (s) { return s[0] === tab; })) return skrg[0];
  const f = SP_FASE_PETA.filter(function (x) {
    return x[2].some(function (s) { return s[0] === tab; });
  })[0];
  return f ? f[0] : null;
}

function spRenderFase_() {
  const w = document.getElementById("sp-tabs");
  if (!w) return;
  w.innerHTML = SP_FASE_PETA.map(function (f) {
    if (!spFaseBoleh_(f)) return "";
    return '<button class="sp-tab' + (f[0] === window.SP_FASE ? ' active' : '') +
      '" data-fase="' + f[0] + '" onclick="spPilihFase_(\'' + f[0] + '\')" type="button">' +
      f[1] + '</button>';
  }).join("");
}

function spRenderSub_() {
  const w = document.getElementById("sp-subtabs");
  if (!w) return;
  const f = SP_FASE_PETA.filter(function (x) { return x[0] === window.SP_FASE; })[0];
  if (!f) { w.innerHTML = ""; return; }
  w.innerHTML = f[2].map(function (s) {
    if (!spTabBoleh_(s[0])) return "";
    return '<button class="sp-tab' + (s[0] === window.SP_TAB ? ' active' : '') +
      '" data-tab="' + s[0] + '" onclick="spSwitchTab(\'' + s[0] + '\')" type="button">' +
      s[1] + '</button>';
  }).join("");
  // fase dengan SATU subtab: barisnya cuma mengulang nama fase -- sembunyikan
  w.style.display = f[2].filter(function (s) { return spTabBoleh_(s[0]); }).length > 1 ? "" : "none";
}

function spPilihFase_(fase) {
  window.SP_FASE = fase;
  window.SP_SUBTAB_TERAKHIR = window.SP_SUBTAB_TERAKHIR || {};
  const f = SP_FASE_PETA.filter(function (x) { return x[0] === fase; })[0];
  const ingat = window.SP_SUBTAB_TERAKHIR[fase];
  let target = (ingat && f[2].some(function (s) { return s[0] === ingat; }) && spTabBoleh_(ingat))
    ? ingat : null;
  if (!target) {
    const pertama = f[2].filter(function (s) { return spTabBoleh_(s[0]); })[0];
    target = pertama ? pertama[0] : null;
  }
  if (target) spSwitchTab(target);
  else { spRenderFase_(); spRenderSub_(); }
}

const SP_BAGIAN_TAB = {
  // Pola dan Sampel dipisah: PIC-nya berbeda orang, dan menggabungkannya
  // membuat masing-masing melihat form yang bukan miliknya.
  //
  // Pola digabung satu tab dengan Marker karena memang satu rangkaian --
  // "Layout Marker" adalah langkah terakhir pembuatan pola.
  pola:    "pola",
  sampel:  ["pola", "sampel"],
  marker:  "pola",
  gelar:   "cutting",
  cutting: "cutting",
  bagi:    "loading",
  setor:   "sewing",
  qc:      "qc",
  // Tab Konfirmasi memuat DUA alur dengan penerima berbeda: sewing menerima
  // potongan dari loading, finishing menerima setoran dari sewing.
  // Array = boleh salah satu.
  konf:    ["sewing", "finishing"],
  riw:     null        // selalu tampil
};

/**
 * Sembunyikan tab yang bukan bagian pemakai.
 * Dipanggil sekali saat halaman dimuat, memakai rjdAmbilPeran_ yang sudah
 * di-cache -- tidak menambah permintaan ke server.
 */
function spTerapkanBagian_(d) {
  const bagian = (d && d.bagian) ? d.bagian : [];
  const lintas = !!(d && d.lintasBagian);

  // Kosong = semua bagian (staf lama yang kolomnya belum diisi).
  // Lintas = peran full/admin.
  const semua = lintas || !bagian.length ||
    bagian.some(function (b) { return b === "produksi" || b === "semua" || b === "all"; });

  window.SP_BAGIAN = bagian;
  // Penanda "peran sudah datang". Dipakai CSS untuk dua hal:
  //   - deret tab baru ditampilkan SETELAH disaring, jadi tidak berkedip dari
  //     sembilan tab menyusut jadi tiga
  //   - hero mengecil, memberi ruang lebih untuk isinya
  //
  // Hero DIKECILKAN, bukan disembunyikan: judul halaman tetap perlu terbaca
  // supaya orang yang membuka beberapa tab browser tahu ada di mana.
  document.body.classList.add("sp-siap");
  // Line yang dipegang staf ini -- dipakai untuk membatasi pembatalan setoran.
  window.SP_ID_LINE = (d && d.idLine) ? d.idLine : [];
  window.SP_BAGIAN_SEMUA = semua;
  if (semua) { spRenderFase_(); spRenderSub_(); return; }

  // v110: penyaringan lewat PETA (spTabBoleh_ membaca SP_BAGIAN yang barusan
  // diisi), lalu kedua bar dirender ulang -- tombol yang tidak boleh memang
  // tidak pernah dilahirkan, bukan disembunyikan. SP_BAGIAN_SEMUA=false
  // menandakan penyaringan aktif.
  window.SP_BAGIAN_SEMUA = false;
  spRenderFase_();
  spRenderSub_();

  // Kalau tab yang sedang aktif ternyata bukan milik bagiannya, pindah ke
  // subtab pertama yang boleh dari fase pertama yang boleh. Tanpa ini,
  // pemakai melihat panel kosong -- terlihat seperti halaman rusak.
  if (!spTabBoleh_(spTabAktif_())) {
    const f = SP_FASE_PETA.filter(spFaseBoleh_)[0];
    if (f) spPilihFase_(f[0]);
  }

  // Sub-tab Konfirmasi ikut disaring begitu peran datang -- panelnya mungkin
  // sudah terbuka sebelum jawaban peran tiba.
  spTerapkanBagianKonf_();

  // Beri tahu kenapa tabnya sedikit -- kalau tidak, orang akan mengira
  // fiturnya hilang lalu menanyakannya, atau lebih buruk: mencari jalan lain.
  const wadah = document.getElementById("sp-tabs");
  if (wadah && !document.getElementById("sp-bagian-info")) {
    const info = document.createElement("div");
    info.id = "sp-bagian-info";
    info.className = "sp-bagian-info";
    info.textContent = "Anda terdaftar di bagian: " + bagian.join(", ") +
      ". Form bagian lain disembunyikan.";
    wadah.parentNode.insertBefore(info, wadah.nextSibling);
  }
}

/**
 * ============================================================
 * PANDUAN PENGISIAN PER TAB
 * ============================================================
 * Ditaruh DI DALAM layar, bukan dokumen terpisah. Dokumen SOP yang harus
 * dibuka di tempat lain tidak akan dibaca -- orang yang sedang bingung di
 * depan form tidak akan berhenti untuk mencari file.
 *
 * Tertutup secara bawaan: yang sudah hafal tidak perlu melewatinya tiap kali,
 * dan panduan yang selalu terbuka justru mendorong orang mengabaikannya.
 *
 * Isinya sengaja BUKAN pengulangan label. Yang dijelaskan adalah hal yang
 * tidak terbaca dari form: kapan memilih apa, apa yang sering salah, dan
 * akibatnya kalau salah.
 */
const SP_PANDUAN = {
  pola: {
    judul: "Cara mengisi Pola",
    isi: [
      ["Dicatat per ARTIKEL, bukan per order",
       "Artikel yang polanya sudah pernah dibuat akan muncul keterangan " +
       "\"sudah dikerjakan di order lain\" -- itu berarti TIDAK perlu dibuat ulang."],
      ["Isi durasi tiap langkah",
       "Angka jam ini satu-satunya sumber untuk menghitung biaya pola di HPP nanti. " +
       "Tidak bisa diambil dari mana pun selain di sini."],
      ["Satu langkah boleh dicatat berkali-kali",
       "Kalau Pecah Pola dikerjakan tiga hari, catat tiga kali dengan durasi " +
       "masing-masing hari. Sistem menjumlahkannya."],
      ["Langkah terakhir: Layout Marker",
       "Setelah itu, markernya sendiri diisi di tab Marker -- panjang, susunan " +
       "size, dan gambar layoutnya."]
    ]
  },
  sampel: {
    judul: "Cara mengisi Sampel",
    isi: [
      ["Tiap perubahan status = catatan baru",
       "Jangan mengedit catatan lama. Sampel yang bolak-balik revisi justru " +
       "perlu terlihat riwayatnya."],
      ["Status Revisi dipakai saat klien minta perbaikan",
       "Jumlah revisi terhitung otomatis. Angka itu yang memberi tahu apakah " +
       "spesifikasi dari klien sudah cukup jelas di awal."],
      ["Durasi boleh kosong untuk catatan status",
       "\"Dikirim ke klien\" tidak punya durasi kerja. Isi durasi hanya untuk " +
       "langkah yang benar-benar dikerjakan."]
    ]
  },
  marker: {
    judul: "Cara mengisi Marker",
    isi: [
      ["Panjang marker diisi APA ADANYA dari software pola",
       "Jangan ditambah allowance. Allowance punya kolom sendiri supaya " +
       "efisiensi marker tetap bisa dinilai."],
      ["Susunan size = berapa pola tiap ukuran dalam SATU lapis",
       "Kalau marker memuat S1 M1 L1 XL1, isi 1 di masing-masing. " +
       "Pcs per lapis terhitung otomatis."],
      ["Komponen dikosongkan kalau marker memuat semua panel",
       "Isi hanya kalau sebagian panel punya marker sendiri -- mis. \"Variasi\" " +
       "atau \"Kerah, Manset\" untuk interlining. Tanpa ini, dua marker dengan " +
       "kain sama akan dijumlahkan dan set lengkap jadi terlalu optimis."],
      ["Marker yang dipakai beberapa style: pilih \"SEMUA style\"",
       "Komponen kombinasi yang sama untuk Long Sleeve maupun Short Sleeve " +
       "tidak perlu dibuat dua kali. Marker itu akan muncul saat menggelar " +
       "style mana pun, dan potongannya masuk ke style yang dipilih saat menggelar."],
      ["Revisi lebar kain: pakai tombol Revisi",
       "Marker lama tetap tersimpan. Jangan hapus lalu buat baru."]
    ]
  },
  gelar: {
    judul: "Cara mencatat Gelaran",
    isi: [
      ["Satu gelaran = satu jenis kain",
       "Kalau satu warna perlu brokat dan polos, catat dua kali. " +
       "Set lengkap dihitung dari jumlah terkecil di antara komponennya."],
      ["Yang diketik cuma jumlah lapis",
       "Output per size dan pemakaian kain dihitung dari marker. " +
       "Periksa pratinjaunya sebelum menyimpan."],
      ["Re-cut untuk mengganti panel yang cacat",
       "Pilih mode Re-cut. Kainnya terhitung, tapi TIDAK menambah jumlah baju -- " +
       "bajunya sudah terhitung waktu dipotong pertama."],
      ["Roll kain dicatat dua kali saja",
       "Saat kain datang (nomor & panjang), dan saat sisa diukur setelah " +
       "selesai digelar. Bukan tiap kali menggelar."]
    ]
  },
  cutting: {
    judul: "Cara mencatat Hasil Cutting",
    isi: [
      ["Isi jumlah yang BENAR-BENAR dipotong",
       "Boleh lebih dari qty order (kain cadangan) -- itu wajar dan tidak diblokir."],
      ["Potong bertahap? Catat tiap kali",
       "Angkanya dijumlahkan. Jangan menunggu selesai semua lalu mencatat sekali."],
      ["Kalau sudah mencatat gelaran, pakai tombol dari Set Lengkap",
       "Angkanya sudah terisi dan sudah dikurangi yang pernah dicatat sebelumnya."]
    ]
  },
  bagi: {
    judul: "Cara mengisi Loading",
    isi: [
      ["Angka di bawah kotak isian = sisa yang belum dibagi",
       "Tidak boleh melebihi itu. Kalau sisanya kurang, berarti hasil cutting " +
       "belum dicatat lengkap."],
      ["Potongan yang dikembalikan line muncul lagi di sini",
       "Line yang mengembalikan potongan tanpa dijahit membuat sisanya bertambah, " +
       "dan bisa dibagikan ke line lain."],
      ["Cetak SPK setelah membagi",
       "Itu yang dibawa line sebagai bukti serah terima."]
    ]
  },
  setor: {
    judul: "Cara mencatat Setoran Hasil",
    isi: [
      ["Pilih dulu: Jadi baju atau Dikembalikan",
       "Dikembalikan = potongan yang tidak jadi dijahit. Barangnya keluar dari " +
       "line, tapi TIDAK dihitung sebagai baju jadi."],
      ["Angka di bawah kotak = sisa yang masih dipegang line",
       "Kalau line menyetor lebih dari itu, berarti ada yang belum tercatat " +
       "di Loading."],
      ["Setoran menunggu dihitung ulang finishing",
       "Statusnya \"Menunggu\" sampai finishing mengonfirmasi di tab " +
       "Konfirmasi Terima."]
    ]
  },
  konf: {
    judul: "Cara mengisi Konfirmasi Terima",
    isi: [
      ["Isi \"Nama yang menerima\" dulu",
       "Berlaku untuk semua konfirmasi di halaman ini, bukan per kartu."],
      ["Terima sesuai = angkanya cocok setelah dihitung",
       "Bukan sekadar barangnya sampai. Konfirmasi ini soal hasil hitung ulang."],
      ["Ada selisih = isi angka yang BENAR-BENAR terhitung",
       "Angka asli tidak diubah. Selisihnya dicatat sebagai koreksi tersendiri " +
       "supaya jejaknya tidak hilang."],
      ["Dua jenis serah terima",
       "Potongan dari Loading dikonfirmasi bagian sewing; setoran ke finishing " +
       "dikonfirmasi bagian finishing."]
    ]
  },
  riw: {
    judul: "Cara memakai Riwayat",
    isi: [
      ["Salah input? Batalkan, lalu catat ulang",
       "Barisnya tidak dihapus -- ditandai batal dan tidak ikut dihitung. " +
       "Jejaknya sengaja disimpan supaya jelas pernah ada kesalahan."],
      ["Pembatalan minta alasan",
       "Alasan itu yang menjelaskan kenapa angkanya berubah kalau ditanya nanti."]
    ]
  }
};

function spPanduanHtml_(tab) {
  const p = SP_PANDUAN[tab];
  if (!p) return "";
  return '<details class="sp-panduan">' +
    '<summary>' + spEsc_(p.judul) + '</summary>' +
    '<div class="sp-panduan-isi">' +
      p.isi.map(function (x) {
        return '<div class="sp-panduan-item">' +
          '<b>' + spEsc_(x[0]) + '</b>' +
          '<span>' + spEsc_(x[1]) + '</span>' +
        '</div>';
      }).join("") +
    '</div>' +
  '</details>';
}

/** Sisipkan panduan ke panel tab yang sedang aktif, sekali saja per panel. */
function spPasangPanduan_(tab) {
  const peta = {
    pola: "sp-panel-pola", sampel: "sp-panel-sampel", marker: "sp-panel-marker",
    gelar: "sp-panel-gelar", cutting: "sp-panel-cutting", bagi: "sp-panel-bagi",
    setor: "sp-panel-setor", konf: "sp-panel-konf", riw: "sp-panel-riw"
  };
  const panel = document.getElementById(peta[tab]);
  if (!panel || panel.querySelector(".sp-panduan")) return;
  const html = spPanduanHtml_(tab);
  if (html) panel.insertAdjacentHTML("afterbegin", html);
}

function spSwitchTab(tab) {
  window.SP_TAB = tab;
  // Dua tingkat (v110): pastikan fase pemilik tab ini yang terbuka --
  // pemanggil programatik (lompatan gelaran->cutting, pilih PO, penyaring
  // bagian) tidak tahu-menahu soal fase, dan memang tidak perlu tahu.
  const faseTab = spFaseDariTab_(tab);
  if (faseTab) {
    window.SP_FASE = faseTab;
    window.SP_SUBTAB_TERAKHIR = window.SP_SUBTAB_TERAKHIR || {};
    window.SP_SUBTAB_TERAKHIR[faseTab] = tab;
  }
  spRenderFase_();
  spRenderSub_();
  document.querySelectorAll(".sp-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  // Bar tab v96 satu baris gulung: tab aktif dibawa ke tengah pandangan --
  // tanpa ini, pindah ke tab yang sedang terpotong di tepi terasa "hilang".
  try {
    const btnAktif = document.querySelector('.sp-tab[data-tab="' + tab + '"]');
    if (btnAktif && btnAktif.scrollIntoView) {
      btnAktif.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  } catch (eTab) { /* browser tua: biarkan */ }
  // Panduan disisipkan saat tab pertama kali dibuka, bukan saat halaman
  // dimuat -- sembilan blok panduan sekaligus di DOM tidak ada gunanya.
  spPasangPanduan_(tab);
  // ---- Buka-tutup panel: WILDCARD, bukan daftar keras (v105) ----
  // Dulu sembilan getElementById eksplisit -- dan panel KESEPULUH (sp-panel-qc,
  // v103) lupa didaftarkan: kelas hidden-nya tidak pernah dilepas, tab QC
  // tampil kosong walau datanya sudah termuat. Bug kelas "daftar keras yang
  // harus diingat manusia". Sekarang satu aturan untuk semua id sp-panel-*:
  // panel yang lahir kapan pun otomatis ikut, tidak ada lagi yang bisa lupa.
  // Konvensi yang menopangnya: data-tab tombol == akhiran id panelnya.
  document.querySelectorAll("[id^='sp-panel-']").forEach(function (p) {
    p.classList.toggle("hidden", p.id !== "sp-panel-" + tab);
  });
  // Kartu "Pilih PO" cuma relevan untuk dua tab pertama. Tab Konfirmasi
  // melihat semua yang menunggu LINTAS ORDER -- memaksa pilih PO dulu di situ
  // justru membalik cara kepala line bekerja (dia pegang beberapa order).
  const kartuPO = document.getElementById("sp-kartu-po");
  // v107: tab QC memakai kartu PO BERSAMA seperti tab lain -- picker internal
  // bawaan qc.html-lah yang disembunyikan (lihat qcSinkronPOAktif_). Satu
  // halaman satu cara memilih PO.
  if (kartuPO) kartuPO.classList.toggle("hidden", tab === "konf" || tab === "riw");

  if (tab === "konf") { spTerapkanBagianKonf_(); spMuatKonfirmasi(); return; }
  if (tab === "pola" || tab === "sampel") { spMuatTahap(tab); return; }
  if (tab === "marker") { spMuatMarker(); spMuatSemuaMarker_(); return; }
  if (tab === "qc") { spMuatQC_(); qcSinkronPOAktif_(); return; }
  if (tab === "gelar") { spMuatGelaran(); return; }
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
    po.baris.map(function (b, i, semua) {
      const s = b.totalSelisih;
      // ---- Kelompok per ITEM (v109) -- pola yang sama dengan tabel Loading.
      // Header per (artikel+style) + subtotal order/potong item; nama item
      // tidak diulang di tiap baris warna.
      const kunciItem = [b.artikel, b.style].filter(Boolean).join(" / ") || "(tanpa nama)";
      const kunciSebelum = i > 0
        ? ([semua[i-1].artikel, semua[i-1].style].filter(Boolean).join(" / ") || "(tanpa nama)")
        : null;
      let kepala = "";
      if (kunciItem !== kunciSebelum) {
        let orderItem = 0, potongItem = 0;
        semua.forEach(function (x) {
          const k = [x.artikel, x.style].filter(Boolean).join(" / ") || "(tanpa nama)";
          if (k !== kunciItem) return;
          orderItem += (x.totalOrder || 0);
          potongItem += (x.totalPotong || 0);
        });
        kepala = '<tr class="sp-grup-item"><td colspan="' + (kolom.length + 2) + '">' +
          rjdEscapeHtml_(kunciItem) +
          '<span class="sp-grup-sisa">order ' + orderItem + ' &#183; potong ' + potongItem + '</span></td></tr>';
      }
      return kepala + '<tr>' +
        '<td><div class="sp-warna">' + rjdEscapeHtml_(b.warna || "-") + '</div>' +
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
    // dibagi" di tab sebelah. Kalau tidak direset, tab Loading masih
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

/**
 * Dua jenis serah terima yang perlu dikonfirmasi, dan keduanya punya alasan
 * yang sama: barang berpindah antara dua pihak, dan angkanya baru terbukti
 * setelah dihitung ulang -- bukan saat diserahkan.
 *
 *   potongan : Loading -> Sewing     (dikonfirmasi bagian sewing)
 *   setoran  : Sewing  -> Finishing  (dikonfirmasi bagian finishing)
 */
/**
 * Sub-tab konfirmasi milik BAGIAN PENERIMA masing-masing:
 *   potongan : Loading -> Sewing     (dikonfirmasi sewing)
 *   setoran  : Sewing  -> Finishing  (dikonfirmasi finishing)
 *
 * Tanpa penyaringan ini, sewing bisa mengonfirmasi setoran yang dia sendiri
 * kirim -- persis kesalahan yang perbaikan konfirmasi ini ada untuk mencegah.
 * Backend tetap menolaknya, tapi tombol yang terlihat lalu gagal saat ditekan
 * membuat orang mengira sistemnya rusak.
 */
const SP_KONF_BAGIAN = { potongan: "sewing", setoran: "finishing" };

function spTerapkanBagianKonf_() {
  // Peran diambil ASINKRON. Kalau tab Konfirmasi dibuka sebelum jawabannya
  // datang, SP_BAGIAN masih undefined -- dan tanpa penjagaan ini, SEMUA
  // sub-tab akan disembunyikan karena tidak ada yang cocok.
  if (window.SP_BAGIAN === undefined) return;

  const bagian = window.SP_BAGIAN || [];
  // Bagian KOSONG = semua bagian. Aturan yang sama berlaku di penyaring tab
  // utama dan di backend -- staf lama yang kolom Bagian-nya belum diisi tidak
  // boleh mendadak kehilangan sub-tab.
  const semua = window.SP_BAGIAN_SEMUA || !bagian.length;
  let pertama = null;

  document.querySelectorAll(".sp-konf-tab").forEach(function (b) {
    const perlu = SP_KONF_BAGIAN[b.dataset.jenis];
    const boleh = semua || !perlu || bagian.indexOf(perlu) !== -1;
    b.classList.toggle("hidden", !boleh);
    if (boleh && !pertama) pertama = b.dataset.jenis;
  });

  // Kalau jenis yang sedang aktif ternyata bukan miliknya, pindah ke yang
  // pertama boleh -- kalau tidak, daftarnya kosong tanpa penjelasan.
  const aktif = window.SP_KONF_JENIS || "potongan";
  const perluAktif = SP_KONF_BAGIAN[aktif];
  if (!semua && perluAktif && bagian.indexOf(perluAktif) === -1 && pertama) {
    spSwitchKonf(pertama);
  }
}

function spSwitchKonf(jenis) {
  window.SP_KONF_JENIS = jenis;
  document.querySelectorAll(".sp-konf-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.jenis === jenis);
  });
  spMuatKonfirmasi();
}

function spMuatKonfirmasi() {
  const wadah = document.getElementById("sp-konf-daftar");
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat daftar...</p>';
  const idLine = (document.getElementById("sp-konf-line") || {}).value || "";
  const jenis = window.SP_KONF_JENIS || "potongan";

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify(jenis === "setoran"
      ? { idToken: SP_ID_TOKEN, action: "getSetoranMenunggu", opsi: { idLine: idLine } }
      : { idToken: SP_ID_TOKEN, action: "getMenungguKonfirmasi", idLine: idLine })
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
          // Nama field berbeda antara dua sumber: distribusi memakai
          // totalQty/tanggalSerah/diserahkanOleh, setoran memakai
          // total/tanggal/disetorkanOleh. Tanpa penyesuaian ini, kartu setoran
          // menampilkan "undefined pcs" dan tanggalnya kosong.
          '<div class="sp-konf-sub">' + rjdEscapeHtml_(k.idPurchaseOrder) +
            ' &#183; ' + rjdEscapeHtml_(k.tanggalSerah || k.tanggal || "-") +
            (k.diserahkanOleh || k.disetorkanOleh
              ? ' &#183; dari ' + rjdEscapeHtml_(k.diserahkanOleh || k.disetorkanOleh) : '') + '</div>' +
        '</div>' +
        '<div class="sp-konf-qty">' +
          (k.totalQty !== undefined ? k.totalQty : (k.total || 0)) +
          '<span>pcs</span></div>' +
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
  // idDistribusi dipakai sebagai nama umum; spKirimKonfirmasi_ yang
  // menerjemahkannya jadi idSetoran kalau jenisnya setoran.
  spKirimKonfirmasi_({ idDistribusi: k.idDistribusi || k.idSetoran, cocok: true });
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
    idDistribusi: k.idDistribusi || k.idSetoran,
    cocok: false,
    sizeQtyDiterima: sizeQtyDiterima,
    catatan: catatan.trim()
  });
}

function spKirimKonfirmasi_(payload) {
  const elNama = document.getElementById("sp-konf-nama");
  payload.diterimaOleh = (elNama || {}).value || "";

  // Nama penerima adalah inti dari konfirmasi: tanpa itu, catatannya cuma
  // "barang diterima" tanpa ada yang bisa ditanya kalau nanti selisihnya
  // dipersoalkan. Diminta di sini, bukan dijadikan wajib di backend, supaya
  // pesannya muncul di layar tempat orangnya sedang bekerja.
  if (!payload.diterimaOleh.trim()) {
    alert("Isi dulu \"Nama yang menerima\" di atas.\n\n" +
      "Nama itu yang tercatat sebagai penerima untuk semua konfirmasi di halaman ini.");
    if (elNama) elNama.focus();
    return;
  }
  const setoran = (window.SP_KONF_JENIS || "potongan") === "setoran";

  // Bentuk payload berbeda antara dua rute: distribusi memakai
  // {idDistribusi, cocok}, setoran memakai {idSetoran, sesuai}. Diterjemahkan
  // di sini supaya sisa kode UI tidak perlu tahu bedanya.
  const badan = setoran
    ? {
        idToken: SP_ID_TOKEN, action: "konfirmasiTerimaSetoran",
        payload: {
          idSetoran: payload.idDistribusi,
          sesuai: !!payload.cocok,
          diterima: payload.diterima,
          catatan: payload.catatan,
          diterimaOleh: payload.diterimaOleh
        }
      }
    : { idToken: SP_ID_TOKEN, action: "konfirmasiTerima", payload: payload };

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify(badan)
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
  const jenis = window.SP_RIW_JENIS || SP_RIW_JENIS_AWAL;
  const wadah = document.getElementById("sp-riw-daftar");
  if (wadah) wadah.innerHTML = '<p class="sp-info">Memuat riwayat...</p>';

  const cari = (document.getElementById("sp-riw-cari") || {}).value || "";
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: jenis === "cutting" ? "getRiwayatCutting"
        : (jenis === "setoran" ? "getRiwayatSetoran" : "getRiwayatDistribusi"),
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
  const jenis = window.SP_RIW_JENIS || SP_RIW_JENIS_AWAL;
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
    // Membatalkan catatan bagian lain akan ditolak backend. Menampilkan
    // tombolnya tetap salah: orang menekan, gagal, lalu berhenti percaya pada
    // layarnya. Yang MELIHAT riwayat tetap semua bagian -- itu justru yang
    // membuat serah terima antar bagian bisa diperiksa.
    const bolehBatal = spBolehBatalRiwayat_(jenis, k);
    const id = jenis === "cutting" ? k.idCutting
      : (jenis === "setoran" ? k.idSetoran : k.idDistribusi);
    const total = jenis === "cutting" ? k.totalPotong
      : (jenis === "setoran" ? k.total : k.totalQty);
    const tanggal = jenis === "cutting" ? k.tanggalPotong
      : (jenis === "setoran" ? k.tanggal : k.tanggalSerah);
    const oleh = jenis === "cutting" ? k.dipotongOleh
      : (jenis === "setoran" ? k.disetorkanOleh : k.diserahkanOleh);

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
        (jenis === "distribusi" ? ' &#8594; ' + rjdEscapeHtml_(k.namaLine) : '') +
        (jenis === "setoran" ? ' &#8592; ' + rjdEscapeHtml_(k.namaLine || "-") : '') +
        // Pengembalian ditandai jelas: angkanya sama-sama "pcs", tapi artinya
        // sangat berbeda -- satu jadi baju, satu masih potongan.
        (jenis === "setoran" && k.jenisSetoran === "Dikembalikan"
          ? ' <span class="sp-tag-kembali">DIKEMBALIKAN</span>' : '') + '</div>' +
      '<div class="sp-riw-sizes">' +
        (jenis === "setoran"
          ? Object.keys(k.sizeQty || {}).map(function (sz) {
              return '<span class="sp-konf-size">' + rjdEscapeHtml_(sz) +
                ' <b>' + k.sizeQty[sz] + '</b></span>';
            }).join("")
          : (k.rincian || []).map(function (x) {
              return '<span class="sp-konf-size">' + rjdEscapeHtml_(x.size) + ' <b>' + x.qty + '</b></span>';
            }).join("")) +
      '</div>' +
      '<div class="sp-riw-status-row">' +
        '<span class="sp-riw-status' + (dibatalkan ? ' batal' : '') + '">' +
          rjdEscapeHtml_(k.status || "-") + '</span>' +
        (dibatalkan
          ? ''
          : (terkunci
              ? '<span class="sp-riw-kunci">sudah dikonfirmasi, tidak bisa dibatalkan</span>'
              : (bolehBatal
                  ? '<button class="sp-riw-btn" data-i="' + i + '" onclick="spBatalkanCatatan(this.dataset.i)" type="button">Batalkan</button>'
                  : '<span class="sp-riw-kunci">' +
                    (jenis === "setoran" && k.namaLine
                      ? 'hanya bisa dibatalkan ' + rjdEscapeHtml_(k.namaLine)
                      : 'hanya bisa dibatalkan bagian ' +
                        rjdEscapeHtml_(SP_RIW_BAGIAN[jenis] || "-")) + '</span>'))) +
      '</div>' +
      (k.catatan ? '<div class="sp-riw-catatan">' + rjdEscapeHtml_(k.catatan) + '</div>' : '') +
    '</div>';
  }).join("");
}

/**
 * Bagian yang berhak MEMBATALKAN tiap jenis catatan. Sama persis dengan
 * BAGIAN_PER_AKSI di akses-role.gs -- backend sudah menolak yang bukan haknya,
 * jadi ini murni supaya tombolnya tidak muncul sia-sia.
 *
 * Kalau kedua daftar ini pernah berbeda, yang menang backend. Layar cuma
 * kehilangan tombol yang seharusnya ada -- bukan sebaliknya.
 */
/**
 * Sub-tab riwayat yang terbuka pertama. HARUS sama dengan yang berkelas
 * "active" di template -- kalau berbeda, tab yang tersorot bukan yang isinya
 * tampil, dan orang mengira daftarnya salah.
 *
 * Ditaruh sebagai konstanta supaya kalau urutannya diubah lagi, cukup satu
 * tempat yang disesuaikan.
 */
const SP_RIW_JENIS_AWAL = "cutting";

const SP_RIW_BAGIAN = {
  distribusi: "loading",
  setoran: "sewing",
  cutting: "cutting"
};

function spBolehBatalRiwayat_(jenis, k) {
  // Peran belum dimuat -> tampilkan saja. Backend tetap menjaga, dan
  // menyembunyikan tombol karena data yang belum tiba lebih membingungkan
  // daripada tombol yang sesekali ditolak.
  if (window.SP_BAGIAN === undefined) return true;
  if (window.SP_BAGIAN_SEMUA) return true;
  const bagian = window.SP_BAGIAN || [];
  if (!bagian.length) return true;   // kosong = semua bagian
  const perlu = SP_RIW_BAGIAN[jenis];
  if (perlu && bagian.indexOf(perlu) === -1) return false;

  // Setoran: hanya line yang menginput. Bagian "sewing" saja tidak cukup --
  // satu bagian memuat banyak line, dan kepala line A tidak seharusnya bisa
  // membatalkan setoran line B.
  //
  // Kosong = tidak dibatasi, sama seperti kolom Bagian.
  if (jenis === "setoran" && k) {
    const lineStaf = window.SP_ID_LINE || [];
    if (lineStaf.length && k.idLine && lineStaf.indexOf(k.idLine) === -1) return false;
  }
  return true;
}

function spBatalkanCatatan(i) {
  const jenis = window.SP_RIW_JENIS || SP_RIW_JENIS_AWAL;
  const k = (window.SP_RIW || [])[i];
  if (!k) return;
  const id = jenis === "cutting" ? k.idCutting
    : (jenis === "setoran" ? k.idSetoran : k.idDistribusi);

  const alasan = prompt("Batalkan catatan " + id + "?\n\n" +
    "Barisnya TIDAK dihapus \u2014 ditandai batal dan tidak ikut dihitung, " +
    "supaya jelas pernah ada kesalahan.\n\nAlasan pembatalan:");
  if (alasan === null) return;
  if (!alasan.trim()) { alert("Alasan wajib diisi."); return; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: jenis === "cutting" ? "batalkanHasilCutting"
        : (jenis === "setoran" ? "batalkanSetoran" : "batalkanDistribusi"),
      payload: jenis === "cutting"
        ? { idCutting: id, alasan: alasan.trim() }
        : (jenis === "setoran"
          ? { idSetoran: id, alasan: alasan.trim() }
          : { idDistribusi: id, alasan: alasan.trim() })
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
      // Baris pengembalian hanya muncul kalau memang ada -- kalau selalu
      // ditampilkan dengan nilai 0, ringkasan jadi penuh angka yang tidak
      // berarti apa-apa untuk mayoritas line.
      (po.totalDikembalikan
        ? '<div class="sp-ringkas-item"><span>Dikembalikan (belum dijahit)</span><b>' +
          po.totalDikembalikan + ' pcs</b></div>'
        : '') +
      '<div class="sp-ringkas-item"><span>Masih di tangan line</span><b>' + wip + ' pcs</b></div>' +
    '</div>';
  document.getElementById("sp-setor-ringkas").classList.remove("hidden");

  // Pemilih jenis SEBELUM tabel: seluruh makna angka yang diisi berubah dari
  // sini. "Jadi baju" masuk hitungan produksi selesai; "dikembalikan" cuma
  // memindahkan barang keluar dari line.
  const wadahJenis = document.getElementById("sp-setor-jenis-wrap");
  if (wadahJenis && !document.querySelector('input[name="sp-setor-jenis"]')) {
    wadahJenis.innerHTML =
      '<div class="sp-mode">' +
        '<label class="sp-mode-opsi aktif"><input checked="checked" name="sp-setor-jenis" ' +
          'onchange="spUbahJenisSetoran_()" type="radio" value="Jadi Baju"/>' +
          '<span><b>Jadi baju</b><small>sudah dijahit, lanjut ke finishing</small></span></label>' +
        '<label class="sp-mode-opsi"><input name="sp-setor-jenis" ' +
          'onchange="spUbahJenisSetoran_()" type="radio" value="Dikembalikan"/>' +
          '<span><b>Dikembalikan</b><small>masih potongan, belum dijahit</small></span></label>' +
      '</div>' +
      '<p class="hidden sp-info sp-setor-info-kembali" id="sp-setor-ket">' +
        'Potongan yang dikembalikan TIDAK dihitung sebagai baju jadi. ' +
        'Barangnya keluar dari tangan line, dan bisa dibagikan lagi ke line lain ' +
        'lewat tab Loading.</p>';
  }

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

function spUbahJenisSetoran_() {
  const kembali = spJenisSetoranKembali_();
  const ket = document.getElementById("sp-setor-ket");
  if (ket) ket.classList.toggle("hidden", !kembali);
  document.querySelectorAll('input[name="sp-setor-jenis"]').forEach(function (inp) {
    const el = inp.closest(".sp-mode-opsi");
    if (el) el.classList.toggle("aktif", inp.checked);
  });
}

function spJenisSetoranKembali_() {
  const r = document.querySelector('input[name="sp-setor-jenis"]:checked');
  return !!(r && r.value === "Dikembalikan");
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
        jenisSetoran: spJenisSetoranKembali_() ? "Dikembalikan" : "Jadi Baju",
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

/* ============================================================
   MARKER (bagian: pola)
   ============================================================ */

/** Ukuran standar, dipakai kalau sumber lain tidak memberi jawaban. */
const SP_SIZE_STANDAR = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "All Size"];

/**
 * Ukuran yang bisa dipakai di susunan marker. TIGA sumber, dicoba berurutan.
 *
 * Sumber utamanya jawaban getMarkerPO (backend membacanya dari Rincian SO).
 * Tapi form ini TIDAK BOLEH hilang cuma karena satu sumber kosong: tim pola
 * yang membuka halaman lalu tidak menemukan apa pun akan menyimpulkan sistemnya
 * rusak, dan kembali mencatat marker di kertas.
 *
 * Dua kejadian yang sudah terbukti membuatnya kosong:
 *   1. window.SP_CUT dipakai sebagai sumber, padahal cuma dimuat di tab
 *      Hasil Cutting -- di tab Marker selalu kosong.
 *   2. Backend belum di-deploy ulang, jadi sizeTersedia tidak dikirim sama
 *      sekali dan `d.sizeTersedia || []` menghasilkan array kosong.
 *
 * Keduanya menghasilkan gejala yang sama persis. Karena itu sekarang ada
 * cadangan berlapis, dan sumber mana yang terpakai diberitahukan ke pemakai --
 * bukan disembunyikan.
 */
function spSizePO_() {
  const dariBackend = window.SP_PO_SIZE || [];
  if (dariBackend.length) { window.SP_SIZE_SUMBER = "order"; return dariBackend; }

  // Cadangan 1: data tab Hasil Cutting, kalau kebetulan sudah dimuat.
  const cut = window.SP_CUT;
  if (cut && cut.baris && cut.baris.length) {
    const set = {};
    cut.baris.forEach(function (b) {
      Object.keys(b.sizeQty || {}).forEach(function (sz) {
        if (Number(b.sizeQty[sz]) > 0) set[sz] = true;
      });
    });
    const ada = SP_SIZE_STANDAR.filter(function (sz) { return set[sz]; })
      .concat(Object.keys(set).filter(function (sz) { return SP_SIZE_STANDAR.indexOf(sz) === -1; }));
    if (ada.length) { window.SP_SIZE_SUMBER = "cutting"; return ada; }
  }

  // Cadangan 2: daftar standar. Lebih banyak pilihan daripada yang perlu, tapi
  // form tetap bisa dipakai -- dan itu jauh lebih baik daripada tidak ada form.
  window.SP_SIZE_SUMBER = "standar";
  return SP_SIZE_STANDAR;
}

/**
 * Thumbnail gambar layout marker.
 *
 * Tautan Drive biasa (".../file/d/ID/view") tidak bisa dipakai di <img> --
 * yang keluar halaman HTML, bukan gambar. Perlu bentuk thumbnail.
 * Kalau gagal dimuat (file dihapus / izin berubah), onerror menggantinya
 * dengan tautan teks, bukan ikon rusak.
 */
function spThumbMarker_(url) {
  const m = String(url).match(/\/file\/d\/([^/]+)/) || String(url).match(/[?&]id=([^&]+)/);
  const src = m
    ? ("https://drive.google.com/thumbnail?id=" + encodeURIComponent(m[1]) + "&sz=w400")
    : url;
  // Versi besar untuk pratinjau. Memakai ID yang sama dengan lebar lebih besar
  // -- bukan URL Drive aslinya, karena halaman Drive tidak bisa disematkan
  // sebagai <img>.
  const besar = m
    ? ("https://drive.google.com/thumbnail?id=" + encodeURIComponent(m[1]) + "&sz=w1600")
    : url;

  // Klik membuka PRATINJAU di halaman, bukan tab Drive. Memeriksa layout
  // marker itu pekerjaan berulang -- tiap kali pindah tab lalu kembali
  // memutus alurnya, dan untuk 45 marker itu jadi mahal.
  //
  // Tautan ke Drive tetap disediakan di dalam pratinjau, untuk yang memang
  // perlu mengunduh atau melihat ukuran asli.
  return '<button class="sp-thumb" onclick="spBukaPratinjau_(\'' +
      spEsc_(besar).replace(/'/g, "&#39;") + '\',\'' +
      spEsc_(url).replace(/'/g, "&#39;") + '\')" ' +
      'title="Lihat gambar layout" type="button">' +
    '<img alt="layout" loading="lazy" onerror="spThumbGagal_(this)" src="' + spEsc_(src) + '"/>' +
  '</button>';
}

/**
 * Pratinjau gambar layar penuh. Dibuat sekali lalu dipakai ulang -- membuat
 * elemen baru tiap klik meninggalkan sampah di DOM.
 */
function spBukaPratinjau_(urlBesar, urlAsli) {
  let wadah = document.getElementById("sp-pratinjau");
  if (!wadah) {
    wadah = document.createElement("div");
    wadah.id = "sp-pratinjau";
    wadah.className = "sp-pratinjau";
    // Klik di LUAR gambar menutup. Klik pada gambarnya sendiri tidak --
    // orang sering mengklik gambar untuk memperbesar, dan menutupnya di situ
    // terasa seperti salah pencet.
    wadah.onclick = function (e) {
      if (e.target === wadah || e.target.classList.contains("sp-pratinjau-tutup")) {
        spTutupPratinjau_();
      }
    };
    document.body.appendChild(wadah);
  }
  wadah.innerHTML =
    '<button class="sp-pratinjau-tutup" title="Tutup" type="button">&#215;</button>' +
    '<img alt="layout marker" src="' + spEsc_(urlBesar) + '"/>' +
    (urlAsli
      ? '<a class="sp-pratinjau-drive" href="' + spEsc_(urlAsli) + '" rel="noopener" ' +
        'target="_blank">Buka di Google Drive</a>'
      : '');
  wadah.classList.add("tampil");
  // Halaman di belakang tidak ikut menggulir saat pratinjau terbuka.
  document.body.style.overflow = "hidden";
}

function spTutupPratinjau_() {
  const wadah = document.getElementById("sp-pratinjau");
  if (wadah) wadah.classList.remove("tampil");
  document.body.style.overflow = "";
}

// Esc menutup pratinjau. Dipasang sekali di tingkat dokumen, bukan per
// pratinjau -- kalau tidak, penanganannya menumpuk tiap kali dibuka.
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") spTutupPratinjau_();
});

function spThumbGagal_(img) {
  const a = img.closest(".sp-thumb");
  if (!a) return;
  a.classList.add("sp-thumb-gagal");
  a.innerHTML = '<span>gambar tidak tampil</span>';
}

/** Tautan berkas non-gambar (.plt dsb) -- ditampilkan sebagai tautan unduh. */
function spTautanFile_(url, i) {
  return '<a class="sp-file-link" href="' + spEsc_(url) + '" rel="noopener" target="_blank">' +
    '&#128196; file ' + (i + 1) + '</a>';
}

function spPecahUrl_(gabungan) {
  return String(gabungan || "").split(";")
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
}

function spMuatMarker() {
  if (!window.SP_PO_AKTIF) {
    document.getElementById("sp-marker-daftar").innerHTML =
      '<p class="sp-info">Pilih Purchase Order dulu.</p>';
    document.getElementById("sp-marker-form").innerHTML = "";
    return;
  }
  document.getElementById("sp-marker-daftar").innerHTML = '<p class="sp-info">Memuat...</p>';
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getMarkerPO",
      idPurchaseOrder: window.SP_PO_AKTIF })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal memuat marker.");
    window.SP_MARKER = d.marker || [];
    window.SP_PO_SIZE = d.sizeTersedia || [];
    window.SP_PO_WARNA = d.warna || [];
    window.SP_PO_ITEM = d.item || {};
    window.SP_PO_DAFTAR_ITEM = d.daftarItem || [];
    window.SP_PO_KAIN = d.jenisKain || [];
    spRenderMarker_();
  })
  .catch(function (e) {
    document.getElementById("sp-marker-daftar").innerHTML =
      '<p class="sp-info">' + (e.message || e) + '</p>';
  });
}

function spRenderMarker_() {
  const daftar = window.SP_MARKER || [];
  const wadah = document.getElementById("sp-marker-daftar");

  wadah.innerHTML = daftar.length
    ? '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
        '<th>Kode</th><th>Style</th><th>Layout</th><th>Lebar (cm)</th><th>Panjang</th><th>Allow</th>' +
        '<th>Susunan</th><th>Pcs/lapis</th><th>Komponen</th><th>Status</th><th></th></tr></thead><tbody>' +
        daftar.map(function (m) {
          const susun = Object.keys(m.susunanSize || {})
            .map(function (sz) { return sz + ":" + m.susunanSize[sz]; }).join(" ");
          const layout = spPecahUrl_(m.urlLayout);
          const berkas = spPecahUrl_(m.urlFileMarker);
          // data-label dipakai CSS di layar sempit: tabel berubah jadi kartu,
          // dan tiap sel memakai label ini sebagai judulnya. Tanpa itu, 9 kolom
          // dipaksa muat di layar HP dan kode marker terpotong huruf per huruf.
          return '<tr>' +
            '<td data-label="Kode"><b>' + spEsc_(m.kodeMarker || "-") + '</b>' +
              (m.warisan ? '<div class="sp-sub" style="color:var(--gold,#C8964A)">dari ' +
                spEsc_(m.poAsal) + '</div>' : '') + '</td>' +
            '<td data-label="Style">' + (m.style
              ? spEsc_(m.style)
              : '<span class="sp-mk-semua">semua style</span>') + '</td>' +
            '<td class="sp-td-layout" data-label="Layout">' +
              (layout.length ? layout.map(spThumbMarker_).join("") : '<span class="sp-kosong">&#183;</span>') +
              (berkas.length ? '<div class="sp-file-list">' +
                berkas.map(spTautanFile_).join("") + '</div>' : '') +
            '</td>' +
            '<td data-label="Lebar kain">' + (m.lebarKain || "-") + ' cm</td>' +
            '<td data-label="Panjang">' + m.panjangMarker + " " + spEsc_(m.satuanPanjang) + '</td>' +
            '<td data-label="Allowance">' + (m.allowancePerLapis !== undefined ? m.allowancePerLapis : "-") + '</td>' +
            '<td data-label="Susunan">' + spEsc_(susun || "-") + '</td>' +
            '<td data-label="Pcs/lapis"><b>' + m.pcsPerLapis + '</b></td>' +
            '<td data-label="Komponen">' + (m.komponen
              ? spEsc_(m.komponen)
              : '<span class="sp-kosong">semua panel</span>') + '</td>' +
            '<td data-label="Status">' + spEsc_(m.status) +
              (m.idMarkerAsal ? ' <small>(revisi)</small>' : '') + '</td>' +
            '<td class="sp-td-aksi" data-label="">' +
              (m.warisan
                ? '<span class="sp-sub">kelola dari PO asalnya</span>'
                : '<button class="sp-btn-kecil" onclick="spRevisiMarker(\'' + m.idMarker + '\')" ' +
                  'type="button">Revisi</button> ' +
                  '<button class="sp-btn-kecil" onclick="spBatalMarker(\'' + m.idMarker + '\')" ' +
                  'type="button">Batal</button>') + '</td></tr>';
        }).join("") +
      '</tbody></table></div>'
    : '<p class="sp-info">Belum ada marker untuk PO ini.</p>';

  spRenderFormMarker_(null);
}

/**
 * Form marker. Susunan size memakai input ANGKA PER SIZE, bukan teks "S:1".
 * Format teks pernah diisi "S" saja tanpa jumlah -- sistem menerimanya diam-diam
 * dan pcs per lapis jadi 0, yang membuat seluruh output gelaran nol tanpa ada
 * yang tahu sebabnya.
 */
/**
 * Item yang sedang dipilih di form Gelaran.
 *
 * Membaca dropdown kalau ada. Kalau tidak ada -- yaitu SAAT form sedang
 * dibangun ulang, ketika dropdown lama sudah terhapus dan yang baru belum
 * jadi -- dipakai indeks yang diingat.
 *
 * Tanpa ingatan itu, memilih style kedua tidak pernah bertahan: onchange
 * memicu render ulang, render ulang membuat dropdown baru tanpa `selected`,
 * dan browser kembali ke indeks 0. Akibatnya bukan cuma layar yang balik --
 * saat Simpan ditekan, nilai yang terbaca juga indeks 0, jadi potongan Short
 * Sleeve tercatat sebagai Long Sleeve.
 */
function spItemGelaranTerpilih_() {
  const daftar = window.SP_PO_DAFTAR_ITEM || [];
  const sel = document.getElementById("sp-gl-item");
  if (sel && daftar[Number(sel.value)]) return daftar[Number(sel.value)];
  const ingat = Number(window.SP_GL_ITEM_IDX);
  if (daftar[ingat]) return daftar[ingat];
  return daftar[0] || window.SP_PO_ITEM || {};
}

/** Indeks item terpilih, sudah dijaga tetap di dalam rentang daftar. */
function spItemGelaranIdx_() {
  const daftar = window.SP_PO_DAFTAR_ITEM || [];
  const ingat = Number(window.SP_GL_ITEM_IDX);
  return daftar[ingat] ? ingat : 0;
}

/**
 * Dipanggil saat dropdown Item diubah. Simpan pilihannya DULU, baru render
 * ulang -- urutan ini yang membuat pilihannya bertahan.
 */
/**
 * Marker digambar untuk kain tertentu -- kalau marker yang dipilih membawa
 * jenis kainnya (kolom Jenis Kain di SD Marker: dideklarasikan saat marker
 * dibuat sejak v91, atau dipelajari dari gelaran pertama), dropdown kain
 * MEWARISINYA. Nilainya tetap bisa diganti manual: pewarisan mengisi, tidak
 * mengunci -- marker lama tanpa kain dan kain pengganti darurat tetap jalan.
 * "(tanpa marker)" atau marker tanpa data kain: dropdown dibiarkan.
 */
/**
 * Kartu "Semua Marker Terdaftar" di tab Marker -- daftar lintas PO.
 * Lahir dari kejadian tim marker (Agu 2026): input beberapa marker, re-login,
 * PO tidak ketemu di picker (picker menyaring order Selesai), dan tidak ada
 * cara memastikan markernya masuk / salah kamar selain menebak nomor PO.
 * Wadahnya dibuat lewat JS (bukan template) supaya tidak menambah beban
 * rilis template; dimuat sekali per sesi, tombol Segarkan untuk memuat ulang.
 */
function spMuatSemuaMarker_(paksa) {
  const panel = document.getElementById("sp-panel-marker");
  if (!panel) return;
  let wadah = document.getElementById("sp-marker-semua");
  if (!wadah) {
    wadah = document.createElement("div");
    wadah.id = "sp-marker-semua";
    wadah.className = "sp-kartu";
    panel.appendChild(wadah);
  }
  // Gaya kartu ini disuntik sekali dari sini (bukan template) supaya rilisnya
  // cukup satu file. Daftarnya ratusan baris dan terus tumbuh: tanpa batas
  // tinggi, kartu ini menelan seluruh halaman. Kepala tabel dibuat sticky --
  // sticky DI DALAM wadah ber-overflow aman; yang berbahaya cuma
  // overflow-x:hidden di body (pelajaran lama).
  if (!document.getElementById("sp-marker-semua-css")) {
    const st = document.createElement("style");
    st.id = "sp-marker-semua-css";
    st.textContent =
      "#sp-marker-semua .sp-tabelwrap{max-height:60vh;overflow:auto;" +
        "border:1px solid var(--line,#E5E0D6);border-radius:10px}" +
      "#sp-marker-semua .sp-tabel thead th{position:sticky;top:0;" +
        "background:var(--cream,#F9F7F2);z-index:2;" +
        "box-shadow:0 1px 0 var(--line,#E5E0D6)}";
    document.head.appendChild(st);
  }
  if (window.SP_SEMUA_MARKER && !paksa) { spRenderSemuaMarker_(); return; }
  wadah.innerHTML = '<p class="sp-info">Memuat daftar semua marker...</p>';

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getDaftarSemuaMarker" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || d.error) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar marker.") + '</p>';
      return;
    }
    window.SP_SEMUA_MARKER = d;
    spRenderSemuaMarker_();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

function spRenderSemuaMarker_() {
  const wadah = document.getElementById("sp-marker-semua");
  const d = window.SP_SEMUA_MARKER;
  if (!wadah || !d) return;

  // KERANGKA (judul + kotak cari + tombol + wadah hasil) dibangun SEKALI.
  // Versi pertama menulis ulang seluruh kartu di tiap ketikan -- kotak cari
  // ikut dihancurkan-dibuat-ulang, nilainya selamat tapi FOKUS KURSOR mati:
  // mengetik "furing" butuh enam klik, satu per huruf. Sekarang mengetik
  // hanya merender ulang #sp-semua-hasil; kotaknya tidak pernah disentuh.
  if (!document.getElementById("sp-semua-hasil")) {
    wadah.innerHTML = '<div class="sp-lbl">Semua Marker Terdaftar</div>' +
      '<p class="sp-info">Lintas PO, terbaru di atas' +
      (d.total > (d.marker || []).length
        ? ' &#8212; menampilkan ' + d.marker.length + ' terbaru dari ' + d.total + ' total'
        : ' &#8212; ' + (d.marker || []).length + ' marker') +
      '. Ketik untuk mencari: kode, artikel, PO, kain, atau nama pembuat. ' +
      'Kalau ada yang <b>salah kamar</b> (nempel di PO yang keliru), betulkan ' +
      'kolom ID Purchase Order barisnya di SD Marker &#8212; selama belum ' +
      'dipakai gelaran, itu satu sel saja.</p>' +
      '<input id="sp-semua-cari" oninput="spRenderSemuaMarker_()" ' +
        'placeholder="cari: furing / Sienna / 260725 / nama pembuat" type="text"/> ' +
      '<button class="sp-btn-kecil" onclick="spMuatSemuaMarker_(true)" type="button">Segarkan</button>' +
      '<div id="sp-semua-hasil"></div>';
  }

  const q = ((document.getElementById("sp-semua-cari") || {}).value || "")
    .trim().toLowerCase();
  const baris = (d.marker || []).filter(function (m) {
    if (!q) return true;
    return [m.idMarker, m.idPurchaseOrder, m.brand, m.artikel, m.style,
      m.kodeMarker, m.jenisKain, m.komponen, m.dibuatOleh]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  });

  let html = "";
  if (q) {
    html += '<p class="sp-info">' + baris.length + ' marker cocok dengan "' +
      rjdEscapeHtml_(q) + '".</p>';
  }
  if (!baris.length) {
    html += '<p class="sp-info">Tidak ada marker yang cocok dengan pencarian.</p>';
  } else {
    // sp-tabel-kartu: pola mobile yang SUDAH ADA di CSS -- di bawah 760px
    // tabel berubah jadi kartu label-nilai (data-label tiap sel).
    html += '<div class="sp-tabelwrap sp-tabelwrap-kartu">' +
      '<table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Tanggal</th><th>Kode</th><th>PO</th><th>Artikel &#183; Style</th>' +
      '<th>Kain</th><th>Pcs/Lapis</th><th>Oleh</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      baris.map(function (m) {
        return '<tr>' +
          '<td data-label="Tanggal">' + rjdEscapeHtml_(m.tanggal || "-") + '</td>' +
          '<td data-label="Kode"><b>' + rjdEscapeHtml_(m.kodeMarker || m.idMarker) + '</b>' +
            (m.komponen ? '<div class="sp-sub">' + rjdEscapeHtml_(m.komponen) + '</div>' : '') + '</td>' +
          '<td data-label="PO">' + rjdEscapeHtml_(m.idPurchaseOrder || "-") + '</td>' +
          '<td data-label="Artikel">' + rjdEscapeHtml_([m.artikel, m.style]
            .filter(function (x) { return x; }).join(" \u00b7 ")) + '</td>' +
          '<td data-label="Kain">' + rjdEscapeHtml_(m.jenisKain || "-") + '</td>' +
          '<td data-label="Pcs/Lapis">' + (m.pcsPerLapis || "-") + '</td>' +
          '<td data-label="Oleh">' + rjdEscapeHtml_((m.dibuatOleh || "").split("@")[0]) + '</td>' +
          '<td data-label="Status">' + rjdEscapeHtml_(m.status || "-") + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table></div>';
  }
  document.getElementById("sp-semua-hasil").innerHTML = html;
}

function spMarkerGelaranGanti_() {
  const sel = document.getElementById("sp-gl-marker");
  const opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
  const kain = opt && opt.dataset ? String(opt.dataset.kain || "").trim() : "";
  if (kain) {
    const k = document.getElementById("sp-gl-kain");
    if (k) {
      if (k.tagName === "SELECT") {
        let ada = false;
        for (let i2 = 0; i2 < k.options.length; i2++) {
          if (k.options[i2].value === kain) { ada = true; break; }
        }
        if (!ada) {
          const o = document.createElement("option");
          o.value = kain; o.textContent = kain;
          k.appendChild(o);
        }
      }
      k.value = kain;
    }
  }
  spHitungGelaran_();
}

function spGantiItemGelaran_(nilai) {
  window.SP_GL_ITEM_IDX = Number(nilai) || 0;
  spRenderFormGelaran_();
}

/** Daftar item PO. Dipakai form Marker dan form Gelaran. */
function spDaftarItemPO_() {
  return window.SP_PO_DAFTAR_ITEM || [];
}

function spRenderFormMarker_(asal) {
  const sizes = spSizePO_();
  const a = asal || {};
  // Catatan sumber ukuran. Muncul HANYA kalau bukan dari order -- kalau selalu
  // muncul, pesannya berhenti dibaca dan justru menutupi kasus yang benar-benar
  // perlu diperhatikan.
  const catatanSumber = (window.SP_SIZE_SUMBER === "order") ? "" :
    '<p class="sp-info sp-size-catatan">' +
      (window.SP_SIZE_SUMBER === "cutting"
        ? "Ukuran diambil dari data cutting karena rincian order tidak terbaca."
        : "Rincian ukuran order tidak terbaca, jadi ditampilkan daftar ukuran standar. " +
          "Isi hanya ukuran yang memang ada di order ini.") +
    '</p>';
  document.getElementById("sp-marker-form").innerHTML =
    '<h4 class="sp-subjudul">' + (asal ? "Revisi marker " + spEsc_(a.kodeMarker) : "Marker baru") + '</h4>' +
    (asal ? '<p class="sp-info">Marker lama tetap tersimpan. Yang ini jadi baris baru berstatus Revisi.</p>' : '') +
    // Pilihan ITEM. Marker milik ITEM (artikel + style), bukan PO. Tanpa
    // pilihan ini, semua marker ARUZA tercatat "Kemeja Long Sleeve" -- termasuk
    // marker Polos SS yang jelas untuk Short Sleeve.
    //
    // Akibatnya bukan cuma label salah: dropdown marker di form Gelaran
    // menyaring per style, jadi marker yang salah style tidak akan muncul saat
    // menggelar style yang benar.
    (spDaftarItemPO_().length > 1
      ? '<div class="sp-grid3">' +
          '<label>Item (artikel &#183; style)' +
            '<select id="sp-mk-item">' +
              spDaftarItemPO_().map(function (it, idx) {
                const terpilih = (a.artikel === it.artikel && a.style === it.style);
                return '<option' + (terpilih ? ' selected="selected"' : '') +
                  ' value="' + idx + '">' + spEsc_(it.artikel) +
                  (it.style ? ' &#183; ' + spEsc_(it.style) : '') + '</option>';
              }).join("") +
              // Sebagian marker memuat komponen yang dipakai LEBIH DARI SATU
              // style -- mis. potongan motif kombinasi yang sama untuk Long
              // Sleeve maupun Short Sleeve. Memaksanya terdaftar di satu style
              // membuat marker itu tidak muncul saat menggelar style lainnya.
              //
              // Style dikosongkan, bukan diisi dua nilai: potongan komponen
              // bersama baru bisa dipasangkan ke style tertentu SAAT DIGELAR,
              // dan itu memang dipilih di form Gelaran.
              '<option' + (a.artikel && !a.style ? ' selected="selected"' : '') +
                ' value="semua">&#8212; Berlaku untuk SEMUA style &#8212;</option>' +
            '</select></label>' +
        '</div>' +
        '<p class="sp-info">PO ini punya ' + spDaftarItemPO_().length + ' item. ' +
          'Pilih yang markernya sedang dibuat &#8212; marker milik ITEM, bukan order.</p>'
      : '') +
    '<div class="sp-grid3">' +
      '<label>Kode Marker<input id="sp-mk-kode" placeholder="mis. A" type="text" value="' +
        spEsc_(a.kodeMarker || "") + '"/></label>' +
      '<label>Lebar Kain (cm)<input id="sp-mk-lebar" min="0" placeholder="150" step="0.5" type="number" value="' +
        (a.lebarKain || "") + '"/></label>' +
      '<label>Panjang Marker (m)<input id="sp-mk-panjang" min="0" placeholder="1.207" step="0.001" type="number" value="' +
        (a.panjangMarker || "") + '"/></label>' +
    '</div>' +
    '<div class="sp-grid3">' +
      '<label>Allowance per lapis (m)<input id="sp-mk-allow" min="0" placeholder="0.02" ' +
        'step="0.001" type="number" value="' +
        (a.allowancePerLapis !== undefined ? a.allowancePerLapis : "0.02") + '"/></label>' +
      '<label>Jenis Kain<input id="sp-mk-kain" list="sp-datalist-kain" placeholder="mis. Polos" value="' +
        spEsc_(a.jenisKain || "") + '"/></label>' +
      '<label>Komponen<input id="sp-mk-komponen" list="sp-datalist-komponen" ' +
        'placeholder="kosongkan = semua panel" type="text" value="' +
        spEsc_(a.komponen || "") + '"/></label>' +
    '</div>' +
    '<p class="sp-info"><b>Komponen</b>: kosongkan kalau marker ini memuat semua panel ' +
      '(kasus paling umum). Isi hanya kalau sebagian panel punya marker sendiri &#8212; ' +
      'mis. "Variasi" atau "Kerah, Manset" untuk interlining. Tanpa ini, dua marker ' +
      'dengan kain yang sama akan dijumlahkan dan set lengkap jadi terlalu optimis.</p>' +
    '<p class="sp-info">Panjang marker diisi APA ADANYA dari software pola. Allowance ' +
      'dipisah supaya efisiensi marker tetap bisa dinilai, dan kalau sisa kain meleset ' +
      'nanti ketahuan penyebabnya yang mana.</p>' +
    catatanSumber +
    '<label class="sp-lbl">Susunan Size &#8212; berapa pola tiap size dalam SATU lapis</label>' +
    '<div class="sp-susun">' +
      sizes.map(function (sz) {
        const v = (a.susunanSize || {})[sz] || "";
        return '<div class="sp-susun-item"><span>' + spEsc_(sz) + '</span>' +
          '<input class="sp-mk-sz" data-size="' + spEsc_(sz) + '" min="0" ' +
          'oninput="spHitungMarker_()" placeholder="0" type="number" value="' + v + '"/></div>';
      }).join("") +
    '</div>' +
    '<p class="sp-info" id="sp-mk-hitung">Pcs per lapis: <b>0</b></p>' +
    '<div class="sp-grid3" style="margin-top:14px">' +
      '<label>Catatan<input id="sp-mk-catatan" placeholder="opsional" type="text"/></label>' +
    '</div>' +
    // ---- Lampiran ----
    // Marker tanpa gambar layout cuma catatan angka: tidak ada yang bisa
    // memeriksa susunannya sebelum kain digelar. File .plt melengkapinya --
    // supaya yang tersimpan bukan cuma laporan, tapi juga bahan cetak polanya.
    '<div class="sp-lampiran">' +
      '<div class="sp-lbl">Lampiran</div>' +
      (spPecahUrl_(a.urlLayout).length
        ? '<div class="sp-thumb-grid">' + spPecahUrl_(a.urlLayout).map(spThumbMarker_).join("") + '</div>'
        : '') +
      (spPecahUrl_(a.urlFileMarker).length
        ? '<div class="sp-file-list">' + spPecahUrl_(a.urlFileMarker).map(spTautanFile_).join("") + '</div>'
        : '') +
      '<label class="sp-lbl-kecil">Gambar layout (png/jpg)' +
        '<input accept="image/*" id="sp-mk-layout" multiple="multiple" type="file"/></label>' +
      '<label class="sp-lbl-kecil">File marker (.plt, .dxf, .zip)' +
        '<input id="sp-mk-file" multiple="multiple" type="file"/></label>' +
      '<div class="sp-info">File baru DITAMBAHKAN &#8212; lampiran lama tidak terhapus. ' +
        'Maksimal 8MB per file.</div>' +
      '<input id="sp-mk-url-layout" type="hidden" value="' + spEsc_(a.urlLayout || "") + '"/>' +
      '<input id="sp-mk-url-file" type="hidden" value="' + spEsc_(a.urlFileMarker || "") + '"/>' +
    '</div>' +
    '<datalist id="sp-datalist-komponen">' +
      (window.SP_SARAN_KOMPONEN || ["Variasi", "Kerah", "Manset", "Kerah, Manset",
        "Badan", "Lengan", "Saku", "Furing"]).map(function (k) {
        return '<option value="' + spEsc_(k) + '"></option>';
      }).join("") +
    '</datalist>' +
    '<datalist id="sp-datalist-kain">' +
      (window.SP_PO_KAIN || []).map(function (k) {
        return '<option value="' + spEsc_(k) + '"></option>';
      }).join("") +
    '</datalist>' +
    '<input id="sp-mk-asal" type="hidden" value="' + spEsc_(a.idMarker || "") + '"/>' +
    '<button class="sp-simpan-btn" onclick="spSimpanMarker()" type="button">Simpan Marker</button>';
  spHitungMarker_();
}

function spHitungMarker_() {
  let n = 0;
  document.querySelectorAll(".sp-mk-sz").forEach(function (inp) { n += Number(inp.value) || 0; });
  const el = document.getElementById("sp-mk-hitung");
  if (el) el.innerHTML = "Pcs per lapis: <b>" + n + "</b>";
}

function spRevisiMarker(idMarker) {
  const m = (window.SP_MARKER || []).filter(function (x) { return x.idMarker === idMarker; })[0];
  if (!m) return;
  spRenderFormMarker_(m);
  document.getElementById("sp-marker-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function spSimpanMarker() {
  const susunan = {};
  document.querySelectorAll(".sp-mk-sz").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v > 0) susunan[inp.dataset.size] = v;
  });
  if (!Object.keys(susunan).length) { alert("Susunan size wajib diisi minimal satu."); return; }
  const panjang = Number((document.getElementById("sp-mk-panjang") || {}).value) || 0;
  if (panjang <= 0) { alert("Panjang marker wajib diisi."); return; }

  const asal = (document.getElementById("sp-mk-asal") || {}).value || "";
  // Item terpilih; kalau PO cuma punya satu, pakai yang itu.
  const daftarMk = spDaftarItemPO_();
  const selMk = document.getElementById("sp-mk-item");
  // "semua" -> style dikosongkan, artikel & brand tetap dari item pertama
  // (mereka sama untuk semua style dalam satu artikel).
  let itemMk;
  if (selMk && selMk.value === "semua") {
    const dasar = daftarMk[0] || window.SP_PO_ITEM || {};
    itemMk = { brand: dasar.brand, artikel: dasar.artikel, style: "" };
  } else if (selMk && daftarMk[Number(selMk.value)]) {
    itemMk = daftarMk[Number(selMk.value)];
  } else {
    itemMk = daftarMk[0] || window.SP_PO_ITEM || {};
  }

  const btn = event && event.target ? event.target : null;
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }

  // Baca lampiran jadi base64 sebelum dikirim. Gagal baca file TIDAK
  // membatalkan penyimpanan -- data markernya jauh lebih penting daripada
  // lampirannya, dan menggagalkan semuanya karena satu file bermasalah akan
  // membuat orang berhenti melampirkan apa pun.
  let fileLayout = [], fileMarker = [];
  try {
    const elL = document.getElementById("sp-mk-layout");
    const elF = document.getElementById("sp-mk-file");
    if (elL && elL.files && elL.files.length) fileLayout = await ofBacaBanyakFileSebagaiBase64_(elL.files);
    if (elF && elF.files && elF.files.length) fileMarker = await ofBacaBanyakFileSebagaiBase64_(elF.files);
  } catch (errUp) {
    alert("Lampiran gagal dibaca: " + (errUp.message || errUp) + "\n\nData marker tetap disimpan.");
  }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "simpanMarker",
      payload: {
        idPurchaseOrder: window.SP_PO_AKTIF,
        brand: itemMk.brand || "", artikel: itemMk.artikel || "", style: itemMk.style || "",
        kodeMarker: (document.getElementById("sp-mk-kode") || {}).value || "",
        lebarKain: Number((document.getElementById("sp-mk-lebar") || {}).value) || 0,
        panjangMarker: panjang,
        allowancePerLapis: (document.getElementById("sp-mk-allow") || {}).value,
        komponen: (document.getElementById("sp-mk-komponen") || {}).value || "",
        jenisKain: (document.getElementById("sp-mk-kain") || {}).value || "",
        satuanPanjang: "m",
        susunanSize: susunan,
        status: asal ? "Revisi" : "Final",
        idMarkerAsal: asal,
        catatan: (document.getElementById("sp-mk-catatan") || {}).value || "",
        urlLayout: (document.getElementById("sp-mk-url-layout") || {}).value || "",
        urlFileMarker: (document.getElementById("sp-mk-url-file") || {}).value || "",
        fileLayout: fileLayout,
        fileMarker: fileMarker
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    alert("Marker tersimpan: " + d.idMarker + " (" + d.pcsPerLapis + " pcs/lapis)");
    spMuatMarker();
  })
  .catch(function (e) { alert(e.message || e); })
  .then(function () { if (btn) { btn.disabled = false; btn.textContent = "Simpan Marker"; } });
}

function spBatalMarker(idMarker) {
  if (!confirm("Batalkan marker " + idMarker + "?\n\nBarisnya tidak dihapus, cuma ditandai Batal.")) return;
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "batalkanMarker",
      payload: { idMarker: idMarker } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal membatalkan.");
    spMuatMarker();
  })
  .catch(function (e) { alert(e.message || e); });
}

/* ============================================================
   GELARAN (bagian: cutting)
   ============================================================ */

function spMuatGelaran() {
  if (!window.SP_PO_AKTIF) {
    document.getElementById("sp-gelar-form").innerHTML =
      '<p class="sp-info">Pilih Purchase Order dulu.</p>';
    document.getElementById("sp-kain-rekap").innerHTML = "";
    return;
  }
  document.getElementById("sp-gelar-form").innerHTML = '<p class="sp-info">Memuat...</p>';
  Promise.all([
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getMarkerPO", idPurchaseOrder: window.SP_PO_AKTIF }) })
      .then(function (r) { return r.json(); }),
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getRekapKainPO", idPurchaseOrder: window.SP_PO_AKTIF }) })
      .then(function (r) { return r.json(); }),
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getRingkasanGelaranPO", idPurchaseOrder: window.SP_PO_AKTIF }) })
      .then(function (r) { return r.json(); }),
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getRollPO", idPurchaseOrder: window.SP_PO_AKTIF }) })
      .then(function (r) { return r.json(); })
  ])
  .then(function (hasil) {
    window.SP_MARKER = (hasil[0] && hasil[0].marker) || [];
    window.SP_PO_SIZE = (hasil[0] && hasil[0].sizeTersedia) || [];
    window.SP_PO_WARNA = (hasil[0] && hasil[0].warna) || [];
    window.SP_PO_ITEM = (hasil[0] && hasil[0].item) || {};
    window.SP_PO_DAFTAR_ITEM = (hasil[0] && hasil[0].daftarItem) || [];
    // PO baru = daftar item baru. Indeks yang diingat dari PO sebelumnya bisa
    // menunjuk item yang tidak ada lagi, atau -- lebih berbahaya -- item lain
    // yang kebetulan ada di posisi yang sama.
    window.SP_GL_ITEM_IDX = 0;
    window.SP_PO_KAIN = (hasil[0] && hasil[0].jenisKain) || [];
    window.SP_KAIN = (hasil[1] && hasil[1].kain) || [];
    window.SP_KAIN_AMBANG = hasil[1] || {};
    window.SP_SET_LENGKAP = (hasil[2] && hasil[2].setLengkap) || [];
    window.SP_RECUT = (hasil[2] && hasil[2].recut) || {};
    window.SP_DAFTAR_GELARAN = (hasil[2] && hasil[2].daftarGelaran) || [];
    window.SP_SARAN_KOMPONEN = (hasil[2] && hasil[2].saranKomponen) || [];
    window.SP_ROLL = (hasil[3] && hasil[3].kain) || [];
    spRenderFormGelaran_();
    spRenderDaftarGelaran_();
    spRenderSetLengkap_();
    spRenderRekapKain_();
    spRenderRecut_();
    spRenderRoll_();
  })
  .catch(function (e) {
    document.getElementById("sp-gelar-form").innerHTML =
      '<p class="sp-info">' + (e.message || e) + '</p>';
  });
}

function spRenderFormGelaran_() {
  // Marker disaring per ITEM terpilih. Marker milik (artikel, style) --
  // menampilkan marker Kemeja Long Sleeve saat menggelar Short Sleeve akan
  // menghasilkan potongan yang tercatat di style yang salah.
  //
  // Kalau tidak ada marker yang cocok, JANGAN kosongkan daftarnya: marker lama
  // yang style-nya belum diisi jadi tidak bisa dipakai sama sekali, dan orang
  // terjebak tanpa penjelasan.
  const itemAktif = spItemGelaranTerpilih_();
  const semuaMarker = (window.SP_MARKER || []).filter(function (m) {
    return String(m.status || "").toLowerCase() !== "batal" && m.pcsPerLapis > 0;
  });
  const cocokItem = semuaMarker.filter(function (m) {
    if (!itemAktif.style) return true;
    return !m.style || m.style === itemAktif.style;
  });
  const marker = cocokItem.length ? cocokItem : semuaMarker;
  if (!marker.length) {
    document.getElementById("sp-gelar-form").innerHTML =
      '<p class="sp-info">Belum ada marker yang siap dipakai. Minta tim pola mengisinya dulu ' +
      'di tab Marker.</p>';
    return;
  }
  // Warna juga bercadangan: kalau backend belum mengirimnya, ambil dari data
  // cutting. Kalau dua-duanya kosong, form tetap tampil dengan input teks --
  // form yang mati total lebih buruk daripada form yang harus diketik manual.
  // Item aktif dipakai DUA saringan di bawah (warna dan jenis kain) --
  // dua-duanya milik (artikel+style), bukan milik PO.
  const itemAktifGl = (window.SP_PO_DAFTAR_ITEM || [])[spItemGelaranIdx_()] || {};

  // Warna mengikuti ITEM yang dipilih (v90, menyusul kain di v89): baris
  // Rincian SO milik item ini saja -- warna koko tidak ditawarkan saat yang
  // digelar Denara Dress. Cadangan berjenjang kalau backend lama: gabungan
  // se-PO, lalu dari data cutting (disaring style item kalau ada).
  let warna = (itemAktifGl.warna && itemAktifGl.warna.length)
    ? itemAktifGl.warna.slice()
    : (window.SP_PO_WARNA || []);
  if (!warna.length && window.SP_CUT && window.SP_CUT.baris) {
    warna = window.SP_CUT.baris
      .filter(function (b) {
        return !itemAktifGl.style || !b.style || b.style === itemAktifGl.style;
      })
      .map(function (b) { return b.warna; })
      .filter(function (w, i, a) { return w && a.indexOf(w) === i; });
  }
  // Jenis kain dari konteks PO (komposisi artikel + kain klien). Versi pertama
  // mengambilnya dari REKAP -- yang isinya cuma kain yang sudah ada
  // penerimaannya. Untuk PO tanpa catatan kain klien, satu-satunya pilihan jadi
  // "(tanpa nama)" dan tidak ada yang bisa dipilih.
  // Jenis kain mengikuti ITEM yang dipilih (v89). Komposisi kain milik
  // (artikel+style), bukan milik PO -- kain Motif Koko tidak boleh
  // ditawarkan saat yang digelar Denara Dress. Backend (marker-gelaran.gs)
  // mengirim daftar per item di daftarItem[i].jenisKain sejak perbaikan
  // Agustus 2026; SP_PO_KAIN (gabungan semua item) jadi cadangan kalau
  // backend yang terpasang masih versi lama, lalu cadangan terakhir dari
  // rekap kain -- form yang mati total lebih buruk daripada daftar yang
  // kurang presisi. Ganti item -> spGantiItemGelaran_ -> render ulang ->
  // daftar ini ikut berganti.
  let kain = (itemAktifGl.jenisKain && itemAktifGl.jenisKain.length)
    ? itemAktifGl.jenisKain.slice()
    : (window.SP_PO_KAIN || []);
  if (!kain.length) {
    kain = (window.SP_KAIN || []).map(function (k) { return k.jenis; })
      .filter(function (x) { return x && x !== "(tanpa nama)"; });
  }

  // Pilihan ITEM (artikel + style). Satu artikel bisa punya beberapa style
  // dengan warna yang sama -- tanpa pilihan ini, potongan Kemeja Long Sleeve
  // dan Short Sleeve tercampur jadi satu dan set lengkapnya salah.
  //
  // Ditampilkan HANYA kalau PO punya lebih dari satu item. Untuk order biasa,
  // dropdown berisi satu pilihan cuma menambah langkah tanpa gunanya.
  const daftarItem = window.SP_PO_DAFTAR_ITEM || [];
  const perluPilihItem = daftarItem.length > 1;
  const itemIdx = spItemGelaranIdx_();

  document.getElementById("sp-gelar-form").innerHTML =
    (perluPilihItem
      ? '<div class="sp-grid3">' +
          '<label>Item (artikel &#183; style)' +
            '<select id="sp-gl-item" onchange="spGantiItemGelaran_(this.value)">' +
              daftarItem.map(function (it, idx) {
                return '<option' + (idx === itemIdx ? ' selected="selected"' : '') +
                  ' value="' + idx + '">' +
                  spEsc_(it.artikel) + (it.style ? ' &#183; ' + spEsc_(it.style) : '') +
                  '</option>';
              }).join("") +
            '</select></label>' +
        '</div>' +
        '<p class="sp-info">PO ini punya ' + daftarItem.length + ' item. Pilih yang ' +
          'sedang digelar &#8212; potongan tiap style dihitung terpisah.</p>'
      : '') +
    // Pemilih mode di paling atas: seluruh perilaku form berubah dari sini,
    // jadi keputusannya harus diambil SEBELUM mengisi apa pun -- bukan sesudah
    // semua terisi lalu baru sadar salah mode.
    '<div class="sp-mode">' +
      '<label class="sp-mode-opsi"><input checked="checked" name="sp-gl-jenis" ' +
        'onchange="spUbahModeGelaran_()" type="radio" value="Normal"/>' +
        '<span><b>Gelaran normal</b><small>menghasilkan baju baru</small></span></label>' +
      '<label class="sp-mode-opsi"><input name="sp-gl-jenis" onchange="spUbahModeGelaran_()" ' +
        'type="radio" value="Re-cut"/>' +
        '<span><b>Re-cut</b><small>ganti panel cacat &#183; kain saja</small></span></label>' +
    '</div>' +
    '<div class="sp-grid3">' +
      '<label>Marker<select id="sp-gl-marker" onchange="spMarkerGelaranGanti_()">' +
        '<option value="">(tanpa marker &#8212; potong manual)</option>' +
        marker.map(function (m) {
          return '<option data-panjang="' + m.panjangMarker + '" data-pcs="' + m.pcsPerLapis +
            '" data-allow="' + (m.allowancePerLapis !== undefined ? m.allowancePerLapis : 0.02) +
            '" data-kain="' + spEsc_(m.jenisKain || "") +
            '" data-susun="' + spEsc_(JSON.stringify(m.susunanSize)) + '" value="' + m.idMarker + '">' +
            spEsc_(m.kodeMarker || m.idMarker) + " &#183; " + m.panjangMarker + "m &#183; " +
            m.pcsPerLapis + " pcs/lapis" +
            (m.jenisKain ? (" &#183; " + spEsc_(m.jenisKain)) : "") +
            (m.komponen ? (" &#183; " + spEsc_(m.komponen)) : "") +
            (m.warisan ? " &#183; dari " + spEsc_(m.poAsal) : "") + "</option>";
        }).join("") +
      '</select></label>' +
      '<label>Warna' +
        (warna.length
          ? '<select id="sp-gl-warna">' + warna.map(function (w) {
              return '<option value="' + spEsc_(w) + '">' + spEsc_(w) + '</option>';
            }).join("") + '</select>'
          : '<input id="sp-gl-warna" placeholder="ketik nama warna" type="text"/>') +
      '</label>' +
      '<label>Jenis Kain' +
        (kain.length
          ? '<select id="sp-gl-kain">' + kain.map(function (k) {
              return '<option value="' + spEsc_(k) + '">' + spEsc_(k) + '</option>';
            }).join("") + '</select>'
          : '<input id="sp-gl-kain" placeholder="ketik jenis kain" type="text"/>') +
      '</label>' +
    (kain.length ? '' :
      '<p class="sp-info sp-size-catatan">Daftar kain kosong. Isi Komposisi Kain di ' +
      'Edit Order (panel ARTIKEL) atau Kain Dari Klien di order &#8212; setelah itu ' +
      'pilihannya muncul di sini. Sementara boleh diketik manual.</p>') +
    '</div>' +
    '<div class="sp-grid3">' +
      '<label>Jumlah Lapis<input id="sp-gl-lapis" min="1" oninput="spHitungGelaran_()" ' +
        'placeholder="0" type="number"/></label>' +
      '<label>Tanggal<input id="sp-gl-tanggal" type="date" value="' +
        new Date().toISOString().slice(0, 10) + '"/></label>' +
      '<label>Allowance/lapis (m)<input id="sp-gl-allow" min="0" oninput="spHitungGelaran_()" ' +
        'step="0.001" type="number"/></label>' +
    '</div>' +
    '<div class="sp-grid3">' +
      '<label>Catatan<input id="sp-gl-catatan" placeholder="opsional" type="text"/></label>' +
    '</div>' +
    // JANGAN self-closing. Di XML <div/> sah, tapi innerHTML browser
    // menafsirkannya sebagai div yang TIDAK ditutup -- tombol Simpan di
    // bawahnya jadi ANAK div ini, lalu ikut terhapus setiap kali
    // spHitungGelaran_ menulis ulang isinya. Gejalanya: tombol Simpan Gelaran
    // hilang dan satu-satunya tombol yang tersisa adalah Simpan Hasil Ukur.
    // Blok re-cut disembunyikan di mode normal. Ditampilkan/disembunyikan,
    // bukan dirender ulang -- supaya isian yang sudah diketik tidak hilang
    // kalau operator berganti mode bolak-balik.
    '<div class="sp-recut-blok hidden" id="sp-gl-recut">' +
      '<div class="sp-grid3">' +
        '<label>Komponen yang diganti' +
          '<input id="sp-gl-komponen" list="sp-datalist-komponen" ' +
            'placeholder="mis. Lengan" type="text"/></label>' +
        '<label>Alasan<input id="sp-gl-alasan" placeholder="mis. kain sobek" type="text"/></label>' +
        '<label>Kain terpakai (m)<input id="sp-gl-kain-manual" min="0" ' +
          'oninput="spHitungGelaran_()" placeholder="0" step="0.01" type="number"/></label>' +
      '</div>' +
      '<datalist id="sp-datalist-komponen">' +
        (window.SP_SARAN_KOMPONEN || []).map(function (k) {
          return '<option value="' + spEsc_(k) + '"></option>';
        }).join("") +
      '</datalist>' +
      '<p class="sp-info">Re-cut TIDAK menambah jumlah baju &#8212; bajunya sudah terhitung ' +
        'waktu dipotong pertama. Yang bertambah cuma pemakaian kain.</p>' +
    '</div>' +
    '<div class="sp-hitung" id="sp-gl-hasil"></div>' +
    '<button class="sp-simpan-btn" onclick="spSimpanGelaran()" type="button">Simpan Gelaran</button>';
  spUbahModeGelaran_();
}

/**
 * Pratinjau hasil SEBELUM disimpan. Ini yang membuat "satu angka diketik" terasa
 * aman: operator melihat 30 lapis jadi berapa pcs dan berapa meter kain sebelum
 * menekan simpan, bukan sesudahnya.
 */
/** Mode gelaran berubah -> tampilkan/sembunyikan blok re-cut, hitung ulang. */
function spUbahModeGelaran_() {
  const recut = spModeRecut_();
  const blok = document.getElementById("sp-gl-recut");
  if (blok) blok.classList.toggle("hidden", !recut);
  // Penanda visual mode aktif dipasang dari sini, bukan lewat :has() di CSS --
  // selektor itu belum didukung browser lama.
  document.querySelectorAll(".sp-mode-opsi").forEach(function (el) {
    const inp = el.querySelector("input");
    el.classList.toggle("aktif", !!(inp && inp.checked));
  });
  spHitungGelaran_();
}

function spModeRecut_() {
  const r = document.querySelector('input[name="sp-gl-jenis"]:checked');
  return !!(r && r.value === "Re-cut");
}

function spHitungGelaran_() {
  const sel = document.getElementById("sp-gl-marker");
  const el = document.getElementById("sp-gl-hasil");
  if (!sel || !el) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) { el.innerHTML = ""; return; }
  const recut = spModeRecut_();

  // Re-cut tanpa marker: kain diisi manual, output tidak dihitung sama sekali.
  if (recut && !sel.value) {
    const kainManual = Number((document.getElementById("sp-gl-kain-manual") || {}).value) || 0;
    el.innerHTML = kainManual > 0
      ? '<div class="sp-hitung-baris"><span>Kain terpakai</span><div><b class="sp-hitung-total">' +
          kainManual + ' m</b> <small>(diisi manual)</small></div></div>' +
        '<div class="sp-hitung-baris"><span>Baju bertambah</span><div><b>tidak</b> ' +
          '<small>&#8212; re-cut hanya mengganti panel</small></div></div>'
      : '<span class="sp-info">Isi kain terpakai untuk melihat ringkasannya.</span>';
    return;
  }

  // Allowance kosong -> isi dengan bawaan markernya. Diisi ke FIELD, bukan
  // cuma dipakai diam-diam: operator perlu melihat angka yang sedang dipakai,
  // dan bisa mengubahnya kalau kain hari itu butuh lebih.
  const inpAllow = document.getElementById("sp-gl-allow");
  if (inpAllow && inpAllow.value === "") {
    inpAllow.value = opt.dataset.allow || "0.02";
  }
  const allow = inpAllow ? (Number(inpAllow.value) || 0) : 0.02;

  const lapis = Number((document.getElementById("sp-gl-lapis") || {}).value) || 0;
  const panjang = Number(opt.dataset.panjang) || 0;
  let susun = {};
  try { susun = JSON.parse(opt.dataset.susun || "{}"); } catch (e) { susun = {}; }

  if (lapis <= 0) {
    el.innerHTML = '<span class="sp-info">Isi jumlah lapis untuk melihat hasilnya.</span>';
    return;
  }
  const perSize = Object.keys(susun).map(function (sz) {
    return '<span class="sp-chip">' + spEsc_(sz) + " <b>" + (susun[sz] * lapis) + "</b></span>";
  }).join("");
  const total = Object.keys(susun).reduce(function (a, sz) { return a + susun[sz] * lapis; }, 0);
  const kain = Math.round((panjang + allow) * lapis * 100) / 100;

  el.innerHTML =
    '<div class="sp-hitung-baris"><span>' + (recut ? 'Panel dipotong' : 'Output') +
      '</span><div>' + perSize +
      ' <b class="sp-hitung-total">' + total + ' pcs</b>' +
      (recut ? ' <small>&#8212; TIDAK menambah jumlah baju</small>' : '') + '</div></div>' +
    '<div class="sp-hitung-baris"><span>Kain terpakai</span><div><b class="sp-hitung-total">' +
      kain + ' m</b> <small>((' + panjang + ' m marker + ' + allow +
      ' m allowance) &#215; ' + lapis + ' lapis)</small></div></div>';
}

function spSimpanGelaran() {
  const sel = document.getElementById("sp-gl-marker");
  const lapis = Number((document.getElementById("sp-gl-lapis") || {}).value) || 0;
  const recut = spModeRecut_();

  if (recut) {
    if (!(document.getElementById("sp-gl-komponen") || {}).value) {
      alert("Komponen yang diganti wajib diisi.\n\nMisal: Lengan, Badan Depan."); return;
    }
    if (!sel.value && !Number((document.getElementById("sp-gl-kain-manual") || {}).value)) {
      alert("Re-cut tanpa marker: isi kain terpakai."); return;
    }
  } else {
    if (!sel || !sel.value) { alert("Marker wajib dipilih."); return; }
    if (lapis <= 0) { alert("Jumlah lapis wajib diisi."); return; }
  }
  const warna = (document.getElementById("sp-gl-warna") || {}).value || "";
  if (!warna) { alert("Warna wajib dipilih."); return; }

  // Item terpilih; kalau PO cuma punya satu, pakai yang itu.
  const item = spItemGelaranTerpilih_();
  const btn = event && event.target ? event.target : null;
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "simpanGelaran",
      payload: {
        idPurchaseOrder: window.SP_PO_AKTIF,
        idMarker: sel.value,
        warna: warna,
        jenisKain: (document.getElementById("sp-gl-kain") || {}).value || "",
        jenisGelaran: spModeRecut_() ? "Re-cut" : "Normal",
        komponen: (document.getElementById("sp-gl-komponen") || {}).value || "",
        alasan: (document.getElementById("sp-gl-alasan") || {}).value || "",
        kainTerpakai: (document.getElementById("sp-gl-kain-manual") || {}).value || "",
        jumlahLapis: lapis,
        allowancePerLapis: (document.getElementById("sp-gl-allow") || {}).value,
        tanggalPotong: (document.getElementById("sp-gl-tanggal") || {}).value || "",
        catatan: (document.getElementById("sp-gl-catatan") || {}).value || "",
        noSO: item.noSO || "", brand: item.brand || "",
        artikel: item.artikel || "", style: item.style || ""
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    alert("Gelaran tersimpan.\n" + d.totalPotongan + " potongan " +
      (document.getElementById("sp-gl-kain") || {}).value + ", kain " +
      d.kainTerpakai + " " + d.satuanKain);
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); })
  .then(function () { if (btn) { btn.disabled = false; btn.textContent = "Simpan Gelaran"; } });
}

/**
 * Panel SET LENGKAP.
 *
 * Ini bagian yang menjelaskan kenapa gelaran tidak boleh langsung jadi qty
 * potong: satu warna bisa perlu beberapa jenis kain, dan yang siap dijahit
 * adalah MINIMUM dari semua komponen -- bukan jumlahnya.
 *
 * Kelebihan di atas minimum ditampilkan sebagai "menunggu", bukan disembunyikan:
 * itu justru yang memberi tahu kain mana yang menahan produksi.
 */
/**
 * Daftar gelaran tercatat, dengan tombol Batalkan per baris.
 *
 * Sebelumnya `batalkanGelaran` sudah ada di backend tapi TIDAK ada tombolnya
 * di layar — satu-satunya cara membetulkan salah input adalah mengedit
 * spreadsheet langsung. Itu jenis jalan pintas yang membuat orang berhenti
 * memakai layarnya, dan pada akhirnya merusak data dengan cara lain.
 *
 * Baris yang sudah dibatalkan tetap ditampilkan (diredupkan) — supaya jelas
 * pernah ada kesalahan, dan orang tidak mencari catatan yang dikiranya hilang.
 */
function spRenderDaftarGelaran_() {
  const wadah = document.getElementById("sp-gelar-daftar");
  if (!wadah) return;
  const daftar = window.SP_DAFTAR_GELARAN || [];
  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">Belum ada gelaran tercatat untuk PO ini.</p>';
    return;
  }

  const aktif = daftar.filter(function (g) { return !g.dibatalkan; }).length;
  const batal = daftar.length - aktif;

  // Tampilkan 8 terbaru dulu. Yang baru saja salah diinput itu yang paling
  // sering dicari untuk dibatalkan; 31 baris sekaligus membuat halaman panjang
  // tanpa ada yang benar-benar membacanya sampai bawah.
  const BATAS = 8;
  const semuaTampil = !!window.SP_GELARAN_SEMUA;
  const tampil = semuaTampil ? daftar : daftar.slice(0, BATAS);
  const sisa = daftar.length - tampil.length;

  // Kolom Item ditampilkan HANYA kalau PO punya lebih dari satu item. Untuk
  // order satu style, kolom yang isinya sama semua cuma memakan lebar tabel.
  const banyakItem = (window.SP_PO_DAFTAR_ITEM || []).length > 1;
  // Kalau ada baris yang style-nya kosong, kolomnya tetap ditampilkan meski
  // PO cuma punya satu item -- baris kosong itu justru yang perlu dibereskan.
  const adaTanpaStyle = daftar.some(function (g) { return !g.style; });
  const pakaiKolomItem = banyakItem || adaTanpaStyle;

  wadah.innerHTML =
    '<p class="sp-info">' + aktif + ' gelaran tercatat' +
      (batal ? ' &#183; ' + batal + ' dibatalkan' : '') +
      '. Salah input? Batalkan lalu catat ulang &#8212; barisnya tidak dihapus.</p>' +
    (adaTanpaStyle
      ? '<p class="sp-info">Ada baris yang <b>belum punya style</b>. Baris seperti ' +
        'itu ikut terhitung di semua style dan membuat set lengkap tercampur &#8212; ' +
        'batalkan lalu catat ulang lewat form di atas.</p>'
      : '') +
    '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu">' +
      '<thead><tr>' +
      (pakaiKolomItem ? '<th>Item</th>' : '') +
      '<th>Warna</th><th>Kain</th><th>Lapis</th>' +
      '<th>Potongan</th><th>Kain terpakai</th><th>Tanggal</th><th></th></tr></thead><tbody>' +
      tampil.map(function (g) {
        const per = Object.keys(g.sizeQty).map(function (sz) {
          return spEsc_(sz) + " " + g.sizeQty[sz];
        }).join("  ");
        const recut = String(g.jenisGelaran || "").toLowerCase() === "re-cut";
        // Artikel hanya ditulis kalau PO memang punya lebih dari satu artikel.
        // Mengulang "ARUZA" di 12 baris tidak membedakan apa pun; yang
        // membedakan adalah style-nya.
        const banyakArtikel = (window.SP_PO_DAFTAR_ITEM || [])
          .map(function (it) { return it.artikel; })
          .filter(function (a, idx, arr) { return arr.indexOf(a) === idx; }).length > 1;
        // Penanda RE-CUT & DIBATALKAN pindah ke kolom Warna. Dua penanda itu
        // dulu menumpang di kolom ID; kolom ID dihilangkan, tapi penandanya
        // TIDAK boleh ikut hilang -- baris re-cut yang tidak dikenali akan
        // dikira gelaran biasa dan dihitung sebagai baju.
        //
        // Warna dipilih karena selalu ada, sedangkan kolom Item bersyarat.
        const penanda =
          (recut ? ' <span class="sp-tag-kembali">RE-CUT</span>' : '') +
          (g.dibatalkan ? ' <span class="sp-tag-batal">DIBATALKAN</span>' : '');
        const selItem = pakaiKolomItem
          ? '<td data-label="Item">' +
              (g.style
                ? spEsc_(g.style)
                : '<span class="sp-tag-batal">TANPA STYLE</span>') +
              (banyakArtikel && g.artikel ? '<div class="sp-gelar-size">' +
                spEsc_(g.artikel) + '</div>' : '') +
            '</td>'
          : '';
        // ID gelaran berformat GLR/RCT + yyMMddHHmmss, jadi JAM input sudah ada
        // di dalamnya. Kolom Tanggal menampilkan tanggal yang sama untuk semua
        // baris yang diinput sehari -- yang benar-benar membedakan justru
        // jamnya, dan itu selama ini terkubur di dalam ID.
        //
        // Diambil hanya kalau formatnya persis cocok. Kalau suatu saat pola ID
        // berubah, yang terjadi cuma jamnya tidak tampil -- bukan angka salah
        // yang terlanjur dipercaya.
        const cocokId = /^(?:GLR|RCT)\d{12}$/.test(String(g.idGelaran || ""));
        const jam = cocokId
          ? String(g.idGelaran).substr(9, 2) + ":" + String(g.idGelaran).substr(11, 2)
          : "";
        // ID tetap melekat di barisnya lewat title -- tidak makan lebar, tapi
        // masih bisa dicocokkan dengan SD Gelaran saat menelusuri sesuatu.
        return '<tr title="' + spEsc_(g.idGelaran) + '"' +
          (g.dibatalkan ? ' class="sp-gelar-batal"' : '') + '>' +
          selItem +
          '<td data-label="Warna">' + spEsc_(g.warna || "-") + penanda + '</td>' +
          '<td data-label="Kain">' + spEsc_(g.jenisKain || "-") +
            (g.komponen ? ' <small>(' + spEsc_(g.komponen) + ')</small>' : '') + '</td>' +
          '<td data-label="Lapis">' + (g.jumlahLapis || "&#8212;") + '</td>' +
          '<td data-label="Potongan"><b>' + g.total + '</b>' +
            (per ? '<div class="sp-gelar-size">' + spEsc_(per) + '</div>' : '') + '</td>' +
          '<td data-label="Kain terpakai">' + g.kainTerpakai + ' ' + spEsc_(g.satuanKain) + '</td>' +
          '<td data-label="Tanggal">' + spEsc_(g.tanggal || "-") +
            (jam ? '<div class="sp-gelar-size">' + jam + '</div>' : '') + '</td>' +
          '<td data-label="">' + (g.dibatalkan
            ? '<span class="sp-riw-kunci">sudah dibatalkan</span>'
            : '<button class="sp-btn-kecil" onclick="spBatalGelaran(\'' +
              spEsc_(g.idGelaran) + '\')" type="button">Batalkan</button>') + '</td>' +
        '</tr>';
      }).join("") +
    '</tbody></table></div>' +
    (sisa > 0
      ? '<p class="sp-info"><a class="sp-tautan" href="#" ' +
        'onclick="window.SP_GELARAN_SEMUA=true;spRenderDaftarGelaran_();return false;">' +
        'Tampilkan ' + sisa + ' gelaran lainnya</a></p>'
      : '');
}

function spBatalGelaran(idGelaran) {
  // Konfirmasi menyebut akibatnya, bukan cuma "yakin?" — membatalkan gelaran
  // mengubah set lengkap dan rekap kain sekaligus.
  if (!confirm("Batalkan gelaran " + idGelaran + "?\n\n" +
      "Barisnya TIDAK dihapus, cuma ditandai batal. Set lengkap dan rekap kain " +
      "ikut menyesuaikan.")) return;

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "batalkanGelaran",
      payload: { idGelaran: idGelaran } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal membatalkan.");
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); });
}

function spRenderSetLengkap_() {
  const daftar = window.SP_SET_LENGKAP || [];
  const wadah = document.getElementById("sp-set-lengkap");
  if (!wadah) return;
  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">Belum ada gelaran tercatat untuk PO ini.</p>';
    return;
  }

  wadah.innerHTML = daftar.map(function (w) {
    // Yang ditawarkan untuk dicatat adalah yang BELUM dicatat, bukan set
    // lengkap kumulatif. Tanpa pembedaan ini, sesi kedua akan menawarkan angka
    // yang sebagian sudah masuk kemarin.
    const belum = w.belumDicatat || w.siap;
    const totalBelum = (w.totalBelumDicatat !== undefined) ? w.totalBelumDicatat : w.totalSiap;
    const sudah = w.sudahDicatat || 0;

    const siapChip = Object.keys(belum).map(function (sz) {
      return '<span class="sp-chip">' + spEsc_(sz) + " <b>" + belum[sz] + "</b></span>";
    }).join("");

    const barisKain = w.kain.map(function (k) {
      const per = Object.keys(k.sizeQty).map(function (sz) {
        return spEsc_(sz) + " " + k.sizeQty[sz];
      }).join("  ");
      const tahan = w.tertahan[k.jenis];
      return '<tr' + (tahan ? ' class="sp-kain-perhatikan"' : '') + '>' +
        '<td data-label="Jenis kain">' + spEsc_(k.jenisKain || k.jenis) + '</td>' +
        '<td data-label="Komponen">' + (k.komponen && k.komponen !== "(semua panel)"
          ? '<b>' + spEsc_(k.komponen) + '</b>'
          : '<span class="sp-kosong">semua panel</span>') + '</td>' +
        '<td data-label="Per size">' + spEsc_(per || "-") + '</td>' +
        '<td data-label="Potongan"><b>' + k.total + '</b></td>' +
        '<td data-label="Gelar">' + k.lapis + ' lapis</td>' +
        '<td data-label="Kain">' + k.kainTerpakai + ' m</td>' +
        '<td data-label="Menunggu">' + (tahan ? '<b>' + tahan.total + '</b> menunggu' : '&#8212;') + '</td></tr>';
    }).join("");

    return '<div class="sp-set-blok">' +
      '<div class="sp-set-judul">' +
        (w.style
          ? spEsc_(w.style) + ' <span class="sp-set-warna">' + spEsc_(w.warnaMurni) + '</span>'
          : spEsc_(w.warna)) +
        '<span class="sp-set-siap">' +
          (sudah > 0 ? 'BELUM DICATAT' : 'SIAP DIJAHIT') +
          ' <b>' + totalBelum + ' pcs</b></span></div>' +
      (sudah > 0
        ? '<p class="sp-info">Set lengkap seluruhnya <b>' + w.totalSiap + ' pcs</b>, ' +
          '<b>' + sudah + '</b> sudah tercatat di Hasil Cutting.</p>'
        : '') +
      (siapChip ? '<div class="sp-set-chip">' + siapChip + '</div>' : '') +
      '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
        '<th>Jenis Kain</th><th>Komponen</th><th>Per size</th><th>Potongan</th><th>Gelar</th>' +
        '<th>Kain</th><th>Menunggu</th></tr></thead><tbody>' + barisKain + '</tbody></table></div>' +
      (w.totalTertahan > 0
        ? '<p class="sp-info">' + w.totalTertahan + ' potongan menunggu pasangan kain lain. ' +
          'Belum bisa dihitung sebagai baju sampai semua komponennya lengkap.</p>'
        : '') +
      (totalBelum > 0
        ? '<button class="sp-btn-kecil" onclick="spKeCutting(\'' + spEsc_(w.warna) + '\')" ' +
          'type="button">Catat ' + totalBelum + ' pcs sebagai Hasil Cutting</button>'
        : (sudah > 0
          ? '<p class="sp-info">Semua set lengkap sudah tercatat di Hasil Cutting.</p>'
          : '')) +
    '</div>';
  }).join("");
}

/**
 * Pindah ke tab Hasil Cutting dengan angka set lengkap sudah terisi.
 *
 * SENGAJA tidak menulis otomatis. Kadang komponen memang sengaja dipotong lebih
 * dulu dan setnya belum mau dinyatakan siap; memaksa sistem menyimpulkan sendiri
 * kapan sebuah set "lengkap" akan salah di kasus yang tidak terduga. Yang
 * dihilangkan cuma pekerjaan menyalin angkanya.
 */
function spKeCutting(warna) {
  const w = (window.SP_SET_LENGKAP || []).filter(function (x) { return x.warna === warna; })[0];
  if (!w) return;
  // Tabel Hasil Cutting punya baris per (item, warna) -- kolom .sp-warna
  // berisi warna MURNI, bukan "style · warna". Kirim keduanya: warna untuk
  // mencocokkan, style untuk memilih baris yang benar kalau warnanya sama.
  window.SP_ISI_CUTTING = {
    warna: w.warnaMurni || warna,
    style: w.style || "",
    siap: w.belumDicatat || w.siap
  };
  spSwitchTab("cutting");

  // Tabel cutting mungkin belum dimuat (spSwitchTab baru memanggilnya, dan
  // jawabannya datang dari server). Ditunggu sampai barisnya benar-benar ada,
  // bukan menebak dengan satu setTimeout -- di koneksi lambat 600ms tidak cukup,
  // dan gejalanya persis seperti "baris tidak ketemu".
  let coba = 0;
  const tunggu = setInterval(function () {
    coba++;
    const ada = document.querySelectorAll("#sp-cut-tabel tbody tr").length;
    if (ada || coba > 20) {          // maks ~6 detik
      clearInterval(tunggu);
      spTerapkanIsiCutting_();
    }
  }, 300);
}

/**
 * Isi kolom qty di tab Hasil Cutting dari set lengkap.
 *
 * Tiga hal yang harus tepat, dan versi pertama salah di ketiganya:
 *   - tabelnya `#sp-cut-tabel`, BUKAN `#sp-tabel` (itu tabel Loading)
 *   - input-nya `.sp-cut-qty`, bukan sembarang input[data-size]
 *   - nama warna ada di `.sp-warna`, dan dicocokkan PERSIS -- `indexOf` membuat
 *     "Butter Motif 1" juga cocok dengan "Butter Motif 12"
 *
 * Menebak struktur DOM tab lain memang rapuh. Karena itu kalau tidak ketemu,
 * angkanya tetap diberitahukan supaya bisa disalin manual -- bukan gagal diam.
 */
function spTerapkanIsiCutting_() {
  const isi = window.SP_ISI_CUTTING;
  if (!isi) return;

  const rapikan = function (x) {
    return String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
  };
  const targetWarna = rapikan(isi.warna);

  let terisi = 0, barisKetemu = false;
  document.querySelectorAll("#sp-cut-tabel tbody tr").forEach(function (tr) {
    const elWarna = tr.querySelector(".sp-warna");
    if (!elWarna || rapikan(elWarna.textContent) !== targetWarna) return;
    // Warna saja tidak cukup kalau PO punya beberapa style dengan warna sama.
    // Sub-baris item memuat "Artikel / Style" -- dicocokkan kalau style dikirim.
    if (isi.style) {
      const elItem = tr.querySelector(".sp-cut-item, .sp-item-sub, td");
      const teksBaris = rapikan(tr.textContent || "");
      if (teksBaris.indexOf(rapikan(isi.style)) === -1) return;
    }
    barisKetemu = true;
    tr.querySelectorAll(".sp-cut-qty").forEach(function (inp) {
      const v = isi.siap[inp.dataset.size];
      if (v > 0) { inp.value = v; terisi++; }
    });
  });

  window.SP_ISI_CUTTING = null;

  if (terisi) {
    // Total di baris & ringkasan bawah tidak ikut terhitung kalau cuma value
    // yang diubah -- oninput tidak menyala untuk perubahan dari kode.
    if (typeof spHitungTotalCutting === "function") spHitungTotalCutting();
    const el = document.getElementById("sp-cut-tabel");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const angka = Object.keys(isi.siap)
    .map(function (sz) { return sz + " " + isi.siap[sz]; }).join(", ");
  alert(barisKetemu
    ? ("Baris '" + isi.warna + "' ketemu, tapi ukurannya (" + angka + ") tidak ada " +
       "kolom isian di tab Hasil Cutting.\n\nBiasanya karena ukuran itu qty ordernya 0. " +
       "Periksa dulu rincian ordernya.")
    : ("Baris warna '" + isi.warna + "' tidak ketemu di tab Hasil Cutting.\n\n" +
       "Isi angkanya manual: " + angka));
}

function spRenderRekapKain_() {
  const semua = window.SP_KAIN || [];
  const wadah = document.getElementById("sp-kain-rekap");
  if (!semua.length) {
    wadah.innerHTML = '<p class="sp-info">Belum ada data kain untuk PO ini.</p>';
    return;
  }
  // Kain x warna menghasilkan perkalian: 4 kain x 5 warna = 20 baris, padahal
  // mungkin cuma 6 kombinasi yang dipakai. Baris kosong bukan sekadar
  // memanjangkan tabel -- ia menyembunyikan baris yang perlu diperiksa di
  // antara belasan angka nol.
  //
  // Yang belum ada angkanya tetap bisa DIBUKA: di situlah hasil ukur diisi
  // kalau ternyata kombinasinya dipakai juga.
  const berangka = semua.filter(function (k) { return !k.hanyaPerkiraan; });
  const belum = semua.filter(function (k) { return k.hanyaPerkiraan; });
  const tampilSemua = !!window.SP_KAIN_SEMUA;
  const dipakai = (tampilSemua || !berangka.length) ? semua : berangka;

  wadah.innerHTML =
    (belum.length && !tampilSemua && berangka.length
      ? '<p class="sp-info">' + berangka.length + ' kombinasi punya angka. ' +
        '<a class="sp-tautan" href="#" onclick="window.SP_KAIN_SEMUA=true;' +
        'spRenderRekapKain_();return false;">Tampilkan ' + belum.length +
        ' kombinasi lain</a> yang belum dipakai.</p>'
      : '') +
    '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Kain</th><th>Warna</th><th>Diterima</th><th>Terpakai</th><th>Re-cut</th>' +
      '<th>Sisa hitung</th><th>Sisa ukur</th><th>Selisih</th></tr></thead><tbody>' +
      dipakai.map(function (k) {
        const kelas = k.tanda ? ("sp-kain-" + k.tanda) : "";
        return '<tr class="' + kelas + '">' +
          '<td data-label="Kain"><b>' + spEsc_(k.jenis) + '</b></td>' +
          // Kain klien selalu datang per warna, jadi warna sekelas dengan nama
          // kain di rekap ini -- bukan pelengkap.
          '<td data-label="Warna">' + (k.warna && k.warna !== "(semua warna)"
            ? spEsc_(k.warna)
            : '<span class="sp-kosong">semua warna</span>') + '</td>' +
          // Kalau roll sudah dicatat, angka DITERIMA berasal dari roll dan
          // estimasi order jadi pembanding -- bukan diganti diam-diam.
          // Selisihnya sendiri informasi: estimasi 100 yds tapi datang 95 yds
          // adalah hal yang perlu ketahuan, bukan disembunyikan.
          '<td data-label="Diterima">' + k.diterima + ' m' +
            (k.diterimaAsli && k.satuanAsli
              ? ' <small>(' + k.diterimaAsli + ' ' + spEsc_(k.satuanAsli) + ')</small>' : '') +
            (k.estimasiBeda
              ? '<div class="sp-estimasi-beda">estimasi ' + k.estimasi + ' m</div>' : '') +
            '</td>' +
          '<td data-label="Terpakai">' + k.terpakai + '</td>' +
          '<td data-label="Re-cut">' + (k.terpakaiRecut
            ? (k.terpakaiRecut + ' m' + (k.qtyRecut ? ' <small>(' + k.qtyRecut + ' pcs)</small>' : ''))
            : '&#8212;') + '</td>' +
          '<td data-label="Sisa hitung">' + k.sisaHitung + '</td>' +
          '<td data-label="Sisa ukur">' + (k.sisaTerukur === null
            ? '<input class="sp-kain-ukur" data-jenis="' + spEsc_(k.jenis) +
              '" data-warna="' + spEsc_(k.warna === "(semua warna)" ? "" : (k.warna || "")) +
              '" placeholder="ukur" step="0.01" type="number"/>'
            : k.sisaTerukur) + '</td>' +
          '<td data-label="Selisih">' + (k.selisih === null ? "-"
            : (k.selisih + " (" + k.persenSelisih + "%) " + k.tanda)) + '</td></tr>';
      }).join("") +
    '</tbody></table></div>' +
    '<button class="sp-simpan-btn" onclick="spSimpanSisaKain()" type="button">Simpan Hasil Ukur</button>' +
    '<p class="sp-info">Selisih wajar sampai ' + (window.SP_KAIN_AMBANG.ambangWajar || 3) +
      '%. Di atas ' + (window.SP_KAIN_AMBANG.ambangPeriksa || 7) + '% perlu diperiksa. ' +
      'Selisih memang selalu ada &#8212; penyusutan kain dan potongan yang tidak utuh.</p>';
}

/**
 * Riwayat re-cut. Ditampilkan di bawah rekap kain -- di situlah pertanyaan
 * "kenapa kainnya habis lebih cepat" muncul, dan jawabannya ada di sini.
 */
function spRenderRecut_() {
  const wadah = document.getElementById("sp-recut-riwayat");
  if (!wadah) return;
  const recut = window.SP_RECUT || {};
  const kainList = Object.keys(recut);
  if (!kainList.length) {
    wadah.innerHTML = '<p class="sp-info">Belum ada re-cut tercatat.</p>';
    return;
  }

  let totalKain = 0, totalPcs = 0;
  const baris = [];
  kainList.forEach(function (kain) {
    totalKain += recut[kain].kainTerpakai || 0;
    totalPcs += recut[kain].total || 0;
    (recut[kain].rincian || []).forEach(function (r) {
      baris.push('<tr>' +
        '<td data-label="Tanggal">' + spEsc_(r.tanggal || "-") + '</td>' +
        '<td data-label="Warna">' + spEsc_(r.warna || "-") + '</td>' +
        '<td data-label="Komponen"><b>' + spEsc_(r.komponen || "-") + '</b></td>' +
        '<td data-label="Kain">' + spEsc_(kain) + '</td>' +
        '<td data-label="Jumlah">' + (r.qty || 0) + ' pcs</td>' +
        '<td data-label="Kain terpakai">' + (r.kain || 0) + ' m</td>' +
        '<td data-label="Alasan">' + spEsc_(r.alasan || "-") + '</td></tr>');
    });
  });

  wadah.innerHTML =
    '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Tanggal</th><th>Warna</th><th>Komponen</th><th>Kain</th>' +
      '<th>Jumlah</th><th>Kain terpakai</th><th>Alasan</th></tr></thead><tbody>' +
      baris.join("") + '</tbody></table></div>' +
    '<p class="sp-info">Total re-cut: <b>' + totalPcs + ' panel</b>, kain <b>' +
      (Math.round(totalKain * 100) / 100) + ' m</b>. ' +
      'Angka ini yang menjelaskan selisih sisa kain &#8212; bukan sekadar "penyusutan".</p>';
}

/**
 * Panel ROLL KAIN. Dua bagian, sesuai dua titik catatnya:
 *   atas  -> daftar roll yang sudah diterima + isian sisa per roll
 *   bawah -> form tambah roll (dipakai saat kain datang)
 */
function spRenderRoll_() {
  const wadah = document.getElementById("sp-roll-panel");
  if (!wadah) return;
  const daftar = window.SP_ROLL || [];

  const blok = daftar.map(function (g) {
    const baris = g.roll.map(function (r) {
      const diukur = r.sisaTerukur !== null && r.sisaTerukur !== undefined;
      const terpakai = diukur ? (Math.round((r.panjangAwal - r.sisaTerukur) * 100) / 100) : null;
      return '<tr' + (diukur ? '' : ' class="sp-roll-belum"') + '>' +
        '<td data-label="No Roll"><b>' + spEsc_(r.noRoll || "-") + '</b></td>' +
        // Angka ASLI di depan, konversi di belakang dalam kurung. Roll yang
        // datang 60 yds ditampilkan "60 yds" -- bukan "54,86 m" yang terasa
        // seperti angka lain saat dicocokkan dengan surat jalan supplier.
        '<td data-label="Panjang awal">' + r.panjangAwal + ' ' + spEsc_(r.satuan || "m") +
          (r.satuan && r.satuan !== "m"
            ? ' <small>(' + r.panjangAwalMeter + ' m)</small>' : '') + '</td>' +
        '<td data-label="Terpakai">' + (terpakai === null ? "&#8212;"
          : (terpakai + ' ' + spEsc_(r.satuan || "m"))) + '</td>' +
        // Satuan ditempel di label kolom, bukan cuma di header: di layar sempit
        // tabel jadi kartu dan headernya hilang -- kalau satuan cuma di header,
        // orang mengisi angka tanpa tahu satuannya apa.
        '<td data-label="Sisa (' + spEsc_(r.satuan || "m") + ')">' +
          '<input class="sp-roll-sisa" data-id="' + spEsc_(r.idRoll) +
            '" max="' + r.panjangAwal + '" min="0" placeholder="ukur" step="0.01" ' +
            'type="number" value="' + (diukur ? r.sisaTerukur : "") + '"/></td>' +
        '<td data-label="Kondisi">' +
          '<select class="sp-roll-kondisi" data-id="' + spEsc_(r.idRoll) + '">' +
            ["Utuh", "Potongan"].map(function (k) {
              return '<option' + (spEsc_(r.kondisiSisa) === k ? ' selected="selected"' : '') +
                ' value="' + k + '">' + k + '</option>';
            }).join("") +
          '</select></td>' +
        '<td data-label=""><button class="sp-btn-kecil" onclick="spBatalRoll(\'' +
          spEsc_(r.idRoll) + '\')" type="button">Batal</button></td></tr>';
    }).join("");

    // Rincian utuh vs potongan: ini yang membuat sisa bisa dijelaskan ke klien.
    // "Sisa 57 m" tidak cukup -- 45 m roll utuh dan 12 m potongan punya nilai
    // yang sangat berbeda.
    const rincian = (g.sudahDiukur > 0)
      ? '<div class="sp-roll-rincian">' +
          '<span>Sisa <b>' + g.totalSisa + ' m</b></span>' +
          '<span class="sp-chip">utuh <b>' + g.sisaUtuh + '</b></span>' +
          '<span class="sp-chip">potongan <b>' + g.sisaPotongan + '</b></span>' +
          (g.belumDiukur ? '<span class="sp-roll-belum-tag">' + g.belumDiukur +
            ' roll belum diukur</span>' : '') +
        '</div>'
      : '<div class="sp-roll-rincian"><span class="sp-roll-belum-tag">' +
          g.jumlahRoll + ' roll belum diukur</span></div>';

    return '<div class="sp-set-blok">' +
      '<div class="sp-set-judul">' + spEsc_(g.jenis) +
        (g.warna && g.warna !== "(semua warna)" ? ' &#183; ' + spEsc_(g.warna) : '') +
        '<span class="sp-set-siap">' + g.jumlahRoll + ' ROLL <b>' +
          g.totalPanjangAwal + ' m</b>' +
          (g.satuanAsli && g.satuanAsli !== "m"
            ? ' <small>(dicatat dalam ' + spEsc_(g.satuanAsli) + ')</small>' : '') +
        '</span></div>' +
      rincian +
      '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu">' +
        '<thead><tr><th>No Roll</th><th>Panjang awal</th><th>Terpakai</th>' +
        '<th>Sisa</th><th>Kondisi</th><th></th></tr></thead><tbody>' + baris +
        '</tbody></table></div>' +
    '</div>';
  }).join("");

  wadah.innerHTML =
    (daftar.length
      ? blok + '<button class="sp-simpan-btn" onclick="spSimpanSisaRoll()" type="button">' +
        'Simpan Hasil Ukur Roll</button>'
      : '<p class="sp-info">Belum ada roll tercatat. Isi saat kain datang &#8212; ' +
        'nomor roll dan panjangnya. Sisanya diukur nanti setelah selesai digelar.</p>') +
    spFormTambahRoll_();
}

function spFormTambahRoll_() {
  const kain = window.SP_PO_KAIN || [];
  const warna = window.SP_PO_WARNA || [];
  return '<div class="sp-roll-tambah">' +
    '<div class="sp-lbl">Tambah roll (saat kain datang)</div>' +
    '<div class="sp-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Jenis Kain</th><th>Warna</th><th>No Roll</th><th>Panjang</th>' +
      '<th>Satuan</th><th></th>' +
    '</tr></thead><tbody id="sp-roll-baru"></tbody></table></div>' +
    '<button class="sp-btn-kecil" onclick="spTambahBarisRoll()" type="button">+ Tambah baris</button> ' +
    '<button class="sp-simpan-btn" onclick="spSimpanRoll()" type="button">Simpan Roll</button>' +
    '<datalist id="sp-datalist-kainroll">' +
      kain.map(function (k) { return '<option value="' + spEsc_(k) + '"></option>'; }).join("") +
    '</datalist>' +
    '<datalist id="sp-datalist-warnaroll">' +
      warna.map(function (w) { return '<option value="' + spEsc_(w) + '"></option>'; }).join("") +
    '</datalist>' +
  '</div>';
}

function spTambahBarisRoll() {
  const tb = document.getElementById("sp-roll-baru");
  if (!tb) return;
  // Baris baru mewarisi kain & warna dari baris sebelumnya: kain datang
  // biasanya beberapa roll sekaligus untuk warna yang sama, dan mengetik
  // ulang tiap baris itu pekerjaan sia-sia.
  const terakhir = tb.querySelector("tr:last-child");
  const kainLama = terakhir ? (terakhir.querySelector(".sp-rb-kain").value || "") : "";
  const warnaLama = terakhir ? (terakhir.querySelector(".sp-rb-warna").value || "") : "";
  const satuanLama = terakhir
    ? ((terakhir.querySelector(".sp-rb-satuan") || {}).value || "m") : "m";
  tb.insertAdjacentHTML("beforeend",
    '<tr>' +
      '<td data-label="Jenis Kain"><input class="sp-rb-kain" list="sp-datalist-kainroll" ' +
        'placeholder="jenis kain" type="text" value="' + spEsc_(kainLama) + '"/></td>' +
      '<td data-label="Warna"><input class="sp-rb-warna" list="sp-datalist-warnaroll" ' +
        'placeholder="warna" type="text" value="' + spEsc_(warnaLama) + '"/></td>' +
      '<td data-label="No Roll"><input class="sp-rb-no" placeholder="mis. R-01" type="text"/></td>' +
      '<td data-label="Panjang"><input class="sp-rb-panjang" min="0" ' +
        'oninput="spHitungKonversiRoll_(this)" placeholder="0" step="0.01" type="number"/>' +
        '<div class="sp-konversi"></div></td>' +
      // Satuan DIPILIH, tidak diasumsikan. Backend sebelumnya memasang "m"
      // diam-diam -- dan roll 60 yard yang diketik "60" akan salah 12% tanpa
      // ada yang menyadarinya. Form kain klien juga punya pilihan yds/m, jadi
      // orang wajar mengira di sini bisa memilih juga.
      '<td data-label="Satuan"><select class="sp-rb-satuan" ' +
        'onchange="spHitungKonversiRoll_(this)">' +
        ['m', 'yds'].map(function (u) {
          return '<option' + (u === satuanLama ? ' selected="selected"' : '') +
            ' value="' + u + '">' + u + '</option>';
        }).join("") +
      '</select></td>' +
      '<td data-label=""><button class="sp-btn-kecil" onclick="this.closest(\'tr\').remove()" ' +
        'type="button">&#10005;</button></td>' +
    '</tr>');
}

/**
 * Pratinjau konversi saat mengetik. Muncul HANYA kalau satuannya bukan meter --
 * kalau selalu tampil, "(100 m)" di bawah "100 m" cuma jadi bising.
 *
 * Ini yang membuat "60 yds" terasa aman diketik: angkanya tetap 60 seperti di
 * surat jalan supplier, dan setaranya dalam meter terlihat langsung.
 */
function spHitungKonversiRoll_(el) {
  const tr = el.closest("tr");
  if (!tr) return;
  const wadah = tr.querySelector(".sp-konversi");
  if (!wadah) return;
  const nilai = Number((tr.querySelector(".sp-rb-panjang") || {}).value) || 0;
  const satuan = (tr.querySelector(".sp-rb-satuan") || {}).value || "m";
  if (!nilai || satuan === "m") { wadah.textContent = ""; return; }
  // 1 yard = 0.9144 m -- angka yang sama dengan METER_PER_YARD di backend.
  wadah.textContent = "= " + (Math.round(nilai * 0.9144 * 100) / 100) + " m";
}

function spSimpanRoll() {
  const roll = [];
  document.querySelectorAll("#sp-roll-baru tr").forEach(function (tr) {
    const jenisKain = (tr.querySelector(".sp-rb-kain").value || "").trim();
    const panjang = Number(tr.querySelector(".sp-rb-panjang").value) || 0;
    if (!jenisKain || panjang <= 0) return;
    roll.push({
      jenisKain: jenisKain,
      warna: (tr.querySelector(".sp-rb-warna").value || "").trim(),
      noRoll: (tr.querySelector(".sp-rb-no").value || "").trim(),
      panjangAwal: panjang,
      satuan: (tr.querySelector(".sp-rb-satuan") || {}).value || "m"
    });
  });
  if (!roll.length) { alert("Isi minimal satu roll: jenis kain dan panjangnya."); return; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "simpanRollKain",
      payload: { idPurchaseOrder: window.SP_PO_AKTIF, roll: roll } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    alert(d.tersimpan + " roll tersimpan" +
      (d.rincianSatuan ? (" (" + d.rincianSatuan + ")") : "") + ".");
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); });
}

function spSimpanSisaRoll() {
  const sisa = [];
  document.querySelectorAll(".sp-roll-sisa").forEach(function (inp) {
    if (inp.value === "") return;
    const v = Number(inp.value);
    if (isNaN(v)) return;
    const sel = document.querySelector('.sp-roll-kondisi[data-id="' + inp.dataset.id + '"]');
    sisa.push({ idRoll: inp.dataset.id, sisa: v, kondisi: sel ? sel.value : "Potongan" });
  });
  if (!sisa.length) { alert("Belum ada sisa roll yang diisi."); return; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "simpanSisaRoll",
      payload: { idPurchaseOrder: window.SP_PO_AKTIF, sisa: sisa } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); });
}

function spBatalRoll(idRoll) {
  if (!confirm("Batalkan roll " + idRoll + "?\n\nBarisnya tidak dihapus, cuma ditandai batal.")) return;
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "batalkanRollKain",
      payload: { idRoll: idRoll } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal membatalkan.");
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); });
}

function spSimpanSisaKain() {
  const sisa = [];
  document.querySelectorAll(".sp-kain-ukur").forEach(function (inp) {
    const v = Number(inp.value);
    if (inp.value !== "" && !isNaN(v)) {
      // Warna ikut dikirim: hasil ukur milik satu (kain, warna), bukan seluruh
      // jenis kain. Kosong = penerimaan lama yang belum punya warna.
      sisa.push({
        jenisKain: inp.dataset.jenis,
        warna: inp.dataset.warna || "",
        jumlah: v, satuan: "m"
      });
    }
  });
  if (!sisa.length) { alert("Belum ada hasil ukur yang diisi."); return; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "simpanSisaKain",
      payload: { idPurchaseOrder: window.SP_PO_AKTIF, sisa: sisa } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    spMuatGelaran();
  })
  .catch(function (e) { alert(e.message || e); });
}

/** Escape HTML sederhana -- dipakai di seluruh render tab Marker & Gelaran. */
function spEsc_(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ============================================================
   POLA & SAMPEL (bagian: pola)
   ============================================================ */

function spMuatTahap(jenis) {
  const t = jenis || window.SP_TAHAP_AKTIF || "pola";
  window.SP_TAHAP_AKTIF = t;
  const wadah = document.getElementById(t === "sampel" ? "sp-sampel-daftar" : "sp-pola-daftar");
  if (!wadah) return;
  if (!window.SP_PO_AKTIF) {
    wadah.innerHTML = '<p class="sp-info">Pilih Purchase Order dulu.</p>';
    return;
  }
  wadah.innerHTML = '<p class="sp-info">Memuat...</p>';
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getProgresTahapPO",
      idPurchaseOrder: window.SP_PO_AKTIF })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal memuat.");
    window.SP_TAHAP = d.artikel || [];
    window.SP_TAHAP_SUBTIPE = d.subTipe || {};
    window.SP_TAHAP_STATUS = d.statusPilihan || {};
    window.SP_TAHAP_LANGKAH = d.langkahPilihan || {};
    spRenderTahap_(t);
  })
  .catch(function (e) {
    wadah.innerHTML = '<p class="sp-info">' + spEsc_(e.message || e) + '</p>';
  });
}

function spRenderTahap_(tahap) {
  const daftar = window.SP_TAHAP || [];
  const wadah = document.getElementById(tahap === "sampel" ? "sp-sampel-daftar" : "sp-pola-daftar");
  if (!wadah) return;
  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">PO ini belum punya artikel di Rincian Sales Order.</p>';
    return;
  }
  wadah.innerHTML = daftar.map(function (a, i) {
    return '<div class="sp-set-blok">' +
      '<div class="sp-set-judul">' + spEsc_(a.artikel) +
        (a.style ? ' &#183; ' + spEsc_(a.style) : '') + '</div>' +
      spKartuTahap_(a, tahap, i) +
    '</div>';
  }).join("");
}

/**
 * Satu kartu tahap: keadaan sekarang, rekap jam per langkah, lalu form untuk
 * mencatat langkah berikutnya.
 */
function spKartuTahap_(a, tahap, i) {
  const r = a[tahap] || {};
  const dariOrderLain = tahap === "pola" ? a.polaDariOrderLain : a.sampelDariOrderLain;
  const label = tahap === "pola" ? "Pola" : "Sampel";
  const statusPilihan = (window.SP_TAHAP_STATUS || {})[tahap] || [];
  const subPilihan = (window.SP_TAHAP_SUBTIPE || {})[tahap] || [];
  const langkahPilihan = (window.SP_TAHAP_LANGKAH || {})[tahap] || [];

  let ringkas;
  if (!r.ada) {
    ringkas = '<span class="sp-tahap-kosong">belum ada catatan</span>';
  } else {
    ringkas =
      '<span class="sp-tahap-status' + (r.selesai ? ' selesai' : '') + '">' +
        spEsc_(r.status) + '</span>' +
      (r.umurHari !== null
        ? '<span class="sp-tahap-umur">' + r.umurHari + ' hari</span>' : '') +
      (r.totalJam
        ? '<span class="sp-tahap-jam">' + r.totalJam + ' jam kerja</span>' : '') +
      (r.jumlahRevisi
        ? '<span class="sp-tahap-revisi">revisi ' + r.jumlahRevisi + '&#215;</span>' : '') +
      (dariOrderLain
        ? '<div class="sp-tahap-lain">Sudah dikerjakan di order <b>' +
          spEsc_(r.idPurchaseOrderAwal) + '</b> &#8212; tidak perlu diulang.</div>'
        : '');
  }

  // Rekap jam PER LANGKAH -- ini yang jadi bahan HPP nanti. Ditampilkan
  // sekarang juga supaya tim pola melihat gunanya mengisi durasi, bukan
  // sekadar diminta.
  const rekapLangkah = (r.perLangkah && Object.keys(r.perLangkah).length)
    ? '<div class="sp-langkah-rekap">' +
        langkahPilihan.concat(
          Object.keys(r.perLangkah).filter(function (x) {
            return langkahPilihan.indexOf(x) === -1;
          })
        ).map(function (lg) {
          const e = r.perLangkah[lg];
          return '<div class="sp-langkah-item' + (e ? '' : ' belum') + '">' +
            '<span>' + spEsc_(lg) + '</span>' +
            '<b>' + (e ? (e.jam + ' jam' + (e.kali > 1 ? ' (' + e.kali + '&#215;)' : '')) : '&#8212;') + '</b>' +
          '</div>';
        }).join("") +
      '</div>'
    : '';

  return '<div class="sp-tahap-baris">' +
    '<div class="sp-tahap-kepala"><b>' + label + '</b>' + ringkas + '</div>' +
    rekapLangkah +
    '<div class="sp-grid3">' +
      '<label>Langkah<select class="sp-th-langkah" data-i="' + i + '" data-tahap="' + tahap + '">' +
        '<option value="">(tanpa langkah &#8212; catatan status saja)</option>' +
        langkahPilihan.map(function (x) {
          return '<option value="' + spEsc_(x) + '">' + spEsc_(x) + '</option>';
        }).join("") +
      '</select></label>' +
      '<label>Durasi (jam)<input class="sp-th-durasi" data-i="' + i + '" data-tahap="' + tahap +
        '" max="24" min="0" placeholder="mis. 3.5" step="0.25" type="number"/></label>' +
      '<label>Tanggal<input class="sp-th-tgl" data-i="' + i + '" data-tahap="' + tahap +
        '" type="date" value="' + new Date().toISOString().slice(0, 10) + '"/></label>' +
    '</div>' +
    '<div class="sp-grid3">' +
      '<label>Jenis<select class="sp-th-sub" data-i="' + i + '" data-tahap="' + tahap + '">' +
        subPilihan.map(function (x) {
          return '<option value="' + spEsc_(x) + '">' + spEsc_(x) + '</option>';
        }).join("") +
      '</select></label>' +
      '<label>Status<select class="sp-th-status" data-i="' + i + '" data-tahap="' + tahap + '">' +
        statusPilihan.map(function (x) {
          return '<option value="' + spEsc_(x) + '">' + spEsc_(x) + '</option>';
        }).join("") +
      '</select></label>' +
      '<label>Catatan<input class="sp-th-catatan" data-i="' + i + '" data-tahap="' + tahap +
        '" placeholder="opsional" type="text"/></label>' +
    '</div>' +
    '<button class="sp-btn-kecil" onclick="spCatatTahap(' + i + ',\'' + tahap + '\')" ' +
      'type="button">Catat ' + label + '</button>' +
    (r.ada && r.riwayat && r.riwayat.length > 1 ? spRiwayatTahap_(r.riwayat) : '') +
  '</div>';
}

/** Riwayat ditampilkan hanya kalau lebih dari satu langkah -- kalau cuma satu,
 *  ringkasan di atas sudah memuat semuanya. */
function spRiwayatTahap_(riwayat) {
  return '<details class="sp-tahap-riwayat"><summary>Riwayat (' + riwayat.length + ')</summary>' +
    riwayat.map(function (x) {
      // Tombol Batalkan per jejak. Tanpa ini, salah catat langkah atau durasi
      // cuma bisa dibetulkan lewat spreadsheet -- dan durasi yang salah akan
      // ikut ke hitungan HPP nanti.
      return '<div class="sp-tahap-jejak">' +
        '<span>' + spEsc_(x.tanggal || "-") + '</span>' +
        '<b>' + spEsc_(x.status) + '</b>' +
        (x.langkah ? '<span>' + spEsc_(x.langkah) + '</span>' : '') +
        (x.durasiJam ? '<span>' + x.durasiJam + ' jam</span>' : '') +
        (x.dikerjakanOleh ? '<span>' + spEsc_(x.dikerjakanOleh) + '</span>' : '') +
        (x.catatan ? '<i>' + spEsc_(x.catatan) + '</i>' : '') +
        (x.idProgres
          ? '<button class="sp-btn-kecil" onclick="spBatalTahap(\'' +
            spEsc_(x.idProgres) + '\')" type="button">Batalkan</button>' : '') +
      '</div>';
    }).join("") +
  '</details>';
}

function spBatalTahap(idProgres) {
  if (!confirm("Batalkan catatan " + idProgres + "?\n\n" +
      "Barisnya TIDAK dihapus, cuma ditandai batal. Status dan rekap jam " +
      "ikut menyesuaikan.")) return;
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "batalkanProgresTahap",
      payload: { idProgres: idProgres } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal membatalkan.");
    spMuatTahap(window.SP_TAHAP_AKTIF);
  })
  .catch(function (e) { alert(e.message || e); });
}

function spCatatTahap(i, tahap) {
  const a = (window.SP_TAHAP || [])[i];
  if (!a) return;
  const ambil = function (kelas) {
    const el = document.querySelector("." + kelas + '[data-i="' + i + '"][data-tahap="' + tahap + '"]');
    return el ? el.value : "";
  };
  const status = ambil("sp-th-status");
  if (!status) { alert("Pilih status dulu."); return; }

  const btn = event && event.target ? event.target : null;
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "catatProgresTahap",
      payload: {
        idArtikel: a.idArtikel, idKlien: a.idKlien,
        brand: a.brand, artikel: a.artikel, style: a.style,
        idPurchaseOrder: window.SP_PO_AKTIF,
        tahap: tahap === "sampel" ? "Sampel" : "Pola",
        subTipe: ambil("sp-th-sub"),
        langkah: ambil("sp-th-langkah"),
        durasiJam: ambil("sp-th-durasi"),
        status: status,
        tanggal: ambil("sp-th-tgl"),
        catatan: ambil("sp-th-catatan")
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    spMuatTahap(tahap);
  })
  .catch(function (e) { alert(e.message || e); })
  .then(function () {
    if (btn) { btn.disabled = false; btn.textContent = "Catat " + (tahap === "pola" ? "Pola" : "Sampel"); }
  });
}

/* ============================================================
   TAB QC (v103) -- diport dari simpro-qc.js, halaman qc.html pensiun
   ============================================================
   Pemindahan LENGKAP (form inspeksi + ringkasan) atas keputusan Femri:
   satu form satu rumah -- dua rumah berarti dua versi yang cepat atau
   lambat bercerai. Backend TIDAK berubah: rute getMasterQC /
   submitInspeksiQC / getRiwayatInspeksiPO / getDaftarPO dipakai apa
   adanya; blok ini cuma pemanggil keduanya pindah alamat.

   Yang SENGAJA tidak ikut diport: login/sesi/nav qc.html (qcShow,
   qcBacaSesi_, qcHandleGoogleLogin, qcLogout, qcMulai, qcRefresh,
   qcSetupTombolGoogle, window.onload) -- halaman produksi sudah punya
   semuanya, dan window.onload kedua justru akan MENIMPA milik produksi.
   QC_API_URL/QC_ID_TOKEN diganti SP_API_URL/SP_ID_TOKEN (sesi produksi).

   Panel QC self-contained: punya picker PO sendiri (qcCariPO/qcPilihPO),
   TIDAK dikopel ke SP_PO_AKTIF -- kopling menyusul kalau lapangan minta.
   ============================================================ */
let QC_MASTER = null;
let QC_DAFTAR_PO = [];
let QC_PO_TERPILIH = null;
let QC_TAHAP_DIPILIH = "";
let QC_RINGKASAN_DIMUAT = false;
let QC_RINCIAN_PO = null;
let QC_WARNA_DIPILIH = null;

/** Pemuat malas tab QC: master + daftar PO dimuat SEKALI per sesi. */
function spMuatQC_() {
  if (window.QC_SUDAH_DIMUAT) return;
  window.QC_SUDAH_DIMUAT = true;
  qcMuatMaster_();
}

/**
 * SHIM qcShow (perbaikan v104). Di qc.html, qcShow menukar tiga layar
 * (login/loading/isi); qcMuatMaster_ hasil port masih memanggilnya di
 * tiga tempat (sukses + dua jalur galat). Tanpa shim ini panggilan itu
 * ReferenceError dan rantai render MATI DIAM-DIAM tepat setelah data
 * tiba -- tab QC tampil kosong. Di halaman produksi visibilitas panel
 * sudah diurus spSwitchTab dan layar login tidak ada, jadi shim kosong
 * adalah terjemahan yang benar. Dibiarkan sebagai shim (bukan mengedit
 * badan fungsi hasil port satu-satu) supaya port tetap setipis mungkin
 * dan penyimpangan dari sumber terpusat di satu tempat ini.
 */
function qcShow() { /* sengaja kosong -- lihat komentar */ }

/**
 * Integrasi v107: QC memakai POLA HALAMAN, bukan pulau sendiri.
 * - PO dipilih lewat kartu "Pilih Purchase Order" bersama (SP_PO_AKTIF);
 *   picker internal bawaan qc.html disembunyikan (field-nya, bukan dihapus
 *   dari markup -- markup panel sengaja tidak diubah sejak pemindahan).
 * - Pemilih ITEM (artikel + style) disuntik di atas Warna, dibangun dari
 *   baris rincian yang sudah ada ((warna x item) dari getPOUntukCutting) --
 *   nol rute baru. Warna lalu disaring per item, meniru form Gelaran.
 * - Nilai option Warna tetap INDEKS GLOBAL baris rincian, jadi qcPilihWarna
 *   dan seluruh rantai submit tidak berubah satu huruf pun.
 */
function qcSinkronPOAktif_() {
  // picker internal selalu disembunyikan di rumah baru
  const inp = document.getElementById("qc-po");
  if (inp && inp.closest(".qc-field")) inp.closest(".qc-field").classList.add("hidden");

  const po = window.SP_PO_AKTIF || "";
  const selW = document.getElementById("qc-warna");
  if (!po) {
    QC_PO_TERPILIH = null; QC_RINCIAN_PO = null; QC_WARNA_DIPILIH = null;
    if (selW) selW.innerHTML = '<option value="">-- Pilih PO lewat kartu di atas --</option>';
    qcIsiDropdownItem_();
    qcRenderSizeLolos_();
    return;
  }
  if (QC_PO_TERPILIH && QC_PO_TERPILIH.idPurchaseOrder === po && QC_RINCIAN_PO) return;
  QC_PO_TERPILIH = { idPurchaseOrder: po };
  qcMuatRincianPO_(po);
}

let QC_ITEM_DIPILIH = "";

function qcKunciItem_(b) {
  return [b.artikel || "", b.style || ""].join("||");
}

/** Suntik field "Item (artikel + style)" tepat di atas field Warna -- sekali. */
function qcPastikanFieldItem_() {
  if (document.getElementById("qc-item")) return;
  const selW = document.getElementById("qc-warna");
  const fieldW = selW ? selW.closest(".qc-field") : null;
  if (!fieldW || !fieldW.parentNode) return;
  const f = document.createElement("div");
  f.className = "qc-field";
  f.innerHTML = "<label for='qc-item'>Item (artikel \u00b7 style)</label>" +
    "<select id='qc-item' onchange='qcPilihItem()'>" +
    "<option value=''>-- Pilih PO dulu --</option></select>";
  fieldW.parentNode.insertBefore(f, fieldW);
}

function qcIsiDropdownItem_() {
  qcPastikanFieldItem_();
  const sel = document.getElementById("qc-item");
  if (!sel) return;
  if (!QC_RINCIAN_PO || !(QC_RINCIAN_PO.baris || []).length) {
    sel.innerHTML = '<option value="">-- Pilih PO dulu --</option>';
    QC_ITEM_DIPILIH = "";
    return;
  }
  const urut = [], lihat = {};
  QC_RINCIAN_PO.baris.forEach(function (b) {
    const k = qcKunciItem_(b);
    if (lihat[k]) return;
    lihat[k] = true;
    urut.push({ k: k, label: [b.artikel, b.style].filter(Boolean).join(" \u00b7 ") || "(tanpa nama)" });
  });
  // item pertama jadi pilihan awal -- meniru form Gelaran
  QC_ITEM_DIPILIH = urut.length ? urut[0].k : "";
  sel.innerHTML = urut.map(function (it) {
    return '<option value="' + rjdEscapeHtml_(it.k) + '">' + rjdEscapeHtml_(it.label) + '</option>';
  }).join("");
  sel.value = QC_ITEM_DIPILIH;
}

function qcPilihItem() {
  const sel = document.getElementById("qc-item");
  QC_ITEM_DIPILIH = sel ? sel.value : "";
  QC_WARNA_DIPILIH = null;
  qcIsiDropdownWarna_();
  qcRenderSizeLolos_();
}

function qcMuatMaster_() {
  Promise.all([
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getMasterQC" }) }).then(function (r) { return r.json(); }),
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getDaftarPO" }) }).then(function (r) { return r.json(); })
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
  // Perbaikan v106 (bug WARISAN qc.html): markup chip lahir dengan kelas
  // "hidden", dan .hidden global memakai !important -- menambah "show" saja
  // tidak pernah cukup, chip tak pernah tampil & ganti PO mustahil tanpa
  // refresh. "hidden" harus DILEPAS, bukan dikalahkan.
  document.getElementById("qc-po-terpilih").classList.remove("hidden");
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

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getPOUntukCutting", idPurchaseOrder: idPO })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      if (sel) sel.innerHTML = '<option value="">Gagal memuat warna</option>';
      qcTampilkanError_((d && d.error) || "Gagal memuat rincian warna PO ini.");
      return;
    }
    QC_RINCIAN_PO = d;
    qcIsiDropdownItem_();
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
  // v107: pastikan pemilih item ada & tersaring -- warna hanya milik item
  // terpilih. Nilai option TETAP indeks global baris rincian (i), bukan
  // indeks hasil saringan, supaya qcPilihWarna & submit tidak berubah.
  if (!document.getElementById("qc-item")) qcIsiDropdownItem_();
  sel.innerHTML = '<option value="">-- Pilih warna --</option>' +
    QC_RINCIAN_PO.baris.map(function (b, i) {
      if (QC_ITEM_DIPILIH && qcKunciItem_(b) !== QC_ITEM_DIPILIH) return "";
      return '<option value="' + i + '">' + rjdEscapeHtml_(b.warna || "(tanpa warna)") +
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
  document.getElementById("qc-po-terpilih").classList.add("hidden");   // pasangan perbaikan v106
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

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
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

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
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

/* Init navigasi dua tingkat (v110): render bar dengan fase Cutting > Gelaran
   aktif -- meniru keadaan awal lama (tombol Gelaran ber-class active dari
   HTML). SENGAJA tidak memanggil spSwitchTab di sini: dulu pun panel awal
   tampil tanpa loader terpicu; loader jalan saat interaksi pertama. */
(function spInitDuaTingkat_() {
  const mulai = function () {
    if (!document.getElementById("sp-tabs")) return;
    if (window.SP_FASE === undefined) window.SP_FASE = "cutting";
    if (window.SP_TAB === undefined) window.SP_TAB = "gelar";
    window.SP_BAGIAN_SEMUA = (window.SP_BAGIAN_SEMUA === undefined)
      ? true : window.SP_BAGIAN_SEMUA;
    spRenderFase_();
    spRenderSub_();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mulai);
  } else { mulai(); }
})();
