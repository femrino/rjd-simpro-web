/**
 * ============================================================
 * SIMPRO -- simpro-sop  (v155)
 * ============================================================
 * SOP LANTAI PRODUKSI, versi yang bisa dibuka di layar.
 *
 * KENAPA HALAMAN, BUKAN DOKUMEN
 * SOP dalam file yang harus diunduh berakhir sebagai lampiran WhatsApp yang
 * tidak pernah dibuka lagi, dan tiap kali ada perubahan, beredar dua versi
 * yang keduanya diyakini benar. Di sini cuma ada satu versi, dan tautannya
 * bisa dikirim langsung ke orang yang sedang bingung di depan form.
 *
 * HUBUNGANNYA DENGAN PANDUAN PER TAB (SP_PANDUAN di simpro-spk.js)
 * Dua-duanya perlu dan TIDAK saling menggantikan:
 *   Panduan per tab -- menjawab "kotak ini diisi apa", muncul di tempat orang
 *                      sedang bekerja, dibaca sambil mengisi.
 *   Halaman ini     -- menjawab "kenapa begini" dan "kalau kejadiannya lain,
 *                      bagaimana", dibaca saat belajar atau saat bingung.
 *
 * ISINYA SENGAJA BUKAN DAFTAR TOMBOL. Yang ditulis adalah hal yang tidak
 * terbaca dari layar: siapa yang berwenang, apa akibatnya kalau salah catat,
 * dan skenario yang tidak ada tombolnya.
 *
 * DIMUAT DI : sop.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const SOP_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const SOP_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let SOP_ID_TOKEN = null;

function sopEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function")
    ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sopShow(id) {
  ["sop-login-box", "sop-loading", "sop-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function sopBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}

function sopSimpanSesi_(token) {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp }));
  } catch (e) { /* private mode */ }
}

function sopHandleGoogleLogin(response) {
  SOP_ID_TOKEN = response.credential;
  sopSimpanSesi_(response.credential);
  sopMulai();
}

function sopLogout() {
  SOP_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("sop-nav-logout");
  if (b) b.classList.add("hidden");
  sopShow("sop-login-box");
}

function sopMulai() {
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(SOP_ID_TOKEN, SOP_API_URL, sopRender);
  } else {
    sopRender();
  }
}

/* ============================================================
 * ISI SOP
 * ============================================================ */

/** Rantai utama. Tiap tahap membatasi tahap berikutnya. */
/**
 * v188: SATU SUMBER SOP.
 *
 * File ini dibaca dua layar (halaman /p/sop.html dan tab SOP di produksi)
 * lewat sopIsiHtml_. Dokumen SOP-SIMPRO-PRODUKSI.md BUKAN sumber -- ia
 * diekspor dari data di bawah ini oleh tools/buat-sop-md.js. SOP baru
 * ditambahkan di sini, lalu MD dibuat ulang; jangan pernah menulis SOP di
 * dua tempat.
 */
const SOP_VERSI = "v198 \u00b7 25 Agustus 2026";

/** Rantai utama: siapa mencatat apa, di tab mana. Urutan = urutan kejadian. */
const SOP_RANTAI_TAB = [
  ["1", "Order masuk", "Order \u203a Orderan / Detail Order", "Admin",
   "PO + Rincian SO (warna & size) jadi pembanding seluruh rantai"],
  ["2", "Pola, Marker, Sampel, Approval", "fase Pola & Marker", "Pola/Marker",
   "Approval klien = titik mulai potong"],
  ["3", "Gelaran & potong", "Cutting \u203a Gelaran, Hasil Potong", "Kepala cutting",
   "Hasil potong per warna per size; potong bertahap = baris baru"],
  ["4", "QC Potong", "Cutting \u203a QC Potong", "Kepala cutting",
   "Self-check sebelum panel dibagi. Afkir \u2192 centang koreksi + tombol re-cut"],
  ["5", "Bagi ke line", "Cutting \u203a Bagi ke Line", "Admin/PPIC",
   "Pembanding = qty potong, bukan qty order. <b>Satu kali Simpan = satu serahan = satu SPK</b> \u2014 " +
   "cetak \u201cSPK serahan ini\u201d dan ikutkan ke tumpukannya; \u201cSPK gabungan\u201d hanya untuk rekap"],
  ["6", "Konfirmasi terima", "Sewing \u203a Konfirmasi Potongan", "Kepala line",
   "<b>Hitung dulu, baru centang.</b> Yang cocok dicentang lalu \u201cTerima sesuai\u201d sekali untuk semua; " +
   "yang tidak cocok \u2192 <b>Ada Selisih</b> di kartunya, hari itu juga. Jangan mencentang yang belum dihitung"],
  ["7", "QC Jahit", "Sewing \u203a QC Jahit", "Kepala line",
   "Self-check sebelum setor. Cacat jahitan saja \u2014 panel rusak bukan di sini (lihat skenario panel cacat)"],
  ["8", "Setoran", "Sewing \u203a Setoran ke Finishing", "Kepala line",
   "<b>Jadi Baju</b> = hasil jahit; <b>Dikembalikan</b> = potongan keluar dari line"],
  ["9", "Konfirmasi setoran", "Finishing \u203a Konfirmasi Setoran", "Finishing",
   "Selisih dicatat lewat mekanisme selisih, bukan didiamkan"],
  ["10", "QC Finishing", "Finishing \u203a QC Finishing", "Bagian QC (khusus)",
   "<b>Gerbang</b>: Qty Lolos per size = dasar stok siap kirim \u2192 surat jalan \u2192 tagihan"],
  ["11", "Kirim & tagih", "Stok Siap Kirim \u2192 Pengiriman \u2192 Invoice", "Admin/Finance",
   "Hanya yang lolos QC Finishing yang bisa dikirim"]
];
const SOP_PAGAR_QC = "Pagar akses QC: Potong = cutting/qc \u00b7 Jahit = sewing/qc \u00b7 Finishing = <b>qc saja</b>. " +
  "Ditolak sistem padahal memang tugasmu? Hubungi admin \u2014 jangan pinjam akun.";

/** Form QC: empat angka mutu. */
const SOP_ANGKA_MUTU = [
  ["Qty diperiksa", "Semua yang diperiksa sesi ini"],
  ["Qty lolos (per size)", "Yang boleh lanjut \u2014 <b>termasuk yang sudah selesai diperbaiki</b>"],
  ["Qty diperbaiki", "Dari yang lolos, berapa yang tadi sempat cacat lalu dibenerin"],
  ["Qty ditahan", "Masih di keranjang perbaikan \u2014 belum lolos, belum diafkir"]
];
const SOP_ANGKA_MUTU_CATATAN =
  "Afkir dihitung otomatis (diperiksa \u2212 lolos \u2212 ditahan). <b>Keputusan batch dinilai dari afkir</b> \u2014 " +
  "batch yang 30% cacat tapi semua sudah beres tetap \u201cLolos\u201d. Kolom diperbaiki tidak menghukum siapa pun; " +
  "dia hanya menunjukkan di mana waktu kerja ulang terbuang. Rincian jenis cacat harus menjumlah ke cacat " +
  "ditemukan (afkir + diperbaiki + ditahan). <b>Jenis cacat yang belum ada di daftar boleh " +
  "diketik sendiri</b> \u2014 pilih \u201c+ Jenis lain\u201d di dropdown. Tulis apa adanya; sistem " +
  "menyamakan ejaannya dengan yang sudah ada dan memasukkannya ke daftar untuk dipakai berikutnya.";

/** v197: tiga keputusan QC -- label untuk manusia, bukan pintu sistem. */
const SOP_KEPUTUSAN = [
  ["Lolos", "Afkir = 0", "Semua yang diperiksa boleh lanjut, termasuk yang sempat cacat lalu diperbaiki. Tidak ada tindakan."],
  ["Lolos Bersyarat", "Ada afkir, \u2264 batas toleransi (10%)", "Batch boleh lanjut; yang afkir keluar dari batch (di Potong: centang koreksi + re-cut). Kepala line/cutting cukup tahu."],
  ["Reject-Rework", "Afkir > batas toleransi", "Yang lolos tetap lolos, tapi batch ini menandai <b>cara kerjanya</b> bermasalah \u2014 kepala produksi turun mencari akar masalah sebelum batch berikutnya dikerjakan dengan cara yang sama."]
];
const SOP_KEPUTUSAN_CATATAN =
  "Keputusan adalah <b>label untuk manusia, bukan pintu sistem</b>: stok siap kirim tetap dihitung dari Qty Lolos per size. " +
  "Dihitung dari afkir, bukan dari cacat ditemukan. Checker boleh mengganti rekomendasi sistem; " +
  "<b>memilih yang lebih longgar wajib beralasan di Catatan</b> (sistem menolak tanpa alasan), memperketat tidak perlu alasan.";

/** Dua buku re-cut -- bukan dobel, dua hal berbeda. */
const SOP_DUA_BUKU = [
  ["KAIN", "Gelaran \u203a mode Re-cut", "kain terpakai, komponen, alasan, line pemohon, kotak \u201cDari QC Potong\u201d", "Tidak (sengaja)"],
  ["BAJU", "QC Potong (koreksi \u2212N) + Buat re-cut (+N), jejak Re-cut Dari QC", "pool \u201csisa boleh dibagi\u201d kembali utuh", "Netral (\u2212N lalu +N)"]
];
const SOP_DUA_BUKU_CATATAN =
  "Kalau kain pengganti dicatat sebagai gelaran <b>Normal</b>: set lengkap naik N, Hasil Potong netral \u2192 " +
  "panel \u201cN pcs belum dicatat\u201d menggantung selamanya. Itu satu-satunya cara dua jalur ini bertabrakan.";

/** Cek mingguan -- Femri / kepala produksi. */
const SOP_CEK_MINGGUAN = [
  ["diagnosaMutuQC() bagian 2", "Keranjang terbuka per PO harus mengecil, bukan menumpuk."],
  ["WIP per line", "Mendekati nol untuk PO yang selesai; WIP menggantung = ada serah-terima yang tidak dicatat."],
  ["Sisa boleh dibagi", "= 0 saat PO tuntas; sisa positif menahun = ada panel hantu (langkah koreksi QC Potong terlewat)."],
  ["diagnosaMutuQC() bagian 5", "Tiap sesi QC Potong berafkir harus TUNTAS: koreksi \u2212N, re-cut +N, kain pengganti > 0, satu ID QC. " +
   "\u201cGelaran NORMAL memakai ID ini\u201d = salah mode, perbaiki hari itu."],
  ["Defect rate naik setelah v184", "<b>Normal dan diharapkan</b> \u2014 mutu akhirnya terlihat. Yang dicurigai justru kalau tetap 0%."]
];

const SOP_RANTAI = [
  ["Order", "Order masuk & disetujui", "#8A5D1F"],
  ["Pola & Marker", "Pola dibuat, marker disusun", "#5F6B7A"],
  ["Sampel", "Sampel dijahit & di-approve", "#5F6B7A"],
  ["Cutting", "Kain jadi potongan", "#C2410C"],
  ["Loading", "Potongan dibagi / keluar", "#C2410C"],
  ["Sewing", "Potongan jadi baju", "#17212F"],
  ["Finishing", "Baju dirapikan & di-QC", "#17212F"],
  ["Packing & Kirim", "Baju keluar ke klien", "#2C6B3F"],
  ["Invoice", "Tagihan dari yang terkirim", "#2C6B3F"]
];

/** Aturan yang berlaku di SEMUA tab. */
const SOP_ATURAN_BESI = [
  ["Catat saat kejadian, bukan nanti",
   "Setiap jeda antara kejadian dan pencatatan adalah jendela di mana sistem " +
   "menawarkan barang yang sudah tidak ada, atau menagih yang belum dikirim."],
  ["Salah input = Batalkan, bukan hapus",
   "Barisnya tetap ada berstatus Dibatalkan. Yang pernah terjadi tidak dihapus, " +
   "termasuk kesalahan -- supaya tidak ada yang mencari-cari catatan yang hilang."],
  ["Jangan pernah mengedit baris lama",
   "Perubahan jumlah dicatat sebagai baris BARU. Mengedit baris lama menghapus " +
   "jejak, dan selisih yang muncul kemudian tidak bisa ditelusuri ke titik lahirnya."],
  ["Angka turunan tidak diisi manual",
   "Stok siap kirim, sisa, dan set lengkap dihitung sistem dari kejadian. Kalau " +
   "angkanya terasa salah, yang keliru adalah salah satu kejadiannya -- cari di situ."],
  ["Satu kejadian, satu tempat",
   "Kalau satu kejadian dicatat di dua form, angkanya berkurang dua kali. " +
   "Ragu di mana mencatat? Lihat tabel skenario di bawah."],
  // v188: dua prinsip dari dokumen induk, sekarang di sini.
  ["Yang menerima yang mengonfirmasi",
   "Setiap barang pindah tangan = ada catatannya, dan yang membenarkan adalah " +
   "penerimanya \u2014 bukan yang menyerahkan. Angka jujur, bukan angka bagus: cacat, " +
   "selisih, dan barang menggantung punya tempatnya masing-masing."],
  ["Self-check tidak pernah memotong upah",
   "Angka QC Potong & QC Jahit adalah pemeriksaan sendiri. Untuk insentif mutu, " +
   "pakai temuan QC Finishing per line."]
];

/** Per fase: siapa, apa, aturan, yang sering salah. */
const SOP_FASE = [
  {
    id: "polamarker", nama: "Pola & Marker", warna: "#5F6B7A",
    tab: "Pola \u00b7 Marker",
    siapa: "Tim pola",
    inti: "Mencatat waktu pembuatan pola dan menyusun marker yang akan dipakai menggelar.",
    aturan: [
      ["Pola dicatat per ARTIKEL, bukan per order",
       "Artikel yang polanya sudah pernah dibuat akan muncul keterangan " +
       "\u201csudah dikerjakan di order lain\u201d \u2014 tidak perlu dibuat ulang."],
      ["Durasi tiap langkah wajib diisi",
       "Angka jam ini satu-satunya sumber biaya pola di HPP. Tidak ada tempat lain " +
       "yang bisa menggantikannya."],
      ["Marker menentukan hitungan kain",
       "Panjang marker \u00d7 jumlah lapis = kain terpakai. Marker yang salah panjang " +
       "membuat HPP kain seluruh order ikut salah."],
      ["Marker milik PO lain akan ditolak",
       "Kalau lolos, pemakaian kain PO ini dihitung dengan panjang marker order lain " +
       "dan tidak ada yang akan menyadarinya."]
    ],
    salah: [
      ["Satu langkah dikerjakan beberapa hari",
       "Catat beberapa kali dengan durasi masing-masing hari. Sistem menjumlahkannya."]
    ]
  },
  {
    id: "sampel", nama: "Sampel", warna: "#5F6B7A",
    tab: "Sampel \u00b7 Approval",
    siapa: "Tim sampel",
    inti: "Mencatat pembuatan sampel dan status persetujuan klien.",
    aturan: [
      ["Tiap perubahan status = catatan baru",
       "Jangan mengedit catatan lama. Sampel yang bolak-balik revisi justru perlu " +
       "terlihat riwayatnya \u2014 itu bahan negosiasi kalau klien menuntut cepat."],
      ["Approval menentukan boleh-tidaknya produksi jalan",
       "Memotong kain sebelum sampel disetujui adalah risiko yang ditanggung sendiri, " +
       "dan sistem tidak akan menahannya \u2014 tapi jejaknya tercatat."]
    ],
    salah: []
  },
  {
    id: "cutting", nama: "Cutting", warna: "#C2410C",
    tab: "Gelaran \u00b7 Hasil Potong",
    siapa: "Tim cutting",
    inti: "MENGISI pool. Kain digelar jadi potongan, lalu jumlah set lengkap dicatat " +
      "sebagai Hasil Potong \u2014 itulah yang membuka pool untuk dibagi.",
    aturan: [
      ["Gelaran mencatat KAIN, Hasil Potong membuka POOL",
       "Dua langkah berbeda. Gelaran menghitung set lengkap secara otomatis; Hasil " +
       "Potong yang mencatatnya sebagai barang yang siap dibagi."],
      ["Set lengkap = jumlah TERKECIL di antara semua komponen",
       "Kalau badan depan 100 tapi lengan baru 80, yang siap dijahit 80. Sisanya " +
       "menunggu pasangannya \u2014 bukan hilang."],
      ["JANGAN pernah mencatat gelaran NORMAL untuk sebagian panel",
       "Set lengkap dihitung sebagai nilai terkecil antar komponen. Gelaran normal " +
       "berisi \u201cBadan Depan 10 pcs\u201d akan membuat set lengkap se-warna anjlok " +
       "jadi 10. Panel sebagian SELALU dicatat sebagai Re-cut atau Panel Klien."],
      ["Hasil Potong boleh melebihi order",
       "Cadangan itu wajar dan tidak diblokir. Yang dibatasi justru pengiriman: " +
       "cadangan ada untuk mengganti yang cacat, bukan untuk ikut dikirim."],
      ["Kode kain dicatat per gelaran",
       "Satu gelaran = satu bentangan = satu kode. Terisi otomatis dari rencana order; " +
       "ubah kalau roll yang dipakai ternyata beda batch."]
    ],
    salah: [
      ["Hasil Potong belum dicatat, sudah membagi",
       "Basis \u201csisa\u201d jatuh ke qty ORDER \u2014 rencana, bukan kenyataan. " +
       "Cadangan jadi tidak terlihat."],
      ["Menggelar dengan marker order lain",
       "Ditolak sistem. Kalau markernya memang dipakai bersama, buat markernya " +
       "untuk PO ini."]
    ]
  },
  {
    id: "loading", nama: "Loading", warna: "#C2410C",
    tab: "Bagi ke Line \u00b7 Potongan Keluar \u00b7 Siapkan Potongan \u00b7 SPK & Rekap",
    siapa: "Kepala produksi/PPIC (membagi) \u00b7 Tim loading (menyiapkan)",
    inti: "MENGELOLA pool. Dua pintu keluar: ke line untuk dijahit, atau ke klien " +
      "untuk tidak kembali.",
    aturan: [
      ["\u201cBagi ke Line\u201d adalah KEPUTUSAN, bukan pencatatan",
       "Isinya berapa pcs ke line mana dan target selesai kapan \u2014 butuh tahu " +
       "beban lantai. Itu wewenang kepala produksi/PPIC, bukan tim loading."],
      ["Tim loading MENYIAPKAN, tidak membagi",
       "Buka \u201cSiapkan Potongan\u201d: daftar yang harus disiapkan hari ini dari " +
       "semua order, dikelompokkan per line. Centang yang fisiknya sudah siap."],
      ["Menandai \u201csudah disiapkan\u201d tidak wajib",
       "Kepala line tetap bisa konfirmasi terima walau penandaan terlewat. Yang " +
       "hilang cuma jejak waktunya, bukan barangnya."],
      ["Potongan Keluar dicatat SEBELUM barang dibawa",
       "Kalau terlambat, ada jendela di mana sistem masih menawarkan barang yang " +
       "sudah pergi \u2014 dan itu persis saat orang membaginya ke line."],
      ["Klien minta potongan yang sedang dipegang line?",
       "Tarik dulu lewat pengembalian setoran, baru catat Potongan Keluar. Sistem " +
       "memang menolak: sisa hanya menghitung yang masih di gudang."]
    ],
    salah: [
      ["Target selesai dikosongkan",
       "Line tanpa target tidak muncul di papan mana pun sebagai terlambat. " +
       "Isi walau perkiraan kasar."]
    ]
  },
  {
    id: "sewing", nama: "Sewing", warna: "#17212F",
    tab: "Konfirmasi Potongan \u00b7 Setoran ke Finishing",
    siapa: "Kepala line",
    inti: "Menerima potongan, menjahit, menyetorkan hasilnya ke finishing.",
    aturan: [
      ["Konfirmasi terima itu serah-terima, bukan formalitas",
       "Selisih jumlah paling murah diselesaikan di titik ini. Sesudah dijahit, " +
       "tidak ada yang bisa membuktikan berapa yang benar-benar diterima."],
      ["Setoran boleh dicicil",
       "Catat tiap kali menyetor, jangan menunggu selesai semua. Progres yang " +
       "menumpuk di akhir membuat papan produksi bohong sepanjang minggu."],
      ["Potongan yang tidak jadi dijahit DIKEMBALIKAN, bukan didiamkan",
       "Potongan yang dikembalikan otomatis bisa dibagi lagi. Kalau didiamkan, " +
       "barangnya ada di gudang tapi menurut sistem masih di line."],
      ["Panel cacat: minta re-cut, JANGAN dikembalikan",
       "Panel cacat itu limbah. Mengembalikannya lewat form pengembalian membuat " +
       "pool menawarkan barang rusak ke line berikutnya."]
    ],
    salah: [
      ["Panel pengganti dicatat sebagai pembagian baru",
       "Line akan tercatat menerima lebih banyak daripada yang akan disetorkannya, " +
       "dan selisihnya jadi hutang yang tidak akan pernah lunas. Panel pengganti " +
       "diserahkan langsung \u2014 cukup dicatat sebagai Re-cut di tab Gelaran."]
    ]
  },
  {
    id: "finishing", nama: "Finishing", warna: "#17212F",
    tab: "Konfirmasi Setoran \u00b7 QC \u00b7 Ringkasan QC",
    siapa: "Tim finishing & QC",
    inti: "Menerima setoran dari sewing, memeriksa mutu, meloloskan yang layak kirim.",
    aturan: [
      ["QC menentukan apa yang boleh dikirim",
       "Stok siap kirim = lolos QC \u2212 sudah terkirim. Barang yang belum diperiksa " +
       "tidak akan muncul sebagai siap kirim, berapa pun yang sudah dijahit."],
      ["Yang bisa diperiksa = yang sudah dikonfirmasi diterima",
       "Kalau QC mengeluh \u201cbarangnya ada tapi tidak bisa dipilih\u201d, biasanya " +
       "setorannya belum dikonfirmasi terima."],
      ["Reject dicatat apa adanya",
       "Angka reject yang dirapikan membuat masalah mutu tidak pernah terlihat, " +
       "dan biayanya tetap ditanggung \u2014 cuma tidak diketahui dari mana."]
    ],
    salah: []
  },
  {
    id: "packing", nama: "Packing & Kirim", warna: "#2C6B3F",
    tab: "Stok Siap Kirim \u00b7 Terkirim",
    siapa: "Gudang & admin",
    inti: "Mengirim baju jadi ke klien dan menerbitkan surat jalan.",
    aturan: [
      ["Batas kirim bertingkat",
       "Lolos QC kalau sudah dicatat; kalau belum, jatuh ke hasil potong; kalau " +
       "belum juga, qty order. Makin lengkap catatannya, makin jujur batasnya."],
      ["Tidak pernah melebihi qty order",
       "Cadangan boleh dipotong dan boleh lolos QC, tapi tidak ikut dikirim \u2014 " +
       "kalau terkirim, klien akan ditagih melebihi yang dipesannya."],
      ["Kurir diisi kalau ada yang mengantar",
       "Beda dari Metode: metode itu CARAnya (Diambil/JNE/Gojek), kurir itu SIAPAnya."]
    ],
    salah: []
  }
];

/** Skenario yang tidak ada tombolnya \u2014 bagian paling sering ditanyakan. */
const SOP_SKENARIO = [
  {
    judul: "Klien minta potongan untuk dijahit sendiri",
    tanya: "Potongannya sudah ada di gudang, atau harus dipotong dulu?",
    baris: [
      ["Sudah ada, order berkurang",
       "Loading \u203a Potongan Keluar \u203a <b>Set lengkap</b>",
       "Pool turun, kain tetap. Surat jalan terbit otomatis."],
      ["Sudah ada, panelnya saja, order berkurang",
       "Loading \u203a Potongan Keluar \u203a <b>Panel saja</b>",
       "Pool turun sebanyak SET yang panelnya diambil \u2014 dihitung dalam pcs baju, " +
       "bukan lembar panel. Set itu tidak bisa jadi baju lagi."],
      ["Harus dipotong dulu",
       "Cutting \u203a Gelaran \u203a mode <b>Panel klien</b>",
       "Kain naik, pool tidak berubah (tidak pernah masuk pool). Surat jalan dicetak " +
       "dari baris gelarannya."],
      ["Sudah ada, tapi RJD akan mengganti panelnya",
       "Cutting \u203a Gelaran \u203a mode <b>Panel klien</b> untuk kain penggantinya",
       "JANGAN catat Potongan Keluar. Netto-nya identik: kain naik, jumlah baju tetap. " +
       "Kalau dicatat dua-duanya, pool berkurang untuk barang yang akhirnya tetap ada."]
    ]
  },
  {
    // v184: kartu ini DITULIS ULANG. Versi lama (v155) menyuruh line "tetap
    // menyetor penuh" dan melarang pengembalian -- sebelum ada QC Potong,
    // keranjang ditahan, koreksi otomatis, dan tombol Buat re-cut. Sekarang
    // tiap fakta punya bukunya sendiri, jadi tidak ada lagi yang perlu
    // dipura-purakan penuh.
    judul: "Panel cacat ketahuan saat menjahit (contoh: loading 100, jadi 98, rusak 2)",
    tanya: "Urutannya tiga langkah -- jangan ada yang dilompati:",
    baris: [
      ["1. Line: setor hasil nyata",
       "Sewing \u203a Setoran: <b>98 Jadi Baju</b>, lalu <b>2 Dikembalikan</b> dengan catatan \"panel rusak\"",
       "WIP line jadi nol dan persen selesai dihitung dari 98 \u2014 line tidak menanggung dosa cutting. " +
       "<b>Jangan catat 2 pcs itu di QC Jahit</b>: panel rusak bukan cacat jahitan."],
      ["2. Cutting: catat afkirnya",
       "Cutting \u203a <b>QC Potong</b>: diperiksa 2, lolos 0, jenis \"panel rusak\", catatan asal line-nya. " +
       "<b>Centang koreksi</b> + isi size panelnya",
       "Koreksi otomatis mengeluarkan panel mati dari \"sisa boleh dibagi\" \u2014 tanpa ini, " +
       "sistem menawarkan panel rusak ke line berikutnya."],
      ["3. Cutting: catat KAIN penggantinya",
       "Cutting \u203a Gelaran \u203a mode <b>Re-cut</b> (BUKAN Normal): komponen yang diganti, alasan, " +
       "kain terpakai, kotak \u201cUntuk Line\u201d diisi line pemohon",
       "Ini buku KAIN. Mode Re-cut menambah pemakaian kain tanpa menambah set lengkap. " +
       "<b>Kalau dicatat sebagai gelaran Normal</b>, set lengkap naik 2 dan panel hantu " +
       "\u201c2 pcs belum dicatat\u201d menggantung selamanya."],
      ["4. Cutting: potong penggantinya",
       "Tekan tombol <b>Buat re-cut 2 pcs</b> yang muncul setelah simpan QC \u2192 isi qty di baris tersorot " +
       "(kolom kain dikosongkan) \u2192 bagi ke line seperti biasa",
       "Ini buku BAJU. Koreksi \u22122 lalu re-cut +2 dengan jejak QC yang sama = pool kembali utuh. " +
       "Langkah 3 dan 4 mencatat hal berbeda (kain vs baju) \u2014 keduanya wajib, dan tidak ada yang terhitung dua kali."]
    ]
  },
  {
    judul: "Barang QC belum selesai diperbaiki saat mau dicatat (PO besar dicicil)",
    tanya: "Jangan dipaksa memilih lolos atau afkir:",
    baris: [
      ["Saat mencatat QC",
       "Isi kolom <b>Qty ditahan</b> sejumlah yang masih di keranjang perbaikan",
       "Barang ditahan belum masuk stok siap kirim, dan tidak terhitung afkir."],
      ["Saat perbaikannya selesai",
       "Buka pintu QC yang sama \u2192 spanduk \"N pcs masih di keranjang\" \u2192 <b>Selesaikan sekarang</b> " +
       "\u2192 isi berapa akhirnya lolos (per size) dan berapa akhirnya afkir",
       "Boleh dicicil; sisanya tetap tercatat. Cacat BARU yang ketemu saat memperbaiki " +
       "dicatat lewat sesi inspeksi biasa, bukan di sini."]
    ]
  },
  {
    judul: "Potongan sudah dibagi tapi line tidak jadi mengerjakan",
    tanya: "Barangnya masih utuh?",
    baris: [
      ["Masih utuh",
       "Sewing \u203a Setoran \u203a <b>Dikembalikan</b>",
       "Otomatis bisa dibagi lagi ke line lain."],
      ["Salah input sejak awal (belum ada barang berpindah)",
       "Batalkan barisnya di daftar pembagian",
       "Baris tetap ada berstatus Dibatalkan; qty-nya kembali tersedia."]
    ]
  },
  {
    // v188: dari dokumen induk, Kasus C.
    judul: "Afkir ketemu di meja potong (belum masuk catatan Hasil Potong)",
    tanya: "Panelnya pernah terhitung atau belum?",
    baris: [
      ["Belum pernah masuk Hasil Potong",
       "Cutting \u203a QC Potong dengan centang koreksi <b>DIMATIKAN</b>",
       "Tidak ada yang perlu dikurangkan \u2014 panelnya belum pernah terhitung. Kain penggantinya tetap " +
       "Gelaran mode Re-cut kalau memang dipotong ulang."],
      ["Sudah tercatat, ketahuan belakangan",
       "Cutting \u203a QC Potong dengan centang koreksi <b>menyala</b>",
       "Hasil Potong berkurang otomatis, lalu Buat re-cut seperti skenario panel cacat."]
    ]
  },
  {
    // v188: Kasus D.
    judul: "Qty serah-terima tidak cocok",
    tanya: "Siapa pun yang menerima \u2014 line dari cutting, finishing dari line:",
    baris: [
      ["Angkanya beda dengan yang diserahkan",
       "Penerima pilih <b>Ada Selisih</b> saat konfirmasi, hari itu juga",
       "Selisih lahir sebagai baris koreksi bertanda, di batch yang sama. Jangan \u201cDiterima\u201d dulu " +
       "lalu dibetulkan lisan \u2014 itu selisih yang tidak akan pernah ketemu."]
    ]
  },
  {
    // v188: Kasus E.
    judul: "Salah input",
    tanya: "Kejadiannya nyata atau tidak?",
    baris: [
      ["Kejadiannya nyata, angkanya yang berubah",
       "Baris <b>Koreksi</b> (qty minus)",
       "Riwayat tetap utuh: angka lama, koreksinya, dan hasil bersihnya bisa ditelusuri."],
      ["Barisnya tidak pernah mewakili kejadian apa pun (salah PO, salah ketik)",
       "<b>Dibatalkan</b>",
       "Baris tetap ada berstatus Dibatalkan. Jangan pernah mengedit baris lama."]
    ]
  },
  {
    // v188: Kasus G.
    judul: "Cacat baru ketemu saat menyelesaikan keranjang",
    tanya: "Sesi penyelesaian hanya menutup keranjang lama:",
    baris: [
      ["Yang ditutup = barang yang tadi ditahan",
       "Tombol <b>Selesaikan sekarang</b> \u2192 isi lolos (per size) & afkir akhirnya",
       "Sistem menolak kalau penyelesaian melebihi keranjang terbuka."],
      ["Cacat BARU di luar keranjang",
       "Sesi <b>inspeksi biasa</b>",
       "Jangan diselipkan ke penyelesaian \u2014 keranjang lama jadi tidak bisa ditutup."]
    ]
  },
  {
    judul: "Jumlah kirim tidak cocok dengan order",
    tanya: "Di titik mana selisihnya lahir?",
    baris: [
      ["Potong kurang dari order",
       "Cek Hasil Potong vs qty order",
       "Biasanya kain klien memang kurang. Catatan kain dipakai di form potong " +
       "adalah dasar RJD saat klien menanyakannya."],
      ["Potong cukup, kirim kurang",
       "Cek berturut-turut: dibagi \u2192 disetor \u2192 lolos QC \u2192 terkirim",
       "Titik pertama yang angkanya turun adalah tempat selisihnya lahir."],
      ["Ada potongan yang keluar ke klien",
       "Cek Loading \u203a Potongan Keluar",
       "Qty yang keluar memang mengurangi yang bisa dikirim \u2014 itu bukan selisih, " +
       "itu kesepakatan."]
    ]
  }
];

/* ============================================================
 * RENDER
 * ============================================================ */

function sopBaganHtml_() {
  // Bagan alur digambar SVG supaya tetap tajam saat dicetak dan tidak
  // bergantung pada gambar yang harus diunggah ke mana pun.
  const lebarKotak = 128, tinggiKotak = 62, jarak = 14;
  const total = SOP_RANTAI.length;
  const w = total * lebarKotak + (total - 1) * jarak;
  const kotak = SOP_RANTAI.map(function (f, i) {
    const x = i * (lebarKotak + jarak);
    const panah = i < total - 1
      ? '<path d="M' + (x + lebarKotak + 2) + ' ' + (tinggiKotak / 2) +
        ' L' + (x + lebarKotak + jarak - 3) + ' ' + (tinggiKotak / 2) +
        '" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah)"/>'
      : '';
    return '<g>' +
      '<rect x="' + x + '" y="0" width="' + lebarKotak + '" height="' + tinggiKotak +
        '" rx="10" fill="#fff" stroke="' + f[2] + '" stroke-width="1.5"/>' +
      '<text x="' + (x + lebarKotak / 2) + '" y="25" text-anchor="middle" ' +
        'font-size="13" font-weight="700" fill="' + f[2] + '">' + sopEsc_(f[0]) + '</text>' +
      '<text x="' + (x + lebarKotak / 2) + '" y="44" text-anchor="middle" ' +
        'font-size="9.5" fill="#5F6B7A">' + sopEsc_(f[1]) + '</text>' +
      '</g>' + panah;
  }).join("");

  return '<div class="sop-bagan-wrap">' +
    '<svg viewBox="0 0 ' + w + ' ' + tinggiKotak + '" width="' + w + '" height="' + tinggiKotak + '" ' +
      'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alur produksi">' +
      '<defs><marker id="sop-panah" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">' +
        '<path d="M0 0 L6 3 L0 6 z" fill="#C9C2B4"/></marker></defs>' +
      kotak +
    '</svg>' +
  '</div>';
}

function sopBaganPotonganHtml_() {
  // Bagan kedua: ke mana potongan bisa pergi. Ini yang paling sering keliru,
  // dan justru bagian yang tidak kelihatan dari deretan tab.
  return '<div class="sop-bagan-wrap">' +
    '<svg viewBox="0 0 640 250" width="640" height="250" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="Ke mana potongan pergi">' +
      '<defs><marker id="sop-panah2" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">' +
        '<path d="M0 0 L6 3 L0 6 z" fill="#C9C2B4"/></marker></defs>' +

      '<rect x="0" y="95" width="150" height="60" rx="10" fill="#fff" stroke="#C2410C" stroke-width="1.5"/>' +
      '<text x="75" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#C2410C">POOL</text>' +
      '<text x="75" y="138" text-anchor="middle" font-size="9.5" fill="#5F6B7A">dari Hasil Potong</text>' +

      '<path d="M152 118 L228 40" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +
      '<path d="M152 125 L228 125" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +
      '<path d="M152 132 L228 210" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +

      '<rect x="232" y="12" width="180" height="56" rx="10" fill="#fff" stroke="#17212F" stroke-width="1.5"/>' +
      '<text x="322" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="#17212F">Bagi ke Line</text>' +
      '<text x="322" y="52" text-anchor="middle" font-size="9.5" fill="#5F6B7A">dijahit, kembali jadi baju</text>' +

      '<rect x="232" y="97" width="180" height="56" rx="10" fill="#fff" stroke="#8A2A2A" stroke-width="1.5"/>' +
      '<text x="322" y="119" text-anchor="middle" font-size="12" font-weight="700" fill="#8A2A2A">Potongan Keluar</text>' +
      '<text x="322" y="137" text-anchor="middle" font-size="9.5" fill="#5F6B7A">ke klien, tidak kembali</text>' +

      '<rect x="232" y="182" width="180" height="56" rx="10" fill="#FAF7F2" stroke="#C9C2B4" ' +
        'stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<text x="322" y="204" text-anchor="middle" font-size="12" font-weight="700" fill="#5F6B7A">Panel Klien</text>' +
      '<text x="322" y="222" text-anchor="middle" font-size="9.5" fill="#5F6B7A">dipotong khusus, TAK lewat pool</text>' +

      '<path d="M414 40 L490 40" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +
      '<text x="500" y="36" font-size="10.5" fill="#5F6B7A">Sewing \u2192 QC \u2192 Kirim</text>' +
      '<text x="500" y="52" font-size="9.5" fill="#8A8577">masuk invoice</text>' +

      '<path d="M414 125 L490 125" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +
      '<text x="500" y="121" font-size="10.5" fill="#5F6B7A">Surat jalan potongan</text>' +
      '<text x="500" y="137" font-size="9.5" fill="#8A8577">tidak masuk invoice</text>' +

      '<path d="M414 210 L490 210" stroke="#C9C2B4" stroke-width="2" marker-end="url(#sop-panah2)"/>' +
      '<text x="500" y="206" font-size="10.5" fill="#5F6B7A">Surat jalan potongan</text>' +
      '<text x="500" y="222" font-size="9.5" fill="#8A8577">kain naik, baju tetap</text>' +
    '</svg>' +
  '</div>';
}

/**
 * Bangun HTML isi SOP. DIPISAH dari sopRender supaya bisa dipakai dua tempat:
 * halaman /p/sop.html dan tab SOP di halaman produksi (v156). Satu sumber,
 * dua pintu -- kalau dipisah jadi dua salinan, cepat atau lambat keduanya
 * berbeda dan tidak ada yang tahu mana yang benar.
 *
 * @param opsi.tanpaNav  true untuk tab di halaman produksi: bar navigasi
 *                       lompat menempel di atas akan bertabrakan dengan bar
 *                       fase & subtab yang sudah menempel di sana.
 */
function sopIsiHtml_(opsi) {
  const tanpaNav = !!(opsi && opsi.tanpaNav);
  const fase = SOP_FASE.map(function (f) {
    const aturan = f.aturan.map(function (a) {
      return '<li><b>' + a[0] + '</b><span>' + a[1] + '</span></li>';
    }).join("");
    const salah = f.salah.length
      ? '<div class="sop-salah"><div class="sop-salah-judul">Yang sering salah</div><ul>' +
        f.salah.map(function (s) {
          return '<li><b>' + s[0] + '</b><span>' + s[1] + '</span></li>';
        }).join("") + '</ul></div>'
      : "";
    return '<section class="sop-fase" id="sop-' + f.id + '">' +
      '<div class="sop-fase-kepala" style="border-color:' + f.warna + '">' +
        '<h3 style="color:' + f.warna + '">' + sopEsc_(f.nama) + '</h3>' +
        '<div class="sop-fase-tab">' + f.tab + '</div>' +
      '</div>' +
      '<div class="sop-fase-meta"><b>Pengisi:</b> ' + sopEsc_(f.siapa) + '</div>' +
      '<p class="sop-fase-inti">' + f.inti + '</p>' +
      '<ul class="sop-daftar">' + aturan + '</ul>' + salah +
    '</section>';
  }).join("");

  const skenario = SOP_SKENARIO.map(function (s) {
    return '<section class="sop-skenario">' +
      '<h3>' + sopEsc_(s.judul) + '</h3>' +
      '<p class="sop-tanya">' + sopEsc_(s.tanya) + '</p>' +
      '<div class="sop-tabelwrap"><table class="sop-tabel">' +
        '<thead><tr><th>Kalau</th><th>Catat di</th><th>Akibatnya</th></tr></thead>' +
        '<tbody>' + s.baris.map(function (r) {
          return '<tr><td data-label="Kalau">' + r[0] + '</td><td data-label="Catat di">' + r[1] +
            '</td><td data-label="Akibatnya">' + r[2] + '</td></tr>';
        }).join("") + '</tbody>' +
      '</table></div>' +
    '</section>';
  }).join("");

  const besi = SOP_ATURAN_BESI.map(function (a) {
    return '<li><b>' + a[0] + '</b><span>' + a[1] + '</span></li>';
  }).join("");

  const rantaiTab = '<div class="sop-tabelwrap"><table class="sop-tabel sop-tabel-rantai">' +
    '<thead><tr><th>#</th><th>Tahap</th><th>Tab</th><th>Yang mencatat</th><th>Inti</th></tr></thead><tbody>' +
    SOP_RANTAI_TAB.map(function (r) {
      return '<tr><td data-label="#">' + r[0] + '</td><td data-label="Tahap"><b>' + sopEsc_(r[1]) +
        '</b></td><td data-label="Tab">' + r[2] + '</td><td data-label="Yang mencatat">' +
        sopEsc_(r[3]) + '</td><td data-label="Inti">' + r[4] + '</td></tr>';
    }).join("") + '</tbody></table></div>' +
    '<p class="sop-info">' + SOP_PAGAR_QC + '</p>';

  const angkaMutu = '<div class="sop-tabelwrap"><table class="sop-tabel">' +
    '<thead><tr><th>Isian</th><th>Arti</th></tr></thead><tbody>' +
    SOP_ANGKA_MUTU.map(function (r) {
      return '<tr><td data-label="Isian">' + sopEsc_(r[0]) + '</td><td data-label="Arti">' + r[1] + '</td></tr>';
    }).join("") +
    '</tbody></table></div><p class="sop-info">' + SOP_ANGKA_MUTU_CATATAN + '</p>';

  const keputusan = '<div class="sop-tabelwrap"><table class="sop-tabel">' +
    '<thead><tr><th>Keputusan</th><th>Kapan</th><th>Artinya</th></tr></thead><tbody>' +
    SOP_KEPUTUSAN.map(function (r) {
      return '<tr><td data-label="Keputusan">' + sopEsc_(r[0]) + '</td><td data-label="Kapan">' + r[1] +
        '</td><td data-label="Artinya">' + r[2] + '</td></tr>';
    }).join("") + '</tbody></table></div><p class="sop-info">' + SOP_KEPUTUSAN_CATATAN + '</p>';

  const duaBuku = '<div class="sop-tabelwrap"><table class="sop-tabel">' +
    '<thead><tr><th>Buku</th><th>Tab</th><th>Mencatat</th><th>Menambah set lengkap?</th></tr></thead><tbody>' +
    SOP_DUA_BUKU.map(function (r) {
      return '<tr><td data-label="Buku">' + r[0] + '</td><td data-label="Tab">' + r[1] +
        '</td><td data-label="Mencatat">' + r[2] + '</td><td data-label="Menambah set lengkap?">' + r[3] + '</td></tr>';
    }).join("") + '</tbody></table></div><p class="sop-info">' + SOP_DUA_BUKU_CATATAN + '</p>';

  const cekMingguan = '<ul class="sop-daftar">' + SOP_CEK_MINGGUAN.map(function (a) {
    return '<li><b>' + sopEsc_(a[0]) + '</b><span>' + a[1] + '</span></li>';
  }).join("") + '</ul>';

  const daftarIsi = SOP_FASE.map(function (f) {
    return '<a href="#sop-' + f.id + '">' + sopEsc_(f.nama) + '</a>';
  }).join("");

  return (tanpaNav ? '' :
    '<div class="sop-nav">' + daftarIsi +
      '<a href="#sop-skenario-blok">Skenario</a>' +
      '<a href="#sop-cek-mingguan">Cek mingguan</a>' +
      '<button class="sop-cetak sp-tautan" onclick="window.print()" type="button">Cetak</button>' +
    '</div>') +
    // v191: baris versi DICABUT dari layar (tetap tercetak di dokumen MD lewat
    // SOP_VERSI). Yang membaca layar ini penjahit dan kepala line -- nomor versi
    // bukan informasi yang mereka pakai, dan menempatkannya di baris pertama
    // membuat hal pertama yang dibaca orang baru adalah angka yang tak berarti.
    // v170: blok pembuka -- APA NAMA SISTEM INI, dan kenapa dua pintu.
    //
    // Tim selama ini menyebutnya "AppSheet" karena itu satu-satunya nama yang
    // pernah mereka lihat: nama SIMPRO cuma muncul sekali di pesan login.
    // Yang lebih berbahaya dari salah sebut adalah kesimpulan yang mengikuti:
    // kalau HP dan komputer disebut sebagai dua sistem, orang akan mengira
    // datanya juga dua -- lalu muncul pertanyaan seperti "itu sudah masuk web
    // belum, tadi kan cuma di AppSheet", padahal itu baris yang sama persis.
    //
    // Blok ini menjelaskan sekali, di tempat yang dibaca orang baru.
    '<section class="sop-blok sop-blok-nama">' +
      '<h2>SIMPRO</h2>' +
      '<p class="sop-info">Satu sistem, dua pintu masuk (Appsheet dan web). Keduanya membaca dan ' +
        'menulis data yang <b>sama persis</b> &#8212; yang berbeda cuma layarnya.</p>' +
      '<div class="sop-pintu">' +
        '<div class="sop-pintu-kotak">' +
          '<b>SIMPRO di HP</b>' +
          '<span>Aplikasi di lapangan. Untuk mencatat dailyreport, hasil potong, ' +
            'setoran, absensi.</span>' +
        '</div>' +
        '<div class="sop-pintu-kotak">' +
          '<b>SIMPRO di komputer</b>' +
          '<span>Halaman web ini. Untuk pekerjaan yang butuh layar lebar: ' +
            'membagi ke line, membuat surat jalan, melihat seluruh order.</span>' +
        '</div>' +
      '</div>' +
      '<p class="sop-info sop-nama-tekan">Sebut <b>SIMPRO</b>, bukan ' +
        '&#8220;AppSheet&#8221; atau &#8220;web&#8221;. Menyebutnya dua nama ' +
        'membuat orang mengira datanya juga dua &#8212; lalu ada yang mencatat ' +
        'ulang hal yang sudah tercatat, atau menunggu data ' +
        '&#8220;pindah&#8221; padahal tidak ada yang perlu pindah.</p>' +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Alur besar</h2>' +
      '<p class="sop-info">Tiap tahap membatasi tahap berikutnya. Yang dipotong ' +
        'membatasi yang bisa dibagi; yang dibagi membatasi yang bisa disetor; ' +
        'begitu seterusnya sampai tagihan.</p>' +
      sopBaganHtml_() +
    '</section>' +
    '<section class="sop-blok" id="sop-rantai-tab">' +
      '<h2>Rantai utama \u2014 siapa mencatat apa, di tab mana</h2>' +
      rantaiTab +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Ke mana potongan bisa pergi</h2>' +
      '<p class="sop-info">Bagian yang paling sering keliru. Pertanyaan pemisahnya ' +
        'satu: <b>potongannya sudah ada di gudang, atau harus dipotong dulu?</b></p>' +
      sopBaganPotonganHtml_() +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Aturan yang berlaku di semua tab</h2>' +
      '<ul class="sop-daftar sop-besi">' + besi + '</ul>' +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Form QC \u2014 empat angka mutu</h2>' + angkaMutu +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Keputusan QC \u2014 tiga label, satu pertanyaan</h2>' + keputusan +
    '</section>' +
    '<section class="sop-blok">' +
      '<h2>Dua buku re-cut \u2014 bukan dobel, dua hal berbeda</h2>' + duaBuku +
    '</section>' +
    '<h2 class="sop-judul-besar">Per fase</h2>' +
    fase +
    '<h2 class="sop-judul-besar" id="sop-skenario-blok">Skenario &amp; penanganannya</h2>' +
    '<p class="sop-info">Kejadian yang tidak ada tombolnya \u2014 dan cara ' +
      'mencatatnya supaya angka tetap jujur.</p>' +
    skenario +
    '<h2 class="sop-judul-besar" id="sop-cek-mingguan">Tanda buku sehat \u2014 cek mingguan</h2>' +
    '<p class="sop-info">Untuk Femri / kepala produksi. Bukan untuk mengisi, untuk memeriksa.</p>' +
    '<section class="sop-blok">' + cekMingguan + '</section>';
}

function sopRender() {
  const b = document.getElementById("sop-nav-logout");
  if (b) b.classList.remove("hidden");
  document.getElementById("sop-isi").innerHTML = sopIsiHtml_();
  sopShow("sop-isi");
}

window.addEventListener("load", function () {
  const sesi = sopBacaSesi_();
  if (sesi) { SOP_ID_TOKEN = sesi; sopMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { sopShow("sop-login-box"); return; }
  google.accounts.id.initialize({ client_id: SOP_OAUTH_CLIENT_ID, callback: sopHandleGoogleLogin });
  const t = document.getElementById("sop-google-btn");
  if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  sopShow("sop-login-box");
});
