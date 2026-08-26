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

/**
 * Penanda memuat: teks + setikan jahit berjalan (v166).
 *
 * Satu bentuk untuk SEMUA tempat yang menunggu data. Sebelumnya tiap tempat
 * menulis <p class="sp-info">Memuat ...</p> sendiri -- teks diam yang terbaca
 * sebagai keadaan akhir, bukan proses, dan itu yang membuat orang menunggu
 * sebentar lalu menyimpulkan halamannya rusak.
 *
 * Kelasnya ada di simpro-global.css supaya halaman lain bisa ikut memakainya
 * tanpa menyalin apa pun.
 */
function spMuatHtml_(teks) {
  return '<div class="rjd-muat">' +
    '<span class="rjd-muat-teks">' + spEsc_(teks || "Memuat...") + '</span>' +
    '<span class="rjd-muat-jahit"></span>' +
  '</div>';
}

function spMuatDaftarPO() {
  // v164: keadaan pemuatan DITANDAI, tidak ditebak dari daftar kosong.
  //
  // Sebelumnya tab Orderan menyimpulkan "belum termuat" hanya karena
  // arraynya kosong -- padahal kosong bisa berarti tiga hal berbeda: sedang
  // dimuat, gagal dimuat, atau memang tidak ada order. Yang tampil selalu
  // kalimat ketiga-tiganya: "Coba muat ulang halaman", saat yang benar cuma
  // menunggu sebentar. Menyuruh orang memuat ulang padahal sistemnya sedang
  // bekerja adalah cara tercepat membuat orang tidak percaya pada layar.
  window.SP_PO_STATUS = "memuat";
  if (window.SP_TAB === "orderan" && typeof spRenderOrderan_ === "function") {
    spRenderOrderan_();
  }
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getDaftarPO" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      window.SP_PO_STATUS = "galat";
      window.SP_PO_GALAT = (d && d.error) || "Gagal memuat daftar PO.";
      spPesan_("sp-po-pesan", window.SP_PO_GALAT, true);
      if (window.SP_TAB === "orderan" && typeof spRenderOrderan_ === "function") {
        spRenderOrderan_();
      }
      return;
    }
    // Order yang sudah Selesai tidak perlu dibagi lagi -- menyembunyikannya
    // membuat daftar jauh lebih pendek & relevan untuk lantai produksi.
    // TAPI disimpan terpisah, bukan dibuang: kasus Sienna (Agu 2026) -- PO
    // sudah Selesai, tim marker masih perlu membuat marker furing untuknya,
    // dan picker menjawab "tidak ditemukan" seolah datanya lenyap. Mengetik
    // NOMOR PO-nya adalah niat eksplisit; untuk itu pintunya tetap terbuka
    // (lihat spCariPO).
    // v158: TIGA kelompok, bukan dua.
    //
    // Versi lama cuma memisahkan "selesai" dari sisanya -- akibatnya order
    // BATAL ikut terhitung berjalan, muncul di kotak Pilih PO, dan ikut
    // ditawarkan untuk dikerjakan. Order yang sudah dibatalkan adalah satu-
    // satunya yang benar-benar TIDAK BOLEH disentuh siapa pun, jadi justru
    // itu yang paling tidak boleh nyasar ke daftar kerja.
    //
    // Pencocokan sengaja longgar (regex, bukan sama-dengan): sheet memakai
    // "Batal" dan "Dibatalkan" bergantian, dan sebagian order lama tertulis
    // "Cancel". Menuntut satu ejaan persis berarti sebagian order batal tetap
    // lolos ke daftar kerja tanpa ada yang menyadarinya.
    const semuaPO = d.daftar || [];
    const stat_ = function (p) { return String(p.status || "").toLowerCase().trim(); };
    window.SP_DAFTAR_PO_SELESAI = semuaPO.filter(function (p) { return stat_(p) === "selesai"; });
    window.SP_DAFTAR_PO_BATAL = semuaPO.filter(function (p) { return /batal|cancel/.test(stat_(p)); });
    window.SP_DAFTAR_PO = semuaPO.filter(function (p) {
      const s = stat_(p);
      return s !== "selesai" && !/batal|cancel/.test(s);
    });
    // v163: kalau tab Orderan sedang terbuka saat daftarnya baru tiba, render
    // ulang. Urutan kedatangan tidak dijamin -- panel bisa terbuka lebih dulu
    // (menampilkan "daftar belum termuat") dan tanpa ini ia akan bertahan
    // begitu sampai orang mengklik subtabnya, mengira tidak ada order apa pun.
    window.SP_PO_STATUS = "siap";
    if (window.SP_TAB === "orderan" && typeof spRenderOrderan_ === "function") {
      spRenderOrderan_();
    }
  })
  .catch(function () {
    window.SP_PO_STATUS = "galat";
    window.SP_PO_GALAT = "Gagal menghubungi server.";
    spPesan_("sp-po-pesan", window.SP_PO_GALAT, true);
    if (window.SP_TAB === "orderan" && typeof spRenderOrderan_ === "function") {
      spRenderOrderan_();
    }
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
  // v158: order BATAL juga tetap bisa dibuka -- tapi hanya lewat nomor PO,
  // sama seperti yang Selesai. Kadang perlu dilihat riwayatnya; yang tidak
  // boleh adalah ia nongol saat orang sekadar menjelajah cari pekerjaan.
  (window.SP_DAFTAR_PO_BATAL || []).forEach(function (p) {
    if (String(p.idPurchaseOrder || "").toLowerCase().indexOf(q) !== -1) {
      hasil.push(Object.assign({}, p, { spBatal: true }));
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
        (p.spSelesai ? ' <span style="font-weight:600;color:#8F2C22">&#183; Selesai</span>' : '') +
        (p.spBatal ? ' <span style="font-weight:600;color:#8F2C22">&#183; DIBATALKAN</span>' : '') + '</div>' +
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
  // v112: cari di bar SUBTAB saja -- tombol fase juga berkelas .sp-tab
  // tapi tanpa data-tab, dan dialah yang tampil pertama di DOM.
  const btn = document.querySelector("#sp-subtabs .sp-tab.active");
  return (btn && btn.dataset && btn.dataset.tab) || "gelar";
}

function spPilihPO(idPO) {
  // PO baru dipilih -> saringan konfirmasi menyala lagi (v117).
  window.SP_KONF_SEMUA = false;
  document.getElementById("sp-po-dropdown").classList.add("hidden");
  document.getElementById("sp-po-cari").value = idPO;
  spPesan_("sp-po-pesan", "", false);
  window.SP_PO_AKTIF = idPO;
  window.SP_PO = null;
  window.SP_CUT = null;
  window.SP_SETOR = null;
  // v160: cache detail order ikut dibuang. Kalau tidak, ganti PO akan
  // menampilkan detail PO SEBELUMNYA sampai orang menyadarinya sendiri --
  // dan itu jenis salah baca yang berakhir dengan memotong warna yang keliru.
  window.SP_DETAIL = null;
  window.SP_DETAIL_PO = null;
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
/* ============================================================
 * v192 -- DAFTAR SPK PER LINE: kartu, pencarian, pratinjau dalam halaman
 * ============================================================
 * Sebelumnya satu baris datar per line, serahannya berjejer sebagai tautan
 * bergaris bawah yang membungkus ke baris berikutnya. Pada PO dengan 6 line
 * x 6 serahan, mata tidak punya tempat berpijak: nama line, qty, dan tautan
 * semuanya seukuran. Sekarang tiap line jadi kartu, serahan jadi chip
 * bernomor, dan ada kotak cari begitu linenya lebih dari empat.
 *
 * Tautan cetak dibuka sebagai PRATINJAU di dalam halaman (iframe
 * /p/cetak.html, origin sama sehingga sesi login ikut terbaca) -- bukan tab
 * baru. Mencetak enam SPK berarti enam tab yang harus ditutup satu per satu,
 * dan orang kehilangan tempatnya di halaman produksi. Tombol "Buka tab baru"
 * tetap ada untuk yang memang mau menyimpan berkasnya.
 *
 * Data tombol dititipkan lewat atribut data-*, BUKAN dirangkai ke dalam
 * onclick: nama line yang mengandung apostrof (mis. "Bu Ta'ah") akan memutus
 * string JavaScript-nya dan tombolnya mati tanpa pesan apa pun.
 */
function spDaftarSPKRangkaHtml_(jumlahLine) {
  const cari = jumlahLine > 4
    ? '<input class="sp-spk-cari" id="sp-spk-cari" type="search" ' +
      'placeholder="Cari line..." oninput="spRenderDaftarSPK_()" autocomplete="off"/>'
    : '';
  return '<div class="sp-spk-kepala">' +
      '<div class="sp-ringkas-judul">Sudah dibagi ke ' +
        '<span class="sp-spk-hitung">' + jumlahLine + ' line</span></div>' +
      cari +
    '</div>' +
    '<div class="sp-spk-list" id="sp-spk-list"></div>';
}

function spRenderDaftarSPK_() {
  const wadah = document.getElementById("sp-spk-list");
  if (!wadah) return;
  const idPO = window.SP_SPK_PO || "";
  const kotak = document.getElementById("sp-spk-cari");
  const cari = kotak ? kotak.value.trim().toLowerCase() : "";
  const daftar = (window.SP_SPK_LINE || []).filter(function (l) {
    return !cari || String(l.namaLine || "").toLowerCase().indexOf(cari) !== -1;
  });

  if (!daftar.length) {
    wadah.innerHTML = '<p class="sp-info">Tidak ada line bernama &#8220;' +
      rjdEscapeHtml_(cari) + '&#8221; di PO ini.</p>';
    return;
  }

  // Tombol pratinjau: seluruh datanya lewat data-*, dibaca spPratinjauDari_.
  const tombol_ = spTombolDok_;

  wadah.innerHTML = daftar.map(function (l) {
    const urlGabung = "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(idPO) +
      "&line=" + encodeURIComponent(l.idLine);
    const urlRekap = "/p/cetak.html?jenis=rekapline&line=" + encodeURIComponent(l.idLine);
    const batch = l.batch || [];
    // Chip serahan hanya kalau LEBIH DARI SATU: pada satu serahan, SPK
    // gabungan dan SPK serahan isinya identik -- dua tombol, satu dokumen.
    const chip = batch.length > 1
      ? '<div class="sp-spk-batch">' +
          '<span class="sp-spk-batch-lbl">' + batch.length + ' serahan</span>' +
          batch.map(function (b, n) {
            return tombol_("sp-batch-chip",
              '<b>' + (n + 1) + '</b>' + rjdEscapeHtml_(b.tanggalSerah || "-") +
                '<span>' + b.qty + ' pcs</span>',
              urlGabung + "&batch=" + encodeURIComponent(b.idBatch),
              "SPK " + l.namaLine + " \u00b7 serahan " + (n + 1),
              (b.tanggalSerah || "-") + " \u00b7 " + b.qty + " pcs");
          }).join("") +
        '</div>'
      : '';

    return '<div class="sp-spk-kartu">' +
      '<div class="sp-spk-atas">' +
        '<div class="sp-spk-nama">' + rjdEscapeHtml_(l.namaLine) +
          (l.targetSelesai
            ? '<span class="sp-ringkas-target">target ' + rjdEscapeHtml_(l.targetSelesai) + '</span>'
            : '<span class="sp-ringkas-target kosong">target belum diisi</span>') +
        '</div>' +
        '<div class="sp-spk-qty">' + l.qty + '<span>pcs</span></div>' +
      '</div>' +
      '<div class="sp-spk-aksi">' +
        tombol_("sp-spk-btn utama", batch.length > 1 ? "SPK gabungan" : "Cetak SPK",
          urlGabung, "SPK " + l.namaLine, "seluruh jatah line di PO ini") +
        tombol_("sp-spk-btn", "Rekap Line", urlRekap,
          "Rekap Line " + l.namaLine, "semua PO yang dipegang line ini") +
      '</div>' + chip +
    '</div>';
  }).join("");
}

/**
 * v193 -- satu pembuat tombol pratinjau untuk SELURUH halaman produksi.
 *
 * Datanya dititipkan lewat data-*, tidak pernah dirangkai ke dalam onclick:
 * nama line atau nomor dokumen yang mengandung apostrof akan memutus string
 * JavaScript-nya, dan tombolnya mati tanpa pesan apa pun.
 */
function spTombolDok_(kelas, teks, url, judul, sub) {
  return '<button class="' + kelas + '" type="button" onclick="spPratinjauDari_(this)" ' +
    'data-url="' + spEsc_(url) + '" data-judul="' + spEsc_(judul) + '" ' +
    'data-sub="' + spEsc_(sub || "") + '">' + teks + '</button>';
}

function spPratinjauDari_(btn) {
  if (!btn) return;
  spPratinjauDok_(btn.dataset.url, btn.dataset.judul, btn.dataset.sub);
}

/**
 * Pratinjau dokumen cetak DI DALAM halaman. Iframe menunjuk /p/cetak.html di
 * origin yang sama, jadi sesi (db_session) terbaca tanpa login ulang, dan
 * print() dari sini mencetak isi iframe -- bukan halaman produksi di
 * belakangnya.
 *
 * NAMA sengaja *Dok_ , bukan *Pratinjau_ : spTutupPratinjau_/#sp-pratinjau
 * sudah dipakai pratinjau GAMBAR marker sejak v128. Dua fungsi bernama sama
 * di satu berkas tidak melempar error apa pun -- yang belakangan menang
 * diam-diam, dan pratinjau marker akan mati tanpa jejak.
 */
function spPratinjauDok_(url, judul, sub) {
  if (!url) return;
  spTutupPratinjauDok_();   // satu pratinjau saja pada satu waktu
  const ov = document.createElement("div");
  ov.className = "rjd-modal-overlay";
  ov.id = "sp-dok-ov";
  ov.innerHTML =
    '<div class="rjd-modal sp-dok">' +
      '<div class="rjd-modal-head">' +
        '<div><div class="rjd-modal-title">' + rjdEscapeHtml_(judul || "Dokumen") + '</div>' +
          '<div class="rjd-modal-sub">' + rjdEscapeHtml_(sub || "") + '</div></div>' +
        '<button class="rjd-modal-close" onclick="spTutupPratinjauDok_()" type="button" ' +
          'aria-label="Tutup">&#10005;</button>' +
      '</div>' +
      '<div class="rjd-modal-body sp-dok-body">' +
        '<div class="sp-dok-muat" id="sp-dok-muat">Memuat dokumen...</div>' +
        '<iframe id="sp-dok-frame" title="Pratinjau dokumen" src="' + spEsc_(url) + '"></iframe>' +
      '</div>' +
      '<div class="rjd-modal-foot">' +
        '<a class="sp-spk-btn" href="' + spEsc_(url) + '" rel="noopener" target="_blank">Buka tab baru</a>' +
        '<button class="sp-spk-btn utama" onclick="spCetakPratinjauDok_()" type="button">Cetak</button>' +
      '</div>' +
    '</div>';
  ov.addEventListener("click", function (e) { if (e.target === ov) spTutupPratinjauDok_(); });
  document.body.appendChild(ov);
  // v202: dokumen bisa SUDAH selesai dimuat sebelum pendengar terpasang --
  // terjadi kalau /p/cetak.html masih di cache. Spanduk "Memuat dokumen..."
  // ber-position:absolute, jadi ia MENUTUPI dokumennya, bukan sekadar hiasan
  // di belakang: yang terlihat orang adalah modal yang menggantung selamanya.
  // Karena itu keadaan iframe diperiksa sekali di sini, tidak hanya ditunggu.
  const f = document.getElementById("sp-dok-frame");
  function lepasSpanduk_() {
    const m = document.getElementById("sp-dok-muat");
    if (m) m.remove();
  }
  if (f) {
    f.addEventListener("load", lepasSpanduk_);
    try {
      const d = f.contentDocument;
      if (d && d.readyState === "complete") lepasSpanduk_();
    } catch (e) { /* beda origin -- biarkan pendengar yang bekerja */ }
  }
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", spEscDok_);
}

function spEscDok_(e) { if (e.key === "Escape") spTutupPratinjauDok_(); }

function spTutupPratinjauDok_() {
  const ov = document.getElementById("sp-dok-ov");
  if (!ov) return;
  ov.remove();
  document.body.style.overflow = "";
  document.removeEventListener("keydown", spEscDok_);
}

function spCetakPratinjauDok_() {
  const f = document.getElementById("sp-dok-frame");
  if (!f || !f.contentWindow) { alert("Dokumen belum selesai dimuat."); return; }
  f.contentWindow.focus();
  f.contentWindow.print();
}

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

  // Ringkasan pembagian yang sudah ada -- v192: kartu per line, kotak cari,
  // dan pratinjau dokumen di dalam halaman. Lihat spRenderDaftarSPK_.
  const rk = document.getElementById("sp-ringkas");
  if ((po.perLine || []).length) {
    window.SP_SPK_PO = po.idPurchaseOrder;
    window.SP_SPK_LINE = po.perLine;
    rk.innerHTML = spDaftarSPKRangkaHtml_(po.perLine.length);
    spRenderDaftarSPK_();
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
        // v186: tautan utama = SPK BATCH INI (yang barusan disimpan). Kertas
        // yang ikut ke tumpukan potongan harus memuat tumpukan itu saja.
        // v193: pratinjau di dalam halaman -- sesudah menyimpan, orang masih
        // berada di tengah pekerjaan membagi; tab baru membuang tempatnya.
        spTombolDok_("sp-cetak-btn", "Cetak SPK serahan ini",
          "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(h.idPurchaseOrder) +
            "&line=" + encodeURIComponent(h.idLine) +
            (h.idBatch ? "&batch=" + encodeURIComponent(h.idBatch) : ""),
          "SPK " + h.namaLine, "serahan yang baru disimpan \u00b7 " + h.totalQty + " pcs") +
        spTombolDok_("sp-tautan sp-tautan-btn", "SPK gabungan " + rjdEscapeHtml_(h.namaLine),
          "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(h.idPurchaseOrder) +
            "&line=" + encodeURIComponent(h.idLine),
          "SPK " + h.namaLine, "seluruh jatah line di PO ini") +
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
 * Konfirmasi (v116): dua subtab bermode -- konfpot (Sewing) & konfset
 * (Finishing) -- adalah dua pintu ke SATU panel fisik sp-panel-konf
 * (alias di spSwitchTab). Subtab yang menentukan mode; sakelar internal
 * lama dipensiunkan.
 *
 * Approval (Sampel) & Packing/Stok BELUM di peta -- cetak biru melarang
 * tab lahir kosong; masuk begitu form-nya jadi.
 */
const SP_FASE_PETA = [
  // v156: SOP paling kiri -- panduan kerja mestinya yang pertama terlihat
  // orang baru. Tapi ia TIDAK dijadikan fase awal (lihat spTerapkanBagian_):
  // yang membuka halaman ini tiap hari datang untuk bekerja, bukan membaca.
  ["sop", "SOP", [["sop", "SOP"]]],
  // v157: keluhan tim saat uji coba -- tiap tab meminta nomor PO, tapi tidak
  // ada tempat melihat order mana yang sedang berjalan. Orang harus membuka
  // halaman Orderan di tab browser lain, mencatat nomornya, lalu kembali.
  //
  // TIDAK memindahkan halaman Orderan ke sini: daftarnya SUDAH ada di memori
  // halaman ini (SP_DAFTAR_PO, dipakai kotak Pilih PO). Yang kurang cuma
  // tempat melihatnya utuh. Nol rute baru, nol fetch tambahan.
  //
  // Soal harga terselesaikan sendiri: getDaftarPO tidak pernah mengirim
  // harga ke halaman produksi. Pemisahan barang vs uang sudah ada sejak awal
  // dan tidak perlu dilonggarkan lalu ditambal filter.
  // v160: subtab kedua "Detail Order" -- isi SPK produksi tanpa harus mencetak.
  ["orderan", "Orderan", [["orderan", "Orderan Berjalan"], ["detailorder", "Detail Order"]]],
  ["polamarker", "Pola & Marker", [["pola", "Pola"], ["marker", "Marker"]]],
  ["sampel",     "Sampel",        [["sampel", "Sampel"], ["approval", "Approval"]]],
  // v181: QC pindah ke rumah pemiliknya. Tiga pintu, SATU panel fisik
  // sp-panel-qc (alias, pola konfpot/konfset v116), tahap TERKUNCI per pintu.
  // Alasannya sederhana: tim cutting tidak akan pernah membuka fase Finishing
  // untuk mencatat cacat potong -- selama formnya di sana, QC Potong kosong
  // selamanya (terbukti: 0 catatan sampai v180). Keputusan 24 Agu 2026:
  // Potong & Jahit self-check oleh timnya, Finishing tetap orang QC --
  // pagarnya ditegakkan backend per tahap (pastikanBagianTahapQC_).
  ["cutting",    "Cutting",       [["gelar", "Gelaran"], ["cutting", "Hasil Potong"], ["qcpot", "QC Potong"]]],
  // v145: subtab "Siapkan Potongan" menutup celah peran yang membingungkan
  // lantai (22 Agu). "Bagi ke Line" itu KEPUTUSAN (qty per line + target
  // selesai); tim loading cuma MENYIAPKAN fisiknya. Dua pekerjaan berbeda
  // sekarang punya pintunya masing-masing di dalam satu rumah.
  //
  // v151: "Potongan Keluar" DIPINDAH ke sini dari fase Cutting. Alasannya
  // bukan soal urutan waktu (di lantai memang terjadi sebelum loading),
  // melainkan APA YANG DIKERJAKAN TERHADAP POOL:
  //
  //     Cutting  MENGISI pool   (Gelaran -> Hasil Potong)
  //     Loading  MENGELOLA pool (keluar ke line / keluar ke klien)
  //
  // "Bagi ke Line" dan "Potongan Keluar" adalah DUA PINTU KELUAR dari pool
  // yang sama, dengan batas qty dari rumus yang sama persis -- kodenya pun
  // begitu: getPOUntukPotonganKeluar_ memakai getPOUntukDistribusi_ sebagai
  // basisnya. Menaruhnya di fase berbeda menyembunyikan hubungan itu, dan
  // orang yang hendak membagi 990 pcs tidak melihat bahwa 30 sudah keluar.
  //
  // v152: urutan mengikuti SIFAT pekerjaan, bukan seberapa sering dipakai --
  // prinsip yang sama dengan alasan tab ini pindah fase:
  //
  //     1-2  Bagi ke Line + Potongan Keluar  -> dua pintu keluar pool (KEPUTUSAN)
  //     3    Siapkan Potongan                -> EKSEKUSI fisik
  //     4    SPK & Rekap                     -> DOKUMEN
  //
  // Dua pintu pool berdampingan itu yang penting: orang yang hendak membagi
  // 990 pcs melihat "Potongan Keluar" persis di sebelahnya, jadi pertanyaan
  // "apa ada yang sudah keluar?" muncul sebelum ia membagi, bukan sesudah.
  ["loading",    "Loading",       [["bagi", "Bagi ke Line"], ["keluar", "Potongan Keluar"], ["siapkan", "Siapkan Potongan"], ["spkrekap", "SPK & Rekap"]]],
  ["sewing",     "Sewing",        [["konfpot", "Konfirmasi Potongan"], ["qcjahit", "QC Jahit"], ["setor", "Setoran ke Finishing"]]],
  ["finishing",  "Finishing",     [["konfset", "Konfirmasi Setoran"], ["qc", "QC Finishing"], ["qcring", "Ringkasan QC"]]],
  ["packing",    "Packing & Kirim", [["stok", "Stok Siap Kirim"], ["terkirim", "Terkirim"]]],
  ["riw",        "Riwayat",       [["riw", "Riwayat"]]]
];

/** Boleh-tidaknya satu tab untuk pemakai -- dari peta bagian, BUKAN dari DOM. */
/**
 * ============================================================
 * v156: SEMUA TAB TERLIHAT, YANG DIBATASI CUMA MENGISI
 * ============================================================
 * Sampai v155 tab yang bukan bagian pemakai TIDAK DILAHIRKAN sama sekali.
 * Akibatnya asimetri penuh: yang mencatat tahu, yang dicatat tidak. Kepala
 * line tidak bisa memeriksa apakah angka yang tercatat dibagi ke dia benar,
 * dan tim cutting tidak pernah tahu hasil potongnya berakhir di mana.
 *
 * Padahal pemeriksa terbaik atas sebuah catatan adalah orang yang pekerjaannya
 * dicatat -- dan itu gratis. Sejak v156 semua tab dibuka; yang dijaga cuma
 * kemampuan MENGISI.
 *
 * AMAN, bukan sekadar bisa dipaksakan: penegakan sebenarnya ada di BACKEND
 * (BAGIAN_PER_AKSI + pastikanBagianBoleh_ di akses-role.gs), per AKSI. Yang
 * di frontend ini lapisan kedua -- mencegah orang mengisi form panjang lalu
 * ditolak server, dan menandai dengan jujur tab mana yang bukan miliknya.
 *
 * Halaman produksi seluruhnya data BARANG (qty, lokasi, tanggal). Harga, HPP,
 * dan upah tidak pernah ada di sini -- itu sudah dipisah ke halaman lain
 * dengan gerbang peran, dan pemisahan itu TIDAK ikut dilonggarkan.
 */
function spTabBoleh_(tab) {
  void tab;
  return true;   // v156: semua tab terlihat
}

/** Boleh MENGISI tab ini? Ini yang menggantikan peran lama spTabBoleh_. */
function spTabEditBoleh_(tab) {
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
    // v156: tab yang tidak boleh diisi tetap DILAHIRKAN, cuma diberi gembok.
    // Penandanya di ikon, bukan warna pudar: tab pudar terbaca "rusak" atau
    // "belum siap", padahal isinya benar-benar bisa dibaca.
    const kunci = spTabEditBoleh_(s[0]) ? "" : ' <span class="sp-tab-kunci">&#128274;</span>';
    return '<button class="sp-tab' + (s[0] === window.SP_TAB ? ' active' : '') +
      (kunci ? ' sp-tab-baca' : '') +
      '" data-tab="' + s[0] + '" onclick="spSwitchTab(\'' + s[0] + '\')" type="button">' +
      s[1] + kunci + '</button>';
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
  // v151: melepas potongan ke klien adalah KEPUTUSAN, sekelas dengan "bagi" --
  // bukan eksekusi fisik seperti "siapkan". Karena itu bagiannya "ppic", bukan
  // "loading": tim loading menyiapkan barang, tidak memutuskan barang mana yang
  // boleh keluar dari pabrik. Kepala produksi lolos lewat peran full/produksi.
  keluar:  "ppic",
  // v149: "Bagi ke Line" adalah KEPUTUSAN (qty per line + target selesai),
  // dan yang memutuskan adalah kepala produksi/PPIC. Sampai v148 entri ini
  // berbunyi "loading" -- sistem menyuruh tim loading memutuskan hal yang
  // bukan wewenangnya, dan itulah akar kebingungan yang mereka laporkan.
  //
  // Bagian "ppic" belum tentu ada isinya di SD Staff, dan memang tidak perlu:
  // kepala produksi berperan full/produksi sehingga lolos semua gerbang
  // (lihat spTerapkanBagian_). Entri ini justru bekerja dengan MENUTUP tab
  // bagi dari bagian "loading". Kalau kelak ada staf PPIC yang bukan full,
  // tinggal isi bagiannya "ppic" -- tanpa menyentuh kode.
  bagi:    "ppic",
  // v145: papan kerja tim loading. Sengaja bagian yang sama dengan "bagi"
  // untuk sekarang -- pemetaan siapa yang BOLEH membagi masih menunggu
  // keputusan organisasi (tidak ada bagian "ppic" di SD Staff). Begitu
  // diputuskan, cukup pindahkan entri "bagi" ke bagian pemutus; entri ini
  // tidak perlu ikut berubah.
  siapkan: "loading",
  setor:   "sewing",
  // v181: cermin pagar backend (QC_BAGIAN_PER_TAHAP di qc-inspeksi.gs).
  // Potong & Jahit self-check timnya; Finishing tetap qc saja -- gerbang
  // stok -> surat jalan -> tagihan tidak ikut dilonggarkan.
  qc:      "qc",
  qcpot:   ["cutting", "qc"],
  qcjahit: ["sewing", "qc"],
  approval: ["pola", "sampel"],
  spkrekap: "loading",
  stok:    ["finishing", "gudang"],   // kursi gudang disiapkan duluan
  terkirim: ["finishing", "gudang"],
  qcring:  "qc",
  // Konfirmasi terpecah dua subtab bermode (v116): sewing menerima potongan
  // dari loading, finishing menerima setoran dari sewing. Entri "konf" lama
  // pensiun bersama sakelar internalnya.
  // Array = boleh salah satu.
  konfpot: "sewing",
  konfset: "finishing",
  riw:     null,       // selalu tampil
  // SOP boleh dibaca siapa pun. Nilainya null berarti tidak ada bagian yang
  // "memilikinya" -- itu juga yang membuat spTerapkanBagian_ tidak pernah
  // mendaratkan orang di sini: pencarian fase awal mencari fase yang BOLEH
  // DIISI, dan SOP tidak diisi siapa-siapa.
  sop:     null,
  // Sama seperti SOP: tidak dimiliki bagian mana pun, jadi tidak pernah jadi
  // fase pendaratan. Isinya memang cuma dibaca.
  orderan: null,
  detailorder: null
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

  // v163: PENDARATAN DIPINDAH KE SINI, sebelum jalan pintas peran-penuh.
  //
  // v162 menaruhnya di bawah, setelah "if (semua) ... return" -- akibatnya
  // justru peran FULL/ADMIN yang tidak pernah mendarat di mana pun: panel
  // awalnya tetap kosong sampai orang mengklik subtabnya sendiri. Staf
  // berbagian sempit tidak mengalaminya, jadi bug ini hanya terlihat oleh
  // orang yang paling jarang melaporkan bug: yang punya akses penuh.
  //
  // Pelajaran yang berulang hari ini: kode yang bercabang menurut peran harus
  // diperiksa dari KEDUA cabang. Cabang "istimewa" justru yang paling sering
  // ketinggalan karena ia ditulis sebagai jalan pintas.
  if (!window.SP_SUDAH_MENDARAT) {
    window.SP_SUDAH_MENDARAT = true;
    spPilihFase_("orderan");
  }

  if (semua) { spRenderFase_(); spRenderSub_(); return; }

  // v110: penyaringan lewat PETA (spTabBoleh_ membaca SP_BAGIAN yang barusan
  // diisi), lalu kedua bar dirender ulang -- tombol yang tidak boleh memang
  // tidak pernah dilahirkan, bukan disembunyikan. SP_BAGIAN_SEMUA=false
  // menandakan penyaringan aktif.
  window.SP_BAGIAN_SEMUA = false;
  spRenderFase_();
  spRenderSub_();

  spSegarkanBaca_(window.SP_TAB);

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
      ". Tab lain bisa dilihat, tapi tidak bisa diisi (bertanda \u{1F512}).";
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
  // v155: tab yang lahir setelah SP_PANDUAN pertama dibuat.
  konfpot: {
    judul: "Cara mengonfirmasi potongan",
    isi: [
      ["Ini serah-terima, bukan formalitas",
       "Selisih jumlah paling murah diselesaikan di titik ini. Sesudah potongannya " +
       "dijahit, tidak ada yang bisa membuktikan berapa yang benar-benar diterima."],
      ["Hitung dulu, baru konfirmasi",
       "Kalau jumlahnya beda, pilih \"Ada selisih\" dan tulis angka sebenarnya — " +
       "jangan dikonfirmasi cocok lalu dibereskan lisan."],
      ["Kotak masuk ini LINTAS ORDER",
       "Tanpa memilih PO, yang tampil semua yang menunggu. Memilih PO cuma menyaring."],
      ["Panel cacat: minta re-cut, jangan dikembalikan",
       "Potongan yang dikembalikan otomatis bisa dibagi lagi ke line lain — " +
       "dan panel cacat tidak boleh sampai ke sana."]
    ]
  },
  konfset: {
    judul: "Cara mengonfirmasi setoran",
    isi: [
      ["Yang dikonfirmasi di sini boleh diperiksa QC",
       "Kalau QC mengeluh barangnya ada tapi tidak bisa dipilih, biasanya setorannya " +
       "belum dikonfirmasi di sini."],
      ["Selisih dicatat apa adanya",
       "Angka yang dirapikan membuat kebocoran tidak pernah terlihat, dan biayanya " +
       "tetap ditanggung — cuma tidak diketahui dari mana."]
    ]
  },
  siapkan: {
    judul: "Cara memakai Siapkan Potongan",
    isi: [
      ["Daftar ini pekerjaan hari ini, LINTAS ORDER",
       "Dikelompokkan per line tujuan, bukan per PO — satu tumpuk untuk satu line, " +
       "sekali angkut."],
      ["Menandai TIDAK wajib",
       "Kepala line tetap bisa konfirmasi terima walau penandaan terlewat. Yang " +
       "hilang cuma jejak waktunya, bukan barangnya."],
      ["Label merah = sudah lama menunggu",
       "Potongan yang sudah dibagi tapi belum disiapkan berhari-hari biasanya berarti " +
       "ada line sedang menganggur menunggu."],
      ["Tab ini tidak membagi apa pun",
       "Pembagian ada di tab sebelah dan itu wewenang kepala produksi/PPIC."]
    ]
  },
  keluar: {
    judul: "Cara mencatat Potongan Keluar",
    isi: [
      ["Hanya untuk potongan yang SUDAH ADA di gudang",
       "Kalau panelnya harus dipotong dulu, itu bukan di sini — pakai mode " +
       "\"Panel klien\" di tab Gelaran. Salah tempat = kain terhitung dua kali."],
      ["Qty dihitung dalam PCS BAJU, bukan lembar panel",
       "Set yang panelnya diambil tidak bisa jadi baju lagi, jadi satu set hilang " +
       "penuh dari hitungan."],
      ["Catat SEBELUM barangnya dibawa",
       "Kalau terlambat, sistem masih menawarkan barang yang sudah pergi — dan " +
       "itu persis saat orang membaginya ke line."],
      ["Potongan yang dipegang line tidak bisa diambil",
       "Tarik dulu lewat pengembalian setoran. Sisa di sini hanya menghitung yang " +
       "masih ada di gudang."],
      ["Yang dikeluarkan mengurangi jumlah yang bisa dikirim",
       "Itu bukan selisih yang perlu dicari-cari nanti — itu kesepakatan."]
    ]
  },
  qcring: {
    judul: "Cara membaca Ringkasan QC",
    isi: [
      ["Defect rate akan NAIK setelah form baru dipakai -- itu kabar baik",
       "Dulu pembilangnya cuma afkir; sekarang termasuk yang sempat diperbaiki. " +
       "Mutu tidak memburuk, mutu akhirnya kelihatan."],
      ["Tiga angka, tiga pertanyaan",
       "Afkir = barang hilang (ongkos bahan). Tingkat perbaikan = waktu kerja " +
       "ulang. Cacat ditemukan = keduanya -- ukuran mutu proses."],
      ["Angka per line untuk belajar, bukan menghukum",
       "Line dengan perbaikan tinggi butuh dicek prosesnya, bukan orangnya. " +
       "Angka self-check jangan pernah dipakai memotong upah."]
    ]
  },
  orderan: {
    judul: "Cara membaca Orderan Berjalan",
    isi: [
      ["Kartu PO di atas adalah kunci semua tab",
       "Pilih PO di sini dulu -- form Gelaran sampai QC mengikuti PO yang aktif."],
      ["Urutan tab mengikuti urutan barang",
       "Order -> Pola & Marker -> Cutting -> Sewing -> Finishing -> Kirim. Kalau " +
       "bingung mencatat di mana, ikuti di mana barangnya sekarang."]
    ]
  },
  detailorder: {
    judul: "Cara membaca Detail Order",
    isi: [
      ["Rincian warna + size dari Rincian SO",
       "Angka order di sini jadi pembanding semua tahap: potong, bagi, setor, QC."],
      ["Ada yang janggal? Lapor admin, jangan dikira-kira",
       "Rincian yang salah menular ke seluruh rantai -- betulkan di sumbernya."]
    ]
  },
  qc: {
    judul: "Cara mengisi QC Finishing",
    isi: [
      ["Yang bisa diperiksa = yang sudah dikonfirmasi diterima finishing",
       "Barang yang belum dikonfirmasi tidak akan muncul di daftar."],
      ["Lolos QC yang menentukan stok siap kirim",
       "Berapa pun yang sudah dijahit, yang belum diperiksa tidak akan bisa dikirim."],
      ["Isi juga yang sempat cacat lalu diperbaiki",
       "Barang yang sudah beres tetap dihitung lolos. Angka perbaikannya yang " +
       "memberi tahu di mana waktu kerja ulang terbuang."],
      ["Belum selesai diperbaiki? Isi kolom ditahan",
       "Jangan dipaksa memilih lolos atau afkir. Nasib akhirnya dicatat nanti " +
       "lewat tombol di spanduk keranjang -- boleh dicicil."],
      ["Reject dicatat apa adanya",
       "Ini satu-satunya sumber angka mutu. Yang dirapikan di sini membuat masalah " +
       "produksi tidak pernah ketemu akarnya."]
    ]
  },
  // v181: panduan pintu self-check. Nadanya sengaja "untuk kalian sendiri",
  // bukan "setor laporan ke atas" -- form yang terasa sebagai kewajiban
  // administratif akan berhenti diisi begitu tidak ada yang menagih.
  qcpot: {
    judul: "Cara mengisi QC Potong",
    isi: [
      ["Catat sebelum potongan dibagi ke line",
       "Cacat yang ketahuan sesudah dibagi jauh lebih mahal: sudah tercampur " +
       "dan sudah jalan."],
      ["Angka jujur, bukan angka bagus",
       "Catatan ini deteksi dini untuk tim sendiri -- salah ukuran pola dan kain " +
       "cacat yang tercatat itulah yang membuat marker dan bahan diperbaiki."],
      ["Panel rusak dari line juga dicatat di sini",
       "Line setor sisa panelnya sebagai Dikembalikan, lalu cutting mencatat " +
       "afkirnya di form ini -- bukan di QC Jahit."],
      ["Centang koreksi + tombol re-cut menuntaskan bukunya",
       "Koreksi mengeluarkan panel mati dari sisa boleh dibagi; re-cut memotong " +
       "penggantinya dengan jejak QC yang sama."],
      ["Kain penggantinya: Gelaran mode Re-cut, BUKAN Normal",
       "Gelaran Normal menaikkan set lengkap dan meninggalkan panel hantu " +
       "\"belum dicatat\". Mode Re-cut hanya menambah pemakaian kain."],
      ["Cacat potong tidak memotong stok",
       "Stok siap kirim dihitung dari QC Finishing. Di sini tidak ada angka yang " +
       "menghukum siapa pun."]
    ]
  },
  qcjahit: {
    judul: "Cara mengisi QC Jahit",
    isi: [
      ["Catat sebelum setoran ke finishing",
       "Setoran yang bersih dari awal tidak bolak-balik -- ini yang membuat " +
       "target line tercapai tanpa lembur menambal."],
      ["Isi juga yang sempat cacat lalu diperbaiki",
       "Barang yang sudah beres tetap lolos. Angka perbaikannya menunjukkan " +
       "proses mana yang paling sering minta kerja ulang."],
      ["Panel rusak BUKAN cacat jahit -- jangan catat di sini",
       "Setor panelnya sebagai Dikembalikan (catatan: panel rusak), biar cutting " +
       "yang mencatat afkirnya di QC Potong. Defect rate line tidak boleh " +
       "menanggung dosa cutting."],
      ["Finishing memeriksa barang yang sama",
       "Angka di sini akan bersanding dengan temuan QC Finishing per line -- " +
       "yang jujur dari awal tidak pernah perlu menjelaskan selisih."]
    ]
  },
  approval: {
    judul: "Cara mengisi Approval",
    isi: [
      ["Tiap putaran revisi dicatat terpisah",
       "Sampel yang bolak-balik tiga kali perlu terlihat tiga kali — itu bahan " +
       "bicara kalau klien menuntut jadwal cepat."],
      ["Tanggal approval jadi titik mulai produksi",
       "Memotong sebelum approval adalah risiko yang ditanggung sendiri; sistem " +
       "tidak menahannya, tapi jejaknya tercatat."]
    ]
  },
  spkrekap: {
    judul: "Cara memakai SPK & Rekap",
    isi: [
      ["SPK = dokumen kerja PO ini untuk satu line",
       "Isinya jatah line itu saja, bukan seluruh order."],
      ["Rekap Line = semua PO yang dipegang satu line",
       "Dipakai kepala line untuk melihat beban kerjanya lintas order."],
      ["Cetak setelah pembagian final",
       "Mencetak lalu membagi ulang membuat dua lembar beredar dengan angka berbeda."]
    ]
  },
  stok: {
    judul: "Cara membaca Stok Siap Kirim",
    isi: [
      ["Angka ini TURUNAN, bukan saldo yang diisi",
       "Stok siap kirim = lolos QC − sudah terkirim. Kalau terasa salah, yang " +
       "keliru salah satu kejadiannya — cari di QC atau di pengiriman."],
      ["Minus tidak disembunyikan",
       "Angka minus berarti terkirim melebihi yang lolos QC. Itu bukan tampilan " +
       "yang perlu dirapikan, itu masalah yang perlu ditelusuri."]
    ]
  },
  terkirim: {
    judul: "Cara membaca Terkirim",
    isi: [
      ["Daftar ini sumber angka invoice",
       "Yang tidak tercatat terkirim tidak akan pernah tertagih."],
      ["Surat jalan bisa dicetak ulang kapan saja",
       "Nomornya tetap sama — tidak ada dokumen kembar untuk satu pengiriman."]
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

/* ============================================================
   MODE BACA-SAJA (v156)
   ============================================================
   Dipasang ke panel tab yang bukan bagian pemakai. Tiga hal, urut dari yang
   paling penting:

   1. BANNER di atas panel -- orang harus tahu KENAPA tombolnya mati, bukan
      mengira halamannya rusak lalu mencari jalan lain.
   2. Isian dimatikan -- mencegah orang mengetik panjang lalu ditolak server.
   3. Tombol EDIT dimatikan; tombol BACA dan tautan tetap hidup.

   Pembeda tombol edit vs baca sengaja memakai DAFTAR PUTIH kelas yang boleh
   tetap hidup, bukan daftar hitam tombol yang harus mati: tombol baru yang
   lahir kelak akan default MATI di mode ini. Salah arah yang aman -- tombol
   baca yang tak sengaja mati cuma merepotkan, tombol edit yang tak sengaja
   hidup membuat orang mengisi data yang bukan haknya.

   Tautan <a> (cetak SPK, surat jalan) tidak pernah disentuh: itu membuka
   dokumen, bukan menulis apa pun.
   ============================================================ */

/** Kelas tombol yang TETAP HIDUP di mode baca-saja -- semuanya membaca. */
const SP_TOMBOL_BACA = ["sp-tab", "sp-konf-tab", "sp-tautan", "sp-mode-sub"];

function spPanelBacaSaja_(panel, tab) {
  if (!panel) return;
  const bolehEdit = spTabEditBoleh_(tab);

  // Banner: dipasang sekali, dibuang lagi kalau ternyata boleh mengedit
  // (peran bisa datang terlambat -- jawaban server tiba setelah panel dibuka).
  const idBanner = "sp-baca-banner-" + tab;
  const lama = document.getElementById(idBanner);
  if (bolehEdit) {
    if (lama) lama.remove();
    panel.querySelectorAll("[data-sp-kunci]").forEach(function (el) {
      el.disabled = false;
      el.removeAttribute("data-sp-kunci");
    });
    return;
  }
  if (!lama) {
    const perlu = SP_BAGIAN_TAB[tab];
    const namaBagian = (Array.isArray(perlu) ? perlu.join(" / ") : String(perlu || "")).toUpperCase();
    const b = document.createElement("div");
    b.id = idBanner;
    b.className = "sp-baca-banner";
    b.innerHTML = '<b>&#128274; Hanya bisa dilihat.</b> Tab ini diisi bagian <b>' +
      spEsc_(namaBagian) + '</b>. Kamu bisa memeriksa angkanya di sini &#8212; ' +
      'kalau ada yang tidak cocok, sampaikan ke bagian itu.';
    panel.insertAdjacentElement("afterbegin", b);
  }

  // Isian & tombol edit dimatikan. Ditandai data-sp-kunci supaya bisa
  // dinyalakan lagi tanpa menyentuh elemen yang memang disabled karena
  // alasan lain (mis. tombol simpan yang mati karena qty masih nol).
  panel.querySelectorAll("input, select, textarea, button").forEach(function (el) {
    if (el.disabled) return;                       // sudah mati, bukan urusan kita
    if (el.tagName === "BUTTON") {
      const kelas = String(el.className || "");
      const baca = SP_TOMBOL_BACA.some(function (k) { return kelas.indexOf(k) !== -1; });
      if (baca) return;
    }
    el.disabled = true;
    el.setAttribute("data-sp-kunci", "1");
  });
}

/** Sisipkan panduan ke panel tab yang sedang aktif, sekali saja per panel. */
function spPasangPanduan_(tab) {
  // v155: panel dicari dengan KONVENSI yang sama dengan spSwitchTab
  // (id panel = "sp-panel-" + tab, dengan alias untuk tab bermode), bukan
  // daftar keras. Daftar lama membuat tab yang lahir kemudian diam-diam
  // kehilangan panduannya: konfpot/konfset sejak v116, siapkan sejak v145,
  // keluar sejak v150 -- tidak ada satu pun yang melempar error, panduannya
  // cuma tidak pernah muncul.
  const ALIAS = { konfpot: "konf", konfset: "konf", qcring: "qc", qcpot: "qc", qcjahit: "qc" };
  const panel = document.getElementById("sp-panel-" + (ALIAS[tab] || tab));
  if (!panel || panel.querySelector(".sp-panduan")) return;
  const html = spPanduanHtml_(tab);
  if (html) panel.insertAdjacentHTML("afterbegin", html);
}

/**
 * Segarkan mode baca-saja untuk tab yang sedang terbuka.
 *
 * Dipanggil dari dua arah: saat tab dibuka, dan lewat MutationObserver saat
 * isi panel dirender belakangan (hampir semua panel diisi SETELAH data tiba
 * dari server). Tanpa pengamat, tombol yang lahir sesudah pengunciannya
 * berjalan akan hidup -- dan itu justru tombol simpan, karena form biasanya
 * dirender paling akhir.
 */
function spSegarkanBaca_(tab) {
  const t = tab || window.SP_TAB;
  if (!t) return;
  const ALIAS = { konfpot: "konf", konfset: "konf", qcring: "qc", qcpot: "qc", qcjahit: "qc" };
  const panel = document.getElementById("sp-panel-" + (ALIAS[t] || t));
  if (!panel) return;
  spPanelBacaSaja_(panel, t);

  // Pengamat dipasang sekali per panel. Ia hanya menyalakan penjadwalan
  // ringan (requestAnimationFrame) supaya render besar tidak memicu
  // penguncian puluhan kali dalam satu tarikan napas.
  if (panel.dataset.spAmatBaca) return;
  panel.dataset.spAmatBaca = "1";
  if (typeof MutationObserver !== "function") return;
  let jadwal = null;
  new MutationObserver(function () {
    if (jadwal) return;
    jadwal = requestAnimationFrame(function () {
      jadwal = null;
      if (window.SP_TAB === t) spPanelBacaSaja_(panel, t);
    });
  }).observe(panel, { childList: true, subtree: true });
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
  // HANYA bar subtab (perbaikan v112): selector lama menyapu SEMUA .sp-tab
  // termasuk tombol fase (ber-data-fase, tanpa data-tab) -- kelas active
  // fase yang barusan dipasang renderer langsung dilucuti lagi di sini,
  // pil navy fase tak pernah terlihat. Fase milik spRenderFase_, bar ini
  // hanya mengurus langkahnya.
  document.querySelectorAll("#sp-subtabs .sp-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  // Bar tab v96 satu baris gulung: tab aktif dibawa ke tengah pandangan --
  // tanpa ini, pindah ke tab yang sedang terpotong di tepi terasa "hilang".
  try {
    // dua bar, dua gulungan: tombol FASE aktif dan tombol SUBTAB aktif
    // sama-sama dibawa ke tengah pandangan (v112).
    const btnFase = document.querySelector('#sp-tabs .sp-tab[data-fase="' + window.SP_FASE + '"]');
    if (btnFase && btnFase.scrollIntoView) {
      btnFase.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
    const btnAktif = document.querySelector('#sp-subtabs .sp-tab[data-tab="' + tab + '"]');
    if (btnAktif && btnAktif.scrollIntoView) {
      btnAktif.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  } catch (eTab) { /* browser tua: biarkan */ }
  // Panduan disisipkan saat tab pertama kali dibuka, bukan saat halaman
  // dimuat -- sembilan blok panduan sekaligus di DOM tidak ada gunanya.
  spPasangPanduan_(tab);
  // v156: mode baca-saja dipasang SESUDAH panel terbuka. Isi panel banyak yang
  // dirender belakangan (setelah data tiba), jadi ini diulang di spSegarkanBaca_
  // yang dipanggil renderer -- sekali di sini saja tidak cukup.
  spSegarkanBaca_(tab);
  // ---- Buka-tutup panel: WILDCARD, bukan daftar keras (v105) ----
  // Dulu sembilan getElementById eksplisit -- dan panel KESEPULUH (sp-panel-qc,
  // v103) lupa didaftarkan: kelas hidden-nya tidak pernah dilepas, tab QC
  // tampil kosong walau datanya sudah termuat. Bug kelas "daftar keras yang
  // harus diingat manusia". Sekarang satu aturan untuk semua id sp-panel-*:
  // panel yang lahir kapan pun otomatis ikut, tidak ada lagi yang bisa lupa.
  // Konvensi yang menopangnya: data-tab tombol == akhiran id panelnya.
  // Alias panel (v116): konfpot & konfset adalah DUA PINTU ke SATU panel
  // fisik sp-panel-konf -- subtab yang menentukan modenya, bukan sakelar
  // internal (sakelar lama dipensiunkan, lihat spMuatKonfMode_).
  const SP_PANEL_ALIAS = { konfpot: "konf", konfset: "konf", qcring: "qc", qcpot: "qc", qcjahit: "qc" };
  const idPanelTujuan = "sp-panel-" + (SP_PANEL_ALIAS[tab] || tab);
  document.querySelectorAll("[id^='sp-panel-']").forEach(function (p) {
    p.classList.toggle("hidden", p.id !== idPanelTujuan);
  });
  // Kartu "Pilih PO" cuma relevan untuk dua tab pertama. Tab Konfirmasi
  // melihat semua yang menunggu LINTAS ORDER -- memaksa pilih PO dulu di situ
  // justru membalik cara kepala line bekerja (dia pegang beberapa order).
  const kartuPO = document.getElementById("sp-kartu-po");
  // v107: tab QC memakai kartu PO BERSAMA seperti tab lain -- picker internal
  // bawaan qc.html-lah yang disembunyikan (lihat qcSinkronPOAktif_). Satu
  // halaman satu cara memilih PO.
  // v117: kartu PO tampil juga di konfpot/konfset -- sebagai PENYARING
  // OPSIONAL, bukan syarat. Konfirmasi itu kotak masuk lintas-PO: kosong
  // = tampil semua (orang membukanya justru untuk tahu apa yang menunggu);
  // PO terpilih = daftar tersaring, dengan chip "tampilkan semua" untuk
  // melepas saringan tanpa mengganggu PO aktif tab lain.
  // v156: SOP ikut menyembunyikan kartu PO -- panduan kerja tidak ada
  // hubungannya dengan order mana pun, dan kartu yang tetap tampil di situ
  // mengundang orang mengira SOP-nya berbeda per PO.
  // Tab Orderan ikut menyembunyikan kartu Pilih PO: daftarnya sendiri SUDAH
  // pemilih PO (klik baris = pilih + lompat ke fase kerja). Dua pemilih di
  // satu layar cuma bikin ragu mana yang berlaku.
  // detailorder TIDAK ikut disembunyikan: ia justru butuh PO terpilih, dan
  // kartunya adalah satu-satunya cara mengganti PO tanpa balik ke daftar.
  if (kartuPO) kartuPO.classList.toggle("hidden",
    tab === "riw" || tab === "sop" || tab === "orderan");

  if (tab === "konfpot") { spMuatKonfMode_("potongan"); return; }
  if (tab === "konfset") { spMuatKonfMode_("setoran"); return; }
  if (tab === "pola" || tab === "sampel") { spMuatTahap(tab); return; }
  if (tab === "marker") { spMuatMarker(); spMuatSemuaMarker_(); return; }
  // v181: tiga pintu, satu panel, tahap terkunci per pintu. Pintu Finishing
  // IKUT dikunci -- kalau cuma Potong & Jahit yang terkunci, pintu Finishing
  // masih menampilkan pemilih tahap dan orang bisa mencatat Potong dari sana,
  // menghidupkan lagi kebingungan yang justru mau ditutup.
  if (tab === "qc") { spMuatQC_(); qcSinkronPOAktif_(); qcModeSub_("input"); qcKunciTahap_("Finishing"); return; }
  if (tab === "qcpot") { spMuatQC_(); qcSinkronPOAktif_(); qcModeSub_("input"); qcKunciTahap_("Potong"); return; }
  if (tab === "qcjahit") { spMuatQC_(); qcSinkronPOAktif_(); qcModeSub_("input"); qcKunciTahap_("Jahit"); return; }
  if (tab === "qcring") { spMuatQC_(); qcSinkronPOAktif_(); qcModeSub_("ringkasan"); return; }
  if (tab === "approval") { spMuatApproval_(); return; }
  if (tab === "sop") { spMuatSOP_(); return; }
  if (tab === "orderan") { spRenderOrderan_(); return; }
  if (tab === "detailorder") { spMuatDetailOrder_(); return; }
  // v178: daftar tercatat dimuat SEKALIGUS saat tabnya dibuka, tidak menunggu
  // line/warna dipilih. Koreksi sering dilakukan tanpa niat mencatat apa pun --
  // memaksa mengisi form dulu berarti menyuruh orang menyiapkan input untuk
  // sesuatu yang justru ingin dibatalkannya.
  const jenisTercatat = { cutting: "cutting", bagi: "distribusi", setor: "setoran" }[tab];
  if (jenisTercatat && window.SP_PO_AKTIF) spMuatTercatat_(jenisTercatat);
  if (tab === "keluar") { if (window.SP_PO_AKTIF) spMuatKeluar_(); return; }
  if (tab === "siapkan") { spMuatSiapkan_(); return; }
  if (tab === "spkrekap") { if (!window.SP_PO) spMuatDistribusi(); return; }
  if (tab === "stok") { spMuatStok_(); return; }
  if (tab === "terkirim") { spMuatTerkirim_(); return; }
  if (tab === "gelar") { spMuatGelaran(); return; }
  if (tab === "riw") { spMuatRiwayat(); return; }
  if (tab === "setor") { spMuatLineSetoran_(); spMuatSetoran(); return; }
  if (!window.SP_PO_AKTIF) return;
  if (tab === "cutting" && !window.SP_CUT) spMuatCutting();
  if (tab === "bagi" && !window.SP_PO) spMuatDistribusi();
}

function spMuatCutting() {
  const wadah = document.getElementById("sp-cut-tabel");
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat rincian PO...");
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
      return kepala + '<tr data-artikel="' + rjdEscapeHtml_(b.artikel || "") +
        '" data-style="' + rjdEscapeHtml_(b.style || "") +
        '" data-warna="' + rjdEscapeHtml_(b.warna || "") + '">' +
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
  spTerapkanRecutPending_();   // v183: pemandu re-cut ikut tiap render ulang
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
        // v183: jejak re-cut ikut hanya kalau sesi ini memang lahir dari
        // tombol "Buat re-cut" -- potong biasa tidak membawa apa-apa.
        recutDariQC: (window.SP_RECUT_PENDING && window.SP_RECUT_PENDING.idQC) || "",
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
    // v183: satu jejak untuk satu penyimpanan. Kalau pending tidak dihapus,
    // potongan biasa berikutnya ikut tercap re-cut QC yang sama.
    window.SP_RECUT_PENDING = null;
    spTerapkanRecutPending_();
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

/**
 * v116: mode konfirmasi DITENTUKAN SUBTAB fase (Sewing>Konfirmasi Potongan
 * = potongan; Finishing>Konfirmasi Setoran = setoran). Sakelar internal
 * .sp-konf-tabs dipensiunkan -- disembunyikan di sini, markup dibiarkan
 * (menghapusnya = bedah template; kalau kelak dibongkar, hapus sekalian
 * spSwitchKonf & spTerapkanBagianKonf_ di bawah). Dua navigasi untuk satu
 * pilihan hanya melahirkan keadaan saling bertentangan -- persis yang
 * terjadi: berdiri di "Konfirmasi Potongan" sambil melihat alur setoran.
 */

/* ============================================================
   SIAPKAN POTONGAN -- papan kerja tim loading (v145)
   ============================================================
   Menjawab "hari ini saya harus menyiapkan apa saja". LINTAS PO: kartu Pilih
   PO di atas berlaku sebagai PENYARING OPSIONAL, sama seperti tab Konfirmasi
   (v117) -- kosong berarti tampil semua, karena orang membuka tab ini justru
   untuk tahu apa yang menunggu.

   Tab ini SENGAJA tidak bisa membagi apa pun. Pembagian tetap di subtab
   sebelahnya. Dua pintu untuk satu keputusan adalah sumber kebingungan yang
   pemisahan ini justru dibuat untuk menyelesaikannya.

   Menandai "sudah disiapkan" BUKAN GERBANG: kepala line tetap bisa
   konfirmasi terima walau penandaannya terlewat. Yang hilang cuma jejak
   waktunya, bukan barangnya.
   ============================================================ */

/* ============================================================
 * POTONGAN KELUAR -- potongan yang diambil klien (v150)
 * ============================================================
 * Dua kejadian, satu form:
 *   Set Lengkap -- klien menjahit sendiri (kejar deadline photoshoot)
 *   Panel       -- klien minta panel saja dari potongan yang sudah ada
 *
 * Efek keduanya ke pool sama: sekian pcs tidak akan jadi baju di sini. Yang
 * berbeda cuma keterangannya, dan itu perlu dicatat supaya pertanyaan "kenapa
 * 20 pcs Dusty Pink berkurang" bisa dijawab setahun lagi tanpa menebak.
 *
 * Panel yang DIPOTONG KHUSUS bukan di sini -- itu mode "Panel klien" di tab
 * Gelaran. Kainnya bertambah, potongannya tidak pernah masuk pool.
 *
 * Sisa yang boleh dikeluarkan dihitung BACKEND dengan rumus yang sama persis
 * dengan form pembagian (keduanya mengambil dari pool yang sama), lalu
 * dikurangi lagi dengan yang sudah pernah keluar.
 * ============================================================ */

function spMuatKeluar_() {
  const idPO = window.SP_PO_AKTIF;
  if (!idPO) return;
  const wadah = document.getElementById("sp-keluar-tabel");
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat rincian PO...");
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getPOUntukPotonganKeluar", idPurchaseOrder: idPO })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat rincian PO.") + '</p>';
      return;
    }
    window.SP_KELUAR = d;
    spRenderKeluar_();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

/** Mode terpilih: "Set Lengkap" | "Panel". */
function spKeluarJenis_() {
  const r = document.querySelector('input[name="sp-keluar-jenis"]:checked');
  return (r && r.value) ? r.value : "Set Lengkap";
}

function spUbahJenisKeluar_() {
  const panel = spKeluarJenis_() === "Panel";
  const blok = document.getElementById("sp-keluar-panel-blok");
  if (blok) blok.classList.toggle("hidden", !panel);
  document.querySelectorAll("#sp-keluar-mode .sp-mode-opsi").forEach(function (el) {
    const inp = el.querySelector("input");
    el.classList.toggle("aktif", !!(inp && inp.checked));
  });
}

function spRenderKeluar_() {
  const po = window.SP_KELUAR;
  const wadah = document.getElementById("sp-keluar-tabel");
  if (!po || !wadah) return;

  // Kolom size yang benar-benar dipakai PO ini saja.
  const dipakai = {};
  (po.baris || []).forEach(function (b) {
    Object.keys(b.sizeQty || {}).forEach(function (sz) { dipakai[sz] = true; });
  });
  const kolom = (po.sizeKolom || []).filter(function (sz) { return dipakai[sz]; });
  window.SP_KELUAR_KOLOM = kolom;

  wadah.innerHTML =
    '<div class="sp-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Artikel / Warna</th>' +
      kolom.map(function (sz) { return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="num">Total</th>' +
    '</tr></thead><tbody>' +
    (po.baris || []).map(function (b, i, semua) {
      const habis = b.totalSisa <= 0;
      const kunciItem = [b.artikel, b.style].filter(Boolean).join(" / ") || "(tanpa nama)";
      const kunciSebelum = i > 0
        ? ([semua[i-1].artikel, semua[i-1].style].filter(Boolean).join(" / ") || "(tanpa nama)")
        : null;
      let kepala = "";
      if (kunciItem !== kunciSebelum) {
        let sisaItem = 0, keluarItem = 0;
        semua.forEach(function (x) {
          const k = [x.artikel, x.style].filter(Boolean).join(" / ") || "(tanpa nama)";
          if (k !== kunciItem) return;
          sisaItem += (x.totalSisa > 0 ? x.totalSisa : 0);
          keluarItem += (x.totalSudahKeluar || 0);
        });
        kepala = '<tr class="sp-grup-item"><td colspan="' + (kolom.length + 2) + '">' +
          rjdEscapeHtml_(kunciItem) +
          '<span class="sp-grup-sisa">tersedia ' + sisaItem + ' pcs' +
          (keluarItem ? ' \u00b7 sudah keluar ' + keluarItem : '') + '</span></td></tr>';
      }
      return kepala + '<tr' + (habis ? ' class="sp-habis"' : '') + '>' +
        '<td><div class="sp-warna">' + rjdEscapeHtml_(b.warna || "-") + '</div>' +
          '<div class="sp-sisa-info">' + (habis ? 'tidak ada yang tersedia'
            : ('tersedia ' + b.totalSisa + ' pcs')) +
          ((b.totalSudahKeluar || 0) ? ' \u00b7 keluar ' + b.totalSudahKeluar : '') +
          '</div></td>' +
        kolom.map(function (sz) {
          const order = b.sizeQty[sz] || 0;
          const sisa = b.sisa[sz] === undefined ? 0 : b.sisa[sz];
          if (!order) return '<td class="num sp-kosong">&#183;</td>';
          if (sisa <= 0) return '<td class="num sp-kosong" title="tidak ada yang tersedia">0</td>';
          return '<td class="num"><input class="sp-keluar-qty" type="number" min="0" max="' + sisa + '"' +
            ' data-baris="' + i + '" data-size="' + rjdEscapeHtml_(sz) + '"' +
            ' oninput="spHitungKeluar_()" placeholder="0"/>' +
            '<div class="sp-maks">/' + sisa + '</div></td>';
        }).join("") +
        '<td class="num sp-total-baris" id="sp-keluar-tot-' + i + '">0</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';

  // Tanggal default hari ini
  const t = new Date();
  const inp = document.getElementById("sp-keluar-tanggal");
  if (inp && !inp.value) {
    inp.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") +
      "-" + String(t.getDate()).padStart(2, "0");
  }
  spRenderRiwayatKeluar_();
  spUbahJenisKeluar_();
  spHitungKeluar_();
}

function spRenderRiwayatKeluar_() {
  const po = window.SP_KELUAR;
  const el = document.getElementById("sp-keluar-riwayat");
  if (!el) return;
  const riw = (po && po.riwayatKeluar) || [];
  if (!riw.length) {
    el.innerHTML = '<p class="sp-info">Belum ada potongan yang keluar untuk PO ini.</p>';
    return;
  }
  // Dikelompokkan per NOMOR SURAT JALAN -- satu serah-terima ke klien bisa
  // berisi beberapa warna, dan yang dibatalkan orang adalah serahannya,
  // bukan barisnya satu per satu.
  const perSJ = {};
  riw.forEach(function (b) {
    const k = b.noSuratJalan || "(tanpa nomor)";
    if (!perSJ[k]) perSJ[k] = [];
    perSJ[k].push(b);
  });
  el.innerHTML = '<div class="sp-ringkas-judul">Sudah keluar (' + po.totalKeluar + ' pcs)</div>' +
    Object.keys(perSJ).map(function (sj) {
      const grup = perSJ[sj];
      const g0 = grup[0];
      let tot = 0;
      grup.forEach(function (x) { tot += x.totalQty || 0; });
      return '<div class="sp-keluar-kartu">' +
        '<div class="sp-keluar-kepala">' +
          // v153: nomornya jadi TAUTAN CETAK. Dokumennya bukan surat jalan
          // biasa -- isinya potongan, bukan barang jadi, dan halaman cetak
          // menuliskannya terang-terangan supaya penerima tidak salah kira.
          '<b>' + spTombolDok_("sp-tautan sp-tautan-btn", rjdEscapeHtml_(sj),
            "/p/cetak.html?jenis=sjpotongan&id=" + encodeURIComponent(sj),
            "Surat Jalan Potongan " + sj, tot + " pcs \u00b7 " + (g0.jenisKeluar || "")) + '</b>' +
          '<span>' + rjdEscapeHtml_(g0.jenisKeluar || "") +
            (g0.komponen ? ' \u00b7 ' + rjdEscapeHtml_(g0.komponen) : '') + '</span>' +
          '<b class="sp-keluar-qty-total">' + tot + ' pcs</b>' +
        '</div>' +
        '<div class="sp-keluar-meta">' +
          rjdEscapeHtml_(g0.tanggal || "") +
          (g0.diambilOleh ? ' \u00b7 diambil ' + rjdEscapeHtml_(g0.diambilOleh) : '') +
          (g0.keperluan ? ' \u00b7 ' + rjdEscapeHtml_(g0.keperluan) : '') +
        '</div>' +
        grup.map(function (x) {
          const per = Object.keys(x.sizeQty || {}).map(function (sz) {
            return rjdEscapeHtml_(sz) + " " + x.sizeQty[sz];
          }).join("  ");
          return '<div class="sp-keluar-baris">' +
            '<span>' + rjdEscapeHtml_(x.warna || "-") +
              ' <small>' + rjdEscapeHtml_(per) + '</small></span>' +
            '<button class="sp-btn-kecil" onclick="spBatalKeluar_(\'' +
              rjdEscapeHtml_(x.idKeluar) + '\')" type="button">Batalkan</button>' +
          '</div>';
        }).join("") +
      '</div>';
    }).join("");
}

function spHitungKeluar_() {
  const perBaris = {};
  let total = 0;
  document.querySelectorAll(".sp-keluar-qty").forEach(function (inp) {
    const i = inp.dataset.baris;
    const v = Number(inp.value) || 0;
    const maks = Number(inp.max) || 0;
    // Ditandai di layar; backend tetap menolak juga (pengaman berlapis).
    inp.classList.toggle("sp-lebih", v > maks);
    perBaris[i] = (perBaris[i] || 0) + v;
    total += v;
  });
  ((window.SP_KELUAR && window.SP_KELUAR.baris) || []).forEach(function (b, i) {
    const el = document.getElementById("sp-keluar-tot-" + i);
    if (el) el.textContent = perBaris[i] || 0;
  });
  const tot = document.getElementById("sp-keluar-total");
  if (tot) tot.textContent = total;
  const btn = document.getElementById("sp-keluar-simpan");
  if (btn) btn.disabled = total <= 0;
}

function spSimpanKeluar_() {
  const po = window.SP_KELUAR;
  if (!po) return;
  const jenis = spKeluarJenis_();
  const diambil = (document.getElementById("sp-keluar-diambil") || {}).value || "";
  const komponen = (document.getElementById("sp-keluar-komponen") || {}).value || "";
  if (!String(diambil).trim()) {
    alert("Nama yang mengambil wajib diisi.\n\nIni bukti serah-terima ke klien."); return;
  }
  if (jenis === "Panel" && !String(komponen).trim()) {
    alert("Panel yang diambil wajib diisi.\n\nMisal: Badan Depan, Lengan."); return;
  }

  // Rakit per baris warna, hanya yang berisi.
  const perBaris = {};
  document.querySelectorAll(".sp-keluar-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v <= 0) return;
    const i = inp.dataset.baris;
    if (!perBaris[i]) perBaris[i] = {};
    perBaris[i][inp.dataset.size] = v;
  });
  const baris = Object.keys(perBaris).map(function (i) {
    const b = po.baris[i];
    return {
      noSO: b.noSO || "", brand: b.brand || "", artikel: b.artikel || "",
      style: b.style || "", warna: b.warna || "",
      detailAllSize: b.detailAllSize || "", sizeQty: perBaris[i]
    };
  });
  if (!baris.length) { alert("Belum ada qty yang diisi."); return; }

  let total = 0;
  baris.forEach(function (b) {
    Object.keys(b.sizeQty).forEach(function (sz) { total += b.sizeQty[sz]; });
  });
  if (!confirm("Catat " + total + " pcs keluar sebagai " + jenis + "?\n\n" +
      "Potongan ini TIDAK akan kembali jadi baju di sini: jumlah yang bisa " +
      "dibagi ke line dan yang bisa dikirim ikut berkurang.")) return;

  const btn = document.getElementById("sp-keluar-simpan");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "simpanPotonganKeluar",
      payload: {
        idPurchaseOrder: po.idPurchaseOrder,
        jenisKeluar: jenis,
        komponen: komponen,
        diambilOleh: diambil,
        keperluan: (document.getElementById("sp-keluar-keperluan") || {}).value || "",
        tanggal: (document.getElementById("sp-keluar-tanggal") || {}).value || "",
        catatan: (document.getElementById("sp-keluar-catatan") || {}).value || "",
        baris: baris
      }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    btn.disabled = false;
    btn.textContent = "Simpan Potongan Keluar";
    if (!d || !d.success) { alert((d && d.error) || "Gagal menyimpan."); return; }
    alert("Tercatat: " + d.totalQty + " pcs keluar.\nNomor surat jalan: " + d.noSuratJalan);
    // PO aktif dimuat ulang: sisa di tab Bagi ke Line ikut berubah, dan
    // membiarkan angka lama di layar adalah cara termudah membuat orang
    // membagi barang yang sudah tidak ada.
    window.SP_PO = null;
    spMuatKeluar_();
  })
  .catch(function (e) {
    btn.disabled = false;
    btn.textContent = "Simpan Potongan Keluar";
    alert(String(e));
  });
}

function spBatalKeluar_(idKeluar) {
  if (!confirm("Batalkan baris " + idKeluar + "?\n\n" +
      "Barisnya tidak dihapus \u2014 statusnya jadi Dibatalkan, dan potongannya " +
      "kembali dihitung tersedia.")) return;
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "batalkanPotonganKeluar", idKeluar: idKeluar })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) { alert((d && d.error) || "Gagal membatalkan."); return; }
    window.SP_PO = null;
    spMuatKeluar_();
  })
  .catch(function (e) { alert(String(e)); });
}

/**
 * Tab SOP (v156). Isinya dirender oleh simpro-sop.js -- berkas yang sama
 * dengan halaman /p/sop.html, jadi tidak ada dua versi SOP yang bisa berbeda.
 *
 * Kalau berkasnya belum dimuat (template belum diperbarui, atau jsDelivr
 * bermasalah), tabnya memberi tahu apa adanya dan menawarkan halaman
 * terpisahnya -- bukan panel kosong yang terbaca seperti fitur rusak.
 */
/* ============================================================
 * TAB ORDERAN BERJALAN (v157)
 * ============================================================
 * Menjawab keluhan tim saat uji coba: tiap tab meminta nomor PO, tapi tidak
 * ada tempat melihat order mana yang sedang berjalan.
 *
 * Datanya SUDAH ADA di memori (SP_DAFTAR_PO, dimuat sekali untuk kotak Pilih
 * PO). Tab ini cuma menampilkannya utuh -- tidak ada rute baru, tidak ada
 * fetch tambahan, dan tidak ada harga karena getDaftarPO memang tidak pernah
 * mengirimkannya ke halaman produksi.
 *
 * Klik baris = pilih PO DAN langsung lompat ke fase kerja orang itu. Itu
 * gunanya tab ini: bukan sekadar melihat, tapi jalan masuk ke pekerjaan.
 * ============================================================ */

/** Sisa hari ke deadline. null kalau tanggalnya tidak terbaca. */
function spSisaHari_(iso) {
  if (!iso) return null;
  const t = new Date(String(iso) + "T00:00:00");
  if (isNaN(t.getTime())) return null;
  const kini = new Date();
  return Math.round((t.getTime() - kini.setHours(0, 0, 0, 0)) / 86400000);
}

function spOrderanCari_() {
  spRenderOrderan_();
}

/**
 * v158: filter status menggantikan sakelar "tampilkan Selesai".
 * "berjalan" | "selesai" | "batal" | "semua"
 */
function spOrderanFilter_(nilai) {
  window.SP_ORD_STATUS = nilai || "berjalan";
  spRenderOrderan_();
}

/** v158: "baru" (tanggal pesanan terbaru) | "deadline" (terdekat). */
function spOrderanUrut_(nilai) {
  window.SP_ORD_URUT = nilai || "baru";
  spRenderOrderan_();
}

/**
 * Klik baris: pilih PO, lalu buka DETAIL ORDER-nya.
 *
 * v161 memperbaiki dua hal sekaligus.
 *
 * (a) Perilakunya salah sasaran. Versi v157 melompat ke "fase kerja" orang
 *     ini, dengan anggapan yang mengklik sudah tahu ordernya apa dan tinggal
 *     mengerjakan. Nyatanya sebaliknya: orang mengklik justru untuk TAHU --
 *     ordernya apa, warnanya apa, standar kliennya bagaimana. Melempar dia
 *     ke form kosong menjawab pertanyaan yang tidak diajukan.
 *
 * (b) Pencariannya cacat untuk peran FULL/ADMIN. "Fase pertama yang boleh
 *     diisi" hanya bermakna kalau bagiannya sempit; bagi yang boleh mengisi
 *     semuanya, fase pertama selalu Pola & Marker -- dan itulah yang terjadi
 *     di layar. Bug ini tidak akan pernah terlihat oleh staf berbagian
 *     tunggal, jadi bisa bertahan lama tanpa ada yang melaporkannya.
 *
 * Detail Order tidak punya masalah itu: ia sama benarnya untuk semua peran.
 */
function spOrderanPilih_(idPO) {
  spPilihPO(idPO);
  spSwitchTab("detailorder");
}

/* [DIHAPUS v161] spLihatDetailOrder_ -- klik baris sendiri sekarang membuka
   Detail Order, jadi fungsi ini tidak punya pemanggil lagi. Dibuang, bukan
   ditinggalkan: fungsi tanpa pemanggil membuat pembaca berikutnya mencari-cari
   dari mana ia dipakai. */

function spRenderOrderan_() {
  const panel = document.getElementById("sp-panel-orderan");
  if (!panel) return;
  const aktif = window.SP_DAFTAR_PO || [];
  const selesai = window.SP_DAFTAR_PO_SELESAI || [];

  // Tiga keadaan, tiga kalimat berbeda -- bukan satu kalimat untuk semuanya.
  const st = window.SP_PO_STATUS || "memuat";
  if (st === "memuat") {
    // v166: <span/> DIGANTI <span></span>.
    //
    // Penulisan self-closing itu sah di XML (template Blogger memang menuntut
    // begitu), tapi HTML tidak mengenalnya untuk elemen non-void. Browser
    // membaca '<span class="x"/>' sebagai span yang TIDAK PERNAH DITUTUP,
    // jadi teks sesudahnya masuk ke dalam span -- dan ikut kena
    // animation: rotate(360deg). Hasilnya kalimat "Memuat daftar order..."
    // berputar seperti baling-baling kipas.
    //
    // Kebiasaan menulis XML terbawa ke string HTML adalah jebakan yang wajar
    // di proyek ini: template .xml dan innerHTML JS ditulis berselang-seling
    // sepanjang hari, dan keduanya TIDAK memakai aturan yang sama.
    panel.innerHTML = '<div class="sp-card">' +
      spMuatHtml_("Memuat daftar order...") + '</div>';
    return;
  }
  if (st === "galat") {
    panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
      rjdEscapeHtml_(window.SP_PO_GALAT || "Gagal memuat daftar order.") + '</p>' +
      '<p class="sp-info"><a href="#" onclick="spMuatDaftarPO();return false;">Coba lagi</a> ' +
      '&#8212; tanpa perlu memuat ulang seluruh halaman.</p></div>';
    return;
  }
  if (!aktif.length && !selesai.length) {
    panel.innerHTML = '<div class="sp-card"><p class="sp-info">Belum ada order sama sekali ' +
      'di sistem.</p></div>';
    return;
  }

  const q = String((document.getElementById("sp-ord-cari") || {}).value || "")
    .trim().toLowerCase();
  const status = window.SP_ORD_STATUS || "berjalan";
  const urut = window.SP_ORD_URUT || "baru";
  const batal = window.SP_DAFTAR_PO_BATAL || [];

  const tandai_ = function (arr, kunci) {
    return arr.map(function (p) {
      const o = Object.assign({}, p);
      o[kunci] = true;
      return o;
    });
  };
  let sumber;
  if (status === "selesai") sumber = tandai_(selesai, "spSelesai");
  else if (status === "batal") sumber = tandai_(batal, "spBatal");
  else if (status === "semua") {
    sumber = aktif.concat(tandai_(selesai, "spSelesai")).concat(tandai_(batal, "spBatal"));
  } else sumber = aktif;

  const baris = sumber.filter(function (p) {
    if (!q) return true;
    return [p.idPurchaseOrder, p.noSO, p.namaKlien, (p.artikel || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  });

  // v158: default TERBARU DI ATAS. Yang dicari orang di lantai hampir selalu
  // order yang baru masuk -- itu yang belum hafal nomornya. Urutan deadline
  // tetap tersedia karena berguna untuk pertanyaan yang berbeda ("mana yang
  // harus dikejar duluan"), tapi bukan pertanyaan yang membawa orang ke sini.
  //
  // Tanpa tanggal selalu ke BAWAH di kedua mode -- bukan dianggap paling baru
  // atau paling mendesak hanya karena datanya kosong.
  baris.sort(function (a, b) {
    if (urut === "deadline") {
      const sa = spSisaHari_(a.deadlineIso), sb = spSisaHari_(b.deadlineIso);
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa - sb;
    }
    const ta = String(a.tanggalPesananIso || ""), tb = String(b.tanggalPesananIso || "");
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return tb.localeCompare(ta);   // terbaru dulu
  });

  // Ringkasan SELALU dari kelompok berjalan, tidak ikut berubah saat filter
  // digeser ke Selesai/Batal: "berapa yang sedang dikerjakan" adalah angka
  // yang sama sepanjang hari, dan angka ringkasan yang berubah-ubah mengikuti
  // filter membuat orang mengira jumlah ordernya berubah.
  let totalPcs = 0, mendesak = 0, lewat = 0;
  aktif.forEach(function (p) {
    totalPcs += p.jumlah || 0;
    const s = spSisaHari_(p.deadlineIso);
    if (s === null) return;
    if (s < 0) lewat++; else if (s <= 7) mendesak++;
  });

  panel.innerHTML =
    '<div class="sp-card">' +
      '<h3 class="sp-judul">Orderan Berjalan</h3>' +
      '<p class="sp-info">Semua order yang belum Selesai, deadline terdekat di atas. ' +
        'Klik satu baris untuk langsung mengerjakannya \u2014 PO-nya terpilih dan ' +
        'halaman pindah ke tahap kerjamu.</p>' +

      '<div class="sp-siap-ringkas">' +
        '<div class="sp-siap-kotak"><span>Order berjalan</span><b>' + aktif.length + '</b></div>' +
        '<div class="sp-siap-kotak"><span>Total pcs</span><b>' + totalPcs.toLocaleString("id-ID") + '</b></div>' +
        '<div class="sp-siap-kotak"><span>Deadline &#8804; 7 hari</span><b>' + mendesak +
          (lewat ? ' <small style="font-size:11px;color:#8F2C22">+' + lewat + ' lewat</small>' : '') +
          '</b></div>' +
      '</div>' +

      '<div class="sp-ord-alat">' +
        '<input id="sp-ord-cari" oninput="spOrderanCari_()" placeholder="Cari PO, No SO, klien, atau artikel..." ' +
          'type="text" value="' + rjdEscapeHtml_(q) + '"/>' +
        '<select onchange="spOrderanFilter_(this.value)" title="Status order">' +
          [["berjalan", "Berjalan"], ["selesai", "Selesai"], ["batal", "Dibatalkan"], ["semua", "Semua"]]
            .map(function (o) {
              return '<option value="' + o[0] + '"' +
                (status === o[0] ? ' selected="selected"' : '') + '>' + o[1] + '</option>';
            }).join("") +
        '</select>' +
        '<select onchange="spOrderanUrut_(this.value)" title="Urutan">' +
          [["baru", "Terbaru dulu"], ["deadline", "Deadline terdekat"]].map(function (o) {
            return '<option value="' + o[0] + '"' +
              (urut === o[0] ? ' selected="selected"' : '') + '>' + o[1] + '</option>';
          }).join("") +
        '</select>' +
      '</div>' +

      (baris.length
        // v159: sp-tabel-kartu -- di bawah 760px tabel berubah jadi kartu,
        // satu order satu kartu. Enam kolom di HP membuat tiap kolom
        // selebar dua-tiga huruf: "260819/Khoi ro Ummah" terpotong di
        // tengah kata, dan satu baris jadi setinggi layar.
        ? '<div class="sp-tabelwrap"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
            '<th>PO / Klien</th><th>Artikel</th><th class="num">Qty</th>' +
            // <th></th>, bukan <th/> -- alasan sama dengan spinner di atas.
            // Di sini akibatnya kebetulan tidak terlihat karena </tr> tepat
            // sesudahnya memaksa browser menutupnya, tapi bergantung pada
            // penyelamatan tak sengaja bukan cara menulis markup.
            '<th>Masuk</th><th>Deadline</th><th>Tahap</th><th></th>' +
          '</tr></thead><tbody>' +
          baris.map(function (p) {
            const sisa = spSisaHari_(p.deadlineIso);
            let tandaDl = "";
            if (!p.spSelesai && !p.spBatal && sisa !== null) {
              if (sisa < 0) tandaDl = '<span class="sp-ord-lewat">' + Math.abs(sisa) + ' hari lewat</span>';
              else if (sisa <= 7) tandaDl = '<span class="sp-ord-dekat">' + sisa + ' hari lagi</span>';
            }
            // Artikel dipangkas: satu order seragam bisa punya 4-5 artikel,
            // dan menulis semuanya membuat satu baris setinggi layar tanpa
            // menambah keputusan apa pun. Sisanya tetap bisa dicari lewat
            // kotak pencarian -- yang menyaring daftar LENGKAP, bukan yang
            // tampil.
            const daftarArt = p.artikel || [];
            const art = daftarArt.slice(0, 2).map(rjdEscapeHtml_).join(", ") +
              (daftarArt.length > 2 ? ' <span class="sp-ord-lebih">+' +
                (daftarArt.length - 2) + ' lainnya</span>' : '');
            return '<tr class="sp-ord-baris' +
              (p.spSelesai || p.spBatal ? ' sp-ord-selesai' : '') + '" ' +
              'onclick="spOrderanPilih_(\'' + rjdEscapeHtml_(p.idPurchaseOrder) + '\')">' +
              '<td data-label="Order"><b>' + rjdEscapeHtml_(p.idPurchaseOrder) + '</b>' +
                (p.spSelesai ? ' <span class="sp-riw-kunci">Selesai</span>' : '') +
                (p.spBatal ? ' <span class="sp-tag-batal">DIBATALKAN</span>' : '') +
                '<div class="sp-gelar-size">' + rjdEscapeHtml_(p.namaKlien || "-") +
                (p.noSO ? ' \u00b7 ' + rjdEscapeHtml_(p.noSO) : '') + '</div></td>' +
              // art sudah memuat markup (span "+N lainnya"), jadi bagian
              // teksnya di-escape saat dirakit -- bukan di sini.
              '<td data-label="Artikel">' + (daftarArt.length
                ? art : '<span class="sp-kosong">&#183;</span>') + '</td>' +
              '<td class="num" data-label="Qty">' + (p.jumlah || 0) + '</td>' +
              // Tanggal masuk ditampilkan karena jadi dasar urutan default --
              // urutan yang dasarnya tak terlihat bikin orang mengira acak.
              '<td data-label="Masuk">' + rjdEscapeHtml_(p.tanggalPesanan || "-") + '</td>' +
              '<td data-label="Deadline">' + rjdEscapeHtml_(p.deadline || "-") +
                (tandaDl ? ' ' + tandaDl : '') + '</td>' +
              '<td data-label="Tahap">' + (p.tahap
                ? rjdEscapeHtml_(p.tahap)
                : '<span class="sp-kosong">belum mulai</span>') + '</td>' +
              // v161: tombol "Detail" DIBUANG. Setelah klik baris sendiri
              // membuka detail, tombol itu cuma target kedua untuk aksi yang
              // sama -- dan tombol yang mengulang perilaku barisnya membuat
              // orang ragu apakah keduanya berbeda. Diganti tanda panah:
              // penunjuk arah, bukan tombol.
              '<td data-label="" class="sp-td-aksi sp-ord-panah">&#8250;</td>' +
            '</tr>';
          }).join("") +
          '</tbody></table></div>'
        : '<p class="sp-info">Tidak ada order yang cocok dengan pencarian.</p>') +
    '</div>';

  // Fokus dikembalikan ke kotak cari supaya mengetik tidak terputus tiap
  // ketukan -- panel dirender ulang penuh setiap huruf.
  const inp = document.getElementById("sp-ord-cari");
  if (inp && q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
}

/* ============================================================
 * DETAIL ORDER (v160)
 * ============================================================
 * Isi SPK produksi, dibaca di layar tanpa harus mencetak.
 *
 * Menjawab pertanyaan yang selama ini dijawab dengan mencetak lembar SPK lalu
 * mencarinya lagi di tumpukan: warna apa saja, size berapa, standar klien
 * apa, catatan apa yang menempel di item ini. Semua itu sudah diinput lewat
 * Form Order dan tidak pernah bisa dilihat lagi dari lantai.
 *
 * Memakai rute getSPKCetak yang SUDAH ADA: fungsinya menerima ID Order
 * Request MAUPUN ID Purchase Order (jatuh ke getSPKDariPurchaseOrder_ kalau
 * tidak ketemu sebagai Order Request). Nol rute baru.
 *
 * NOL DATA HARGA, dan itu bukan kebetulan: payload SPK memang dirancang
 * tanpa harga sejak awal ("bahan: []" di tiap warna) karena dokumennya
 * dipegang lantai produksi. Jadi tab ini aman dibuka semua bagian tanpa
 * filter apa pun.
 * ============================================================ */

function spMuatDetailOrder_() {
  const panel = document.getElementById("sp-panel-detailorder");
  if (!panel) return;
  const idPO = window.SP_PO_AKTIF;
  if (!idPO) {
    panel.innerHTML = '<div class="sp-card"><h3 class="sp-judul">Detail Order</h3>' +
      '<p class="sp-info">Pilih Purchase Order dulu &#8212; atau klik salah satu order ' +
      'di subtab <b>Orderan Berjalan</b>.</p></div>';
    return;
  }
  if (window.SP_DETAIL_PO === idPO && window.SP_DETAIL) { spRenderDetailOrder_(); return; }

  panel.innerHTML = '<div class="sp-card">' + spMuatHtml_("Memuat detail order...") + '</div>';
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getSPKCetak", id: idPO })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat detail order.") + '</p></div>';
      return;
    }
    window.SP_DETAIL = d.data || d;
    window.SP_DETAIL_PO = idPO;
    spRenderDetailOrder_();
  })
  .catch(function () {
    panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
      'Gagal menghubungi server.</p></div>';
  });
}

/** Tabel warna x size untuk satu item. */
function spDetailTabelItem_(it) {
  const kolom = it.sizeColumns || [];
  const adaNonStandar = (it.warnaList || []).some(function (w) {
    return w.detailAllSizeParsed && w.detailAllSizeParsed.length;
  });
  // v162: TETAP TABEL di layar sempit, tidak berubah jadi kartu.
  //
  // Kartu masuk akal untuk tabel berkolom banyak dan berteks panjang (daftar
  // order). Di sini kebalikannya: kolomnya sedikit dan isinya angka pendek,
  // jadi satu kartu per warna memakan empat baris untuk menyampaikan "Brown
  // S 28 M 29" -- sepuluh warna jadi empat puluh baris yang harus digulung,
  // padahal seluruhnya muat dalam satu tabel yang digeser sedikit.
  //
  // Membandingkan qty antar warna juga cuma mungkin kalau angkanya sekolom.
  return '<div class="sp-tabelwrap sp-det-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Warna</th>' +
      kolom.map(function (sz) { return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      (adaNonStandar ? '<th>Size lain</th>' : '') +
      '<th class="num">Total</th>' +
    '</tr></thead><tbody>' +
    (it.warnaList || []).map(function (w) {
      const lain = (w.detailAllSizeParsed || []).map(function (x) {
        return rjdEscapeHtml_(x.label || x.size || "") + " " + (x.qty || 0);
      }).join(", ");
      return '<tr>' +
        '<td data-label="Warna"><b>' + rjdEscapeHtml_(w.warna || "-") + '</b></td>' +
        kolom.map(function (sz) {
          const v = (w.sizeQty || {})[sz] || 0;
          return '<td class="num" data-label="' + rjdEscapeHtml_(sz) + '">' +
            (v ? v : '<span class="sp-kosong">&#183;</span>') + '</td>';
        }).join("") +
        (adaNonStandar ? '<td data-label="Size lain">' +
          (lain || '<span class="sp-kosong">&#183;</span>') + '</td>' : '') +
        '<td class="num" data-label="Total"><b>' + (w.totalQtyWarna || 0) + '</b></td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';
}

function spRenderDetailOrder_() {
  const d = window.SP_DETAIL;
  const panel = document.getElementById("sp-panel-detailorder");
  if (!d || !panel) return;

  const baris_ = function (label, isi) {
    if (!isi) return "";
    return '<div class="sp-det-baris"><span>' + label + '</span><b>' + isi + '</b></div>';
  };

  // Jadwal kirim bertahap: yang penting bagi lantai adalah TANGGAL dan QTY-nya,
  // bukan bahwa jadwalnya ada. Kalau cuma satu tahap, tidak ditampilkan --
  // target kirim di atas sudah menjawab.
  const jadwal = (d.jadwalKirim || []).length > 1
    ? '<div class="sp-det-blok"><h4>Jadwal kirim bertahap</h4>' +
      '<ul class="sp-det-list">' + d.jadwalKirim.map(function (j) {
        return '<li><b>' + rjdEscapeHtml_(j.tanggal || j.tanggalKirim || "-") + '</b> &#183; ' +
          (j.qty || j.jumlah || 0) + ' pcs' +
          (j.catatan ? ' <span>' + rjdEscapeHtml_(j.catatan) + '</span>' : '') + '</li>';
      }).join("") + '</ul></div>'
    : "";

  const items = (d.itemGroups || []).map(function (it, i) {
    const nama = [it.artikel, it.style].filter(String).join(" / ") || "(tanpa nama)";
    return '<div class="sp-det-item">' +
      '<div class="sp-det-item-kepala">' +
        '<h4>' + rjdEscapeHtml_(nama) + '</h4>' +
        '<span>' + (it.brand ? rjdEscapeHtml_(it.brand) + ' &#183; ' : '') +
          (it.totalQtyItem || 0) + ' pcs</span>' +
      '</div>' +
      // Catatan & gambar melekat pada ITEM, bukan order -- itu sebabnya
      // ditampilkan di sini, bukan digabung ke catatan umum di bawah.
      // v162: catatan ditampilkan APA ADANYA termasuk baris barunya (kelas
      // sp-det-pre -> white-space: pre-wrap). Isi catatan hampir selalu
      // spesifikasi bernomor ("1. Panjang depan 160cm  2. Panjang tali...")
      // yang di Form Order diketik satu baris per poin. Diratakan jadi satu
      // paragraf, poin-poinnya menyatu dan orang harus membacanya berulang
      // untuk memisahkan mana ukuran mana -- padahal ini justru bagian yang
      // paling tidak boleh salah baca.
      //
      // Tanda kutip DIBUANG: pada teks bernomor multi-baris ia tidak lagi
      // menandai kutipan, cuma menambah karakter di awal angka.
      (it.catatanOrder ? '<p class="sp-det-catatan sp-det-pre">' +
        rjdEscapeHtml_(it.catatanOrder) + '</p>' : '') +
      ((it.kainArtikel && it.kainArtikel.length)
        ? '<p class="sp-det-kain"><b>Kain:</b> ' +
          it.kainArtikel.map(function (k) {
            return rjdEscapeHtml_(k.nama || k.jenis || k);
          }).join(", ") + '</p>'
        : '<p class="sp-det-kain sp-det-kain-kosong">Kain belum tercatat untuk item ini.</p>') +
      spDetailTabelItem_(it) +
      ((it.gambarOrder || it.scOrder) ? '<div class="sp-det-thumb-grid">' +
        spThumbLampiran_(it.gambarOrder, "Gambar model") +
        spThumbLampiran_(it.scOrder, "Size chart") +
      '</div>' : '') +
    '</div>';
  }).join("");

  const lampiran = (d.urlFileLainnya || []).length
    ? '<div class="sp-det-blok"><h4>Lampiran</h4><div class="sp-det-thumb-grid">' +
      d.urlFileLainnya.map(function (u, i) {
        return spThumbLampiran_(u, "Berkas " + (i + 1));
      }).join("") + '</div></div>'
    : "";

  panel.innerHTML =
    '<div class="sp-card">' +
      '<h3 class="sp-judul">Detail Order</h3>' +
      (d.isDraft
        ? '<div class="sp-baca-banner"><b>Order ini belum disetujui.</b> ' +
          'Isinya masih bisa berubah &#8212; jangan dijadikan dasar memotong kain.</div>'
        : '') +

      '<div class="sp-det-kepala">' +
        baris_("Purchase Order", rjdEscapeHtml_(d.idPurchaseOrderHasil || window.SP_PO_AKTIF || "-")) +
        baris_("No SO", rjdEscapeHtml_(d.noSOHasil || "-")) +
        baris_("Klien", rjdEscapeHtml_(d.namaKlien || "-")) +
        baris_("Masuk", rjdEscapeHtml_(d.tanggalDiajukan || "-")) +
        baris_("Target kirim", rjdEscapeHtml_(d.targetTanggalKirim || "-")) +
        baris_("Total", (d.totalQtyKeseluruhan || 0) + " pcs") +
      '</div>' +

      // Standar klien & asal kain ditaruh DI ATAS rincian item: keduanya
      // mengubah cara seluruh order dikerjakan, jadi harus terbaca sebelum
      // orang tenggelam di angka size.
      // v162: standarKlien adalah OBJEK { url, catatan } dari profil-klien.gs,
      // bukan teks. Versi v160 merendernya langsung sehingga layar menampilkan
      // "[object Object]" -- kesalahan yang tidak akan pernah dilaporkan
      // sebagai bug oleh orang lantai; mereka cuma menganggap bagian itu rusak
      // lalu berhenti membacanya.
      //
      // Isinya standar TETAP klien (mis. "jahitan rantai, label di dalam"),
      // berlaku untuk semua ordernya -- itu sebabnya disimpan di profil klien,
      // bukan per order.
      (function () {
        const sk = d.standarKlien;
        if (!sk) return "";
        const catatan = (typeof sk === "string") ? sk : String(sk.catatan || "");
        const url = (typeof sk === "string") ? "" : String(sk.url || "");
        if (!catatan && !url) return "";
        return '<div class="sp-det-blok sp-det-standar"><h4>Standar klien</h4>' +
          (catatan ? '<p class="sp-det-pre">' + rjdEscapeHtml_(catatan) + '</p>' : '') +
          (url ? '<div class="sp-det-tautan"><a href="' + rjdEscapeHtml_(url) +
            '" target="_blank">Buka dokumen standar</a></div>' : '') +
          '</div>';
      })() +
      (d.kainDariKlien
        ? '<div class="sp-det-blok sp-det-standar"><h4>Kain dari klien</h4>' +
          '<p>Kain disediakan klien. Kekurangan kain bukan tanggung jawab RJD &#8212; ' +
          'catat pemakaian apa adanya supaya ada dasar saat ditanyakan.</p></div>'
        : '') +

      jadwal +

      '<div class="sp-det-blok"><h4>Rincian item (' + (d.itemGroups || []).length + ')</h4>' +
        (items || '<p class="sp-info">Belum ada rincian item.</p>') +
      '</div>' +

      (d.catatanKlien ? '<div class="sp-det-blok"><h4>Catatan klien</h4>' +
        '<p class="sp-det-catatan sp-det-pre">' + rjdEscapeHtml_(d.catatanKlien) + '</p></div>' : '') +
      (d.catatanAdmin ? '<div class="sp-det-blok"><h4>Catatan admin</h4>' +
        '<p class="sp-det-catatan sp-det-pre">' + rjdEscapeHtml_(d.catatanAdmin) + '</p></div>' : '') +
      lampiran +

      '<div class="sp-det-tautan sp-det-cetak">' +
        // v194: bergaya tombol, seragam dengan daftar SPK di tab Loading.
        // Sebagai teks bergaris bawah di dasar halaman panjang, ia tidak
        // terbaca sebagai tindakan -- padahal inilah tindakan utama layar ini.
        spTombolDok_("sp-spk-btn utama sp-det-cetak-btn", "&#128438; Cetak SPK produksi",
          "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(window.SP_PO_AKTIF || ""),
          "SPK produksi", "PO penuh \u2014 semua line") +
      '</div>' +
    '</div>';
}

function spMuatSOP_() {
  const panel = document.getElementById("sp-panel-sop");
  if (!panel) return;
  if (panel.dataset.spTerisi === "1") return;   // cukup sekali, isinya statis
  if (typeof sopIsiHtml_ !== "function") {
    panel.innerHTML = '<div class="sp-card"><p class="sp-info">Panduan belum bisa dimuat ' +
      'di sini. Buka <a href="/p/sop.html" target="_blank">halaman SOP</a> sebagai gantinya.</p></div>';
    return;
  }
  panel.innerHTML = '<div class="sp-card sop-embed">' + sopIsiHtml_({ tanpaNav: true }) + '</div>';
  panel.dataset.spTerisi = "1";
}

function spMuatSiapkan_() {
  const wadah = document.getElementById("sp-siapkan-daftar");
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat daftar...");
  const opsi = {};
  // PO aktif = penyaring, kecuali pemakai minta "tampilkan semua".
  if (!window.SP_SIAPKAN_SEMUA && window.SP_PO_AKTIF) {
    opsi.idPurchaseOrder = window.SP_PO_AKTIF;
  }
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "getPerluDisiapkan", opsi: opsi })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar.") + '</p>';
      return;
    }
    window.SP_SIAPKAN = d.baris || [];
    window.SP_SIAPKAN_PILIH = {};
    spRenderSiapkan_();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="sp-pesan sp-galat">Gagal menghubungi server.</p>';
  });
}

function spSiapkanSemua_() {
  window.SP_SIAPKAN_SEMUA = true;
  spMuatSiapkan_();
}

/** Umur antrean dalam hari. Potongan yang lama menunggu biasanya menahan line. */
function spSiapkanUmur_(iso) {
  if (!iso) return null;
  const t = new Date(String(iso) + "T00:00:00");
  if (isNaN(t.getTime())) return null;
  const kini = new Date();
  return Math.floor((kini.setHours(0, 0, 0, 0) - t.getTime()) / 86400000);
}

function spSiapkanToggle_(id, el) {
  if (!window.SP_SIAPKAN_PILIH) window.SP_SIAPKAN_PILIH = {};
  if (el.checked) window.SP_SIAPKAN_PILIH[id] = true;
  else delete window.SP_SIAPKAN_PILIH[id];
  spSiapkanTombol_();
}

/** v200: centang/lepas seluruh baris satu serahan. */
function spSiapkanPilihBatch_(cb) {
  if (!window.SP_SIAPKAN_PILIH) window.SP_SIAPKAN_PILIH = {};
  String(cb.dataset.ids || "").split(",").filter(Boolean).forEach(function (id) {
    if (cb.checked) window.SP_SIAPKAN_PILIH[id] = true; else delete window.SP_SIAPKAN_PILIH[id];
    const kotak = document.getElementById("sp-siap-cek-" + id);
    if (kotak) kotak.checked = cb.checked;
  });
  spSiapkanTombol_();
}

function spSiapkanPilihLine_(idLine, el) {
  (window.SP_SIAPKAN || []).forEach(function (b) {
    if (b.idLine !== idLine) return;
    if (el.checked) window.SP_SIAPKAN_PILIH[b.idDistribusi] = true;
    else delete window.SP_SIAPKAN_PILIH[b.idDistribusi];
    const kotak = document.getElementById("sp-siap-cek-" + b.idDistribusi);
    if (kotak) kotak.checked = !!el.checked;
  });
  spSiapkanTombol_();
}

function spSiapkanTombol_() {
  const n = Object.keys(window.SP_SIAPKAN_PILIH || {}).length;
  const btn = document.getElementById("sp-siapkan-btn");
  const info = document.getElementById("sp-siapkan-info");
  if (btn) btn.disabled = n === 0;
  // v148: bilah aksi melayang naik dari bawah begitu ada baris dicentang.
  // Gerakannya bagian dari umpan balik, bukan hiasan -- lihat catatan
  // panjang di .sp-siap-aksi (simpro-spk.css) sebelum mengubah pola ini.
  //
  // Tombol tetap di-disable saat nol pilihan sebagai jaring kedua: kelas CSS
  // bisa gagal dimuat (jsDelivr bermasalah), status disabled tidak.
  const bilah = document.querySelector(".sp-siap-aksi");
  if (bilah) bilah.classList.toggle("tampil", n > 0);
  if (info) {
    let pcs = 0;
    (window.SP_SIAPKAN || []).forEach(function (b) {
      if (window.SP_SIAPKAN_PILIH[b.idDistribusi]) pcs += b.totalQty || 0;
    });
    info.textContent = n ? (n + " baris dipilih \u00b7 " + pcs + " pcs") : "Belum ada yang dipilih";
  }
}

function spRenderSiapkan_() {
  const daftar = window.SP_SIAPKAN || [];
  const wadah = document.getElementById("sp-siapkan-daftar");
  const ringkas = document.getElementById("sp-siapkan-ringkas");
  if (!wadah) return;

  const menyaring = !window.SP_SIAPKAN_SEMUA && window.SP_PO_AKTIF;
  const chip = menyaring
    ? '<p class="sp-info">Disaring ke <b>' + rjdEscapeHtml_(window.SP_PO_AKTIF) + '</b>. ' +
      '<a href="#" onclick="spSiapkanSemua_();return false;">Tampilkan semua order</a></p>'
    : "";

  if (!daftar.length) {
    if (ringkas) ringkas.innerHTML = "";
    wadah.innerHTML = chip + '<p class="sp-info">Tidak ada potongan yang menunggu disiapkan. ' +
      'Semua pembagian sudah ditandai atau sudah diterima line.</p>';
    spSiapkanTombol_();
    return;
  }

  let totalPcs = 0;
  const perLine = {};
  daftar.forEach(function (b) {
    totalPcs += b.totalQty || 0;
    if (!perLine[b.idLine]) perLine[b.idLine] = { nama: b.namaLine, lokasi: b.lokasi, baris: [], pcs: 0 };
    perLine[b.idLine].baris.push(b);
    perLine[b.idLine].pcs += b.totalQty || 0;
  });

  if (ringkas) {
    ringkas.innerHTML =
      '<div class="sp-siap-kotak"><span>Baris menunggu</span><b>' + daftar.length + '</b></div>' +
      '<div class="sp-siap-kotak"><span>Total pcs</span><b>' + totalPcs + '</b></div>' +
      '<div class="sp-siap-kotak"><span>Line tujuan</span><b>' + Object.keys(perLine).length + '</b></div>';
  }

  // Dikelompokkan per LINE: tim loading menyiapkan per tujuan, satu tumpuk
  // sekali angkut -- bukan per PO.
  //
  // v200: di dalam line, per SERAHAN (satu kali Simpan Pembagian = prefix
  // ID Distribusi = satu SPK). Sebelumnya semua baris satu line dijejer
  // rata: "Kloter 3" tanggal 13 Agustus bercampur dengan serahan 27 Agustus,
  // dan yang menyiapkan harus membaca tanggal tiap baris untuk tahu mana
  // yang satu tumpuk. Sekarang satu serahan = satu blok, dengan centang
  // "siapkan seluruh serahan ini" dan tombol SPK-nya -- kertas yang ikut ke
  // tumpukan itu. Urutan: serahan paling lama menunggu di atas.
  wadah.innerHTML = chip + Object.keys(perLine).map(function (idLine) {
    const g = perLine[idLine];
    const batch = {}, urutBatch = [];
    g.baris.forEach(function (b) {
      const idB = String(b.idDistribusi || "").split("-")[0];
      if (!batch[idB]) {
        batch[idB] = { idBatch: idB, iso: b.tanggalSerah || "", po: b.idPurchaseOrder || "", baris: [], pcs: 0 };
        urutBatch.push(batch[idB]);
      }
      batch[idB].baris.push(b);
      batch[idB].pcs += b.totalQty || 0;
    });
    urutBatch.sort(function (a, b) { return (a.iso || "9999").localeCompare(b.iso || "9999") || a.idBatch.localeCompare(b.idBatch); });

    return '<div class="sp-siap-grup">' +
      '<div class="sp-siap-kepala">' +
        '<label class="sp-siap-ceksemua">' +
          '<input onchange="spSiapkanPilihLine_(\'' + rjdEscapeHtml_(idLine) + '\', this)" type="checkbox"/>' +
          '<span><b>' + rjdEscapeHtml_(g.nama) + '</b>' +
            (g.lokasi ? ' <small>' + rjdEscapeHtml_(g.lokasi) + '</small>' : '') + '</span>' +
        '</label>' +
        '<span class="sp-siap-pcs">' + g.pcs + ' pcs \u00b7 ' + urutBatch.length + ' serahan \u00b7 ' + g.baris.length + ' baris</span>' +
      '</div>' +
      urutBatch.map(function (bt, n) {
        const umurB = spSiapkanUmur_(bt.iso);
        const ids = bt.baris.map(function (b) { return b.idDistribusi; });
        const semuaDipilih = ids.every(function (id) { return (window.SP_SIAPKAN_PILIH || {})[id]; });
        // Semua baris satu serahan berasal dari satu PO (satu kali Simpan
        // Pembagian selalu dalam satu PO), jadi PO cukup di kepala serahan.
        const urlSpk = "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(bt.po) +
          "&line=" + encodeURIComponent(idLine) + "&batch=" + encodeURIComponent(bt.idBatch);
        return '<div class="sp-siap-serahan">' +
          '<div class="sp-siap-serahan-head">' +
            '<label class="sp-siap-serahan-cek">' +
              '<input type="checkbox"' + (semuaDipilih ? ' checked' : '') +
                ' data-ids="' + rjdEscapeHtml_(ids.join(",")) + '" onchange="spSiapkanPilihBatch_(this)"/>' +
              '<span class="sp-siap-serahan-tgl">' + rjdEscapeHtml_(spTglIndo_(bt.iso)) + '</span>' +
              (umurB !== null && umurB >= 2 ? '<span class="sp-siap-lama">' + umurB + ' hari</span>' : '') +
              '<span class="sp-siap-serahan-po">' + rjdEscapeHtml_(bt.po) + '</span>' +
            '</label>' +
            '<span class="sp-siap-serahan-ringkas">' + bt.pcs + ' pcs \u00b7 ' + bt.baris.length + ' baris</span>' +
            spTombolDok_("sp-btn-kecil", "SPK", urlSpk, "SPK " + g.nama,
              "serahan " + spTglIndo_(bt.iso) + " \u00b7 " + bt.pcs + " pcs") +
          '</div>' +
          bt.baris.map(function (b) {
        const per = Object.keys(b.sizeQty || {}).map(function (sz) {
          return rjdEscapeHtml_(sz) + " " + b.sizeQty[sz];
        }).join("  ");
        // v200: umur & PO sudah di kepala serahan -- baris cukup warna + size.
        const dipilih = !!(window.SP_SIAPKAN_PILIH || {})[b.idDistribusi];
        return '<label class="sp-siap-baris">' +
          '<input id="sp-siap-cek-' + rjdEscapeHtml_(b.idDistribusi) + '" ' + (dipilih ? 'checked ' : '') +
            'onchange="spSiapkanToggle_(\'' + rjdEscapeHtml_(b.idDistribusi) + '\', this)" type="checkbox"/>' +
          '<span class="sp-siap-isi">' +
            '<span class="sp-siap-judul">' + rjdEscapeHtml_(b.warna || "-") +
              ' <small>' + rjdEscapeHtml_([b.artikel, b.style].filter(String).join(" / ")) + '</small></span>' +
            (per ? '<span class="sp-siap-detail">' + rjdEscapeHtml_(per) + '</span>' : '') +
            (b.catatan ? '<span class="sp-siap-catatan">\u201c' + rjdEscapeHtml_(b.catatan) + '\u201d</span>' : '') +
          '</span>' +
          '<b class="sp-siap-qty">' + (b.totalQty || 0) + '</b>' +
        '</label>';
          }).join("") +
        '</div>';
      }).join("") +
    '</div>';
  }).join("");

  spSiapkanTombol_();
}

function spTandaiSiapkan_() {
  const ids = Object.keys(window.SP_SIAPKAN_PILIH || {});
  if (!ids.length) return;
  let pcs = 0;
  (window.SP_SIAPKAN || []).forEach(function (b) {
    if (window.SP_SIAPKAN_PILIH[b.idDistribusi]) pcs += b.totalQty || 0;
  });
  if (!confirm("Tandai " + ids.length + " baris (" + pcs + " pcs) sebagai SUDAH DISIAPKAN?\n\n" +
      "Namamu dan waktunya tercatat. Ini catatan penyiapan \u2014 kepala line tetap " +
      "perlu konfirmasi terima seperti biasa.")) return;

  const btn = document.getElementById("sp-siapkan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "tandaiDisiapkan",
      payload: { idDistribusi: ids }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    btn.disabled = false;
    btn.textContent = "Tandai sudah disiapkan";
    if (!d || !d.success) { alert((d && d.error) || "Gagal menandai."); return; }
    let pesan = d.ditandai + " baris ditandai disiapkan.";
    if (d.dilewati && d.dilewati.length) pesan += "\n\nDilewati: " + d.dilewati.join(", ");
    alert(pesan);
    spMuatSiapkan_();
  })
  .catch(function (e) {
    btn.disabled = false;
    btn.textContent = "Tandai sudah disiapkan";
    alert(String(e));
  });
}

function spMuatKonfMode_(jenis) {
  window.SP_KONF_JENIS = jenis;
  const sakelar = document.querySelector(".sp-konf-tabs");
  if (sakelar) sakelar.classList.add("hidden");
  spMuatKonfirmasi();
}

function spKonfSemua_() {
  window.SP_KONF_SEMUA = true;
  spRenderKonfirmasi();
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
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat daftar...");
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
  const semua = window.SP_KONF || [];

  // Penyaring PO opsional (v117): SP_PO_AKTIF menyaring, SP_KONF_SEMUA
  // (chip "tampilkan semua") melepasnya secara lokal tanpa menghapus PO
  // aktif -- tab lain tetap memegang PO-nya. Memilih PO baru di kartu
  // otomatis memasang saringan lagi (spPilihPO mereset penanda ini).
  const poFilter = (!window.SP_KONF_SEMUA && window.SP_PO_AKTIF) ? window.SP_PO_AKTIF : "";
  const daftar = poFilter
    ? semua.filter(function (k) { return String(k.idPurchaseOrder || "").trim() === poFilter; })
    : semua;

  let chip = "";
  if (poFilter) {
    chip = '<p class="sp-info">Menampilkan hanya <b>' + rjdEscapeHtml_(poFilter) + '</b> (' +
      daftar.length + ' dari ' + semua.length + ') &#183; ' +
      '<button class="sp-btn-kecil" onclick="spKonfSemua_()" type="button">Tampilkan semua PO</button></p>';
  }

  if (!daftar.length) {
    wadah.innerHTML = chip + '<p class="sp-info">Tidak ada serah-terima yang menunggu konfirmasi' +
      (poFilter ? ' untuk PO ini' : '') + '.</p>';
    return;
  }

  // v198: pilih-semua yang TAMPIL (menghormati saringan line & PO). Kalau
  // menyaring per line lalu "pilih semua", yang tercentang hanya line itu.
  const semuaTampilDipilih = daftar.every(function (k) {
    return (window.SP_KONF_PILIH || {})[k.idDistribusi || k.idSetoran];
  });
  chip += '<label class="sp-konf-ceksemua"><input type="checkbox"' + (semuaTampilDipilih ? ' checked' : '') +
    ' onchange="spKonfCentangSemua_(this.checked)"/>' +
    '<span>Pilih semua yang tampil <small>(' + daftar.length + ' bundel)</small></span></label>';

  // v199: DIKELOMPOKKAN per line + tanggal serah = satu "serahan". Itu unit
  // fisiknya di lantai: tumpukan bundel yang diantar sekali jalan. Sebelumnya
  // tujuh kartu sejajar dengan nama line & tanggal diulang di tiap kartu --
  // mata harus membaca tanggal di tiap kartu untuk tahu ini kiriman kapan.
  // Sekarang tanggal & line hanya di kepala grup, kartunya cukup PO + warna.
  // Kepala grup punya centangnya sendiri: "seluruh serahan ini cocok".
  const grup = {}, urutGrup = [];
  daftar.forEach(function (k) {
    const iso = k.tanggalSerahIso || k.tanggal || "";
    const kunci = (k.idLine || k.namaLine || "-") + "|" + iso;
    if (!grup[kunci]) {
      grup[kunci] = { kunci: kunci, namaLine: k.namaLine || k.idLine || "-", iso: iso, item: [], pcs: 0 };
      urutGrup.push(grup[kunci]);
    }
    grup[kunci].item.push(k);
    grup[kunci].pcs += Number(k.totalQty !== undefined ? k.totalQty : k.total) || 0;
  });
  // Paling lama menunggu di atas -- itu yang paling berisiko terlupakan.
  urutGrup.sort(function (a, b) {
    return (a.iso || "9999").localeCompare(b.iso || "9999") || a.namaLine.localeCompare(b.namaLine);
  });

  wadah.innerHTML = chip + urutGrup.map(function (g) {
    const semuaDipilih = g.item.every(function (k) {
      return (window.SP_KONF_PILIH || {})[k.idDistribusi || k.idSetoran];
    });
    const idsGrup = g.item.map(function (k) { return k.idDistribusi || k.idSetoran || ""; });
    // v201: <div>, bukan <section> -- simpro-global.css punya aturan tema
    // `section{padding:88px 0}` untuk seksi halaman depan, dan grup ini ikut
    // kena: jarak 88px di atas & bawah tiap serahan. Tidak ada error, cuma
    // ruang kosong yang tak bisa dijelaskan.
    return '<div class="sp-konf-grup">' +
      '<label class="sp-konf-grup-head">' +
        '<input type="checkbox"' + (semuaDipilih ? ' checked' : '') +
          ' data-ids="' + rjdEscapeHtml_(idsGrup.join(",")) + '" onchange="spKonfCentangGrup_(this)"/>' +
        '<span class="sp-konf-grup-line">' + rjdEscapeHtml_(g.namaLine) + '</span>' +
        '<span class="sp-konf-grup-tgl">' + rjdEscapeHtml_(spTglIndo_(g.iso)) + '</span>' +
        '<span class="sp-konf-grup-ringkas">' + g.item.length + ' bundel &#183; ' + g.pcs + ' pcs</span>' +
      '</label>' +
      g.item.map(spKonfKartuHtml_).join("") +
    '</div>';
  }).join("");
  spKonfTombolMassal_();
}

/** v199: "2026-08-09" -> "9 Agustus 2026". Non-ISO dikembalikan apa adanya. */
function spTglIndo_(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "-";
  const bln = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  return Number(m[3]) + " " + bln[Number(m[2]) - 1] + " " + m[1];
}

/** v199: centang/lepas seluruh bundel dalam satu serahan. */
function spKonfCentangGrup_(cb) {
  if (!window.SP_KONF_PILIH) window.SP_KONF_PILIH = {};
  const ids = String(cb.dataset.ids || "").split(",").filter(Boolean);
  ids.forEach(function (id) {
    if (cb.checked) window.SP_KONF_PILIH[id] = true; else delete window.SP_KONF_PILIH[id];
    const kotak = document.querySelector('#sp-konf-daftar .sp-konf-cek input[data-id="' + id.replace(/"/g, '\\"') + '"]');
    if (kotak) {
      kotak.checked = cb.checked;
      const kartu = kotak.closest(".sp-konf-kartu");
      if (kartu) kartu.classList.toggle("dipilih", cb.checked);
    }
  });
  spKonfTombolMassal_();
}

function spKonfKartuHtml_(k) {
  const semua = window.SP_KONF || [];
    // indeks HARUS menunjuk ke SP_KONF asli -- tombol Terima/Selisih membaca
    // window.SP_KONF[i]; indeks daftar tersaring akan salah kartu.
    const i = semua.indexOf(k);
    const sizes = Object.keys(k.sizeQty || {});
    const idK = k.idDistribusi || k.idSetoran || "";
    const dicentang = !!(window.SP_KONF_PILIH || {})[idK];
    return '<div class="sp-konf-kartu' + (dicentang ? ' dipilih' : '') + '" id="sp-konf-' + i + '">' +
      '<div class="sp-konf-head">' +
        // v198: centang = "bundel ini cocok, terima nanti sekaligus". Kotaknya
        // di kepala kartu, bukan mengganti tombol: per kartu tetap bisa
        // diterima satuan atau ditandai selisih seperti sebelumnya.
        '<label class="sp-konf-cek"><input type="checkbox" data-id="' + rjdEscapeHtml_(idK) + '"' +
          (dicentang ? ' checked' : '') + ' onchange="spKonfCentang_(this)"/></label>' +
        '<div class="sp-konf-teks">' +
          // v199: line & tanggal sudah di kepala grup -- di kartu cukup
          // warna (yang dicocokkan dengan bundel fisik) dan PO-nya.
          // Nama field berbeda antara dua sumber: distribusi memakai
          // totalQty/diserahkanOleh, setoran memakai total/disetorkanOleh.
          '<div class="sp-konf-line">' + rjdEscapeHtml_(k.warna || "-") + '</div>' +
          '<div class="sp-konf-sub">' + rjdEscapeHtml_(k.idPurchaseOrder) +
            ' &#183; ' + rjdEscapeHtml_([k.artikel, k.style].filter(Boolean).join(" / ")) +
            (k.diserahkanOleh || k.disetorkanOleh
              ? ' &#183; dari ' + rjdEscapeHtml_(k.diserahkanOleh || k.disetorkanOleh) : '') + '</div>' +
        '</div>' +
        '<div class="sp-konf-qty">' +
          (k.totalQty !== undefined ? k.totalQty : (k.total || 0)) +
          '<span>pcs</span></div>' +
      '</div>' +
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
}

/* ============================================================
 * v198 -- KONFIRMASI MASSAL "terima sesuai"
 * ============================================================
 * Di lantai, kepala line memegang 5-10 bundel yang sudah dihitung dan cocok
 * semua. Sebelumnya: klik Terima, tunggu 2-3 detik, daftar dimuat ulang,
 * cari kartu berikutnya, klik lagi. Untuk 10 bundel, setengah menit menatap
 * layar -- dan orang mulai malas mengonfirmasi, padahal konfirmasi adalah
 * satu-satunya bukti bahwa angka loading benar.
 *
 * Sekarang: centang yang cocok, tekan sekali. "Ada selisih" SENGAJA tetap
 * per kartu -- ia butuh angka per size dan alasan, dan justru tidak boleh
 * dikerjakan terburu-buru.
 *
 * Pilihan disimpan per ID (bukan indeks) supaya bertahan saat daftar
 * dirender ulang oleh saringan line/PO.
 */
function spKonfCentang_(cb) {
  if (!window.SP_KONF_PILIH) window.SP_KONF_PILIH = {};
  const id = cb.dataset.id;
  if (cb.checked) window.SP_KONF_PILIH[id] = true; else delete window.SP_KONF_PILIH[id];
  const kartu = cb.closest(".sp-konf-kartu");
  if (kartu) kartu.classList.toggle("dipilih", cb.checked);
  spKonfTombolMassal_();
}

function spKonfCentangSemua_(nyala) {
  if (!window.SP_KONF_PILIH) window.SP_KONF_PILIH = {};
  document.querySelectorAll("#sp-konf-daftar .sp-konf-cek input").forEach(function (cb) {
    cb.checked = nyala;
    const id = cb.dataset.id;
    if (nyala) window.SP_KONF_PILIH[id] = true; else delete window.SP_KONF_PILIH[id];
    const kartu = cb.closest(".sp-konf-kartu");
    if (kartu) kartu.classList.toggle("dipilih", nyala);
  });
  spKonfTombolMassal_();
}

function spKonfTombolMassal_() {
  const pilih = window.SP_KONF_PILIH || {};
  const semua = window.SP_KONF || [];
  let n = 0, pcs = 0;
  semua.forEach(function (k) {
    const id = k.idDistribusi || k.idSetoran;
    if (pilih[id]) { n++; pcs += Number(k.totalQty != null ? k.totalQty : k.total) || 0; }
  });
  const bilah = document.querySelector(".sp-konf-aksi-massal");
  const btn = document.getElementById("sp-konf-massal-btn");
  const info = document.getElementById("sp-konf-massal-info");
  if (bilah) bilah.classList.toggle("tampil", n > 0);
  if (btn) { btn.disabled = n === 0; btn.textContent = "Terima sesuai " + (n ? "(" + n + ")" : ""); }
  if (info) info.textContent = n ? (n + " bundel dicentang \u00b7 " + pcs + " pcs") : "Belum ada yang dicentang";
}

function spKonfirmasiMassal_() {
  const ids = Object.keys(window.SP_KONF_PILIH || {});
  if (!ids.length) return;
  const elNama = document.getElementById("sp-konf-nama");
  const nama = ((elNama || {}).value || "").trim();
  if (!nama) {
    alert("Isi dulu \"Nama yang menerima\" di atas.\n\nSatu nama dipakai untuk semua bundel yang dicentang.");
    if (elNama) elNama.focus();
    return;
  }
  if (!confirm("Terima " + ids.length + " bundel sesuai angka yang tercatat?\n\n" +
      "Pastikan semuanya SUDAH dihitung. Yang jumlahnya berbeda jangan dicentang -- pakai \"Ada selisih\" di kartunya.")) return;

  const setoran = (window.SP_KONF_JENIS || "potongan") === "setoran";
  const btn = document.getElementById("sp-konf-massal-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan " + ids.length + " bundel..."; }

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN,
      action: setoran ? "konfirmasiTerimaSetoranMassal" : "konfirmasiTerimaMassal",
      payload: { ids: ids, diterimaOleh: nama }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    if (!h || !h.success) {
      alert((h && h.error) || "Gagal menyimpan konfirmasi.");
      spKonfTombolMassal_();
      return;
    }
    // Yang berhasil dilepas dari pilihan; yang gagal TETAP tercentang supaya
    // kelihatan dan bisa dicoba lagi (atau ditangani satuan).
    (h.berhasil || []).forEach(function (id) { delete window.SP_KONF_PILIH[id]; });
    let pesan = h.diterima + " bundel diterima.";
    if (h.gagal && h.gagal.length) {
      pesan += "\n\n" + h.gagal.length + " GAGAL (masih tercentang):\n" +
        h.gagal.map(function (g) { return "\u2022 " + g.id + ": " + g.error; }).join("\n");
    }
    alert(pesan);
    window.SP_PO = null;   // alokasi bisa berubah -> cache Bagi ke Line dibuang
    spMuatKonfirmasi();
  })
  .catch(function () { alert("Gagal menghubungi server."); spKonfTombolMassal_(); });
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
    if (window.SP_KONF_PILIH) delete window.SP_KONF_PILIH[payload.idDistribusi];   // v198
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
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat riwayat...");

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

/* [DIGANTI v178] Blok "SETORAN TERCATAT" khusus dulu di sini
   (spMuatSetoranTercatat_, spRenderSetoranTercatat_, spBatalSetoranTercatat_).
   Digantikan mesin UMUM di bawah yang melayani tiga jenis sekaligus.

   Alasannya bukan kerapian: begitu Hasil Potong dan Bagi ke Line menyusul,
   tiga blok yang hampir sama akan berakhir seperti biasanya -- satu
   diperbaiki, dua lainnya tidak, lalu perilakunya berbeda tanpa ada yang
   menyadari. Jangan hidupkan lagi versi per-jenis. */
/* ============================================================
 * CATATAN TERCATAT DI TABNYA SENDIRI (v178)
 * ============================================================
 * v177 mengerjakan Setoran; v178 menuntaskan Hasil Potong dan Bagi ke Line.
 *
 * DITULIS UMUM, bukan tiga salinan. Versi Setoran di v177 ditulis khusus, dan
 * begitu tab kedua menyusul, tiga blok yang hampir sama akan berakhir seperti
 * biasanya: satu diperbaiki, dua lainnya tidak, lalu perilakunya berbeda tanpa
 * ada yang menyadari.
 *
 * Yang membedakan antar jenis cuma isi kolom tengahnya, dan itu ditaruh di
 * SP_TERCATAT_PROFIL. Rute API, aturan boleh-batal, teks konfirmasi, dan
 * penyegaran setelah batal SEMUANYA sama -- dan memang harus sama.
 *
 * Rute yang dipakai identik dengan tab Riwayat (getRiwayat* + batalkan*),
 * begitu juga spBolehBatalRiwayat_. Tab Riwayat tetap ada untuk pandangan
 * LINTAS PO; yang di sini per PO.
 * ============================================================ */

const SP_TERCATAT_PROFIL = {
  cutting: {
    wadah: "sp-cut-tercatat",
    judul: "Hasil Potong Tercatat",
    aksiMuat: "getRiwayatCutting",
    aksiBatal: "batalkanHasilCutting",
    kunciId: "idCutting",
    // v179: nama kolom qty & tanggal BERBEDA di tiap jenis, dan itu harus
    // ditulis di sini, bukan ditebak dengan rantai `a || b || c`.
    //
    // Versi v178 memakai `k.totalQty || k.total || 0` -- rantai itu tidak
    // pernah melempar error, cuma menghasilkan 0 dan "-" untuk cutting, dan
    // angka nol di daftar catatan terbaca seperti data yang memang nol.
    // Ditulis eksplisit supaya kalau kelak ada jenis baru yang namanya lain
    // lagi, kolomnya kosong dengan jelas -- bukan diam-diam nol.
    kunciQty: "totalPotong",
    kunciTanggal: "tanggalPotong",
    kosong: "Belum ada hasil potong untuk PO ini.",
    // Disegarkan sesudah batal: qty hasil potong adalah BATAS yang boleh
    // dibagi ke line, jadi form pembagian yang masih memakai angka lama akan
    // menerima input yang sebenarnya sudah tidak sah.
    segarkan: function () { if (typeof spMuatCutting === "function") spMuatCutting(); }
  },
  distribusi: {
    wadah: "sp-bagi-tercatat",
    judul: "Pembagian Tercatat",
    aksiMuat: "getRiwayatDistribusi",
    aksiBatal: "batalkanDistribusi",
    kunciId: "idDistribusi",
    kunciQty: "totalQty",
    kunciTanggal: "tanggalSerah",
    kosong: "Belum ada pembagian untuk PO ini.",
    segarkan: function () { if (typeof spMuatDistribusi === "function") spMuatDistribusi(); }
  },
  setoran: {
    wadah: "sp-setor-tercatat",
    judul: "Setoran Tercatat",
    aksiMuat: "getRiwayatSetoran",
    aksiBatal: "batalkanSetoran",
    kunciId: "idSetoran",
    kunciQty: "total",
    kunciTanggal: "tanggal",
    kosong: "Belum ada setoran untuk PO ini.",
    segarkan: function () { if (typeof spMuatSetoran === "function") spMuatSetoran(); }
  }
};

/**
 * Rincian size jadi teks pendek: "S 5  M 5".
 *
 * v179: DUA BENTUK yang harus dilayani, dan itu bukan pilihan gaya --
 * rutenya memang mengirim berbeda:
 *   setoran            -> k.sizeQty = { S: 5, M: 5 }     (objek)
 *   cutting/distribusi -> k.rincian = [{size,qty}, ...]  (array)
 *
 * Versi v178 cuma membaca sizeQty, jadi rincian cutting dan pembagian hilang
 * tanpa jejak. Ditangani di satu tempat supaya tiga pemanggilnya tidak perlu
 * tahu bedanya.
 */
function spTercatatSize_(k) {
  if (k && k.sizeQty && Object.keys(k.sizeQty).length) {
    const sq = k.sizeQty;
    return Object.keys(sq).filter(function (s) { return Number(sq[s]) > 0; })
      .map(function (s) { return spEsc_(s) + " " + sq[s]; }).join("  ");
  }
  if (k && Array.isArray(k.rincian)) {
    return k.rincian.filter(function (x) { return Number(x.qty) > 0; })
      .map(function (x) { return spEsc_(x.size) + " " + x.qty; }).join("  ");
  }
  return "";
}

function spMuatTercatat_(jenis) {
  const p = SP_TERCATAT_PROFIL[jenis];
  if (!p) return;
  const wadah = document.getElementById(p.wadah);
  if (!wadah) return;
  const idPO = window.SP_PO_AKTIF;
  if (!idPO) { wadah.innerHTML = ""; return; }

  wadah.innerHTML = '<div class="sp-card">' + spMuatHtml_("Memuat " +
    p.judul.toLowerCase() + "...") + '</div>';

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: p.aksiMuat,
      opsi: { idPurchaseOrder: idPO }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat " + p.judul.toLowerCase() + ".") +
        '</p></div>';
      return;
    }
    window.SP_TERCATAT = window.SP_TERCATAT || {};
    window.SP_TERCATAT[jenis] = d.daftar || d.data || [];
    spRenderTercatat_(jenis);
  })
  .catch(function () {
    wadah.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
      'Gagal menghubungi server.</p></div>';
  });
}

function spRenderTercatat_(jenis) {
  const p = SP_TERCATAT_PROFIL[jenis];
  if (!p) return;
  const wadah = document.getElementById(p.wadah);
  if (!wadah) return;
  const daftar = ((window.SP_TERCATAT || {})[jenis]) || [];

  if (!daftar.length) {
    wadah.innerHTML = '<div class="sp-card"><h3 class="sp-judul">' + p.judul + '</h3>' +
      '<p class="sp-info">' + p.kosong + '</p></div>';
    return;
  }

  const aktif = daftar.filter(function (k) { return k.status !== "Dibatalkan"; }).length;
  const batal = daftar.length - aktif;

  wadah.innerHTML = '<div class="sp-card">' +
    '<h3 class="sp-judul">' + p.judul + '</h3>' +
    '<p class="sp-info">' + aktif + ' tercatat' +
      (batal ? ' &#183; ' + batal + ' dibatalkan' : '') +
      '. Salah input? Batalkan lalu catat ulang &#8212; barisnya tidak dihapus, ' +
      'supaya jelas pernah ada kesalahan.</p>' +
    '<div class="sp-tabelwrap"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Catatan</th><th>Item</th><th class="num">Qty</th><th>Tanggal</th><th></th>' +
    '</tr></thead><tbody>' +
    daftar.map(function (k, i) {
      const dibatalkan = k.status === "Dibatalkan";
      // Serah-terima yang SUDAH dikonfirmasi kepala line tidak bisa dibatalkan:
      // begitu pihak kedua membenarkan, catatan itu bukan lagi input sepihak.
      // Aturan yang sama dipakai tab Riwayat -- disalin ke sini karena
      // spBolehBatalRiwayat_ tidak memeriksanya (ia soal BAGIAN, bukan status).
      const terkunci = jenis === "distribusi" &&
        (k.status === "Diterima" || k.status === "Ada Selisih");
      const boleh = (typeof spBolehBatalRiwayat_ === "function")
        ? spBolehBatalRiwayat_(jenis, k) : true;
      const sz = spTercatatSize_(k);
      // k.artikel dari rute riwayat SUDAH gabungan brand/artikel/style --
      // menambahkan k.style lagi menghasilkan "Inara Dress / / Butter" dengan
      // garis miring ganda. Warna dipisah karena ia yang paling dicari mata
      // saat memeriksa catatan.
      const item = spEsc_(k.artikel || "-") +
        (k.warna ? ' &#183; <b>' + spEsc_(k.warna) + '</b>' : '');
      // Arah panah membedakan dua hal yang angkanya sama-sama "pcs":
      // distribusi keluar ke line, setoran masuk dari line.
      const line = k.namaLine
        ? (jenis === "distribusi" ? " &#8594; " : " &#8592; ") + spEsc_(k.namaLine)
        : "";
      return '<tr' + (dibatalkan ? ' class="sp-ord-selesai"' : '') + '>' +
        '<td data-label="Catatan"><b>' + spEsc_(k[p.kunciId] || "-") + '</b>' +
          (dibatalkan ? ' <span class="sp-tag-batal">DIBATALKAN</span>' : '') +
          (k.status && !dibatalkan
            ? '<div class="sp-gelar-size">' + spEsc_(k.status) + '</div>' : '') +
          '</td>' +
        '<td data-label="Item">' + item + line +
          (sz ? '<div class="sp-gelar-size">' + sz + '</div>' : '') + '</td>' +
        '<td class="num" data-label="Qty"><b>' +
          (Number(k[p.kunciQty]) || 0) + '</b></td>' +
        '<td data-label="Tanggal">' + spEsc_(k[p.kunciTanggal] || "-") + '</td>' +
        '<td data-label="" class="sp-td-aksi">' +
          (dibatalkan
            ? '<span class="sp-riw-kunci">sudah dibatalkan</span>'
            : terkunci
              ? '<span class="sp-riw-kunci">sudah dikonfirmasi</span>'
              : boleh
                ? '<button class="sp-btn-kecil" type="button" onclick="spBatalTercatat_(\'' +
                  jenis + '\', ' + i + ')">Batalkan</button>'
                : '<span class="sp-riw-kunci">bukan bagianmu</span>') +
        '</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div></div>';
}

function spBatalTercatat_(jenis, i) {
  const p = SP_TERCATAT_PROFIL[jenis];
  if (!p) return;
  const k = (((window.SP_TERCATAT || {})[jenis]) || [])[i];
  if (!k) return;
  const id = k[p.kunciId];

  const alasan = prompt("Batalkan catatan " + id + "?\n\n" +
    "Barisnya TIDAK dihapus \u2014 ditandai batal dan tidak ikut dihitung, " +
    "supaya jelas pernah ada kesalahan.\n\nAlasan pembatalan:");
  if (alasan === null) return;
  if (!alasan.trim()) { alert("Alasan wajib diisi."); return; }

  const payload = {};
  payload[p.kunciId] = id;
  payload.alasan = alasan.trim();

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: p.aksiBatal, payload: payload })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) { alert((d && d.error) || "Gagal membatalkan."); return; }
    spMuatTercatat_(jenis);
    p.segarkan();
  })
  .catch(function () { alert("Gagal menghubungi server."); });
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
      // v186: SPK untuk serahan INI saja. Batch = prefix ID Distribusi sebelum "-".
      (jenis === "distribusi" && !dibatalkan && id
        ? '<div class="sp-riw-cetak">' +
            spTombolDok_("sp-tautan sp-tautan-btn", "Cetak SPK serahan ini",
              "/p/cetak.html?jenis=spk&id=" + encodeURIComponent(k.idPurchaseOrder) +
                "&line=" + encodeURIComponent(k.idLine || "") +
                "&batch=" + encodeURIComponent(String(id).split("-")[0]),
              "SPK " + (k.namaLine || "line"), String(id) + " \u00b7 " + tanggal) +
          '</div>'
        : '') +
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
  if (wadah) wadah.innerHTML = spMuatHtml_("Memuat...");

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
      // v119: basis setoran = serah-terima TERKONFIRMASI. Yang masih Menunggu
      // ditampilkan sebagai peringatan, bukan disembunyikan -- supaya line
      // tahu kenapa angkanya "kurang" dan ke mana harus mengonfirmasi.
      ((po.totalMenungguKonfirmasi || 0) > 0
        ? '<div class="sp-ringkas-item" style="color:#8F5A16"><span>&#9888; Menunggu konfirmasi (belum bisa disetor)</span><b>' +
          po.totalMenungguKonfirmasi + ' pcs</b></div>' +
          '<p class="sp-info" style="margin:6px 0 0">Konfirmasi dulu di <b>Sewing &#8250; Konfirmasi Potongan</b> &#8212; angka di atas hanya menghitung serah-terima yang sudah divalidasi kepala line.</p>'
        : '') +
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
/**
 * v194 -- ID berkas Drive dari sebuah tautan, atau "" kalau bukan Drive.
 * Dipisah supaya spThumbMarker_ (layout marker) dan spThumbLampiran_
 * (gambar model, size chart, lampiran order) memakai aturan yang SAMA.
 * Tautan Drive biasa (".../file/d/ID/view") tidak bisa dipakai di <img> --
 * yang keluar halaman HTML, bukan gambar.
 */
function spIdDrive_(url) {
  const m = String(url).match(/\/file\/d\/([^/]+)/) || String(url).match(/[?&]id=([^&]+)/);
  return m ? m[1] : "";
}
function spSrcDrive_(url, lebar) {
  const id = spIdDrive_(url);
  return id
    ? ("https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w" + lebar)
    : url;
}

/**
 * v194 -- thumbnail berlabel untuk Detail Order (gambar model, size chart,
 * lampiran). Sebelumnya semuanya tautan teks "Gambar model": untuk tahu
 * modelnya seperti apa, orang harus meninggalkan halaman dan kembali lagi --
 * padahal justru gambar itu yang paling sering dilihat saat membaca order.
 *
 * Klik membuka pratinjau gambar yang SAMA dengan layout marker
 * (spBukaPratinjau_), lengkap dengan tautan ke Drive di dalamnya untuk yang
 * perlu ukuran asli atau mengunduh.
 *
 * Berkas yang bukan gambar (.plt, .pdf, .xlsx) tidak akan pernah termuat
 * sebagai <img>; onerror menggantinya dengan tautan unduh, bukan ikon rusak.
 */
function spThumbLampiran_(url, label) {
  if (!url) return "";
  return '<button class="sp-det-thumb" type="button" onclick="spBukaThumb_(this)" ' +
      'data-besar="' + spEsc_(spSrcDrive_(url, 1600)) + '" data-asli="' + spEsc_(url) + '" ' +
      'title="' + spEsc_(label) + '">' +
    '<span class="sp-det-thumb-kotak">' +
      '<img alt="' + spEsc_(label) + '" loading="lazy" onerror="spThumbGagal_(this)" ' +
        'src="' + spEsc_(spSrcDrive_(url, 400)) + '"/>' +
    '</span>' +
    '<span class="sp-det-thumb-lbl">' + spEsc_(label) + '</span>' +
  '</button>';
}

function spBukaThumb_(btn) {
  if (btn) spBukaPratinjau_(btn.dataset.besar, btn.dataset.asli);
}

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
  // v194: thumbnail Detail Order punya rangka sendiri (.sp-det-thumb) dan
  // bisa saja memang bukan gambar (.plt, .pdf) -- diganti tautan unduh,
  // supaya berkasnya tetap bisa diambil.
  const d = img.closest(".sp-det-thumb");
  if (d) {
    const url = d.dataset.asli || "";
    const lbl = (d.querySelector(".sp-det-thumb-lbl") || {}).textContent || "Berkas";
    d.outerHTML = '<a class="sp-det-thumb-gagal" href="' + spEsc_(url) + '" ' +
      'rel="noopener" target="_blank">&#128196; ' + spEsc_(lbl) + '</a>';
    return;
  }
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
  document.getElementById("sp-marker-daftar").innerHTML = spMuatHtml_("Memuat...");
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
  wadah.innerHTML = spMuatHtml_("Memuat daftar semua marker...");

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
  document.getElementById("sp-gelar-form").innerHTML = spMuatHtml_("Memuat...");
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
    // v143: kode kain RENCANA per (warna, slot) dari order -- dipakai mengisi
    // kotak Kode Kain otomatis. Saran, bukan paksaan.
    window.SP_BAHAN_RENCANA = (hasil[2] && hasil[2].bahanRencana) || { peta: {}, semuaKode: [] };
    window.SP_LINE_GELARAN = (hasil[2] && hasil[2].daftarLine) || [];   // v154
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
      // v149: panel yang dipotong khusus atas permintaan klien (biasanya
      // mengejar photoshoot, dijahit sendiri di tempat mereka). Mekanismenya
      // sama dengan re-cut, tapi ARTINYA berlawanan -- re-cut itu pemborosan
      // yang ingin ditekan, ini pekerjaan yang diminta. Dipisah supaya angka
      // "kain untuk mengganti panel cacat" tidak tercemar.
      '<label class="sp-mode-opsi"><input name="sp-gl-jenis" onchange="spUbahModeGelaran_()" ' +
        'type="radio" value="Panel Klien"/>' +
        '<span><b>Panel klien</b><small>diminta klien &#183; kain saja</small></span></label>' +
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
          ? '<select id="sp-gl-warna" onchange="spIsiKodeKain_()">' + warna.map(function (w) {
              return '<option value="' + spEsc_(w) + '">' + spEsc_(w) + '</option>';
            }).join("") + '</select>'
          : '<input id="sp-gl-warna" onchange="spIsiKodeKain_()" ' +
            'placeholder="ketik nama warna" type="text"/>') +
      '</label>' +
      '<label>Jenis Kain' +
        (kain.length
          ? '<select id="sp-gl-kain" onchange="spIsiKodeKain_()">' + kain.map(function (k) {
              return '<option value="' + spEsc_(k) + '">' + spEsc_(k) + '</option>';
            }).join("") + '</select>'
          : '<input id="sp-gl-kain" onchange="spIsiKodeKain_()" ' +
            'placeholder="ketik jenis kain" type="text"/>') +
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
      // v143: KODE kain yang benar-benar digelar. "Jenis Kain" di atas itu
      // SLOT (Brokat/Polos); ini barang fisiknya. Satu slot bisa terisi lebih
      // dari satu kode dalam satu PO -- beda batch, atau diganti kain lain
      // berwarna sama karena stok kurang. Terisi otomatis dari rencana order,
      // boleh ditimpa kalau kenyataannya beda.
      '<label>Kode Kain<input id="sp-gl-kodekain" list="sp-datalist-kodekain" ' +
        'placeholder="terisi dari order &#183; ubah bila beda" type="text"/></label>' +
      '<label>Catatan<input id="sp-gl-catatan" placeholder="opsional" type="text"/></label>' +
    '</div>' +
    '<datalist id="sp-datalist-kodekain">' +
      ((window.SP_BAHAN_RENCANA && window.SP_BAHAN_RENCANA.semuaKode) || [])
        .map(function (k) { return '<option value="' + spEsc_(k) + '"></option>'; }).join("") +
    '</datalist>' +
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
        '<label id="sp-gl-lbl-komponen">Komponen yang diganti' +
          '<input id="sp-gl-komponen" list="sp-datalist-komponen" ' +
            'placeholder="mis. Lengan" type="text"/></label>' +
        '<label id="sp-gl-lbl-alasan">Alasan<input id="sp-gl-alasan" placeholder="mis. kain sobek" type="text"/></label>' +
        '<label>Kain terpakai (m)<input id="sp-gl-kain-manual" min="0" ' +
          'oninput="spHitungGelaran_()" placeholder="0" step="0.01" type="number"/></label>' +
      '</div>' +
      // v154: kotak "Untuk Line" -- OPSIONAL. Gunanya menjawab pertanyaan yang
      // sekarang tidak bisa dijawab sama sekali: panel apa yang paling sering
      // cacat, dan apakah polanya menumpuk di satu line. Yang pertama menunjuk
      // ke mutu potong, yang kedua ke cara kerja atau mesin di line itu.
      // Kosong tidak menghalangi simpan -- memaksanya diisi hanya akan membuat
      // orang memilih asal, dan data asal lebih buruk daripada kolom kosong.
      '<div id="sp-gl-untukline-blok">' +
        '<label>Untuk line <small>(opsional)</small>' +
          '<select id="sp-gl-untukline">' +
            '<option value="">-- tidak dicatat --</option>' +
            (window.SP_LINE_GELARAN || []).map(function (l) {
              return '<option value="' + spEsc_(l.idLine) + '">' + spEsc_(l.namaLine) +
                (l.lokasi ? " (" + spEsc_(l.lokasi) + ")" : "") + '</option>';
            }).join("") +
          '</select></label>' +
        // v185: jejak sesi QC Potong yang minta re-cut ini. Terisi otomatis
        // dari QC Potong terakhir yang berafkir (window.SP_RECUT_QC_GELARAN);
        // boleh diedit/dihapus. Nilainya menyambung baris kain ini dengan
        // baris koreksi dan baris potong pengganti di SD Hasil Cutting.
        '<label>Dari QC Potong <small>(opsional, ID QC)</small>' +
          '<input type="text" id="sp-gl-recut-qc" placeholder="mis. QC-..." value="' +
            spEsc_((window.SP_RECUT_QC_GELARAN && window.SP_RECUT_QC_GELARAN.idQC) || "") + '"/></label>' +
      '</div>' +
      '<datalist id="sp-datalist-komponen">' +
        (window.SP_SARAN_KOMPONEN || []).map(function (k) {
          return '<option value="' + spEsc_(k) + '"></option>';
        }).join("") +
      '</datalist>' +
      '<p class="sp-info" id="sp-gl-recut-hint">Re-cut TIDAK menambah jumlah baju &#8212; bajunya sudah terhitung ' +
        'waktu dipotong pertama. Yang bertambah cuma pemakaian kain.</p>' +
      // v154: kesalahan paling mahal di alur ini, dicegah dengan satu kalimat.
      // Kalau panel pengganti dicatat sebagai pembagian baru, line tercatat
      // menerima lebih banyak daripada yang akan disetorkannya -- selisihnya
      // jadi hutang yang tidak akan pernah lunas, dan tidak ada layar mana pun
      // yang bisa membetulkannya belakangan. Pengembalian panel cacat punya
      // akibat kembar: pool menawarkan barang yang sudah rusak.
      '<p class="sp-info sp-gl-aturan" id="sp-gl-aturan-recut">' +
        '<b>Aturan:</b> panel pengganti diserahkan langsung ke line &#8212; ' +
        'JANGAN dicatat lagi sebagai pembagian baru di tab Bagi ke Line. ' +
        'Panel cacatnya juga jangan dikembalikan lewat form pengembalian setoran.' +
      '</p>' +
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
  const mode = spModeGelaran_();
  // Re-cut dan Panel Klien berbagi SATU blok isian -- yang dibutuhkan sama
  // persis (komponen, alasan, kain manual). Yang berbeda cuma kata-katanya,
  // dan itu penting: "komponen yang diganti" tidak masuk akal untuk panel
  // yang diserahkan ke klien.
  const bukanBaju = (mode === "Re-cut" || mode === "Panel Klien");
  const blok = document.getElementById("sp-gl-recut");
  if (blok) blok.classList.toggle("hidden", !bukanBaju);
  if (bukanBaju) {
    const panel = mode === "Panel Klien";
    const lblK = document.getElementById("sp-gl-lbl-komponen");
    const lblA = document.getElementById("sp-gl-lbl-alasan");
    const inpK = document.getElementById("sp-gl-komponen");
    const inpA = document.getElementById("sp-gl-alasan");
    const hint = document.getElementById("sp-gl-recut-hint");
    // Teks label diganti lewat childNodes[0] supaya elemen <input> di
    // dalamnya tidak ikut tertimpa -- innerHTML akan menghapusnya berikut
    // isian yang sudah diketik.
    if (lblK && lblK.childNodes[0]) {
      lblK.childNodes[0].nodeValue = panel ? "Panel yang diserahkan" : "Komponen yang diganti";
    }
    if (lblA && lblA.childNodes[0]) {
      lblA.childNodes[0].nodeValue = panel ? "Keperluan" : "Alasan";
    }
    if (inpK) inpK.placeholder = panel ? "mis. Badan Depan" : "mis. Lengan";
    if (inpA) inpA.placeholder = panel ? "mis. photoshoot klien" : "mis. kain sobek";
    if (hint) {
      hint.innerHTML = panel
        ? "Panel ini keluar pabrik dan tidak akan kembali jadi baju di sini. " +
          "Jumlah baju TIDAK bertambah &#8212; yang bertambah cuma pemakaian kain."
        : "Re-cut TIDAK menambah jumlah baju &#8212; bajunya sudah terhitung " +
          "waktu dipotong pertama. Yang bertambah cuma pemakaian kain.";
    }
    // v154: dua hal ini cuma masuk akal untuk RE-CUT. Panel klien tidak
    // diserahkan ke line mana pun -- menampilkan "Untuk line" di situ
    // mengundang orang mengisinya, dan aturan soal pembagian ke line justru
    // membingungkan karena tidak ada pembagian yang terlibat.
    const blokLine = document.getElementById("sp-gl-untukline-blok");
    const aturan = document.getElementById("sp-gl-aturan-recut");
    if (blokLine) blokLine.classList.toggle("hidden", panel);
    // v185: form bisa saja sudah dirender SEBELUM QC Potong disimpan -- isi
    // prefill saat mode Re-cut dipilih, hanya kalau kotaknya masih kosong.
    const kotakQC = document.getElementById("sp-gl-recut-qc");
    if (!panel && kotakQC && !kotakQC.value && window.SP_RECUT_QC_GELARAN) {
      kotakQC.value = window.SP_RECUT_QC_GELARAN.idQC || "";
    }
    if (aturan) aturan.classList.toggle("hidden", panel);
    // Nilai ikut dikosongkan saat pindah ke Panel Klien -- kotak tersembunyi
    // yang masih menyimpan pilihan lama akan ikut terkirim diam-diam.
    if (panel) {
      const selLine = document.getElementById("sp-gl-untukline");
      if (selLine) selLine.value = "";
    }
  }
  // Penanda visual mode aktif dipasang dari sini, bukan lewat :has() di CSS --
  // selektor itu belum didukung browser lama.
  document.querySelectorAll(".sp-mode-opsi").forEach(function (el) {
    const inp = el.querySelector("input");
    el.classList.toggle("aktif", !!(inp && inp.checked));
  });
  spHitungGelaran_();
}

/**
 * ID line -> nama yang bisa dibaca. Kalau daftarnya belum termuat, ID-nya
 * dikembalikan apa adanya: menampilkan ID mentah jauh lebih baik daripada
 * kosong, karena masih bisa dicocokkan dengan sheet.
 */
function spNamaLine_(idLine) {
  const d = (window.SP_LINE_GELARAN || []).filter(function (l) { return l.idLine === idLine; })[0];
  return d ? d.namaLine : idLine;
}

/** Mode gelaran terpilih: "Normal" | "Re-cut" | "Panel Klien". */
function spModeGelaran_() {
  const r = document.querySelector('input[name="sp-gl-jenis"]:checked');
  return (r && r.value) ? r.value : "Normal";
}

/** Dua mode yang memakai kain tanpa menghasilkan baju baru. */
function spModeRecut_() {
  const m = spModeGelaran_();
  return m === "Re-cut" || m === "Panel Klien";
}

/**
 * v143: isi kotak Kode Kain dari rencana order untuk (warna, jenis kain)
 * yang sedang dipilih.
 *
 * TIDAK menimpa isian yang sudah diketik manual -- kalau operator sengaja
 * menulis kode lain (roll diganti, batch beda), pilihan warna/kain berikutnya
 * tidak boleh menghapusnya diam-diam. Penanda "dari rencana" disimpan di
 * data-attribute, bukan dibaca dari teksnya: identitas data tidak pernah
 * bersandar pada apa yang kebetulan tampil.
 */
function spIsiKodeKain_() {
  const kotak = document.getElementById("sp-gl-kodekain");
  if (!kotak) return;
  const rencana = (window.SP_BAHAN_RENCANA && window.SP_BAHAN_RENCANA.peta) || {};
  const warna = (document.getElementById("sp-gl-warna") || {}).value || "";
  const kain = (document.getElementById("sp-gl-kain") || {}).value || "";
  const norm = function (s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); };
  const kode = rencana[norm(warna) + "||" + norm(kain)] || "";

  const isiSekarang = String(kotak.value || "").trim();
  const dariRencana = kotak.getAttribute("data-dari-rencana") || "";
  // Boleh ditimpa hanya kalau kosong, atau isinya memang hasil isian otomatis
  // sebelumnya (bukan ketikan manusia).
  if (isiSekarang && isiSekarang !== dariRencana) return;
  kotak.value = kode;
  kotak.setAttribute("data-dari-rencana", kode);
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
    const panel = spModeGelaran_() === "Panel Klien";
    if (!(document.getElementById("sp-gl-komponen") || {}).value) {
      alert(panel
        ? "Panel yang diserahkan wajib diisi.\n\nMisal: Badan Depan, Lengan."
        : "Komponen yang diganti wajib diisi.\n\nMisal: Lengan, Badan Depan."); return;
    }
    if (!sel.value && !Number((document.getElementById("sp-gl-kain-manual") || {}).value)) {
      alert((panel ? "Panel klien" : "Re-cut") + " tanpa marker: isi kain terpakai."); return;
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
        // v149: kirim MODE apa adanya. Versi lama memampatkannya jadi
        // boolean ("Re-cut" atau "Normal") -- begitu mode ketiga lahir,
        // Panel Klien akan tersimpan sebagai Re-cut dan mencemari justru
        // angka yang pemisahannya dibuat untuk melindunginya.
        jenisGelaran: spModeGelaran_(),
        komponen: (document.getElementById("sp-gl-komponen") || {}).value || "",
        alasan: (document.getElementById("sp-gl-alasan") || {}).value || "",
        untukLine: (document.getElementById("sp-gl-untukline") || {}).value || "",
        recutDariQC: (document.getElementById("sp-gl-recut-qc") || {}).value || "",   // v185
        kainTerpakai: (document.getElementById("sp-gl-kain-manual") || {}).value || "",
        jumlahLapis: lapis,
        allowancePerLapis: (document.getElementById("sp-gl-allow") || {}).value,
        tanggalPotong: (document.getElementById("sp-gl-tanggal") || {}).value || "",
        catatan: (document.getElementById("sp-gl-catatan") || {}).value || "",
        kodeKain: (document.getElementById("sp-gl-kodekain") || {}).value || "",
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
    // v185: satu prefill untuk satu gelaran re-cut. Kalau dibiarkan, gelaran
    // re-cut berikutnya (kejadian lain) ikut tercap QC yang sama.
    const qcDipakai = (document.getElementById("sp-gl-recut-qc") || {}).value || "";
    if (window.SP_RECUT_QC_GELARAN && qcDipakai === window.SP_RECUT_QC_GELARAN.idQC) {
      window.SP_RECUT_QC_GELARAN = null;
    }
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
        // v153: PANEL KLIEN dapat penandanya sendiri. Tanpa ini, satu-satunya
        // cara membedakannya dari gelaran normal adalah membuka sheet --
        // padahal efeknya ke jumlah baju berbeda total (tidak menambah), dan
        // itu justru yang paling perlu terlihat sekilas.
        const panelKlien = /panel/i.test(String(g.jenisGelaran || ""));
        const penanda =
          (recut ? ' <span class="sp-tag-kembali">RE-CUT</span>' : '') +
          (panelKlien ? ' <span class="sp-tag-kembali">PANEL KLIEN</span>' : '') +
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
        // v153: PKL (Panel Klien) ikut dikenali. Versi v149 menambah jenis
        // gelaran ketiga tapi melewatkan pola ID di sini -- akibatnya jam
        // gelaran panel klien tidak pernah tampil, diam-diam, karena pola
        // yang tidak cocok memang sengaja gagal tanpa suara. Daftar keras
        // yang harus diingat manusia, lagi.
        const cocokId = /^(?:GLR|RCT|PKL)\d{12}$/.test(String(g.idGelaran || ""));
        const jam = cocokId
          ? String(g.idGelaran).substr(9, 2) + ":" + String(g.idGelaran).substr(11, 2)
          : "";
        // ID tetap melekat di barisnya lewat title -- tidak makan lebar, tapi
        // masih bisa dicocokkan dengan SD Gelaran saat menelusuri sesuatu.
        return '<tr title="' + spEsc_(g.idGelaran) + '"' +
          (g.dibatalkan ? ' class="sp-gelar-batal"' : '') + '>' +
          selItem +
          // v143: CATATAN akhirnya terlihat. Sebelum ini kolomnya tersimpan
          // ke SD Gelaran dan bahkan ikut dikirim ke layar -- tapi tidak
          // pernah dirender, jadi mengisinya terasa sia-sia. Ditaruh di
          // kolom Warna karena kolom itu satu-satunya yang selalu tampil.
          '<td data-label="Warna">' + spEsc_(g.warna || "-") + penanda +
            (g.catatan ? '<div class="sp-gelar-size" title="catatan">&#8220;' +
              spEsc_(g.catatan) + '&#8221;</div>' : '') + '</td>' +
          // v143: kode kain aktual tampil di bawah slot kainnya. Selama ini
          // kode cuma ada di rencana order -- yang benar-benar digelar tidak
          // pernah terlihat di mana pun.
          '<td data-label="Kain">' + spEsc_(g.jenisKain || "-") +
            (g.komponen ? ' <small>(' + spEsc_(g.komponen) + ')</small>' : '') +
            (g.kodeKain ? '<div class="sp-gelar-size">' + spEsc_(g.kodeKain) + '</div>' : '') +
            // v154: line pemohon re-cut. Ditampilkan supaya polanya kelihatan
            // tanpa perlu membuka sheet -- "Payak lagi" tiga baris berturut
            // adalah petunjuk yang tidak akan pernah muncul dari angka total.
            (g.untukLine ? '<div class="sp-gelar-size">&#8594; ' +
              spEsc_(spNamaLine_(g.untukLine)) + '</div>' : '') +
            '</td>' +
          '<td data-label="Lapis">' + (g.jumlahLapis || "&#8212;") + '</td>' +
          '<td data-label="Potongan"><b>' + g.total + '</b>' +
            (per ? '<div class="sp-gelar-size">' + spEsc_(per) + '</div>' : '') + '</td>' +
          '<td data-label="Kain terpakai">' + g.kainTerpakai + ' ' + spEsc_(g.satuanKain) + '</td>' +
          '<td data-label="Tanggal">' + spEsc_(g.tanggal || "-") +
            (jam ? '<div class="sp-gelar-size">' + jam + '</div>' : '') + '</td>' +
          // v153: baris PANEL KLIEN dapat tautan surat jalan -- panelnya keluar
          // pabrik sama seperti potongan yang diambil dari stok, jadi berhak
          // atas bukti serah-terima. Nomornya diterbitkan saat tautan dibuka
          // (lihat pkCetakDariPanelKlien_) dan disimpan balik, jadi membukanya
          // lagi memberi nomor yang sama.
          '<td data-label="">' + (g.dibatalkan
            ? '<span class="sp-riw-kunci">sudah dibatalkan</span>'
            : ((/panel/i.test(String(g.jenisGelaran || ""))
                ? spTombolDok_("sp-btn-kecil", "Surat Jalan",
                    "/p/cetak.html?jenis=sjpotongan&id=" + encodeURIComponent(g.idGelaran),
                    "Surat Jalan Potongan", g.idGelaran) + ' '
                : '') +
              '<button class="sp-btn-kecil" onclick="spBatalGelaran(\'' +
              spEsc_(g.idGelaran) + '\')" type="button">Batalkan</button>')) + '</td>' +
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
      // Perbaikan v122: v109 memindahkan nama item dari baris ke header
      // kelompok, jadi mencocokkan lewat teks baris SELALU gagal -- tombol
      // "Catat X pcs" mati sejak itu. Baris kini membawa identitasnya
      // sebagai data-attribute; teks tampilan bukan tempat menyimpan data.
      const cocokDs = rapikan(tr.dataset.style || "") === rapikan(isi.style) ||
        rapikan(tr.dataset.artikel || "") === rapikan(isi.style);
      const adaDs = (tr.dataset.style || tr.dataset.artikel);
      if (adaDs) { if (!cocokDs) return; }
      else if (rapikan(tr.textContent || "").indexOf(rapikan(isi.style)) === -1) return;
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
  // v210: tombol Laporan Cutting -- dokumen cetak per PO yang merangkum
  // hasil potong vs order, konsumsi kain, sisa roll, gelaran, dan mutu.
  // Dibuka sebagai pratinjau modal seperti dokumen lain. Dideklarasikan di
  // sini, DI LUAR cabang kosong -- const berskop blok, dan cabang render
  // utama juga memakainya.
  const tombolLaporan = window.SP_PO_AKTIF
    ? '<div class="sp-laporan-aksi">' +
        spTombolDok_("sp-spk-btn utama", "&#128438; Cetak Laporan Cutting",
          "/p/cetak.html?jenis=laporancutting&id=" + encodeURIComponent(window.SP_PO_AKTIF),
          "Laporan Cutting " + window.SP_PO_AKTIF, "hasil potong, konsumsi kain, sisa roll, gelaran, mutu") +
      '</div>'
    : '';
  if (!semua.length) {
    wadah.innerHTML = tombolLaporan + '<p class="sp-info">Belum ada data kain untuk PO ini.</p>';
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

  wadah.innerHTML = tombolLaporan +
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
        const kodeSungguhan = (k.perKode || []).filter(function (pk) { return !!pk.kode; });
        const satuKode = ((k.perKode || []).length === 1 && kodeSungguhan.length === 1) ? kodeSungguhan[0] : null;
        return '<tr class="' + kelas + '">' +
          '<td data-label="Kain"><b>' + spEsc_(k.jenis) + '</b></td>' +
          // Kain klien selalu datang per warna, jadi warna sekelas dengan nama
          // kain di rekap ini -- bukan pelengkap.
          '<td data-label="Warna">' + (k.warna && k.warna !== "(semua warna)"
            ? spEsc_(k.warna)
            : '<span class="sp-kosong">semua warna</span>') +
            // v203: satu kode saja -> ditempel di sini, tidak perlu baris rincian
            // (angkanya pasti sama dengan induknya).
            (satuKode ? ' <span class="sp-kode-kain">' + spEsc_(satuKode.kode) + '</span>' : '') +
            '</td>' +
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
          // v207: kotak ukur manual HANYA untuk kain yang rollnya belum
          // tercatat. Kalau roll ada, sisa datang dari pengukuran per roll
          // dan backend memang mengabaikan isian di sini (terukurRoll menang
          // atas terukur) -- menampilkan kotak yang tidak berpengaruh adalah
          // mengundang orang mengisi sesuatu yang hilang tanpa jejak.
          '<td data-label="Sisa ukur">' + (
            k.sisaDariRoll
              ? '<span class="sp-kain-dariroll' + (k.rollLengkap ? '' : ' belum') + '">' +
                  k.sisaTerukur + '<small>' +
                  (k.rollLengkap
                    ? (k.rollDiukur + ' roll diukur')
                    : (k.rollDiukur + ' dari ' + k.jumlahRoll + ' roll \u00b7 belum lengkap')) +
                  '</small></span>'
              : (k.jumlahRoll > 0
                  ? '<span class="sp-kosong">ukur per roll di atas' +
                      (k.jumlahRoll > k.rollDiukur
                        ? ' &#183; ' + (k.jumlahRoll - k.rollDiukur) + ' belum' : '') +
                    '</span>'
                  : (k.sisaTerukur === null
                      ? '<input class="sp-kain-ukur" data-jenis="' + spEsc_(k.jenis) +
                        '" data-warna="' + spEsc_(k.warna === "(semua warna)" ? "" : (k.warna || "")) +
                        '" placeholder="ukur" step="0.01" type="number"/>'
                      : k.sisaTerukur))) + '</td>' +
          '<td data-label="Selisih">' + (k.selisih === null ? "-"
            : (k.selisih + " (" + k.persenSelisih + "%) " + k.tanda)) + '</td></tr>' +
          // v203: rincian per KODE KAIN di bawah baris kain/warna -- bahasa
          // yang dipakai klien di surat jalannya. Baris induk tetap angka
          // total; rincian hanya kalau ada kode sungguhan. Sisa ukur dan
          // selisih memang tidak per kode: hasil ukur dicatat per roll, dan
          // roll sudah membawa kodenya masing-masing di panel Roll Kain.
          (satuKode ? [] : (k.perKode || [])).map(function (pk) {
            return '<tr class="sp-kain-kode">' +
              '<td data-label="Kain"></td>' +
              '<td data-label="Kode">' + (pk.kode
                ? '<span class="sp-kode-kain">' + spEsc_(pk.kode) + '</span>'
                : '<span class="sp-kosong">tanpa kode</span>') +
                (pk.jumlahRoll ? ' <small>' + pk.jumlahRoll + ' roll</small>' : '') + '</td>' +
              '<td data-label="Diterima">' + pk.diterima + ' m</td>' +
              '<td data-label="Terpakai">' + pk.terpakai + '</td>' +
              '<td data-label="Re-cut"></td>' +
              '<td data-label="Sisa hitung">' + pk.sisaHitung + '</td>' +
              '<td data-label="Sisa ukur"></td><td data-label="Selisih"></td></tr>';
          }).join("");
      }).join("") +
    '</tbody></table></div>' +
    // v207: tombol ikut hilang kalau tidak ada satu pun kotak ukur manual --
    // tombol simpan yang tidak punya isian adalah janji kosong.
    (dipakai.some(function (k) { return !k.sisaDariRoll && !(k.jumlahRoll > 0) && k.sisaTerukur === null; })
      ? '<button class="sp-simpan-btn" onclick="spSimpanSisaKain(this)" type="button">Simpan Hasil Ukur</button>'
      : '') +
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
        '<td data-label="Alasan">' + spEsc_(r.alasan || "-") +
          (r.recutDariQC ? ' <span class="sp-tag-kembali">' + spEsc_(r.recutDariQC) + '</span>' : '') +   // v185
        '</td></tr>');
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
      // v204: sisa boleh diukur dalam satuan lain (roll 100 yds, diukur
      // dengan meteran). Terpakai karena itu dihitung di METER, lalu
      // ditampilkan dalam meter juga -- mencampur "100 yds" dengan "10 m"
      // dalam satu pengurangan adalah persis kesalahan yang mau dihindari.
      const satuanRoll = r.satuan || "m";
      // Belum diukur -> bawaan METER (alat ukur di lantai). Sudah diukur ->
      // satuan yang tersimpan; data sebelum v204 kosong dan dibaca backend
      // sebagai satuan roll, jadi angkanya tidak berubah arti.
      const satuanSisa = r.satuanSisa || (diukur ? satuanRoll : "m");
      const keM = function (v, u) { return (u === "yds") ? (v * 0.9144) : v; };
      const terpakai = diukur
        ? (Math.round((keM(r.panjangAwal, satuanRoll) - keM(r.sisaTerukur, satuanSisa)) * 100) / 100)
        : null;
      return '<tr' + (diukur ? '' : ' class="sp-roll-belum"') + '>' +
        '<td data-label="No Roll"><b>' + spEsc_(r.noRoll || "-") + '</b>' +
          // v203: kode kain dari surat jalan klien, per roll.
          (r.kodeKain ? '<div class="sp-kode-kain">' + spEsc_(r.kodeKain) + '</div>' : '') + '</td>' +
        // Angka ASLI di depan, konversi di belakang dalam kurung. Roll yang
        // datang 60 yds ditampilkan "60 yds" -- bukan "54,86 m" yang terasa
        // seperti angka lain saat dicocokkan dengan surat jalan supplier.
        '<td data-label="Panjang awal">' + r.panjangAwal + ' ' + spEsc_(r.satuan || "m") +
          (r.satuan && r.satuan !== "m"
            ? ' <small>(' + r.panjangAwalMeter + ' m)</small>' : '') + '</td>' +
        '<td data-label="Terpakai">' + (terpakai === null ? "&#8212;"
          : (terpakai + ' m')) + '</td>' +
        // Satuan ditempel di label kolom, bukan cuma di header: di layar sempit
        // tabel jadi kartu dan headernya hilang -- kalau satuan cuma di header,
        // orang mengisi angka tanpa tahu satuannya apa.
        // v204: satuan sisa dipilih di sebelah angkanya, default METER --
        // itu yang dipakai meteran di lantai. Sebelumnya angka masuk sebagai
        // satuan roll tanpa label apa pun di layar lebar, jadi "10" yang
        // dimaksud 10 m tercatat 10 yds tanpa ada yang bisa menyadarinya.
        '<td data-label="Sisa terukur" class="sp-roll-sisa-sel">' +
          '<div class="sp-roll-ukur">' +
            '<input class="sp-roll-sisa" data-id="' + spEsc_(r.idRoll) +
              '" min="0" placeholder="ukur" step="0.01" oninput="spKonversiSisaRoll_(this)" ' +
              'type="number" value="' + (diukur ? r.sisaTerukur : "") + '"/>' +
            '<select class="sp-roll-satuansisa" data-id="' + spEsc_(r.idRoll) +
              '" onchange="spKonversiSisaRoll_(this)">' +
              ["m", "yds"].map(function (u) {
                return '<option' + (u === satuanSisa ? ' selected="selected"' : '') +
                  ' value="' + u + '">' + u + '</option>';
              }).join("") +
            '</select>' +
          '</div>' +
          '<div class="sp-konversi" data-awal-m="' +
            (Math.round(keM(r.panjangAwal, satuanRoll) * 100) / 100) + '"></div></td>' +
        '<td data-label="Kondisi">' +
          // v206: kondisi DITURUNKAN dari sisa vs panjang awal, tidak dipilih.
          // Dropdown yang bisa bertentangan dengan angkanya adalah sumber
          // ringkasan "utuh" yang berbohong.
          '<span class="sp-roll-kondisi-auto">' + spEsc_(spKondisiSisa_(
            (diukur ? r.sisaTerukur : null), satuanSisa, keM(r.panjangAwal, satuanRoll))) +
          '</span></td>' +
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

    // v203: kalau semua roll satu kode, tampilkan di judul supaya tidak
    // diulang di tiap baris; kalau campur, biarkan per baris yang bicara.
    const kodeSemua = g.roll.map(function (r) { return r.kodeKain || ""; })
      .filter(function (k, i, a) { return a.indexOf(k) === i; });
    const kodeJudul = (kodeSemua.length === 1 && kodeSemua[0])
      ? ' <span class="sp-kode-kain sp-kode-kain-inline">' + spEsc_(kodeSemua[0]) + '</span>' : '';
    return '<div class="sp-set-blok">' +
      '<div class="sp-set-judul">' + spEsc_(g.jenis) +
        (g.warna && g.warna !== "(semua warna)" ? ' &#183; ' + spEsc_(g.warna) : '') + kodeJudul +
        '<span class="sp-set-siap">' + g.jumlahRoll + ' ROLL <b>' +
          g.totalPanjangAwal + ' m</b>' +
          (g.satuanAsli && g.satuanAsli !== "m"
            ? ' <small>(dicatat dalam ' + spEsc_(g.satuanAsli) + ')</small>' : '') +
        '</span></div>' +
      rincian +
      '<div class="sp-tabelwrap sp-tabelwrap-kartu"><table class="sp-tabel sp-tabel-kartu">' +
        '<thead><tr><th>No Roll</th><th>Panjang awal</th><th>Terpakai</th>' +
        '<th>Sisa terukur</th><th>Kondisi</th><th></th></tr></thead><tbody>' + baris +
        '</tbody></table></div>' +
    '</div>';
  }).join("");

  // v204b: form "Tambah roll" DI ATAS daftar. Urutan kerjanya memang begitu --
  // kain datang lebih dulu, sisanya diukur berminggu kemudian. Di bawah
  // daftar, form itu perlu digulir melewati 16 baris roll setiap kali kiriman
  // baru masuk. "Simpan Hasil Ukur Roll" tetap menempel di bawah daftar,
  // dekat dengan kotak-kotak yang barusan diisi.
  wadah.innerHTML =
    spFormTambahRoll_() +
    (daftar.length
      ? blok + '<button class="sp-simpan-btn" onclick="spSimpanSisaRoll(this)" type="button">' +
        'Simpan Hasil Ukur Roll</button>'
      : '<p class="sp-info">Belum ada roll tercatat. Isi saat kain datang &#8212; ' +
        'nomor roll dan panjangnya. Sisanya diukur nanti setelah selesai digelar.</p>');
}

function spFormTambahRoll_() {
  const kain = window.SP_PO_KAIN || [];
  const warna = window.SP_PO_WARNA || [];
  return '<div class="sp-roll-tambah">' +
    '<div class="sp-lbl">Tambah roll (saat kain datang)</div>' +
    '<div class="sp-tabelwrap"><table class="sp-tabel"><thead><tr>' +
      '<th>Jenis Kain</th><th>Warna</th><th>Kode Kain</th><th>No Roll</th><th>Panjang</th>' +
      '<th>Satuan</th><th></th>' +
    '</tr></thead><tbody id="sp-roll-baru"></tbody></table></div>' +
    '<button class="sp-btn-kecil" onclick="spTambahBarisRoll()" type="button">+ Tambah baris</button> ' +
    '<button class="sp-simpan-btn" onclick="spSimpanRoll(this)" type="button">Simpan Roll</button>' +
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
  // v203: kode ikut disalin ke baris berikutnya -- 16 roll satu kiriman
  // biasanya satu kode; yang berbeda tinggal diganti.
  const kodeLama = terakhir ? ((terakhir.querySelector(".sp-rb-kode") || {}).value || "") : "";
  const satuanLama = terakhir
    ? ((terakhir.querySelector(".sp-rb-satuan") || {}).value || "m") : "m";
  tb.insertAdjacentHTML("beforeend",
    '<tr>' +
      '<td data-label="Jenis Kain"><input class="sp-rb-kain" list="sp-datalist-kainroll" ' +
        'placeholder="jenis kain" type="text" value="' + spEsc_(kainLama) + '"/></td>' +
      '<td data-label="Warna"><input class="sp-rb-warna" list="sp-datalist-warnaroll" ' +
        'placeholder="warna" type="text" value="' + spEsc_(warnaLama) + '"' +
        ' onchange="spIsiKodeRoll_(this)"/></td>' +
      // v203: kode kain dari surat jalan klien. Datalist = kode rencana SO
      // (sp-datalist-kodekain, dibuat form gelaran); saat warna dipilih dan
      // kotak masih kosong, diisi dari rencana untuk (warna, kain) itu.
      '<td data-label="Kode Kain"><input class="sp-rb-kode" list="sp-datalist-kodekain" ' +
        'placeholder="mis. C75" type="text" value="' + spEsc_(kodeLama) + '" ' +
        'style="text-transform:uppercase"/></td>' +
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
/** v203: isi kode kain roll dari rencana SO kalau kotaknya masih kosong. */
function spIsiKodeRoll_(el) {
  const tr = el.closest("tr");
  if (!tr) return;
  const kotak = tr.querySelector(".sp-rb-kode");
  if (!kotak || kotak.value.trim()) return;
  const rencana = (window.SP_BAHAN_RENCANA && window.SP_BAHAN_RENCANA.peta) || {};
  const norm = function (x) { return String(x || "").trim().toLowerCase().replace(/\s+/g, " "); };
  const warna = (tr.querySelector(".sp-rb-warna") || {}).value || "";
  const kain = (tr.querySelector(".sp-rb-kain") || {}).value || "";
  kotak.value = rencana[norm(warna) + "||" + norm(kain)] || "";
}

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

function spSimpanRoll(btn) {
  const roll = [];
  document.querySelectorAll("#sp-roll-baru tr").forEach(function (tr) {
    const jenisKain = (tr.querySelector(".sp-rb-kain").value || "").trim();
    const panjang = Number(tr.querySelector(".sp-rb-panjang").value) || 0;
    if (!jenisKain || panjang <= 0) return;
    roll.push({
      jenisKain: jenisKain,
      warna: (tr.querySelector(".sp-rb-warna").value || "").trim(),
      noRoll: (tr.querySelector(".sp-rb-no").value || "").trim(),
      kodeKain: ((tr.querySelector(".sp-rb-kode") || {}).value || "").trim(),   // v203
      panjangAwal: panjang,
      satuan: (tr.querySelector(".sp-rb-satuan") || {}).value || "m"
    });
  });
  if (!roll.length) { alert("Isi minimal satu roll: jenis kain dan panjangnya."); return; }
  const pulih = spTombolSibuk_(btn, "Menyimpan " + roll.length + " roll...");

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
    spMuatGelaran();   // tombol dipulihkan oleh render ulang
  })
  .catch(function (e) { pulih(); alert(e.message || e); });
}

/**
 * v204 -- indikator "sedang bekerja" untuk tombol aksi.
 *
 * Tiga tombol di area Roll & Rekap Kain (Simpan Roll, Simpan Hasil Ukur Roll,
 * Simpan Hasil Ukur) mengirim fetch TANPA tanda apa pun: tombolnya tetap
 * hidup, teksnya tidak berubah, dan sukses cuma memuat ulang daftar --
 * yang perlu beberapa detik. Orang wajar menyimpulkan kliknya tidak masuk,
 * lalu menekan lagi berkali-kali. Setiap tekanan = satu permintaan lagi.
 *
 * Tombol lain (Simpan Hasil Potong, Setoran, dll) sudah punya pola ini
 * sejak lama; di sini pola itu dijadikan satu helper supaya tombol
 * berikutnya tidak perlu mengulang tiga baris yang sama -- dan tidak ada
 * lagi tombol yang lupa diberi tanda.
 *
 * Dipakai: const pulih = spTombolSibuk_(btn, "Menyimpan...");  ... pulih();
 */
function spTombolSibuk_(el, teks) {
  if (!el || el.tagName !== "BUTTON") return function () {};
  const teksAsli = el.textContent;
  el.disabled = true;
  el.textContent = teks || "Menyimpan...";
  return function () { el.disabled = false; el.textContent = teksAsli; };
}

/**
 * v204 -- pratinjau saat mengukur sisa roll.
 * Menampilkan setara meter kalau satuannya yds, dan MEMPERINGATKAN kalau
 * sisa melebihi panjang awal (backend menolaknya; lebih baik ketahuan
 * sebelum ditekan Simpan, bukan sesudah).
 */
/**
 * v206: label kondisi sisa. Aturannya sama persis dengan backend
 * (kondisiSisaRoll2_) -- kalau berbeda, layar dan sheet akan bercerita
 * lain tentang roll yang sama.
 */
function spKondisiSisa_(sisa, satuan, awalMeter) {
  if (sisa === null || sisa === undefined || sisa === "") return "\u2014";
  const m = (satuan === "yds") ? Number(sisa) * 0.9144 : Number(sisa);
  if (!(m > 0.001)) return "Habis";
  if (awalMeter > 0 && m >= awalMeter - 0.5) return "Utuh";
  return "Potongan";
}

function spKonversiSisaRoll_(el) {
  const td = el.closest("td");
  if (!td) return;
  const wadah = td.querySelector(".sp-konversi");
  if (!wadah) return;
  const mentah = (td.querySelector(".sp-roll-sisa") || {}).value;
  const nilai = Number(mentah);
  const satuan = (td.querySelector(".sp-roll-satuansisa") || {}).value || "m";
  const awalM = Number(wadah.dataset.awalM) || 0;

  // v206: label kondisi diperbarui LEBIH DULU dan tanpa syarat. Sebelumnya
  // fungsi ini keluar lebih awal untuk nilai 0/kosong, jadi mengetik 0
  // meninggalkan label di nilai sebelumnya -- "Utuh" untuk roll yang habis.
  const tr0 = td.closest("tr");
  const lbl0 = tr0 ? tr0.querySelector(".sp-roll-kondisi-auto") : null;
  if (lbl0) lbl0.textContent = spKondisiSisa_(mentah === "" ? null : nilai, satuan, awalM);

  if (!(nilai > 0)) { wadah.textContent = ""; wadah.classList.remove("lebih"); return; }
  const nilaiM = satuan === "yds" ? nilai * 0.9144 : nilai;
  const lebih = awalM > 0 && nilaiM > awalM + 0.01;
  wadah.classList.toggle("lebih", lebih);
  wadah.textContent = lebih
    ? ("melebihi panjang awal " + (Math.round(awalM * 100) / 100) + " m")
    : (satuan === "yds" ? ("= " + (Math.round(nilaiM * 100) / 100) + " m") : "");

}

function spSimpanSisaRoll(btn) {
  const sisa = [];
  document.querySelectorAll(".sp-roll-sisa").forEach(function (inp) {
    if (inp.value === "") return;
    const v = Number(inp.value);
    if (isNaN(v)) return;
    const selSat = document.querySelector('.sp-roll-satuansisa[data-id="' + inp.dataset.id + '"]');
    // v206: kondisi tidak dikirim lagi -- backend menurunkannya dari angka.
    sisa.push({ idRoll: inp.dataset.id, sisa: v, satuan: selSat ? selSat.value : "m" });
  });
  if (!sisa.length) { alert("Belum ada sisa roll yang diisi."); return; }
  const pulih = spTombolSibuk_(btn, "Menyimpan " + sisa.length + " roll...");

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "simpanSisaRoll",
      payload: { idPurchaseOrder: window.SP_PO_AKTIF, sisa: sisa } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    // Daftar dimuat ulang (beberapa detik). Tombol SENGAJA tetap mati sampai
    // render selesai -- kalau dipulihkan di sini, layar masih menampilkan
    // angka lama dengan tombol hidup, dan orang menekannya lagi.
    alert(sisa.length + " roll tersimpan.");
    spMuatGelaran();
  })
  .catch(function (e) { pulih(); alert(e.message || e); });
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

function spSimpanSisaKain(btn) {
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
  const pulih = spTombolSibuk_(btn, "Menyimpan " + sisa.length + " baris...");

  fetch(SP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: SP_ID_TOKEN, action: "simpanSisaKain",
      payload: { idPurchaseOrder: window.SP_PO_AKTIF, sisa: sisa } })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) throw new Error((d && d.error) || "Gagal menyimpan.");
    alert(sisa.length + " hasil ukur tersimpan.");
    spMuatGelaran();   // tombol dipulihkan oleh render ulang
  })
  .catch(function (e) { pulih(); alert(e.message || e); });
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
  wadah.innerHTML = spMuatHtml_("Memuat...");
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
// Default "Finishing" (v118): tab ini hidup di fase Finishing dan 90%
// pemakaiannya QC Finishing (sumber stok siap kirim). Potong/Jahit tetap
// sekali klik. Tombol tahap di markup di-highlight saat panel dimuat.
let QC_TAHAP_DIPILIH = "Finishing";
let QC_RINGKASAN_DIMUAT = false;
let QC_RINCIAN_PO = null;
let QC_WARNA_DIPILIH = null;

/** Pemuat malas tab QC: master + daftar PO dimuat SEKALI per sesi. */
function spMuatQC_() {
  if (window.QC_SUDAH_DIMUAT) return;
  window.QC_SUDAH_DIMUAT = true;
  qcMuatMaster_();
  // sorot tombol tahap default (Finishing) -- markup lahir tanpa active
  try { qcPilihTahap(QC_TAHAP_DIPILIH); } catch (e) { /* elemen belum ada */ }
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

/* ============================================================
   TERSEDIA UNTUK QC FINISHING (v121)
   ============================================================
   Cermin aturan setoran v119: QC Finishing hanya atas setoran jadi-baju
   yang SUDAH dikonfirmasi finishing. Angka tersedia ditampilkan di bawah
   Qty Diperiksa SEBELUM operator mengetik; pengaman kerasnya di server
   (submitInspeksiQC) -- pra-cek di sini cuma sopan santun. */
let QC_TERSEDIA = null;   // baris getTersediaQC utk PO aktif
// v182: keranjang ditahan PO aktif + mode sesi form.
// "baru" = inspeksi biasa; "penyelesaian" = menutup keranjang (baris
// pembukuan: diperiksa 0, ditahan negatif). Mode diganti lewat spanduk.
let QC_DITAHAN = null;
let QC_MODE_SESI = "baru";

function qcKunciWarnaFE_(brand, artikel, style, warna) {
  return [brand, artikel, style, warna].map(function (x) {
    return String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
  }).join("|");
}

function qcMuatTersedia_() {
  QC_TERSEDIA = null;
  const po = (QC_PO_TERPILIH && QC_PO_TERPILIH.idPurchaseOrder) || window.SP_PO_AKTIF || "";
  if (!po) { qcTampilTersedia_(); return; }
  fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
    idToken: SP_ID_TOKEN, action: "getTersediaQC", idPurchaseOrder: po }) })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.error) QC_TERSEDIA = d.baris || [];
    qcTampilTersedia_();
  })
  .catch(function () { qcTampilTersedia_(); });
}

function qcMuatDitahan_() {
  QC_DITAHAN = null;
  const po = (QC_PO_TERPILIH && QC_PO_TERPILIH.idPurchaseOrder) || window.SP_PO_AKTIF || "";
  if (!po) { qcTampilDitahan_(); return; }
  fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
    idToken: SP_ID_TOKEN, action: "getDitahanQC", idPurchaseOrder: po }) })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.error) QC_DITAHAN = d.baris || [];
    qcTampilDitahan_();
  })
  .catch(function () { qcTampilDitahan_(); });
}

/** Keranjang terbuka untuk tahap + warna yang sedang dipilih. */
function qcCariDitahan_() {
  if (!QC_DITAHAN || !QC_WARNA_DIPILIH) return null;
  const tahap = window.QC_TAHAP_DIPILIH || QC_TAHAP_DIPILIH || "";
  const w = QC_WARNA_DIPILIH;
  const kunci = tahap + "|" + qcKunciWarnaFE_(w.brand, w.artikel, w.style, w.warna);
  return QC_DITAHAN.filter(function (b) {
    return (b.tahap + "|" + qcKunciWarnaFE_(b.brand, b.artikel, b.style, b.warna)) === kunci;
  })[0] || null;
}

/**
 * Spanduk keranjang: tampil hanya kalau tahap+warna terpilih PUNYA barang
 * ditahan yang belum diselesaikan. Elemen dibuat sekali, pola sama dengan
 * qcTampilTersedia_ -- template tidak perlu markup baru untuk spanduknya.
 */
function qcTampilDitahan_() {
  const acuan = document.getElementById("qc-warna");
  if (!acuan) return;
  const field = acuan.closest(".qc-field");
  if (!field) return;
  let b = document.getElementById("qc-ditahan-banner");
  if (!b) {
    b = document.createElement("div");
    b.id = "qc-ditahan-banner";
    b.className = "qc-ditahan-banner hidden";
    field.insertAdjacentElement("afterend", b);
  }
  const k = qcCariDitahan_();
  if (!k || !(k.terbuka > 0) || QC_MODE_SESI === "penyelesaian") {
    b.classList.add("hidden");
    if (QC_MODE_SESI !== "penyelesaian") qcSetModeSesi_("baru");
    return;
  }
  b.classList.remove("hidden");
  b.innerHTML = '<b>' + k.terbuka + ' pcs masih di keranjang perbaikan</b> untuk warna ini' +
    (k.idLine ? ' (terakhir di line ' + rjdEscapeHtml_(k.idLine) + ')' : '') +
    '. Sebelum diselesaikan, barang itu tidak masuk stok siap kirim.' +
    '<button onclick="qcSetModeSesi_(\'penyelesaian\')" type="button">Selesaikan sekarang</button>';
}

function qcCariTersedia_() {
  if (!QC_TERSEDIA || !QC_WARNA_DIPILIH) return null;
  const w = QC_WARNA_DIPILIH;
  const kunci = qcKunciWarnaFE_(w.brand, w.artikel, w.style, w.warna);
  return QC_TERSEDIA.filter(function (b) {
    return qcKunciWarnaFE_(b.brand, b.artikel, b.style, b.warna) === kunci;
  })[0] || { tersedia: 0, menunggu: 0, terkonfirmasi: 0, sudahDiperiksa: 0 };
}

function qcTampilTersedia_() {
  // hint hidup di bawah field Qty Diperiksa, dibuat sekali
  //
  // v180 -- BUG DIPERBAIKI: id yang dicari "qc-diperiksa", padahal input di
  // template ber-id "qc-periksa". getElementById mengembalikan null, fungsi
  // langsung return, dan hint jumlah tersedia (fitur v121) TIDAK PERNAH SEKALI
  // PUN TAMPIL sejak dipasang. Tidak ada error di console -- kegagalan senyap,
  // jenis yang cuma ketahuan kalau ada yang menelusuri id satu per satu.
  const inp = document.getElementById("qc-periksa");
  if (!inp) return;
  const field = inp.closest(".qc-field");
  if (!field) return;
  let hint = document.getElementById("qc-tersedia-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "qc-tersedia-hint";
    hint.style.cssText = "font-size:12px;margin-top:6px;color:var(--ink-soft)";
    field.appendChild(hint);
  }
  const tahap = window.QC_TAHAP_DIPILIH || QC_TAHAP_DIPILIH;
  if (tahap !== "Finishing" || !QC_WARNA_DIPILIH) { hint.innerHTML = ""; return; }
  const t = qcCariTersedia_();
  if (!t) { hint.innerHTML = ""; return; }
  let teks = 'Tersedia untuk QC: <b>' + t.tersedia + ' pcs</b>' +
    ' <span style="color:var(--ink-soft)">(terkonfirmasi ' + t.terkonfirmasi +
    ' &#8722; diperiksa ' + t.sudahDiperiksa + ')</span>';
  if (t.menunggu > 0) {
    teks += '<br/><span style="color:#8F5A16">&#9888; ' + t.menunggu +
      ' pcs setoran menunggu konfirmasi &#8212; konfirmasi di <b>Finishing &#8250; Konfirmasi Setoran</b> dulu.</span>';
  }
  hint.innerHTML = teks;
}

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
    "<option value=''>-- Pilih PO lewat kartu di atas --</option></select>";
  fieldW.parentNode.insertBefore(f, fieldW);
}

function qcIsiDropdownItem_() {
  qcPastikanFieldItem_();
  const sel = document.getElementById("qc-item");
  if (!sel) return;
  if (!QC_RINCIAN_PO || !(QC_RINCIAN_PO.baris || []).length) {
    sel.innerHTML = '<option value="">-- Pilih PO lewat kartu di atas --</option>';
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
    qcMuatTersedia_();
    qcMuatDitahan_();
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
  setTimeout(qcTampilTersedia_, 0);   // v121: hint tersedia ikut warna
  // v182: spanduk keranjang ikut warna; ganti warna membatalkan mode penyelesaian.
  setTimeout(function () {
    if (QC_MODE_SESI !== "baru") qcSetModeSesi_("baru"); else qcTampilDitahan_();
  }, 0);
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
  if (selWarna) selWarna.innerHTML = '<option value="">-- Pilih PO lewat kartu di atas --</option>';
  qcRenderSizeLolos_();
  document.getElementById("qc-po-terpilih").classList.remove("show");
  document.getElementById("qc-po-terpilih").classList.add("hidden");   // pasangan perbaikan v106
  const input = document.getElementById("qc-po");
  input.classList.remove("hidden");
  input.value = "";
  input.focus();
}

// ============ TAB SWITCHER ============

/**
 * v118: Input/Ringkasan naik jadi SUBTAB FASE (Finishing > QC / Ringkasan
 * QC) -- dua rel segmen bertumpuk itu satu terlalu banyak, dan preseden
 * peleburannya sudah ada (konfirmasi, v116). Rel internal .qc-tabs
 * dipensiunkan: disembunyikan di sini, markup dibiarkan bertombstone.
 */
function qcModeSub_(mode) {
  const rel = document.querySelector(".qc-tabs");
  if (rel) rel.classList.add("hidden");
  qcSwitchTab(mode);
}

function qcSwitchTab(tab) {
  document.querySelectorAll(".qc-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("qc-panel-input").classList.toggle("hidden", tab !== "input");
  document.getElementById("qc-panel-ringkasan").classList.toggle("hidden", tab !== "ringkasan");
  if (tab === "ringkasan" && !QC_RINGKASAN_DIMUAT) qcMuatRingkasan();
}

// ============ MODE A: FORM INPUT ============

/**
 * v181: kunci tahap sesuai pintu yang dibuka. Pemilih tahap disembunyikan --
 * pintunya yang menentukan, bukan tombol. Markup pemilih SENGAJA dibiarkan
 * di template sebagai jaring pengaman versi: kalau template baru berjalan
 * dengan JS lama (yang tidak memanggil fungsi ini), pemilihnya tetap tampil
 * dan form tetap bisa dipakai seperti v180.
 *
 * Panduan panel ikut ditukar per pintu: spPasangPanduan_ hanya memasang
 * SEKALI per panel (guard querySelector .sp-panduan), padahal panel qc
 * sekarang dipakai tiga pintu -- tanpa penukaran ini, pintu yang dibuka
 * pertama menentukan panduan untuk semuanya.
 */
function qcKunciTahap_(tahap) {
  window.QC_TAHAP_KUNCI = tahap || "";
  const toggle = document.getElementById("qc-tahap-toggle");
  const field = toggle ? toggle.closest(".qc-field") : null;
  if (field) field.classList.toggle("hidden", !!tahap);
  if (tahap) qcPilihTahap(tahap);

  const panel = document.getElementById("sp-panel-qc");
  if (panel && typeof spPanduanHtml_ === "function") {
    const lama = panel.querySelector(".sp-panduan");
    if (lama) lama.remove();
    const html = spPanduanHtml_(window.SP_TAB);
    if (html) panel.insertAdjacentHTML("afterbegin", html);
  }
}

/**
 * v182: pindah antara sesi inspeksi biasa dan sesi PENYELESAIAN keranjang.
 *
 * Mode penyelesaian menyembunyikan isian yang tidak relevan (diperiksa,
 * diperbaiki, ditahan, jenis cacat, override keputusan) -- cacatnya sudah
 * tercatat di sesi asal, yang ditanya di sini cuma NASIB AKHIR barang
 * keranjang: berapa akhirnya lolos (per size, karena masuk stok siap kirim)
 * dan berapa akhirnya diafkir. Sisanya pembukuan otomatis di backend.
 */
function qcSetModeSesi_(mode) {
  QC_MODE_SESI = mode === "penyelesaian" ? "penyelesaian" : "baru";
  const py = QC_MODE_SESI === "penyelesaian";

  const sembunyi_ = function (id, ya) {
    const el = document.getElementById(id);
    const field = el ? el.closest(".qc-field") : null;
    if (field) field.classList.toggle("hidden", ya);
  };
  sembunyi_("qc-periksa", py);
  sembunyi_("qc-perbaiki", py);
  sembunyi_("qc-ditahan", py);
  sembunyi_("qc-detail-rows", py);
  sembunyi_("qc-keputusan-override", py);
  const kotakCacat = document.querySelector(".qc-cacat-box");
  if (kotakCacat) kotakCacat.classList.toggle("hidden", py);

  const lblLolos = document.querySelector('label[for="qc-lolos"]');
  if (lblLolos) lblLolos.textContent = py ? "Akhirnya lolos (selesai diperbaiki)" : "Qty lolos";
  sembunyi_("qc-py-afkir", !py);

  const kepala = document.getElementById("qc-py-kepala");
  if (kepala) {
    kepala.classList.toggle("hidden", !py);
    if (py) {
      const k = qcCariDitahan_();
      kepala.innerHTML = '<b>Menyelesaikan keranjang perbaikan</b> -- terbuka ' +
        ((k && k.terbuka) || 0) + ' pcs. Boleh dicicil; sisanya tetap tercatat ditahan. ' +
        '<button onclick="qcSetModeSesi_(\'baru\')" type="button">Batal, kembali ke inspeksi biasa</button>';
    }
  }
  const btn = document.getElementById("qc-submit-btn");
  if (btn) btn.textContent = py ? "Simpan penyelesaian" : "Simpan inspeksi";
  const afkirEl = document.getElementById("qc-py-afkir");
  if (afkirEl && !py) afkirEl.value = "";
  qcTampilDitahan_();
  qcRecalc();
}

function qcPilihTahap(tahap) {
  QC_TAHAP_DIPILIH = tahap;
  setTimeout(qcTampilTersedia_, 0);   // v121: hint hanya utk Finishing
  // v182: ganti tahap = keranjang yang relevan ikut ganti; mode kembali normal.
  if (QC_MODE_SESI !== "baru") qcSetModeSesi_("baru"); else setTimeout(qcTampilDitahan_, 0);
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

/**
 * ============================================================
 * v180 -- TIGA ANGKA MUTU, SATU ISIAN BARU
 * ============================================================
 * Temuan lapangan: tim mencatat QC SESUDAH barang cacat diperbaiki, jadi
 * hasilnya selalu "diperiksa 100, lolos 100, cacat 0". Angka stoknya benar,
 * tapi data mutunya hilang seluruhnya.
 *
 * Yang hilang cuma SATU angka -- berapa yang sempat cacat lalu diperbaiki --
 * jadi tambahannya juga satu isian, bukan satu form baru:
 *
 *     afkir     = diperiksa - lolos            (turunan, tidak diketik)
 *     ditemukan = afkir + diperbaiki           (turunan, tidak diketik)
 *
 * Rumus gerbang TIDAK tersentuh: stok siap kirim tetap dari Qty Lolos per
 * size di tahap Finishing.
 */
function qcRecalc() {
  // Qty Lolos berubah -> pembanding rincian size ikut berubah.
  if (typeof qcHitungTotalSize_ === "function") setTimeout(qcHitungTotalSize_, 0);
  // v182 mode penyelesaian: kotak cacat & pratinjau tidak relevan -- yang
  // dihitung cuma sisa keranjang, ditampilkan di kepala mode.
  if (QC_MODE_SESI === "penyelesaian") {
    const prev0 = document.getElementById("qc-keputusan-preview");
    if (prev0) prev0.classList.remove("show");
    return;
  }
  const p = Number(document.getElementById("qc-periksa").value) || 0;
  const l = Number(document.getElementById("qc-lolos").value) || 0;
  const b = Math.max(Number((document.getElementById("qc-perbaiki") || {}).value) || 0, 0);
  const t = Math.max(Number((document.getElementById("qc-ditahan") || {}).value) || 0, 0);
  const afkir = Math.max(p - l - t, 0);
  const ditemukan = afkir + b + t;

  const box = document.getElementById("qc-cacat-angka");
  box.textContent = ditemukan;
  box.parentElement.classList.toggle("qc-cacat-nol", ditemukan === 0);

  // Rincian ditaruh di elemen SENDIRI di bawah kotak, bukan span ketiga di
  // dalamnya: .qc-cacat-box di simpro-qc.css memakai span:first-child dan
  // span:last-child: menambah span ketiga akan memindahkan gaya angka besar
  // ke elemen yang salah.
  const rinci = document.getElementById("qc-cacat-rinci");
  if (rinci) {
    if (l + t > p && p > 0) {
      rinci.textContent = "Qty lolos (" + l + ") + ditahan (" + t + ") melebihi qty diperiksa (" + p + "). Cek lagi angkanya.";
      rinci.className = "qc-hint qc-cacat-rinci-salah";
    } else if (b > l && l >= 0 && p > 0) {
      rinci.textContent = "Qty diperbaiki (" + b + ") tidak boleh lebih besar dari Qty Lolos (" +
        l + ") -- barang yang diperbaiki berakhir sebagai barang lolos.";
      rinci.className = "qc-hint qc-cacat-rinci-salah";
    } else if (ditemukan === 0) {
      rinci.textContent = p > 0
        ? "Belum ada cacat tercatat. Kalau tadi ada yang sempat cacat lalu diperbaiki, isi kolom di atas -- angka itu yang selama ini tidak pernah tersimpan."
        : "";
      rinci.className = "qc-hint";
    } else {
      rinci.textContent = b + " diperbaiki \u00B7 " + afkir + " afkir" +
        (t > 0 ? " \u00B7 " + t + " ditahan (nasibnya dicatat lewat sesi penyelesaian)" : "");
      rinci.className = "qc-hint";
    }
  }

  // Isian tidak masuk akal (diperbaiki > lolos): JANGAN tampilkan pratinjau
  // keputusan. Angka turunannya ikut mustahil ("cacat ditemukan 105%"), dan
  // pratinjau mustahil di sebelah peringatan merah cuma membuat checker ragu
  // mana yang harus dipercaya. Satu pesan saja: yang merah.
  qcRenderKoreksiCutting_(afkir);

  if (b > l || l + t > p) {
    const prev = document.getElementById("qc-keputusan-preview");
    if (prev) prev.classList.remove("show");
    return;
  }
  qcUpdatePreviewKeputusan_(p, afkir, b + t);
}

/**
 * v184 -- blok koreksi Hasil Potong. Tampil HANYA di tahap Potong dengan
 * afkir > 0. Checkbox default AKTIF (alur dominan: hasil potong dicatat dulu,
 * QC belakangan -- jadi panel afkir hampir selalu sudah terhitung); dimatikan
 * kalau panelnya memang belum pernah masuk catatan potong. Salah ke arah
 * mana pun: nonaktif = kolam menggendut (panel hantu), aktif keliru = kolam
 * kurus (konservatif, ketahuan saat panel fisiknya ketemu) -- arah kedua
 * yang lebih aman, makanya jadi default.
 *
 * Rincian SIZE wajib: kolam "boleh dibagi" dihitung per size, koreksi tanpa
 * size cuma membetulkan totalnya sambil membiarkan angka per size bohong.
 * Checker memegang panelnya -- dia tahu size-nya.
 */
function qcRenderKoreksiCutting_(afkir) {
  const wadah = document.getElementById("qc-koreksi-wrap");
  if (!wadah) return;
  const tampil = (QC_TAHAP_DIPILIH === "Potong") && afkir > 0 && QC_MODE_SESI === "baru";
  wadah.classList.toggle("hidden", !tampil);
  if (!tampil) { wadah.dataset.afkir = "0"; return; }

  const sizes = QC_WARNA_DIPILIH ? Object.keys(QC_WARNA_DIPILIH.sizeQty || {}) : [];
  // Dirender ulang hanya saat daftar size berubah -- supaya angka yang sudah
  // diketik tidak hilang tiap kali qcRecalc jalan.
  if (wadah.dataset.sizes !== sizes.join("|")) {
    wadah.dataset.sizes = sizes.join("|");
    wadah.innerHTML =
      '<label class="qc-koreksi-cek"><input checked="checked" id="qc-koreksi-aktif" type="checkbox"/> ' +
      'Kurangi Hasil Potong otomatis (panel afkir ini sudah terhitung di catatan potong)</label>' +
      '<div class="qc-size-grid">' + sizes.map(function (sz) {
        return '<div class="qc-size-sel"><label>' + rjdEscapeHtml_(sz) + '</label>' +
          '<input class="qc-kor-size" data-size="' + rjdEscapeHtml_(sz) +
          '" min="0" oninput="qcRecalc()" placeholder="0" type="number"/></div>';
      }).join("") + '</div>' +
      '<p class="qc-hint" id="qc-koreksi-hint"></p>';
  }
  wadah.dataset.afkir = String(afkir);
  let tot = 0;
  document.querySelectorAll(".qc-kor-size").forEach(function (i) { tot += Number(i.value) || 0; });
  const hint = document.getElementById("qc-koreksi-hint");
  const aktif = (document.getElementById("qc-koreksi-aktif") || {}).checked;
  if (hint) {
    hint.textContent = !aktif ? "Nonaktif -- Hasil Potong tidak disentuh."
      : (tot === afkir ? "Rincian size pas (" + tot + " dari " + afkir + " pcs afkir)."
        : "Isi size panel afkir: " + tot + " dari " + afkir + " pcs.");
    hint.className = "qc-hint" + (aktif && tot !== afkir ? " qc-cacat-rinci-salah" : "");
  }
}

/**
 * Keputusan dihitung dari AFKIR, bukan dari cacat ditemukan -- sama dengan
 * backend, dan disengaja. Keputusan menjawab "barangnya boleh lanjut atau
 * tidak", dan barang yang cacat lalu diperbaiki memang boleh lanjut. Kalau
 * dasarnya cacat ditemukan, batch yang 30% cacat tapi SELURUHNYA sudah beres
 * berlabel "Reject-Rework" -- dan checker cepat belajar mengabaikan labelnya.
 */
function qcUpdatePreviewKeputusan_(qtyDiperiksa, qtyAfkir, qtyDiperbaiki) {
  const el = document.getElementById("qc-keputusan-preview");
  if (!qtyDiperiksa) { el.classList.remove("show"); return; }
  const batas = (QC_MASTER && QC_MASTER.batasToleransiDefect) || 0.10;
  const rate = qtyAfkir / qtyDiperiksa;
  const ditemukan = qtyAfkir + (qtyDiperbaiki || 0);
  let kelas, teks;
  if (qtyAfkir === 0) {
    kelas = "lolos"; teks = "Lolos -- tidak ada yang diafkir.";
  } else if (rate <= batas) {
    kelas = "bersyarat"; teks = "Lolos bersyarat -- afkir " + (rate * 100).toFixed(1) + "%, di bawah batas toleransi " + (batas * 100).toFixed(0) + "%.";
  } else {
    kelas = "reject"; teks = "Reject-Rework -- afkir " + (rate * 100).toFixed(1) + "%, di atas batas toleransi " + (batas * 100).toFixed(0) + "%.";
  }
  if (ditemukan > qtyAfkir) {
    teks += " Cacat ditemukan " + ((ditemukan / qtyDiperiksa) * 100).toFixed(1) +
      "% termasuk yang diperbaiki -- itu beban kerja ulang, bukan penentu keputusan.";
  }
  el.className = "qc-keputusan-preview show " + kelas;
  el.textContent = teks;
  // v197: rekomendasi disimpan supaya handler override bisa membandingkan.
  window.QC_REKOMENDASI = kelas === "lolos" ? "Lolos" : (kelas === "bersyarat" ? "Lolos Bersyarat" : "Reject-Rework");
  qcGantiKeputusan_();
}

/**
 * v197 -- override keputusan.
 * Memilih yang LEBIH LONGGAR dari rekomendasi wajib beralasan di Catatan
 * (backend menolak kalau kosong). Memperketat tidak perlu alasan. Di sini
 * cuma diberi tahu lebih awal supaya orang tidak menulis alasannya SETELAH
 * ditolak -- label Catatan ikut berubah jadi "(wajib)".
 */
const QC_URUTAN_KEPUTUSAN = ["Lolos", "Lolos Bersyarat", "Reject-Rework"];

function qcGantiKeputusan_() {
  const sel = document.getElementById("qc-keputusan-override");
  const hint = document.getElementById("qc-keputusan-hint");
  const lblCatatan = document.querySelector('label[for="qc-catatan"]');
  const kotak = document.getElementById("qc-catatan");
  if (!sel || !hint) return;
  const pilih = sel.value;
  const rek = window.QC_REKOMENDASI || "";
  const longgar = pilih && rek &&
    QC_URUTAN_KEPUTUSAN.indexOf(pilih) < QC_URUTAN_KEPUTUSAN.indexOf(rek);
  if (!pilih) {
    hint.textContent = rek
      ? "Yang tersimpan: " + rek + " (rekomendasi sistem)."
      : "Isi qty diperiksa dulu; rekomendasi muncul otomatis.";
    hint.className = "qc-hint";
  } else if (longgar) {
    hint.textContent = "Lebih longgar dari rekomendasi (" + rek + "). Tulis alasannya di Catatan -- tanpa alasan, sistem menolak.";
    hint.className = "qc-hint qc-cacat-rinci-salah";
  } else if (pilih === rek) {
    hint.textContent = "Sama dengan rekomendasi sistem.";
    hint.className = "qc-hint";
  } else {
    hint.textContent = "Lebih ketat dari rekomendasi (" + rek + "). Tidak perlu alasan -- lebih hati-hati selalu boleh.";
    hint.className = "qc-hint";
  }
  if (lblCatatan) lblCatatan.textContent = longgar ? "Catatan (wajib -- alasan melonggarkan keputusan)" : "Catatan (opsional)";
  if (kotak) kotak.classList.toggle("qc-wajib", !!longgar);
}

/**
 * v182: kirim sesi PENYELESAIAN keranjang. Dua angka nasib akhir: lolos
 * (per size, masuk stok siap kirim) dan afkir. Boleh dicicil -- backend
 * memastikan tidak melebihi keranjang terbuka, frontend cuma mengingatkan
 * lebih awal.
 */
function qcSubmitPenyelesaian_() {
  const idPO = QC_PO_TERPILIH ? QC_PO_TERPILIH.idPurchaseOrder : "";
  const idLine = (document.getElementById("qc-line") || {}).value || "";
  const qtyLolos = Math.max(Number((document.getElementById("qc-lolos") || {}).value) || 0, 0);
  const qtyAfkir = Math.max(Number((document.getElementById("qc-py-afkir") || {}).value) || 0, 0);
  const total = qtyLolos + qtyAfkir;
  const lolosPerSize = qcKumpulkanLolosPerSize_();
  const totalSize = Object.keys(lolosPerSize).reduce(function (a, k) { return a + lolosPerSize[k]; }, 0);
  const k = qcCariDitahan_();

  if (!idPO) return qcTampilkanError_("Pilih PO dulu.");
  if (!QC_TAHAP_DIPILIH) return qcTampilkanError_("Pilih tahap dulu.");
  if (!QC_WARNA_DIPILIH) return qcTampilkanError_("Pilih warna dulu.");
  if (QC_TAHAP_DIPILIH !== "Potong" && !idLine) {
    return qcTampilkanError_("Pilih line untuk tahap " + QC_TAHAP_DIPILIH + ".");
  }
  if (total <= 0) return qcTampilkanError_("Isi berapa yang akhirnya lolos dan/atau diafkir.");
  if (k && total > k.terbuka) {
    return qcTampilkanError_("Mau menyelesaikan " + total + " pcs, tapi keranjang warna ini tinggal " +
      k.terbuka + " pcs. Barang cacat BARU dicatat lewat sesi inspeksi biasa.");
  }
  if (qtyLolos > 0 && totalSize !== qtyLolos) {
    return qcTampilkanError_("Rincian qty lolos per size (" + totalSize +
      ") harus sama dengan yang akhirnya lolos (" + qtyLolos + ").");
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
        jenisSesi: "penyelesaian",
        idPurchaseOrder: idPO,
        tahap: QC_TAHAP_DIPILIH,
        idLine: idLine,
        operator: document.getElementById("qc-operator").value.trim(),
        brand: QC_WARNA_DIPILIH.brand || "",
        artikel: QC_WARNA_DIPILIH.artikel || "",
        style: QC_WARNA_DIPILIH.style || "",
        warna: QC_WARNA_DIPILIH.warna || "",
        qtyLolos: qtyLolos,
        qtyAfkir: qtyAfkir,
        lolosPerSize: lolosPerSize,
        catatan: document.getElementById("qc-catatan").value.trim()
      }
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      if (!d || !d.success) {
        btn.textContent = "Simpan penyelesaian";
        qcTampilkanError_((d && d.error) || "Gagal menyimpan penyelesaian. Coba lagi.");
        return;
      }
      const el = document.getElementById("qc-submit-sukses");
      el.textContent = "Keranjang ditutup " + (qtyLolos + qtyAfkir) + " pcs (" + d.idQC + ") -- " +
        qtyLolos + " lolos, " + qtyAfkir + " afkir" +
        (d.sisaTerbuka > 0 ? ". Sisa ditahan: " + d.sisaTerbuka + " pcs." : ". Keranjang habis.");
      el.classList.remove("hidden");
      qcSetModeSesi_("baru");
      qcResetForm_();
      qcMuatDitahan_();   // spanduk menyegarkan diri dengan sisa terbaru
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = "Simpan penyelesaian";
      qcTampilkanError_("Gagal menghubungi server. Coba beberapa saat lagi.");
    });
}

/**
 * v183: sambungan cacat potong -> re-cut. Membawa konteks QC ke subtab Hasil
 * Potong (fase yang sama, PO yang sama -- kartu PO aktif tidak berubah), lalu
 * spTerapkanRecutPending_ yang memandu di sana. Baris re-cut tetap baris
 * potong Normal biasa; bedanya cuma jejak "Re-cut Dari QC" di sheet.
 */
/** v184: kumpulkan isi blok koreksi. null di luar tahap Potong / tanpa afkir. */
function qcKumpulkanKoreksi_(afkir) {
  const wadah = document.getElementById("qc-koreksi-wrap");
  if (!wadah || wadah.classList.contains("hidden") || QC_TAHAP_DIPILIH !== "Potong" || !(afkir > 0)) return null;
  const perSize = {};
  let tot = 0;
  document.querySelectorAll(".qc-kor-size").forEach(function (i) {
    const v = Number(i.value) || 0;
    if (v > 0) { perSize[i.dataset.size] = v; tot += v; }
  });
  return { aktif: !!(document.getElementById("qc-koreksi-aktif") || {}).checked,
    afkirPerSize: perSize, totalSize: tot };
}

function qcKeRecut_() {
  if (!window.QC_RECUT_SIAP) return;
  window.SP_RECUT_PENDING = window.QC_RECUT_SIAP;
  window.QC_RECUT_SIAP = null;
  spSwitchTab("cutting");
}

/**
 * Dipanggil di akhir render tabel Hasil Potong. Tiga hal: spanduk pemandu,
 * catatan terisi jejak, baris warna yang cocok disorot. Qty per size SENGAJA
 * tidak diisi otomatis -- afkir QC dicatat total (bukan per size), jadi
 * pembagian ulangnya memang keputusan kepala cutting, bukan tebakan sistem.
 */
function spTerapkanRecutPending_() {
  const lamaB = document.getElementById("sp-recut-banner");
  const pend = window.SP_RECUT_PENDING;
  if (!pend) { if (lamaB) lamaB.remove(); return; }

  const panel = document.getElementById("sp-panel-cutting");
  if (!panel) return;
  let b = lamaB;
  if (!b) {
    b = document.createElement("div");
    b.id = "sp-recut-banner";
    b.className = "qc-ditahan-banner";
    const anchor = panel.querySelector(".sp-panduan");
    if (anchor) anchor.insertAdjacentElement("afterend", b);
    else panel.insertAdjacentElement("afterbegin", b);
  }
  b.innerHTML = '<b>Re-cut ' + pend.afkir + ' pcs</b> pengganti afkir potong ' +
    rjdEscapeHtml_(pend.idQC) + ' -- warna <b>' + rjdEscapeHtml_(pend.warna || "-") + '</b>' +
    (pend.artikel ? ' (' + rjdEscapeHtml_(pend.artikel) + ')' : '') +
    '. Isi qty di baris yang disorot; pembagian per size terserah kepala cutting, totalnya ' +
    pend.afkir + ' pcs. Jejak QC tercatat otomatis saat disimpan.' +
    '<button onclick="window.SP_RECUT_PENDING=null; spTerapkanRecutPending_();" type="button">Batal, potong biasa saja</button>';

  const kw = qcKunciWarnaFE_(pend.brand, pend.artikel, pend.style, pend.warna);
  document.querySelectorAll("#sp-panel-cutting tr[data-warna]").forEach(function (tr) {
    const cocok = qcKunciWarnaFE_("", tr.dataset.artikel, tr.dataset.style, tr.dataset.warna)
      === qcKunciWarnaFE_("", pend.artikel, pend.style, pend.warna);
    tr.classList.toggle("sp-recut-target", cocok);
  });

  const cat = document.getElementById("sp-cut-catatan");
  if (cat && !cat.value) cat.value = "Re-cut " + pend.idQC + " (" + pend.afkir + " pcs, warna " + (pend.warna || "-") + ")";
}

function qcTambahBarisCacat() {
  if (!QC_TAHAP_DIPILIH) {
    const hint = document.getElementById("qc-detail-hint");
    if (hint) hint.classList.remove("hidden");
    return;
  }
  const daftarJenis = (QC_MASTER && QC_MASTER.jenisCacatPerTahap && QC_MASTER.jenisCacatPerTahap[QC_TAHAP_DIPILIH]) || [];
  const wrap = document.getElementById("qc-detail-rows");
  qcPastikanDatalistCacat_();
  const row = document.createElement("div");
  row.className = "qc-detail-row";
  // v196: pilihan terakhir = ketik sendiri. Kalau jenis yang ditemukan tidak
  // ada di daftar, checker sebelumnya cuma punya dua pilihan yang sama-sama
  // buruk: memilih yang "paling mirip" (data mutu jadi bohong) atau tidak
  // merinci sama sekali -- dan submit ditolak karena rincian harus menjumlah
  // ke cacat ditemukan.
  row.innerHTML =
    '<div class="qc-detail-jenis">' +
      '<select onchange="qcPilihJenisCacat_(this)">' +
        daftarJenis.map(function (j) {
          return '<option value="' + rjdEscapeHtml_(j) + '">' + rjdEscapeHtml_(j) + '</option>';
        }).join("") +
        '<option value="' + QC_JENIS_LAIN + '">+ Jenis lain (ketik sendiri)</option>' +
      '</select>' +
      '<input class="qc-detail-lain hidden" list="qc-datalist-cacat" type="text" ' +
        'placeholder="Tulis jenis cacatnya, mis. Resleting macet" autocomplete="off"/>' +
    '</div>' +
    '<input min="0" type="number" value="1"/>' +
    '<button onclick="this.closest(\'.qc-detail-row\').remove(); qcRecalc();" type="button" title="Hapus baris">&times;</button>';
  wrap.appendChild(row);
}

/** Penanda opsi "ketik sendiri". Diawali karakter yang tidak mungkin jadi nama cacat. */
const QC_JENIS_LAIN = "__lain__";

function qcPilihJenisCacat_(sel) {
  const kotak = sel.parentElement.querySelector(".qc-detail-lain");
  if (!kotak) return;
  const lain = sel.value === QC_JENIS_LAIN;
  kotak.classList.toggle("hidden", !lain);
  if (lain) kotak.focus(); else kotak.value = "";
}

/**
 * Datalist berisi jenis cacat dari SEMUA tahap -- bukan tahap ini saja.
 * Alasannya justru anti-duplikat: waktu "Jahitan lepas / putus" ditemukan di
 * Finishing, saran ini memberi ejaan yang SUDAH dipakai di Jahit, sehingga
 * tidak lahir ejaan kedua untuk cacat yang sama. Backend tetap menyelaraskan
 * ejaan sekali lagi saat menyimpan; ini lapis pertama, yang lebih murah.
 */
function qcPastikanDatalistCacat_() {
  let dl = document.getElementById("qc-datalist-cacat");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "qc-datalist-cacat";
    document.body.appendChild(dl);
  }
  const peta = (QC_MASTER && QC_MASTER.jenisCacatPerTahap) || {};
  const set = {};
  Object.keys(peta).forEach(function (t) {
    (peta[t] || []).forEach(function (j) { if (j) set[j] = true; });
  });
  dl.innerHTML = Object.keys(set).sort().map(function (j) {
    return '<option value="' + rjdEscapeHtml_(j) + '"></option>';
  }).join("");
}

function qcKumpulkanDetailCacat_() {
  const hasil = [];
  document.querySelectorAll("#qc-detail-rows .qc-detail-row").forEach(function (row) {
    const sel = row.querySelector("select");
    // v196: qty ada di input[type=number]; kotak ketik-sendiri juga <input>,
    // jadi querySelector("input") saja sudah salah sasaran sejak baris ini
    // punya dua input.
    const qty = Number((row.querySelector('input[type="number"]') || {}).value) || 0;
    let jenis = sel.value;
    if (jenis === QC_JENIS_LAIN) {
      jenis = ((row.querySelector(".qc-detail-lain") || {}).value || "").trim();
    }
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
  const perbaiki = document.getElementById("qc-perbaiki");
  if (perbaiki) perbaiki.value = "";
  const tahan = document.getElementById("qc-ditahan");
  if (tahan) tahan.value = "";
  const pyAfkir = document.getElementById("qc-py-afkir");
  if (pyAfkir) pyAfkir.value = "";
  document.getElementById("qc-detail-rows").innerHTML = "";
  document.getElementById("qc-keputusan-override").value = "";
  document.getElementById("qc-catatan").value = "";
  document.getElementById("qc-cacat-angka").textContent = "0";
  const rinci = document.getElementById("qc-cacat-rinci");
  if (rinci) { rinci.textContent = ""; rinci.className = "qc-hint"; }
  document.getElementById("qc-keputusan-preview").classList.remove("show");
  window.QC_REKOMENDASI = "";
  qcGantiKeputusan_();
  // Tahap SENGAJA TIDAK direset -- checker biasanya periksa banyak PO
  // berturut-turut di tahap yang SAMA, jadi lebih cepat kalau tetap terpilih.
}

function qcSubmitInspeksi() {
  // Pra-cek v121 (server tetap penjaga sesungguhnya)
  if ((window.QC_TAHAP_DIPILIH || QC_TAHAP_DIPILIH) === "Finishing") {
    const t = qcCariTersedia_();
    // v180 -- BUG DIPERBAIKI: id salah (lihat qcTampilTersedia_), jadi qd
    // selalu 0 dan pra-cek ini tidak pernah menyala. Server tetap menolak,
    // tapi checker menerima pesan mentah dari server, bukan peringatan ramah
    // yang menyebut apa yang harus dilakukan.
    const qd = Number((document.getElementById("qc-periksa") || {}).value) || 0;
    if (t && qd > t.tersedia) {
      alert("Qty diperiksa (" + qd + ") melebihi yang tersedia untuk QC (" + t.tersedia +
        " pcs)." + (t.menunggu > 0
          ? " Ada " + t.menunggu + " pcs setoran menunggu konfirmasi -- konfirmasi dulu di Finishing > Konfirmasi Setoran."
          : " Pastikan setoran jadi-baju warna ini sudah dicatat & dikonfirmasi."));
      return;
    }
  }
  document.getElementById("qc-submit-error").classList.add("hidden");
  document.getElementById("qc-submit-sukses").classList.add("hidden");

  // v182: mode penyelesaian punya jalurnya sendiri -- payload berbeda,
  // validasi berbeda, dan tidak menyentuh pengaman tersedia-Finishing
  // (barangnya sudah terhitung diperiksa di sesi asal).
  if (QC_MODE_SESI === "penyelesaian") return qcSubmitPenyelesaian_();

  const idPO = QC_PO_TERPILIH ? QC_PO_TERPILIH.idPurchaseOrder : "";
  const operator = document.getElementById("qc-operator").value.trim();
  const idLine = (document.getElementById("qc-line") || {}).value || "";
  const qtyDiperiksa = Number(document.getElementById("qc-periksa").value) || 0;
  const qtyLolos = Number(document.getElementById("qc-lolos").value) || 0;
  // v180. Elemen bisa saja belum ada kalau template tertinggal satu rilis --
  // dalam kasus itu nilainya 0 dan perilakunya persis seperti v179.
  const qtyDiperbaiki = Math.max(Number((document.getElementById("qc-perbaiki") || {}).value) || 0, 0);
  const qtyDitahan = Math.max(Number((document.getElementById("qc-ditahan") || {}).value) || 0, 0);
  const qtyAfkir = Math.max(qtyDiperiksa - qtyLolos - qtyDitahan, 0);
  const qtyCacat = qtyAfkir + qtyDiperbaiki + qtyDitahan;   // cacat DITEMUKAN
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
  // Aturan yang sama ditegakkan backend; ini supaya checker tahu sebelum
  // menekan simpan, bukan sesudah.
  if (qtyDiperbaiki > qtyLolos) {
    return qcTampilkanError_("Qty diperbaiki (" + qtyDiperbaiki + ") tidak boleh lebih besar dari Qty Lolos (" +
      qtyLolos + "). Barang yang diperbaiki berakhir sebagai barang lolos.");
  }
  if (qtyLolos + qtyDitahan > qtyDiperiksa) {
    return qcTampilkanError_("Qty lolos (" + qtyLolos + ") + qty ditahan (" + qtyDitahan +
      ") melebihi qty diperiksa (" + qtyDiperiksa + "). Cek lagi angkanya.");
  }
  // v184: koreksi aktif wajib rinciannya pas -- server menolak juga, ini
  // supaya ketahuan sebelum tombol dipencet.
  const korKirim = qcKumpulkanKoreksi_(qtyAfkir);
  if (korKirim && korKirim.aktif && korKirim.totalSize !== qtyAfkir) {
    return qcTampilkanError_("Rincian size panel afkir (" + korKirim.totalSize +
      ") harus sama dengan afkir (" + qtyAfkir + "), atau matikan centang koreksi.");
  }
  if (qtyLolos > 0 && totalSize !== qtyLolos) {
    return qcTampilkanError_("Rincian qty lolos per size (" + totalSize + ") harus sama dengan Qty Lolos (" + qtyLolos + ").");
  }
  // v180: pembandingnya cacat DITEMUKAN (afkir + diperbaiki), bukan afkir saja.
  // Justru itu yang dicari: "jahitan miring 5 pcs, semuanya diperbaiki" adalah
  // temuan mutu yang berguna, dan sebelumnya tidak punya tempat sama sekali.
  if (qtyCacat > 0 && totalDetail !== qtyCacat) {
    return qcTampilkanError_("Total qty jenis cacat (" + totalDetail + ") harus sama dengan cacat ditemukan (" +
      qtyCacat + " = " + qtyAfkir + " afkir + " + qtyDiperbaiki + " diperbaiki). Cek lagi rincian jenis cacat.");
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
        qtyDiperbaiki: qtyDiperbaiki,
        qtyDitahan: qtyDitahan,
        koreksiCutting: qcKumpulkanKoreksi_(qtyAfkir),
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
      // v183: cacat potong -> tombol "Buat re-cut". Konteks warna DIREKAM
      // SEBELUM qcResetForm_ menghapusnya -- tombolnya dipencet sesudah reset.
      const afkirPotong = (QC_TAHAP_DIPILIH === "Potong" && d.qtyAfkir > 0) ? d.qtyAfkir : 0;
      if (afkirPotong && QC_WARNA_DIPILIH) {
        window.QC_RECUT_SIAP = {
          idQC: d.idQC, afkir: afkirPotong,
          brand: QC_WARNA_DIPILIH.brand || "", artikel: QC_WARNA_DIPILIH.artikel || "",
          style: QC_WARNA_DIPILIH.style || "", warna: QC_WARNA_DIPILIH.warna || ""
        };
        // v185: prefill TERPISAH untuk form Gelaran (buku kain). SP_RECUT_PENDING
        // hidup-mati bersama tombol "Buat re-cut" (buku baju); yang ini bertahan
        // sampai gelaran re-cut dengan ID ini tersimpan, urutan mana pun yang
        // dipilih kepala cutting.
        window.SP_RECUT_QC_GELARAN = { idQC: d.idQC, afkir: afkirPotong,
          warna: QC_WARNA_DIPILIH.warna || "" };
        // v184: laporkan nasib koreksinya -- gagal harus KELIHATAN, karena
        // artinya sheet perlu dibetulkan tangan.
        const kor = d.koreksiCutting;
        const infoKor = !kor ? ""
          : (kor.sukses ? " Hasil Potong dikurangi " + kor.totalDikurangkan + " pcs otomatis."
            : ' <b class="qc-kor-gagal">Koreksi Hasil Potong GAGAL: ' + rjdEscapeHtml_(kor.error || "") +
              " -- kurangi manual di SD Hasil Cutting.</b>");
        el.innerHTML = "Tersimpan (" + rjdEscapeHtml_(d.idQC) + ") -- " + rjdEscapeHtml_(d.keputusan) +
          ", defect rate " + d.defectRate + "%." + infoKor + " <b>" + afkirPotong + " pcs afkir potong perlu diganti.</b>" +
          '<button class="qc-recut-btn" onclick="qcKeRecut_()" type="button">Buat re-cut ' + afkirPotong + ' pcs &#8594;</button>';
      } else {
        el.textContent = "Tersimpan (" + d.idQC + ") -- " + d.keputusan + ", defect rate " + d.defectRate + "%.";
      }
      // v196: jenis cacat baru masuk master -> muncul di dropdown berikutnya.
      // Dikabarkan supaya checker tahu tidak perlu mengetik ulang lain kali,
      // dan supaya salah ketik ketahuan saat itu juga, bukan sebulan kemudian.
      if (d.jenisCacatBaru && d.jenisCacatBaru.length) {
        el.innerHTML = el.innerHTML +
          '<div class="qc-jenis-baru">Jenis cacat baru masuk daftar: <b>' +
          d.jenisCacatBaru.map(rjdEscapeHtml_).join(", ") +
          '</b> &#183; mulai sekarang ada di dropdown tahap ini.</div>';
        if (QC_MASTER && QC_MASTER.jenisCacatPerTahap && QC_MASTER.jenisCacatPerTahap[QC_TAHAP_DIPILIH]) {
          d.jenisCacatBaru.forEach(function (j) {
            if (QC_MASTER.jenisCacatPerTahap[QC_TAHAP_DIPILIH].indexOf(j) === -1) {
              QC_MASTER.jenisCacatPerTahap[QC_TAHAP_DIPILIH].push(j);
            }
          });
          qcPastikanDatalistCacat_();
        }
      }
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
    // v162: pembuka halaman = ORDERAN. Nilai lama ("cutting"/"gelar") lahir
    // sebelum tab Orderan ada, waktu satu-satunya isi halaman ini memang
    // form kerja. Sekarang membuka di form kosong berarti pertanyaan pertama
    // orang -- "ada pekerjaan apa" -- justru tidak terjawab di layar pertama.
    if (window.SP_FASE === undefined) window.SP_FASE = "orderan";
    if (window.SP_TAB === undefined) window.SP_TAB = "orderan";
    window.SP_BAGIAN_SEMUA = (window.SP_BAGIAN_SEMUA === undefined)
      ? true : window.SP_BAGIAN_SEMUA;
    spRenderFase_();
    spRenderSub_();
    // v163: panel awal DIISI di sini, tidak menunggu klik.
    //
    // Komentar lama di atas menyatakan spSwitchTab sengaja tidak dipanggil --
    // dan itu benar SELAMA panel awal berupa form statis yang markupnya sudah
    // ada di template (dulu: Gelaran). Panel Orderan dirender JS, jadi tanpa
    // pemanggilan ini ia tetap kosong sampai orang mengklik subtabnya, dan
    // kartu Pilih PO ikut tertinggal tampil karena spSwitchTab juga yang
    // mengaturnya.
    //
    // Aman dipanggil di sini: tab orderan cuma membaca memori, tidak menembak
    // server. Kalau daftarnya belum tiba, panel menampilkan keadaan itu apa
    // adanya dan dirender ulang begitu datanya masuk (lihat spMuatDaftarPO).
    spSwitchTab(window.SP_TAB);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mulai);
  } else { mulai(); }
})();

/* ============================================================
   APPROVAL SAMPEL & STOK SIAP KIRIM (v115)
   ============================================================
   Dua subtab baru sesuai cetak biru IA. Keduanya memakai kartu PO
   BERSAMA (SP_PO_AKTIF), cangkang panel kosong di template, dan
   backend yang sudah terpasang lebih dulu (approval-sampel.gs,
   stok-siap-kirim.gs). Gaya field mewarisi restyle v95 otomatis
   karena panel ber-id sp-panel-*. */

let APS_STATUS = null;       // hasil getStatusApprovalSampel PO aktif
let APS_ITEM_PO = null;      // daftar item unik PO aktif (dari rincian cutting)
let APS_JENIS = "Kirim";

function spMuatApproval_() {
  const panel = document.getElementById("sp-panel-approval");
  if (!panel) return;
  const po = window.SP_PO_AKTIF || "";
  if (!po) {
    panel.innerHTML = '<div class="sp-card"><h3 class="sp-judul">Approval Sampel</h3>' +
      '<p class="sp-info">Pilih Purchase Order dulu lewat kartu di atas.</p></div>';
    return;
  }
  panel.innerHTML = '<div class="sp-card">' + spMuatHtml_("Memuat approval sampel...") + '</div>';
  Promise.all([
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getPOUntukCutting", idPurchaseOrder: po }) })
      .then(function (r) { return r.json(); }),
    fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
      idToken: SP_ID_TOKEN, action: "getStatusApprovalSampel", idPurchaseOrder: po }) })
      .then(function (r) { return r.json(); })
  ]).then(function (hasil) {
    const rincian = hasil[0], status = hasil[1];
    if (rincian.error || status.error) {
      panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' +
        rjdEscapeHtml_(rincian.error || status.error) + '</p></div>';
      return;
    }
    const lihat = {}; APS_ITEM_PO = [];
    (rincian.baris || []).forEach(function (b) {
      const k = [b.brand || "", b.artikel || "", b.style || ""].join("||");
      if (lihat[k]) return;
      lihat[k] = true;
      APS_ITEM_PO.push({ brand: b.brand || "", artikel: b.artikel || "", style: b.style || "" });
    });
    APS_STATUS = status;
    spRenderApproval_();
  }).catch(function () {
    panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">Gagal menghubungi server.</p></div>';
  });
}

function spRenderApproval_() {
  const panel = document.getElementById("sp-panel-approval");
  if (!panel) return;
  const jenisBtn = ["Kirim", "Revisi", "ACC"].map(function (j) {
    const aktif = j === APS_JENIS;
    return '<button type="button" class="sp-btn-kecil" onclick="apsPilihJenis_(\'' + j + '\')" ' +
      'style="flex:1;padding:12px 0;' + (aktif
        ? 'background:var(--navy);color:var(--cream);border-color:var(--navy);'
        : '') + '">' + j + '</button>';
  }).join("");

  let html = '<div class="sp-card"><h3 class="sp-judul">Catat Kejadian Approval</h3>' +
    '<p class="sp-info">Satu baris per kejadian: <b>Kirim</b> sampel ke klien, klien minta <b>Revisi</b> (wajib catatan), atau <b>ACC</b>. Ronde &amp; status dihitung dari riwayat &#8212; tidak ada yang diedit.</p>' +
    '<div class="sp-grid3">' +
    '<label>Item (artikel &#183; style)<select id="aps-item">' +
      APS_ITEM_PO.map(function (it, i) {
        return '<option value="' + i + '">' + rjdEscapeHtml_(
          [it.artikel, it.style].filter(Boolean).join(" \u00b7 ") || "(tanpa nama)") + '</option>';
      }).join("") + '</select></label>' +
    '<label>Tanggal<input id="aps-tanggal" type="date" value="' +
      new Date().toISOString().slice(0, 10) + '"/></label>' +
    '</div>' +
    '<div class="sp-lbl">Jenis kejadian</div>' +
    '<div style="display:flex;gap:8px">' + jenisBtn + '</div>' +
    '<div class="sp-grid3" style="margin-top:12px"><label style="grid-column:1/-1">Catatan' +
      '<input id="aps-catatan" placeholder="wajib diisi untuk Revisi &#8212; poin revisinya apa" type="text"/></label></div>' +
    '<button class="sp-simpan-btn" id="aps-simpan" onclick="apsSimpan_()" style="width:100%;margin-top:14px" type="button">Simpan Kejadian</button>' +
    '</div>';

  html += '<div class="sp-card"><h3 class="sp-judul">Status per Item</h3>';
  const item = (APS_STATUS && APS_STATUS.item) || [];
  if (!item.length) {
    html += '<p class="sp-info">Belum ada kejadian approval untuk PO ini.</p>';
  } else {
    html += item.map(function (it) {
      const rantai = it.kejadian.map(function (k) {
        return '<span title="' + rjdEscapeHtml_(k.tanggal + (k.catatan ? " \u2014 " + k.catatan : "")) + '">' +
          rjdEscapeHtml_(k.jenis) + '</span>';
      }).join(' <span style="color:var(--ink-soft)">&#8594;</span> ');
      return '<div style="padding:12px 0;border-bottom:1px dashed var(--line,#E5E0D6)">' +
        '<b>' + rjdEscapeHtml_([it.artikel, it.style].filter(Boolean).join(" \u00b7 ")) + '</b>' +
        ' <span style="font-weight:700;color:' + (it.acc ? 'var(--emerald,#2D8A5F)' : 'var(--gold,#C8964A)') + '">' +
          rjdEscapeHtml_(it.status) + '</span>' +
        '<div class="sp-sub" style="margin-top:4px">' + rantai +
        (it.catatanTerakhir ? ' &#183; <i>' + rjdEscapeHtml_(it.catatanTerakhir) + '</i>' : '') + '</div></div>';
    }).join("");
  }
  html += '</div>';
  panel.innerHTML = html;
}

function apsPilihJenis_(j) { APS_JENIS = j; spRenderApproval_(); }

function apsSimpan_() {
  const it = APS_ITEM_PO[Number((document.getElementById("aps-item") || {}).value) || 0];
  if (!it) { alert("Pilih item dulu."); return; }
  const catatan = (document.getElementById("aps-catatan") || {}).value || "";
  if (APS_JENIS === "Revisi" && !catatan.trim()) {
    alert("Kejadian Revisi wajib membawa catatan \u2014 poin revisinya apa.");
    return;
  }
  const btn = document.getElementById("aps-simpan");
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
  fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
    idToken: SP_ID_TOKEN, action: "catatApprovalSampel",
    idPurchaseOrder: window.SP_PO_AKTIF,
    brand: it.brand, artikel: it.artikel, style: it.style,
    jenis: APS_JENIS, catatan: catatan,
    tanggal: (document.getElementById("aps-tanggal") || {}).value || ""
  }) })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) { alert(d.error); if (btn) { btn.disabled = false; btn.textContent = "Simpan Kejadian"; } return; }
    alert("Tercatat: " + d.jenis + " (ronde " + d.ronde + ").");
    spMuatApproval_();     // muat ulang status -- kerangka dirender ulang, aman
  })
  .catch(function () {
    alert("Gagal menghubungi server.");
    if (btn) { btn.disabled = false; btn.textContent = "Simpan Kejadian"; }
  });
}

// ============ TERKIRIM (v124) ============
// Tampilan agregat SURAT JALAN untuk PO aktif -- data yang sama yang
// dipakai mesin stok sebagai pengurang, kini disajikan sebagai daftar.
// Satu rute (getStokSiapKirim), dua subtab: tidak ada buku kedua.

function spMuatTerkirim_() {
  const panel = document.getElementById("sp-panel-terkirim");
  if (!panel) return;
  const po = window.SP_PO_AKTIF || "";
  if (!po) {
    panel.innerHTML = '<div class="sp-card"><h3 class="sp-judul">Terkirim</h3>' +
      '<p class="sp-info">Pilih Purchase Order dulu lewat kartu di atas.</p></div>';
    return;
  }
  panel.innerHTML = '<div class="sp-card">' + spMuatHtml_("Memuat daftar kiriman...") + '</div>';
  fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
    idToken: SP_ID_TOKEN, action: "getStokSiapKirim", idPurchaseOrder: po }) })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) {
      panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' + rjdEscapeHtml_(d.error) + '</p></div>';
      return;
    }
    const daftar = d.pengiriman || [];
    // v125: tampilan utama = TABEL agregat per item-warna x size -- struktur
    // yang sama persis dengan Stok Siap Kirim (permintaan Femri); daftar
    // surat jalan turun jadi kartu kedua. Datanya sudah ada di d.baris
    // (kolom terkirim per size) -- nol fetch tambahan.
    let html = '<div class="sp-card"><h3 class="sp-judul">Terkirim</h3>' +
      '<p class="sp-info">Agregat semua surat jalan PO ini (yang batal tidak dihitung). Total terkirim <b>' +
      (d.totalTerkirim || 0) + ' pcs</b> dari lolos QC <b>' + (d.totalLolos || 0) + ' pcs</b>. ' +
      '<button class="sp-btn-kecil" onclick="spMuatTerkirim_()" type="button">Segarkan</button></p>';

    const barisKirim = (d.baris || []).filter(function (b) { return (b.totalTerkirim || 0) > 0; });
    if (!barisKirim.length && !daftar.length) {
      html += '<p class="sp-info">Belum ada surat jalan untuk PO ini.</p></div>';
      panel.innerHTML = html;
      return;
    }
    const sz = d.sizeKolom || [];
    html += '<div class="sp-tabelwrap"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Item &#183; Warna</th>' +
      sz.map(function (s) { return '<th>' + rjdEscapeHtml_(s) + '</th>'; }).join("") +
      '<th>Terkirim</th></tr></thead><tbody>' +
      barisKirim.map(function (b) {
        return '<tr>' +
          '<td data-label="Item"><b>' + rjdEscapeHtml_([b.artikel, b.style].filter(Boolean).join(" \u00b7 ")) + '</b>' +
            '<div class="sp-sub">' + rjdEscapeHtml_(b.warna || "-") +
            ' &#183; lolos ' + b.totalLolos + ' &#183; siap ' + b.totalSiap + '</div></td>' +
          sz.map(function (s) {
            const n = (b.terkirim && b.terkirim[s] !== undefined) ? b.terkirim[s] : "";
            return '<td data-label="' + rjdEscapeHtml_(s) + '">' + (n === "" ? "-" : n) + '</td>';
          }).join("") +
          '<td data-label="Terkirim"><b>' + b.totalTerkirim + '</b></td></tr>';
      }).join("") +
      '</tbody></table></div></div>';

    html += '<div class="sp-card"><h3 class="sp-judul">Daftar Surat Jalan</h3>';
    if (!daftar.length) html += '<p class="sp-info">Belum ada surat jalan untuk PO ini.</p>';
    html += daftar.map(function (p) {
      // v126: rincian dikelompokkan per item-warna -- nama item SEKALI,
      // size jadi chip ringkas, subtotal di kanan. Sebelumnya nama item
      // diulang untuk tiap size dan jadi tembok teks tak terbaca.
      const grup = {}, urut = [];
      (p.baris || []).forEach(function (b) {
        const k = [b.artikel, b.style, b.warna].join("||");
        if (!grup[k]) {
          grup[k] = { item: [b.artikel, b.style].filter(Boolean).join(" \u00b7 "),
            warna: b.warna || "-", sizeQty: {}, total: 0 };
          urut.push(k);
        }
        grup[k].sizeQty[b.size] = (grup[k].sizeQty[b.size] || 0) + b.jumlah;
        grup[k].total += b.jumlah;
      });
      // v127: rincian per surat jalan memakai TABEL berstruktur identik
      // dengan Stok Siap Kirim & Terkirim -- satu bahasa untuk seluruh fase.
      const barisGrup = '<div class="sp-tabelwrap"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
        '<th>Item &#183; Warna</th>' +
        sz.map(function (s) { return '<th>' + rjdEscapeHtml_(s) + '</th>'; }).join("") +
        '<th>Total</th></tr></thead><tbody>' +
        urut.map(function (k) {
          const g = grup[k];
          return '<tr>' +
            '<td data-label="Item"><b>' + rjdEscapeHtml_(g.item) + '</b>' +
              '<div class="sp-sub">' + rjdEscapeHtml_(g.warna) + '</div></td>' +
            sz.map(function (s) {
              const n = g.sizeQty[s];
              return '<td data-label="' + rjdEscapeHtml_(s) + '">' + (n === undefined ? "-" : n) + '</td>';
            }).join("") +
            '<td data-label="Total"><b>' + g.total + '</b></td></tr>';
        }).join("") +
        '</tbody></table></div>';
      return '<div style="padding:14px 0 8px;border-bottom:2px solid var(--line,#E5E0D6)">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px">' +
          '<div><b>' + rjdEscapeHtml_(p.tanggal || "-") + '</b>' +
            (p.metode ? ' &#183; ' + rjdEscapeHtml_(p.metode) : '') +
            (p.jenis ? ' &#183; ' + rjdEscapeHtml_(p.jenis) : '') +
            (p.noResi ? '<div class="sp-sub">Resi: ' + rjdEscapeHtml_(p.noResi) + '</div>' : '') +
          '</div>' +
          '<div style="font-family:\'IBM Plex Mono\',monospace;font-weight:700">' + p.total + ' pcs</div>' +
        '</div>' + barisGrup +
      '</div>';
    }).join("");
    html += '</div>';
    panel.innerHTML = html;
  })
  .catch(function () {
    panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">Gagal menghubungi server.</p></div>';
  });
}

// ============ STOK SIAP KIRIM ============

function spMuatStok_() {
  const panel = document.getElementById("sp-panel-stok");
  if (!panel) return;
  const po = window.SP_PO_AKTIF || "";
  if (!po) {
    panel.innerHTML = '<div class="sp-card"><h3 class="sp-judul">Stok Siap Kirim</h3>' +
      '<p class="sp-info">Pilih Purchase Order dulu lewat kartu di atas.</p></div>';
    return;
  }
  panel.innerHTML = '<div class="sp-card"><p class="sp-info">Menghitung stok siap kirim...</p></div>';
  fetch(SP_API_URL, { method: "POST", body: JSON.stringify({
    idToken: SP_ID_TOKEN, action: "getStokSiapKirim", idPurchaseOrder: po }) })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) {
      panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">' + rjdEscapeHtml_(d.error) + '</p></div>';
      return;
    }
    let html = '<div class="sp-card"><h3 class="sp-judul">Stok Siap Kirim</h3>' +
      '<p class="sp-info"><b>Siap = lolos QC Finishing &#8722; terkirim.</b> Nol input baru: angka ini turunan dari QC dan Surat Jalan. ' +
      'Angka MINUS berarti ada barang terkirim yang lolos QC-nya belum dicatat &#8212; sinyal disiplin QC, sengaja tidak disembunyikan. ' +
      '<button class="sp-btn-kecil" onclick="spMuatStok_()" type="button">Segarkan</button></p>';
    if (!(d.baris || []).length) {
      html += '<p class="sp-info">Belum ada QC tahap Finishing untuk PO ini &#8212; stok siap kirim lahir dari sana. ' +
        'Catat inspeksi Finishing di tab <b>Finishing &#8250; QC</b> dulu.</p></div>';
      panel.innerHTML = html;
      return;
    }
    const sz = d.sizeKolom || [];
    html += '<div class="sp-tabelwrap"><table class="sp-tabel sp-tabel-kartu"><thead><tr>' +
      '<th>Item &#183; Warna</th>' +
      sz.map(function (s) { return '<th>' + rjdEscapeHtml_(s) + '</th>'; }).join("") +
      '<th>Siap</th></tr></thead><tbody>' +
      d.baris.map(function (b) {
        return '<tr>' +
          '<td data-label="Item"><b>' + rjdEscapeHtml_([b.artikel, b.style].filter(Boolean).join(" \u00b7 ")) + '</b>' +
            '<div class="sp-sub">' + rjdEscapeHtml_(b.warna || "-") +
            ' &#183; lolos ' + b.totalLolos + ' &#183; terkirim ' + b.totalTerkirim + '</div></td>' +
          sz.map(function (s) {
            const n = (b.siap && b.siap[s] !== undefined) ? b.siap[s] : "";
            return '<td data-label="' + rjdEscapeHtml_(s) + '"' +
              (n !== "" && n < 0 ? ' style="color:#8F2C22;font-weight:700"' : '') + '>' +
              (n === "" ? "-" : n) + '</td>';
          }).join("") +
          '<td data-label="Siap"><b' + (b.totalSiap < 0 ? ' style="color:#8F2C22"' : '') + '>' +
            b.totalSiap + '</b></td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<p class="sp-info" style="margin-top:10px">Total: lolos <b>' + d.totalLolos +
      '</b> &#183; terkirim <b>' + d.totalTerkirim + '</b> &#183; siap kirim <b>' + d.totalSiap + '</b> pcs.</p>' +
      // v169: JEMBATAN ke halaman Surat Jalan, PO sudah terbawa.
      //
      // DI BAWAH daftar, bukan di atasnya. v168 menaruhnya sesudah paragraf
      // pengantar -- yang secara kode terlihat seperti "akhir kepala panel",
      // tapi di layar jadi tombol besar yang menghalangi angka stoknya.
      // Urutan membaca di tab ini: lihat angka, putuskan apa yang dikirim,
      // BARU buat surat jalan. Tombol di atas membalik urutan itu.
      //
      // Posisinya kini sama dengan tombol aksi di fase Loading -- satu
      // kebiasaan untuk seluruh halaman: aksi utama selalu di bawah isinya.
      '<div class="sp-stok-jembatan">' +
        '<a class="sp-tautan-kotak" href="/p/pengiriman.html?po=' +
          encodeURIComponent(po) + '" target="_blank" rel="noopener">' +
          'Buat Surat Jalan untuk PO ini &#8250;</a>' +
        '<span class="sp-stok-jembatan-ket">Terbuka di tab baru, PO sudah terpilih di sana.</span>' +
      '</div></div>';
    panel.innerHTML = html;
  })
  .catch(function () {
    panel.innerHTML = '<div class="sp-card"><p class="sp-pesan sp-galat">Gagal menghubungi server.</p></div>';
  });
}

/* ============================================================
   PENJAGA SESI KEDALUWARSA -- DIPINDAH (v141)
   ============================================================
   Blok v123 yang dulu di sini (sadap fetch SP_API_URL + layar "sesi
   berakhir") NAIK ke simpro-global.js supaya SEMUA halaman terlindungi,
   bukan cuma SPK. Jangan pasang ulang di sini: dua penyadap fetch =
   fetch terbungkus dua kali. window.rjdSesiHabis_ tetap tersedia --
   sekarang dari global. */
