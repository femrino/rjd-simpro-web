/**
 * ============================================================
 * SIMPRO -- simpro-jadwal  (v214, form v215, pesan galat jujur v217, periksa-sendiri v217.1,
 *                           pesan tenang v219, header kiri sticky tanpa rowspan v221,
 *                           Sub Tahap (Sampel/Pengiriman) v224,
 *                           muat paralel + snapshot lokal + kotak keluar v226)
 * ============================================================
 * MATRIKS JADWAL PRODUKSI (jadwal.html).
 *
 * Meniru matriks Gantt yang dulu dipelihara di spreadsheet: baris = artikel
 * x tahap (Sewing dipecah per line), kolom = hari kerja Senin-Sabtu, sel
 * diwarnai menurut tahap. Bedanya: datanya dibaca dari "SD Jadwal Produksi"
 * lewat backend (jadwal-manual.gs), jadi satu sumber untuk semua orang.
 *
 * HALAMAN INI TIDAK MENGHITUNG APA PUN. Ia hanya menggambar apa yang diisi
 * manusia di sheet. Kalau ada baris yang tidak bisa digambar (PO tidak
 * ditemukan, tanggal terbalik), baris itu ditampilkan sebagai peringatan di
 * atas matriks -- bukan dihilangkan diam-diam.
 *
 * Satu-satunya data otomatis: GARIS DEADLINE PO (dari SD Purchase Order) dan
 * penanda HARI INI. Keduanya konteks, bukan rencana.
 *
 * FORM (v215): menambah/mengubah/menghapus bar tanpa membuka sheet. Menulis
 * ke sheet yang SAMA lewat simpanJadwalManual/hapusJadwalManual. Klik sel
 * bar = edit. Form hanya tampil untuk yang boleh menulis (bagian ppic /
 * produksi / peran lintas bagian) -- itu kenyamanan; penolakan sebenarnya
 * di backend (BAGIAN_PER_AKSI). Setelah simpan, item tetap terpilih dan
 * Tanggal Mulai loncat ke hari setelah bar terakhir item itu, supaya
 * mengisi rantai Cutting -> Sewing -> Finishing cukup ganti tahap.
 *
 * DIMUAT DI : jadwal.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const JM_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const JM_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let JM_ID_TOKEN = null;
let JM_DATA = null;
let JM_BOLEH_TULIS = false;   // v215: diisi dari getPeranSaya
let JM_EDIT_ID = "";          // v215: ID bar yang sedang diedit ("" = tambah baru)
let JM_JANJI_DATA = null;     // v226: permintaan data yang dimulai SEBELUM gerbang peran selesai
let JM_DARI_SNAPSHOT = false; // v226: tampilan saat ini berasal dari snapshot lokal
const JM_ANTREAN_KUNCI = "jm_antrean";   // v226: kotak keluar (localStorage)
let JM_PENGIRIM_ANTREAN = null;

// Keadaan tampilan. Disimpan di sessionStorage supaya tidak kembali ke minggu
// ini setiap kali halaman dimuat ulang -- kepala produksi biasanya sedang
// melihat 2-3 minggu ke depan, dan kehilangan posisi itu menyebalkan.
const JM_LIHAT = {
  mulai: null,        // Date (Senin) kolom pertama
  minggu: 8,          // jumlah minggu yang digambar (v248: 6 -> 8, permintaan 3 Sep 2026 -- deadline PO lazim 5-7 minggu ke depan, 6 minggu sering memotongnya)
  klien: [],          // filter ID klien; v255: DAFTAR ([] = semua)
  line: [],           // filter ID line;  v255: DAFTAR ([] = semua)
  sembunyiLewat: true, // sembunyikan item yang semua bar-nya sudah lewat
  keadaan: [],         // v256: filter keadaan item (aktif/rencana/batal/selesai); DAFTAR, [] = semua
  tahap: [],           // v233: filter tahap; v254: DAFTAR nama ([] = semua). SARINGAN TINGKAT-BARIS,
                       // beda dengan line yang tingkat-item -- lihat catatan di
                       // jmRenderLaci_. Nilainya utama saat dipadukan mode tahap:
                       // "Per tahap + Cutting" = daftar kerja harian kepala cutting.
  mode: "artikel",     // v231: "artikel" (grup = item, baris = tahap) | "tahap" (dibalik)
  sembunyi: {}         // v246: {kunci item: true} -- disembunyikan MANUAL, di localStorage (lihat jmBacaSembunyi_)
};

/* v231 -- DUA SUMBU, SATU DATA
   "artikel" menjawab "order ini sudah sampai mana?" (PPIC, owner, CS).
   "tahap"   menjawab "beban tahap ini minggu ini seberapa?" (kepala cutting,
             kepala line, kepala finishing).
   Yang kedua memperlihatkan hal yang pertama menyembunyikannya: TABRAKAN.
   Lima PO yang semuanya Cutting di tanggal yang sama tersebar di lima grup
   pada tampilan artikel -- tidak ada yang terlihat aneh. Pada tampilan tahap
   kelimanya bertumpuk di satu grup dan overload terlihat sekali pandang.
   Mode disimpan di localStorage (bukan sessionStorage seperti filter lain):
   ini preferensi peran, kepala cutting tidak perlu mengganti tiap pagi. */
const JM_MODE_KUNCI = "jm_mode";
function jmBacaMode_() {
  try { const m = localStorage.getItem(JM_MODE_KUNCI); if (m === "tahap" || m === "artikel") JM_LIHAT.mode = m; }
  catch (e) { /* abaikan */ }
}
function jmGantiMode(mode) {
  JM_LIHAT.mode = (mode === "tahap") ? "tahap" : "artikel";
  try { localStorage.setItem(JM_MODE_KUNCI, JM_LIHAT.mode); } catch (e) { /* abaikan */ }
  jmRenderTombolMode_();
  jmRender();
}

/* v246 -- SEMBUNYIKAN / FOKUS ITEM
   Filter (klien, line, tahap, lewat) menjawab "apa yang ADA". Ini menjawab
   "apa yang mau saya LIHAT sekarang": kepala produksi yang sedang mengurus
   dua order tidak perlu 19 order lain di layar yang sama.

   Bentuknya satu set kunci item di JM_LIHAT.sembunyi, diterapkan SESUDAH
   semua filter, di kedua mode. Disimpan di localStorage seperti mode -- fokus
   itu dipasang lalu dipakai berhari-hari; kalau hilang tiap tab ditutup,
   fiturnya menyebalkan. Syaratnya, dan ini bukan hiasan: penanda "N
   disembunyikan" SELALU tampil selama ada yang disembunyikan -- pil di baris
   info (v247; v246 memakai bilah chip di atas matriks, yang pada 23 item jadi
   lima baris) -- dan membuka panel berisi nama tiap item serta "Tampilkan
   semua". Item yang hilang tanpa penanda yang terlihat adalah bug jenis
   "diam-diam" -- kali ini disengaja, tapi tetap harus terlihat.

   Kunci basi (item selesai, hilang dari data) DIBIARKAN di set: tidak dihitung,
   tidak ditampilkan, dan kalau item itu kembali ia tetap tersembunyi -- itu
   yang diharapkan orang yang pernah menyembunyikannya. */
const JM_SEMBUNYI_KUNCI = "jm_sembunyi";
let JM_SEMBUNYI_TERAKHIR = [];   // item yang lolos filter TAPI disembunyikan (untuk bilah & angka)
let JM_TAMPIL_TERAKHIR = [];     // kunci item yang sedang tampil (untuk "hanya ini")

function jmBacaSembunyi_() {
  try {
    const d = JSON.parse(localStorage.getItem(JM_SEMBUNYI_KUNCI) || "{}");
    JM_LIHAT.sembunyi = (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
  } catch (e) { JM_LIHAT.sembunyi = {}; }
}
function jmSimpanSembunyi_() {
  try { localStorage.setItem(JM_SEMBUNYI_KUNCI, JSON.stringify(JM_LIHAT.sembunyi)); } catch (e) { /* abaikan */ }
}

/** Pisahkan daftar (yang SUDAH lolos filter) jadi tampil vs disembunyikan.
 *  Dipanggil kedua fungsi pengelompokan supaya definisinya satu. */
function jmPisahSembunyi_(daftar, ambilItem) {
  const tampil = [], sembunyi = [];
  daftar.forEach(function (x) {
    const it = ambilItem(x);
    (it && JM_LIHAT.sembunyi[it.kunci] ? sembunyi : tampil).push(x);
  });
  JM_SEMBUNYI_TERAKHIR = sembunyi.map(ambilItem);
  JM_TAMPIL_TERAKHIR = tampil.map(function (x) { return ambilItem(x).kunci; });
  return tampil;
}

function jmSembunyikanItem(kunci) {
  if (!kunci) return;
  JM_LIHAT.sembunyi[kunci] = true;
  jmSimpanSembunyi_(); jmTutupMenuItem_(); jmRender();
}
/** "Hanya tampilkan ini": semua item lain yang SEDANG tampil disembunyikan. */
function jmHanyaItem(kunci) {
  if (!kunci) return;
  JM_TAMPIL_TERAKHIR.forEach(function (k) { if (k !== kunci) JM_LIHAT.sembunyi[k] = true; });
  delete JM_LIHAT.sembunyi[kunci];
  jmSimpanSembunyi_(); jmTutupMenuItem_(); jmRender();
}
function jmTampilkanItem(kunci) {
  delete JM_LIHAT.sembunyi[kunci];
  jmSimpanSembunyi_(); jmRender();
}
function jmTampilkanSemua() {
  JM_LIHAT.sembunyi = {};
  jmSimpanSembunyi_(); jmRender();
}

function jmLabelItem_(it) {
  return ([it.artikel, it.style].filter(String).join(" ") || it.po) + " \u00b7 " + it.po;
}

/* v247: pemulih = PANEL MELAYANG yang dipicu pil "N disembunyikan" di baris
   info, bukan bilah di atas matriks. v246 memakai bilah berisi chip semua item
   yang disembunyikan; begitu "Hanya tampilkan ini" dipakai pada 23 item, bilah
   itu jadi lima baris chip dan memakan layar -- kebalikan dari maksud fitur.
   Penanda tetap SELALU terlihat (pil di baris info yang memang selalu dibaca),
   tapi daftarnya baru muncul saat diminta, dan tidak menggeser matriks.
   NISAN: #jm-sembunyi-bar tidak lagi dibuat; kalau tersisa dari render lama
   pada sesi yang sama, dibuang di sini. */
function jmPanelSembunyi_() {
  let p = document.getElementById("jm-panel-sembunyi");
  if (!p) {
    p = document.createElement("div");
    p.id = "jm-panel-sembunyi"; p.className = "jm-panel-sembunyi hidden";
    document.body.appendChild(p);
  }
  return p;
}
function jmRenderSembunyi_() {
  const sisa = document.getElementById("jm-sembunyi-bar");
  if (sisa && sisa.parentNode) sisa.parentNode.removeChild(sisa);
  const p = document.getElementById("jm-panel-sembunyi");
  if (!p || p.classList.contains("hidden")) return;      // panel tertutup: cukup pil di baris info
  if (!JM_SEMBUNYI_TERAKHIR.length) { jmTutupPanelSembunyi_(); return; }
  jmIsiPanelSembunyi_(p);                                 // panel terbuka: isinya ikut keadaan baru
}
function jmIsiPanelSembunyi_(p) {
  const daftar = JM_SEMBUNYI_TERAKHIR;
  p.innerHTML = '<div class="jm-panel-kepala"><b>' + daftar.length + ' item disembunyikan</b>' +
    '<button type="button" class="jm-sembunyi-semua" onclick="jmTampilkanSemua()">Tampilkan semua</button></div>' +
    '<div class="jm-panel-daftar">' + daftar.map(function (it) {
      return '<div class="jm-panel-baris"><span>' + jmEsc_(jmLabelItem_(it)) + '</span>' +
        '<button type="button" class="jm-sembunyi-chip" data-kunci="' + jmEsc_(it.kunci) + '" title="Tampilkan lagi" aria-label="Tampilkan lagi">\u00d7</button></div>';
    }).join("") + '</div>';
}
function jmBukaPanelSembunyi_(ev) {
  if (!JM_SEMBUNYI_TERAKHIR.length) return;
  const p = jmPanelSembunyi_();
  jmTutupMenuItem_();
  jmIsiPanelSembunyi_(p);
  p.classList.remove("hidden");
  // Dijangkarkan ke pil-nya, dijaga tetap di layar (di HP pil bisa di tepi kanan).
  const pil = (ev && ev.currentTarget) || document.querySelector(".jm-rentang-sembunyi");
  const r = pil ? pil.getBoundingClientRect() : { left: 8, bottom: 8 };
  const lebar = p.offsetWidth || 300, tinggi = p.offsetHeight || 200;
  const x = Math.max(8, Math.min(r.left, window.innerWidth - lebar - 8));
  const y = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - tinggi - 8));
  p.style.left = x + "px"; p.style.top = y + "px";
}
function jmTutupPanelSembunyi_() {
  const p = document.getElementById("jm-panel-sembunyi");
  if (p) p.classList.add("hidden");
}

/** Menu kecil di sel nama item: Sembunyikan / Hanya tampilkan ini. */
function jmBukaMenuItem_(kunci, ev) {
  let m = document.getElementById("jm-menu-item");
  if (!m) {
    m = document.createElement("div");
    m.id = "jm-menu-item"; m.className = "jm-menu-item hidden";
    document.body.appendChild(m);
  }
  const it = (JM_DATA && (JM_DATA.itemAktif || []).concat(JM_DATA.items || []).filter(function (x) { return x.kunci === kunci; })[0]) || null;
  // v253: info lengkap ada DI SINI, karena baris mode tahap kini hanya memuat nama.
  const rinci = it ? [it.namaKlien || it.idKlien, (it.jenis === "rencana" ? "Rencana \u00b7 " : "") + it.po, it.qtyPo ? it.qtyPo.toLocaleString("id-ID") + " pcs" : "",
    it.deadline ? "deadline " + jmTanggalPendek_(it.deadline) : ""].filter(String).join(" \u00b7 ") : "";
  m.innerHTML = '<div class="jm-menu-judul"><b>' + jmEsc_(it ? ([it.artikel, it.style].filter(String).join(" ") || it.po) : kunci) + '</b>' +
    (rinci ? '<br>' + jmEsc_(rinci) : '') + '</div>' +
    '<button type="button" onclick="jmSembunyikanItem(' + JSON.stringify(kunci).replace(/"/g, "&quot;") + ')">Sembunyikan item ini</button>' +
    '<button type="button" onclick="jmHanyaItem(' + JSON.stringify(kunci).replace(/"/g, "&quot;") + ')">Hanya tampilkan item ini</button>';
  m.classList.remove("hidden");
  // Diposisikan sesudah tampil supaya ukurannya terukur; dijaga tetap di layar.
  const lebar = m.offsetWidth || 240, tinggi = m.offsetHeight || 110;
  const x = Math.max(8, Math.min((ev && ev.clientX) || 8, window.innerWidth - lebar - 8));
  const y = Math.max(8, Math.min((ev && ev.clientY) || 8, window.innerHeight - tinggi - 8));
  m.style.left = x + "px"; m.style.top = y + "px";
}
function jmTutupMenuItem_() {
  const m = document.getElementById("jm-menu-item");
  if (m) m.classList.add("hidden");
}
/* v232 -- LAYAR SEMPIT
   Di ~390 px, toolbar yang menumpuk vertikal memakan satu layar penuh sebelum
   data pertama terlihat, dan legenda 4 baris lagi. Solusinya laci: kontrol
   filter DIPINDAH (bukan disalin) ke #jm-laci lewat JS. Di desktop laci diberi
   display:contents -- anak-anaknya mengalir seolah tidak pernah pindah, jadi
   desktop piksel-identik. Di layar sempit laci tertutup untuk semua orang
   (keputusan 2 Sep 2026) dan dibuka tombol Filter.

   Tombol Filter WAJIB berlencana jumlah filter aktif. Filter tersembunyi yang
   menyala tanpa penanda adalah jebakan klasik: "kok PO-nya hilang?" padahal
   filter klien menyala di laci yang tertutup. Lencana hanya menghitung filter
   yang MENYEMBUNYIKAN data (klien, line) -- lebar minggu dan centang bawaan
   bukan jebakan. */
var JM_LACI_BUKA = false;   // sengaja tidak dipersistensi: selalu tertutup saat halaman dibuka

function jmToggleLaci() {
  JM_LACI_BUKA = !JM_LACI_BUKA;
  const laci = document.getElementById("jm-laci");
  if (laci) laci.classList.toggle("jm-laci-buka", JM_LACI_BUKA);
  const btn = document.getElementById("jm-btn-laci");
  if (btn) btn.classList.toggle("jm-sumbu-aktif", JM_LACI_BUKA);
  jmPasTinggi_();   // v250: laci terbuka menggeser matriks ke bawah
}
function jmToggleLegenda() {
  const l = document.getElementById("jm-legenda");
  if (l) l.classList.toggle("jm-legenda-buka");
  const b = document.getElementById("jm-btn-legenda");
  if (b && l) b.classList.toggle("jm-sumbu-aktif", l.classList.contains("jm-legenda-buka"));
  jmPasTinggi_();
}

/* v250 -- MEMAKSIMALKAN LAYAR UNTUK MATRIKS
   Diukur 3 Sep 2026 di 1440x900: 312 px (35% layar) habis sebelum matriks --
   header 68, baris form 58, kartu toolbar dua baris 132, legenda 32, jarak 22.
   Dan max-height matriks dipatok calc(100vh - 220px): kotaknya 92 px lebih
   panjang dari layar, halaman ikut bergulir, bilah gulir mendatarnya
   tersembunyi -- "dua gulir".

   Tiga perubahan, semuanya di halaman ini saja (header situs dipakai 18
   halaman, tidak disentuh):
   1. Toolbar SATU baris di semua lebar: laci filter v232 (tertutup + lencana
      jumlah filter aktif) sekarang berlaku di desktop juga -- satu baris utuh
      dengan empat select + centang tidak muat di 1400 px (~1.800 px).
      Legenda di balik tombol "Keterangan" di toolbar.
   2. Form jadi MODAL: elemen form dipindah utuh (id tetap, jadi seluruh kode
      form tidak tahu bedanya) ke kotak melayang; dibuka tombol "+ Jadwal"
      atau klik bar. Klik bar tidak lagi harus menggulir ke atas ke form.
   3. Tinggi matriks dihitung dari posisi atasnya yang SEBENARNYA
      (jmPasTinggi_), lewat variabel CSS supaya aturan @media print tetap
      menang. Dihitung ulang saat resize dan saat laci/legenda dibuka. */
function jmPasTinggi_() {
  const gulir = document.querySelector("#jm-matriks .jm-gulir");
  if (!gulir) return;
  const atasDokumen = gulir.getBoundingClientRect().top + window.scrollY;
  const tinggi = Math.max(240, window.innerHeight - atasDokumen - 16);
  gulir.style.setProperty("--jm-tinggi", Math.round(tinggi) + "px");
}
let JM_RESIZE_TUNGGU = null;
function jmPasTinggiNanti_() {
  clearTimeout(JM_RESIZE_TUNGGU);
  JM_RESIZE_TUNGGU = setTimeout(jmPasTinggi_, 120);
}
window.addEventListener("resize", jmPasTinggiNanti_);

/* v252. Diukur 3 Sep 2026 di produksi: sisa 61 px di bawah matriks, jadi 16
   sesudah resize. Tingginya dihitung saat bilah "Data tersimpan pukul ...
   memperbarui dari server" masih ada di atas matriks; bilah itu disembunyikan
   SESUDAH render terakhir, dan tidak ada yang menghitung ulang. Memanggil
   jmPasTinggi_ di tiap tempat yang mengubah tinggi di atas matriks akan
   selalu tertinggal satu tempat -- yang benar: amati ukurannya. ResizeObserver
   pada semua elemen di atas matriks memicu hitung ulang apa pun sebabnya
   (bilah status, peringatan, antrean, laci, legenda, toolbar yang membungkus). */
let JM_PENGAMAT_TINGGI = null;
function jmPasangPengamatTinggi_() {
  if (JM_PENGAMAT_TINGGI || typeof ResizeObserver === "undefined") return;
  JM_PENGAMAT_TINGGI = new ResizeObserver(jmPasTinggiNanti_);
  ["jm-status-data", "jm-peringatan", "jm-antrean", "jm-laci", "jm-legenda", "jm-form-wrap"]
    .forEach(function (id) { const el = document.getElementById(id); if (el) JM_PENGAMAT_TINGGI.observe(el); });
  const alat = document.querySelector(".jm-alat"); if (alat) JM_PENGAMAT_TINGGI.observe(alat);
  const head = document.querySelector(".db-header"); if (head) JM_PENGAMAT_TINGGI.observe(head);
}

/* v251 -- MODE FOKUS
   Untuk layar besar (rapat pagi, monitor lantai): header situs dan latar
   dekoratif disembunyikan, tinggal toolbar satu baris + matriks. Tidak
   dipersistenkan -- seperti laci -- supaya orang yang tak sengaja menekannya
   lalu memuat ulang halaman kembali ke tampilan biasa. Keluar: tombol yang
   sama, atau Esc (bertingkat: modal/menu/panel yang terbuka ditutup dulu).
   requestFullscreen dicoba sebagai bonus (klik tombol = gestur pengguna);
   kalau browser keluar fullscreen sendiri, mode fokus ikut keluar. */
let JM_FOKUS = false;
function jmFokus(aktif) {
  JM_FOKUS = (aktif === undefined) ? !JM_FOKUS : !!aktif;
  document.body.classList.toggle("jm-fokus", JM_FOKUS);
  const b = document.getElementById("jm-btn-fokus");
  if (b) {
    b.classList.toggle("jm-sumbu-aktif", JM_FOKUS);
    b.innerHTML = JM_FOKUS
      ? '<span class="jm-lbl-panjang">Keluar fokus</span><span class="jm-lbl-pendek">\u2716</span>'
      : '<span class="jm-lbl-panjang">Fokus</span><span class="jm-lbl-pendek">\u2922</span>';
    b.title = JM_FOKUS ? "Keluar mode fokus (Esc)" : "Mode fokus: sembunyikan header, matriks selebar layar";
  }
  try {
    if (JM_FOKUS && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(function () {});
    } else if (!JM_FOKUS && document.fullscreenElement && document.exitFullscreen) {
      const q = document.exitFullscreen(); if (q && q.catch) q.catch(function () {});
    }
  } catch (e) { /* fullscreen hanya bonus */ }
  // Header hilang/muncul menggeser matriks; tunggu satu frame supaya layout selesai.
  requestAnimationFrame(jmPasTinggi_);
  setTimeout(jmPasTinggi_, 150);
}
document.addEventListener("fullscreenchange", function () {
  if (!document.fullscreenElement && JM_FOKUS) jmFokus(false);
});

function jmModal_() {
  let m = document.getElementById("jm-modal");
  if (m) return m;
  const wrap = document.getElementById("jm-form-wrap");
  const form = wrap ? wrap.querySelector(".jm-form") : null;
  const judul = document.getElementById("jm-form-judul");
  if (!wrap || !form) return null;
  m = document.createElement("div");
  m.id = "jm-modal"; m.className = "jm-modal hidden";
  m.innerHTML = '<div class="jm-modal-kotak" role="dialog" aria-modal="true">' +
    '<div class="jm-modal-kepala"><span class="jm-modal-judul"></span>' +
    '<button type="button" class="jm-modal-tutup" onclick="jmTutupForm()" aria-label="Tutup" title="Tutup (Esc)">\u00d7</button></div>' +
    '<div class="jm-modal-isi"></div></div>';
  document.body.appendChild(m);
  // Judul & form DIPINDAH, bukan disalin: id-nya tetap, kode form tidak berubah.
  const kepala = m.querySelector(".jm-modal-judul");
  if (judul) kepala.appendChild(judul);
  m.querySelector(".jm-modal-isi").appendChild(form);
  wrap.classList.add("jm-form-wrap-kosong");   // sisa <details> disembunyikan CSS
  m.addEventListener("click", function (ev) { if (ev.target === m) jmTutupForm(); });
  return m;
}
function jmBukaForm() {
  if (!JM_BOLEH_TULIS) return;
  const m = jmModal_();
  if (!m) return;
  m.classList.remove("hidden");
  document.body.classList.add("jm-modal-terbuka");
  const k = m.querySelector(".jm-modal-kotak");
  if (k) k.classList.toggle("jm-mode-edit", !!JM_EDIT_ID);
  const pertama = document.getElementById("jm-in-item");
  if (pertama && pertama.focus && !JM_EDIT_ID) pertama.focus();
}
function jmTutupForm() {
  const m = document.getElementById("jm-modal");
  if (m) m.classList.add("hidden");
  document.body.classList.remove("jm-modal-terbuka");
  if (JM_EDIT_ID) jmFormBatal();   // keluar dari mode ubah: form kembali ke tambah
}
/** Tombol "+ Jadwal": buka form tambah baru untuk item apa pun. */
function jmTambahJadwal() {
  if (JM_EDIT_ID) jmFormBatal();
  jmFormPesan_("");
  jmFormItemBerubah();
  jmBukaForm();
}

/* v254 -- FILTER MULTI-PILIH (tahap); v255 -- juga KLIEN dan LINE, satu
   mekanisme. Tiap filter: tombol #jm-f-<jenis> (id sama dengan <select> lama,
   jadi harness pengukur toolbar tidak berubah) yang membuka panel kotak
   centang #jm-panel-<jenis>. Nilai disimpan sebagai DAFTAR di JM_LIHAT;
   kosong = semua. Sesi lama yang menyimpan string diterima (jmDaftarDari_).

   Opsi klien & line diturunkan dari DATA YANG ADA (items + lines + line yang
   muncul di bar), bukan dari <option> di template: line yang dipakai bar tapi
   belum ada di master tetap bisa dipilih -- kalau tidak, bar-nya ada tapi
   tidak bisa disaring, jebakan diam-diam. */
const JM_FILTER_PILIH = {
  tahap: { judul: "Tahap yang ditampilkan", semua: "Semua tahap", satuan: "tahap",
    opsi: function () { return ((JM_DATA && JM_DATA.tahap) || []).map(function (t) { return { v: t, l: t }; }); } },
  klien: { judul: "Klien yang ditampilkan", semua: "Semua klien", satuan: "klien",
    opsi: function () {
      const peta = {};
      ((JM_DATA && JM_DATA.items) || []).forEach(function (it) { if (it.idKlien) peta[it.idKlien] = it.namaKlien || it.idKlien; });
      return Object.keys(peta).sort(function (a, b) { return String(peta[a]).localeCompare(String(peta[b])); })
        .map(function (id) { return { v: id, l: peta[id] }; });
    } },
  line: { judul: "Line yang ditampilkan", semua: "Semua line", satuan: "line",
    opsi: function () {
      const peta = {}, urut = [];
      ((JM_DATA && JM_DATA.lines) || []).forEach(function (l) { if (l.idLine && !peta[l.idLine]) { peta[l.idLine] = l.namaLine || l.idLine; urut.push(l.idLine); } });
      ((JM_DATA && JM_DATA.bar) || []).forEach(function (b) { if (b.line && !peta[b.line]) { peta[b.line] = b.namaLine || b.line; urut.push(b.line); } });
      return urut.map(function (id) { return { v: id, l: peta[id] }; });
    } },
  // v256: nasib item. Nilai yang disimpan = hasil jmKeadaan_(item).
  keadaan: { judul: "Keadaan item yang ditampilkan", semua: "Semua keadaan", satuan: "keadaan",
    opsi: function () { return JM_DAFTAR_KEADAAN.slice(); } }
};
const JM_DAFTAR_KEADAAN = [
  { v: "aktif", l: "Aktif (PO berjalan)" }, { v: "rencana", l: "Rencana (order request)" },
  { v: "batal", l: "Batal (request ditolak / PO cancel)" }, { v: "selesai", l: "Selesai" }
];
function jmDaftarDari_(x) {
  if (Array.isArray(x)) return x.filter(function (v) { return typeof v === "string" && v; });
  if (typeof x === "string" && x) return [x];
  return [];
}
/** true kalau nilai ini lolos filter jenis tsb (daftar kosong = semua). */
function jmPilihAktif_(jenis, v) {
  const d = JM_LIHAT[jenis];
  return !d.length || d.indexOf(v) !== -1;
}
function jmTahapAktif_(t) { return jmPilihAktif_("tahap", t); }
function jmLabelPilih_(jenis) {
  const k = JM_FILTER_PILIH[jenis], d = JM_LIHAT[jenis];
  if (!d.length) return k.semua;
  if (d.length === 1) {
    const o = k.opsi().filter(function (x) { return x.v === d[0]; })[0];
    return o ? o.l : d[0];
  }
  return d.length + " " + k.satuan;
}
/** Tombol filter: <select> dari template diganti tombol ber-id sama; label & title disegarkan. */
function jmTombolPilih_(jenis, laci) {
  let el = document.getElementById("jm-f-" + jenis);
  if (el && el.tagName === "SELECT") {
    const b = document.createElement("button");
    b.id = el.id; b.type = "button"; b.className = "jm-btn jm-f-pilih jm-f-" + jenis;
    el.parentNode.replaceChild(b, el);
    el = b;
  } else if (!el) {
    el = document.createElement("button");
    el.id = "jm-f-" + jenis; el.type = "button"; el.className = "jm-btn jm-f-pilih jm-f-" + jenis;
    (laci || document.querySelector(".jm-alat")).appendChild(el);
  }
  el.onclick = function (ev) { jmBukaPanelPilih_(jenis, ev); };
  el.textContent = jmLabelPilih_(jenis);
  const d = JM_LIHAT[jenis];
  el.title = d.length ? JM_FILTER_PILIH[jenis].judul + ": " + d.join(", ") : "Pilih " + JM_FILTER_PILIH[jenis].satuan + " yang ditampilkan (boleh lebih dari satu)";
  return el;
}
function jmSegarkanTombolPilih_() {
  ["tahap", "klien", "line", "keadaan"].forEach(function (j) { if (document.getElementById("jm-f-" + j)) jmTombolPilih_(j); });
}
function jmPanelPilih_(jenis) {
  let p = document.getElementById("jm-panel-" + jenis);
  if (!p) {
    p = document.createElement("div");
    p.id = "jm-panel-" + jenis; p.className = "jm-panel-sembunyi jm-panel-pilih hidden";
    document.body.appendChild(p);
    p.addEventListener("change", function (ev) {
      const cb = ev.target;
      if (!cb || cb.tagName !== "INPUT") return;
      if (cb.hasAttribute("data-semua")) {
        JM_LIHAT[jenis] = [];
      } else {
        const v = cb.getAttribute("data-nilai");
        const d = JM_LIHAT[jenis], ada = d.indexOf(v);
        if (cb.checked && ada === -1) d.push(v);
        if (!cb.checked && ada !== -1) d.splice(ada, 1);
        const urut = JM_FILTER_PILIH[jenis].opsi().map(function (o) { return o.v; });
        d.sort(function (a, b) { return urut.indexOf(a) - urut.indexOf(b); });   // stabil untuk label & sessionStorage
      }
      jmSimpanLihat_(); jmRender();   // jmRender -> jmRenderLaci_ -> label & lencana
      jmIsiPanelPilih_(jenis, p);      // panel tetap terbuka, centang ikut keadaan baru
    });
  }
  return p;
}
function jmIsiPanelPilih_(jenis, p) {
  const k = JM_FILTER_PILIH[jenis], d = JM_LIHAT[jenis], opsi = k.opsi();
  const adaDiOpsi = {}; opsi.forEach(function (o) { adaDiOpsi[o.v] = true; });
  // Nilai yang sedang aktif tapi tidak ada di data hari ini tetap ditampilkan
  // (bertanda), supaya bisa dilepas -- bukan hilang diam-diam.
  const yatim = d.filter(function (v) { return !adaDiOpsi[v]; }).map(function (v) { return { v: v, l: v + " (tidak ada di data)" }; });
  p.innerHTML = '<div class="jm-panel-kepala"><b>' + jmEsc_(k.judul) + '</b></div>' +
    '<div class="jm-panel-daftar">' +
    '<label class="jm-panel-baris"><input type="checkbox" data-semua="1"' + (d.length ? '' : ' checked') + '> <span>' + jmEsc_(k.semua) + '</span></label>' +
    opsi.concat(yatim).map(function (o) {
      return '<label class="jm-panel-baris"><input type="checkbox" data-nilai="' + jmEsc_(o.v) + '"' +
        (d.indexOf(o.v) !== -1 ? ' checked' : '') + '> <span>' + jmEsc_(o.l) + '</span></label>';
    }).join("") + '</div>';
}
function jmBukaPanelPilih_(jenis, ev) {
  const p = jmPanelPilih_(jenis);
  if (!p.classList.contains("hidden")) { jmTutupPanelPilih_(); return; }
  jmTutupMenuItem_(); jmTutupPanelSembunyi_(); jmTutupPanelPilih_();
  jmIsiPanelPilih_(jenis, p);
  p.classList.remove("hidden");
  const btn = (ev && ev.currentTarget) || document.getElementById("jm-f-" + jenis);
  const r = btn ? btn.getBoundingClientRect() : { left: 8, bottom: 8 };
  const lebar = p.offsetWidth || 260, tinggi = p.offsetHeight || 200;
  p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - lebar - 8)) + "px";
  p.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - tinggi - 8)) + "px";
}
/** Menutup panel pilih mana pun yang terbuka. */
function jmTutupPanelPilih_() {
  ["tahap", "klien", "line", "keadaan"].forEach(function (j) {
    const p = document.getElementById("jm-panel-" + j);
    if (p) p.classList.add("hidden");
  });
}
function jmTutupPanelTahap_() { jmTutupPanelPilih_(); }   // nama lama (v254) masih dipakai harness

function jmRenderLaci_() {
  const alat = document.querySelector(".jm-alat");
  if (!alat) return;

  let laci = document.getElementById("jm-laci");
  if (!laci) {
    laci = document.createElement("div");
    laci.id = "jm-laci"; laci.className = "jm-laci";
    // Elemen DIPINDAH utuh -- id, value, dan onchange ikut, jadi
    // jmIsiFilter_/jmUbahFilter tidak perlu tahu apa-apa soal laci.
    const pindah = [document.getElementById("jm-f-minggu"),
      document.getElementById("jm-f-klien"), document.getElementById("jm-f-line"),
      alat.querySelector("label.jm-cek")];
    Array.prototype.forEach.call(alat.querySelectorAll("button"), function (b) {
      if (b.textContent.trim() === "Muat ulang") pindah.push(b);
    });
    alat.appendChild(laci);
    pindah.forEach(function (el) { if (el) laci.appendChild(el); });
  }

  // v233: dropdown tahap. SEMANTIK YANG DIPUTUSKAN SADAR (2 Sep 2026):
  // filter line tetap tingkat-ITEM -- "item yang dijahit di line ini",
  // dihitung dari SEMUA bar item -- sedangkan tahap tingkat-BARIS. Dengan
  // begitu "Cutting + line Bu Tini" berarti "baris Cutting milik item yang
  // dijahit di line Bu Tini". Kalau keduanya di-AND-kan di tingkat bar,
  // hasilnya SELALU kosong (bar Cutting tidak punya line) -- jebakan.
  // v254: filter tahap MULTI-PILIH. Dulu <select> satu nilai -- "Sewing DAN
  // Finishing bersamaan" tidak mungkin, padahal itu pasangan yang lazim
  // dipantau bersama. Sekarang tombol (id tetap #jm-f-tahap supaya harness
  // pengukur baris tidak berubah) yang membuka panel kotak centang.
  if (!document.getElementById("jm-f-tahap")) {
    const selT = jmTombolPilih_("tahap", laci);
    const selM2 = document.getElementById("jm-f-minggu");
    if (selM2 && selM2.parentNode === laci) laci.insertBefore(selT, selM2.nextSibling);
    else laci.insertBefore(selT, laci.firstChild);
  }
  // v256: tombol keadaan, tepat sesudah tahap.
  if (!document.getElementById("jm-f-keadaan")) {
    const selK = jmTombolPilih_("keadaan", laci);
    const selT2 = document.getElementById("jm-f-tahap");
    if (selT2 && selT2.parentNode === laci) laci.insertBefore(selK, selT2.nextSibling);
  }
  // v255: <select> klien & line dari template diganti tombol ber-id sama (di tempatnya).
  jmSegarkanTombolPilih_();

  let btn = document.getElementById("jm-btn-laci");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "jm-btn-laci"; btn.type = "button"; btn.className = "jm-btn jm-btn-laci";
    btn.onclick = jmToggleLaci;
    laci.parentNode.insertBefore(btn, laci);
  }
  const n = (JM_LIHAT.klien.length ? 1 : 0) + (JM_LIHAT.line.length ? 1 : 0) + (JM_LIHAT.tahap.length ? 1 : 0) +
    (JM_LIHAT.keadaan.length ? 1 : 0);
  btn.innerHTML = "Filter" + (n ? ' <span class="jm-laci-lencana">' + n + "</span>" : "");

  // v250: tombol legenda di TOOLBAR (semua lebar), bukan baris sendiri di atas
  // legenda. Legenda tertutup sampai diminta.
  if (!document.getElementById("jm-btn-legenda")) {
    const bl = document.createElement("button");
    bl.id = "jm-btn-legenda"; bl.type = "button"; bl.className = "jm-btn jm-btn-legenda";
    bl.innerHTML = '<span class="jm-lbl-panjang">Keterangan</span><span class="jm-lbl-pendek">Ket.</span>';
    bl.title = "Tampilkan / sembunyikan keterangan warna";
    bl.onclick = jmToggleLegenda;
    btn.parentNode.insertBefore(bl, btn.nextSibling);
  }
  // v250: "+ Jadwal" membuka form (modal). Mengikuti gerbang tulis yang sama
  // dengan form: peran tanpa hak tulis tidak melihatnya.
  let bj = document.getElementById("jm-btn-jadwal");
  if (!bj) {
    bj = document.createElement("button");
    bj.id = "jm-btn-jadwal"; bj.type = "button"; bj.className = "jm-btn jm-btn-utama jm-btn-jadwal";
    bj.innerHTML = '<span class="jm-lbl-panjang">+ Jadwal</span><span class="jm-lbl-pendek">+</span>';
    bj.title = "Tambah jadwal";
    bj.onclick = jmTambahJadwal;
    alat.appendChild(bj);
  }
  bj.classList.toggle("hidden", !JM_BOLEH_TULIS);
  // Modal dibuat SEKARANG, bukan saat pertama dibuka: selama form masih di
  // <details>, baris "Tambah jadwal" tetap memakan 58 px di atas matriks --
  // persis yang mau dihilangkan. jmModal_ idempoten.
  jmModal_();
  // v251: tombol mode fokus, untuk semua peran (hanya tampilan).
  if (!document.getElementById("jm-btn-fokus")) {
    const bf = document.createElement("button");
    bf.id = "jm-btn-fokus"; bf.type = "button"; bf.className = "jm-btn jm-btn-fokus";
    bf.onclick = function () { jmFokus(); };
    alat.appendChild(bf);
    jmFokus(false);   // isi label awal
  }
}

/** Tombol disuntik ke toolbar dari JS supaya template Blogger hanya naik tag. */
function jmRenderTombolMode_() {
  const jangkar = document.getElementById("jm-f-minggu");
  if (!jangkar || !jangkar.parentNode) return;
  let w = document.getElementById("jm-sumbu");
  if (!w) {
    w = document.createElement("div");
    w.id = "jm-sumbu"; w.className = "jm-sumbu";
    // v234: dua versi label. Di 390 px, "Per artikel | Per tahap" + nav +
    // Filter = +-430 px -- meluber. Label pendek + padding rapat membuat
    // ketiganya muat SEJAJAR di satu baris. CSS yang memilih versi mana yang
    // tampil; JS-nya selalu menggambar keduanya.
    w.innerHTML = '<button type="button" data-mode="artikel" onclick="jmGantiMode(\'artikel\')">' +
                    '<span class="jm-lbl-panjang">Per artikel</span><span class="jm-lbl-pendek">Artikel</span></button>' +
                  '<button type="button" data-mode="tahap" onclick="jmGantiMode(\'tahap\')">' +
                    '<span class="jm-lbl-panjang">Per tahap</span><span class="jm-lbl-pendek">Tahap</span></button>';
    jangkar.parentNode.insertBefore(w, jangkar);
  }
  Array.prototype.forEach.call(w.querySelectorAll("button"), function (b) {
    b.classList.toggle("jm-sumbu-aktif", b.getAttribute("data-mode") === JM_LIHAT.mode);
  });
}

const JM_HARI = ["S", "S", "R", "K", "J", "S"]; // Senin..Sabtu
const JM_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Kelas warna per tahap. Nama tahap datang dari backend (TAHAP_JADWAL); kalau
// backend menambah tahap baru yang belum ada di sini, jatuh ke kelas "lain".
const JM_KELAS_TAHAP = {
  "Pola & Marker": "pola",
  "Pola & Konsumsi": "pola",   // nama lama (v214-v223), masih bisa datang dari sheet
  "Sampel": "sampel",          // v224
  "Pengadaan Bahan": "bahan",
  "Cutting": "cutting",
  "Interlining": "interlining",
  "Sewing": "sewing",
  "Finishing": "finishing",
  "Pengiriman": "kirim"
};

// ---------- util ----------

function jmEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function")
    ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jmIso_(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function jmDariIso_(s) {
  // "yyyy-MM-dd" -> Date lokal tengah malam. Sengaja tidak new Date(s) --
  // itu ditafsirkan UTC dan mundur sehari di WIB.
  const p = String(s || "").split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function jmSenin_(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const geser = (x.getDay() + 6) % 7; // Senin=0 ... Minggu=6
  x.setDate(x.getDate() - geser);
  return x;
}

function jmTambahHari_(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function jmShow(id) {
  ["jm-login-box", "jm-loading", "jm-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

// ---------- sesi (pola sama dengan halaman upah) ----------

function jmBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}

function jmSimpanSesi_(token) {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp }));
  } catch (e) { /* private mode */ }
}

function jmHandleGoogleLogin(response) {
  JM_ID_TOKEN = response.credential;
  jmSimpanSesi_(response.credential);
  jmMulai();
}

function jmLogout() {
  JM_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("jm-nav-logout");
  if (b) b.classList.add("hidden");
  jmShow("jm-login-box");
}

function jmMulai() {
  // v226: data diminta SEKARANG, sejajar dengan pemeriksaan peran -- bukan
  // sesudahnya. Dulu dua permintaan berurutan (peran 3-4 dtk, lalu data 4-6
  // dtk); sekarang waktu tunggunya = yang terlama, bukan jumlah keduanya.
  // Aman: server tetap menolak data untuk yang tidak berhak; gerbang di
  // sini hanya menentukan APA yang digambar.
  JM_JANJI_DATA = jmAmbilData_();
  JM_JANJI_DATA.catch(function () { /* ditangani di jmMuat */ });
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(JM_ID_TOKEN, JM_API_URL, jmMulaiIsi_);
  } else {
    jmMulaiIsi_();
  }
}

function jmMulaiIsi_() {
  const b = document.getElementById("jm-nav-logout");
  if (b) b.classList.remove("hidden");
  jmBacaLihat_();
  // v226: snapshot lokal digambar lebih dulu (kalau ada, maks 3 hari), sambil
  // menunggu jawaban server. Ditandai jelas supaya orang tahu angkanya lama.
  const snap = (typeof rjdSnapshotBaca_ === "function") ? rjdSnapshotBaca_("jadwal", 3 * 24 * 60) : null;
  if (snap && snap.data && snap.data.bar) {
    JM_DARI_SNAPSHOT = true;
    jmShow("jm-isi");
    jmTerapkanData_(snap.data);
    jmStatusData_("Data tersimpan pukul " + rjdJamPendek_(snap.waktu) + " \u00b7 memperbarui dari server\u2026");
  } else {
    jmShow("jm-loading");
  }
  // v215: peran sudah di-cache oleh satpam -- tidak menambah permintaan.
  if (typeof rjdAmbilPeran_ === "function") {
    rjdAmbilPeran_(JM_API_URL, JM_ID_TOKEN)
      .then(function (d) { jmTerapkanBagian_(d); })
      .catch(function () { jmTerapkanBagian_(null); });
  }
  jmMuat();
}

/** Boleh menulis? Cermin BAGIAN_PER_AKSI["simpanJadwalManual"] = "ppic". */
function jmTerapkanBagian_(d) {
  const bagian = (d && d.bagian) ? d.bagian : [];
  const lintas = !!(d && d.lintasBagian);
  JM_BOLEH_TULIS = lintas || !bagian.length ||
    bagian.some(function (b) { return b === "ppic" || b === "produksi" || b === "semua" || b === "all"; });
  const f = document.getElementById("jm-form-wrap");
  if (f) f.classList.toggle("hidden", !JM_BOLEH_TULIS);
  document.body.classList.toggle("jm-bisa-tulis", JM_BOLEH_TULIS);
  // Peran dan data datang lewat dua permintaan yang urutannya tidak pasti;
  // kalau data lebih dulu, matriks (dan pesan kosongnya) sudah digambar
  // dengan asumsi belum boleh menulis -- gambar ulang dengan peran yang benar.
  if (JM_DATA) { jmIsiFormPilihan_(); jmRender(); }
}

// ---------- keadaan tampilan ----------

function jmBacaLihat_() {
  jmBacaMode_();
  jmBacaSembunyi_();   // v246
  try {
    const raw = sessionStorage.getItem("jm_lihat");
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.mulai) JM_LIHAT.mulai = jmDariIso_(d.mulai);
    if (d.minggu) JM_LIHAT.minggu = Number(d.minggu) || 8;
    // v255: dulu string tunggal; sesi lama diterima dan diubah jadi daftar.
    JM_LIHAT.klien = jmDaftarDari_(d.klien);
    JM_LIHAT.line = jmDaftarDari_(d.line);
    JM_LIHAT.keadaan = jmDaftarDari_(d.keadaan);
    if (typeof d.sembunyiLewat === "boolean") JM_LIHAT.sembunyiLewat = d.sembunyiLewat;
    // v254: dulu string tunggal; sesi lama yang masih menyimpan string diterima.
    if (Array.isArray(d.tahap)) JM_LIHAT.tahap = d.tahap.filter(function (x) { return typeof x === "string" && x; });
    else if (typeof d.tahap === "string") JM_LIHAT.tahap = d.tahap ? [d.tahap] : [];
  } catch (e) { /* abaikan */ }
}

function jmSimpanLihat_() {
  try {
    sessionStorage.setItem("jm_lihat", JSON.stringify({
      mulai: JM_LIHAT.mulai ? jmIso_(JM_LIHAT.mulai) : null,
      minggu: JM_LIHAT.minggu, klien: JM_LIHAT.klien, line: JM_LIHAT.line,
      sembunyiLewat: JM_LIHAT.sembunyiLewat, tahap: JM_LIHAT.tahap, keadaan: JM_LIHAT.keadaan
    }));
  } catch (e) { /* abaikan */ }
}

// ---------- muat data ----------

/**
 * Ambil data jadwal dari server. Mengembalikan Promise berisi data mentah;
 * tidak menyentuh layar. jmMuat() memakainya untuk memuat halaman, jmKirim_()
 * memakainya untuk MEMERIKSA hasil saat jawaban simpan/hapus tidak sampai.
 */
function jmAmbilData_() {
  return fetch(JM_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: JM_ID_TOKEN, action: "getJadwalManual" })
  })
  .then(function (r) { return r.text(); })
  .then(function (teks) {
    let data;
    try { data = JSON.parse(teks); }
    catch (e) { throw new Error("jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 90)); }
    if (!data || !data.success) throw new Error((data && data.error) || "Gagal memuat jadwal.");
    return data;
  });
}

function jmTerapkanData_(data) {
  JM_DATA = data;
  // Jendela default: seminggu ke belakang dari hari ini, supaya bar yang
  // sedang berjalan kelihatan awalnya.
  if (!JM_LIHAT.mulai) JM_LIHAT.mulai = jmSenin_(jmTambahHari_(jmDariIso_(data.hariIni), -7));
  jmIsiFilter_();
  jmIsiFormPilihan_();
  jmRender();
}

function jmStatusData_(teks) {
  const el = document.getElementById("jm-status-data");
  if (!el) return;
  el.textContent = teks || "";
  el.classList.toggle("hidden", !teks);
  jmPasTinggiNanti_();   // v252: bilah ini yang membuat sisa 61 px (lihat jmPasangPengamatTinggi_)
}

function jmMuat() {
  const janji = JM_JANJI_DATA || jmAmbilData_();
  JM_JANJI_DATA = null;
  janji
    .then(function (data) {
      jmShow("jm-isi");
      JM_DARI_SNAPSHOT = false;
      jmTerapkanData_(data);
      if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("jadwal", data);
      jmStatusData_("");
      jmKirimAntrean_();
    })
    .catch(function (e) {
      if (JM_DARI_SNAPSHOT) {
        // Snapshot tetap tampil; cukup beri tahu bahwa yang segar gagal.
        jmStatusData_("Tidak bisa memperbarui dari server (" + ((e && e.message) || "sambungan") + "). Menampilkan data tersimpan.");
        return;
      }
      jmShow("jm-isi");
      document.getElementById("jm-matriks").innerHTML =
        '<div class="jm-kartu"><p class="jm-galat">' + jmEsc_((e && e.message) || "Gagal menghubungi server. Periksa jaringan lalu muat ulang.") + '</p></div>';
    });
}

// ---------- kotak keluar (v226) ----------
// Simpan/hapus yang gagal terkirim DAN gagal diverifikasi (= benar-benar
// tanpa sambungan) masuk antrean di localStorage, digambar sebagai bar
// "menunggu", dan dikirim ulang saat sambungan kembali / halaman dibuka lagi.
// Server punya anti-kembar, jadi pengiriman ulang selalu aman.
function jmAntreanBaca_() { try { return JSON.parse(localStorage.getItem(JM_ANTREAN_KUNCI) || "[]"); } catch (e) { return []; } }
function jmAntreanTulis_(q) { try { localStorage.setItem(JM_ANTREAN_KUNCI, JSON.stringify(q)); } catch (e) { /* kuota */ } }
function jmAntreanTambah_(action, muatan, label) {
  const q = jmAntreanBaca_();
  const id = "ANTRE:" + Date.now() + Math.floor(Math.random() * 100);
  q.push({ id: id, action: action, muatan: muatan, label: label, dibuat: Date.now() });
  jmAntreanTulis_(q);
  // gambar optimistis
  if (action === "simpanJadwalManual" && JM_DATA) {
    const d = muatan.data;
    if (d.id) { JM_DATA.bar = (JM_DATA.bar || []).filter(function (b) { return b.id !== d.id; }); }
    JM_DATA.bar.push({ id: id, item: d.item, tahap: d.tahap, line: d.line || "", sub: d.sub || "",
      namaLine: d.line ? ((JM_DATA.lines || []).filter(function (l) { return l.idLine === d.line; })[0] || {}).namaLine || d.line : "",
      mulai: d.mulai, selesai: d.selesai, qty: d.qty || 0, keterangan: d.keterangan || "", menunggu: true });
    jmSinkronItems_(); jmRender();
  } else if (action === "hapusJadwalManual" && JM_DATA) {
    JM_DATA.bar = (JM_DATA.bar || []).filter(function (b) { return b.id !== muatan.id; });
    jmSinkronItems_(); jmRender();
  }
  jmRenderAntrean_();
  return id;
}
function jmRenderAntrean_() {
  const q = jmAntreanBaca_();
  const el = document.getElementById("jm-antrean");
  if (!el) return;
  el.classList.toggle("hidden", !q.length);
  el.innerHTML = q.length ? '<b>' + q.length + ' perubahan menunggu dikirim</b> \u2014 akan terkirim otomatis saat sambungan kembali. ' +
    '<button class="jm-btn" onclick="jmKirimAntrean_(true)" type="button">Kirim sekarang</button>' : "";
}
function jmKirimAntrean_(manual) {
  const q = jmAntreanBaca_();
  if (!q.length) { jmRenderAntrean_(); return; }
  if (JM_PENGIRIM_ANTREAN) return;
  if (!navigator.onLine && !manual) { jmRenderAntrean_(); return; }
  let sisa = q.slice();
  const satu = function () {
    if (!sisa.length) {
      JM_PENGIRIM_ANTREAN = null; jmAntreanTulis_([]); jmRenderAntrean_();
      jmAmbilData_().then(function (d) { JM_DATA = d; jmIsiFilter_(); jmIsiFormPilihan_(); jmRender(); if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("jadwal", d); }).catch(function () {});
      return;
    }
    const item = sisa[0];
    fetch(JM_API_URL, { method: "POST", body: JSON.stringify(Object.assign({ idToken: JM_ID_TOKEN, action: item.action }, item.muatan)) })
      .then(function (r) { return r.text(); })
      .then(function (teks) {
        let res; try { res = JSON.parse(teks); } catch (e) { throw new TypeError("jawaban tidak terbaca"); }
        // Ditolak server (validasi/bagian) = bukan soal sambungan -> buang dari antrean, beri tahu.
        if (!res || !res.success) { jmFormPesan_("Antrean \"" + item.label + "\" ditolak server: " + ((res && res.error) || "?"), true); }
        sisa.shift(); jmAntreanTulis_(sisa); satu();
      })
      .catch(function () {
        // masih tanpa sambungan -> berhenti, coba lagi nanti
        JM_PENGIRIM_ANTREAN = null; jmAntreanTulis_(sisa); jmRenderAntrean_();
      });
  };
  JM_PENGIRIM_ANTREAN = true; satu();
}
window.addEventListener("online", function () { jmKirimAntrean_(); });
setInterval(function () { if (JM_ID_TOKEN && jmAntreanBaca_().length) jmKirimAntrean_(); }, 60000);

function jmIsiFilter_() {
  // v255: klien & line kini tombol + panel (lihat JM_FILTER_PILIH). Nilai yang
  // tidak ada lagi di data dibuang diam-diam? TIDAK -- dipertahankan: PO yang
  // hilang dari data hari ini bisa kembali besok, dan filter yang diam-diam
  // kosong adalah jebakan yang lebih buruk daripada filter yang tampak menyala.
  jmSegarkanTombolPilih_();
  const cb = document.getElementById("jm-f-lewat");
  if (cb) cb.checked = JM_LIHAT.sembunyiLewat;
  const selM = document.getElementById("jm-f-minggu");
  if (selM) selM.value = String(JM_LIHAT.minggu);
}

// ---------- kendali ----------

function jmGeser(n) { JM_LIHAT.mulai = jmTambahHari_(JM_LIHAT.mulai, n * 7); jmSimpanLihat_(); jmRender(); }
function jmKeHariIni() {
  JM_LIHAT.mulai = jmSenin_(jmTambahHari_(jmDariIso_(JM_DATA.hariIni), -7));
  jmSimpanLihat_(); jmRender();
}
function jmUbahFilter() {
  // v255: klien, tahap, line diubah langsung oleh panel kotak centang masing-masing.
  // v254: JM_LIHAT.tahap diubah langsung oleh kotak centang di panel tahap, bukan dibaca dari sini.
  JM_LIHAT.minggu = Number((document.getElementById("jm-f-minggu") || {}).value) || 8;
  JM_LIHAT.sembunyiLewat = !!((document.getElementById("jm-f-lewat") || {}).checked);
  jmSimpanLihat_(); jmRender();
}

// ---------- render ----------

function jmRender() {
  if (!JM_DATA) return;
  jmRenderTombolMode_();   // v231: idempoten -- menggambar sekali, sesudahnya cuma menyetel yang aktif
  jmRenderLaci_();         // v232: idem; juga memperbarui lencana jumlah filter aktif
  jmRenderPeringatan_();
  jmRenderMatriks_();
  jmRenderSembunyi_();     // v246: butuh JM_SEMBUNYI_TERAKHIR dari pengelompokan di atas
}

function jmRenderPeringatan_() {
  const el = document.getElementById("jm-peringatan");
  if (!el) return;
  const p = JM_DATA.peringatan || [];
  if (!JM_DATA.sheetAda) {
    el.classList.remove("hidden");
    el.innerHTML = '<b>Sheet "SD Jadwal Produksi" belum ada.</b> Jalankan <code>buatSheetJadwalProduksi()</code> ' +
      'lalu <code>segarkanPilihanJadwal()</code> di Apps Script, isi jadwalnya, dan muat ulang halaman ini.';
    return;
  }
  // v256: selain baris rusak, panel ini memuat CATATAN dari server (request
  // diam, kunci belum pindah, sumber tidak terbaca) dan tombol bersih-bersih
  // bar batal. Semua terlihat, tidak ada yang diam-diam.
  const c = JM_DATA.catatan || [];
  const batal = jmBarBatal_();
  if (!p.length && !c.length && !batal.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  let html = "";
  if (p.length) {
    html += '<div class="jm-peringatan-blok"><b>' + p.length + ' baris di sheet tidak bisa digambar</b> -- perbaiki di "SD Jadwal Produksi":' +
      '<ul>' + p.map(function (x) {
        return '<li>Baris ' + x.baris + (x.item ? ' <span class="jm-mono">' + jmEsc_(x.item) + '</span>' : '') +
          (x.tahap ? ' (' + jmEsc_(x.tahap) + ')' : '') + ': ' + jmEsc_(x.pesan) + '</li>';
      }).join("") + '</ul></div>';
  }
  if (c.length) {
    html += '<div class="jm-peringatan-blok jm-catatan"><b>' + c.length + ' catatan</b><ul>' + c.map(function (x) {
      return '<li class="jm-catatan-' + jmEsc_(x.jenis || "") + '">' + jmEsc_(x.pesan) + '</li>';
    }).join("") + '</ul></div>';
  }
  if (batal.length) {
    html += '<div class="jm-peringatan-blok jm-catatan-batal"><b>' + batal.length + ' bar milik item batal</b> (tergambar redup dan dicoret). ' +
      'Tidak dihapus otomatis. <button type="button" class="jm-btn jm-btn-kecil" id="jm-btn-bersih-batal" onclick="jmBersihkanBatal_()">Bersihkan bar batal</button></div>';
  }
  el.innerHTML = html;
}

/** Susun kolom hari kerja (Senin-Sabtu) untuk jendela yang dilihat. */
function jmKolom_() {
  const kolom = [];
  for (let m = 0; m < JM_LIHAT.minggu; m++) {
    for (let h = 0; h < 6; h++) {
      const d = jmTambahHari_(JM_LIHAT.mulai, m * 7 + h);
      kolom.push({ tgl: d, iso: jmIso_(d), minggu: m, hari: h });
    }
  }
  return kolom;
}

/** Kelompokkan bar per item, terapkan filter, urutkan menurut bar paling awal. */
function jmKelompok_() {
  const hariIni = JM_DATA.hariIni;
  const petaItem = {};
  (JM_DATA.items || []).forEach(function (it) { petaItem[it.kunci] = it; });

  const grup = {};
  (JM_DATA.bar || []).forEach(function (b) {
    // v256: item tak dikenal dulu dibuang diam-diam (return). Sekarang diberi
    // item pengganti bertanda supaya barnya TAMPAK -- kunci yang salah pindah
    // atau request yang hilang dari data harus kelihatan, bukan lenyap.
    const it = petaItem[b.item] || (petaItem[b.item] = jmItemTakDikenal_(b.item));
    if (!jmPilihAktif_("klien", it.idKlien)) return;
    if (!jmKeadaanLolos_(it)) return;
    if (!grup[b.item]) grup[b.item] = { item: it, bar: [], mulaiMin: b.mulai, selesaiMax: b.selesai };
    grup[b.item].bar.push(b);
    if (b.mulai < grup[b.item].mulaiMin) grup[b.item].mulaiMin = b.mulai;
    if (b.selesai > grup[b.item].selesaiMax) grup[b.item].selesaiMax = b.selesai;
  });

  const lolos = Object.keys(grup).map(function (k) { return grup[k]; })
    .filter(function (g) {
      if (JM_LIHAT.sembunyiLewat && g.selesaiMax < hariIni) return false;
      // Filter line: tampilkan item yang punya bar Sewing di line itu.
      if (JM_LIHAT.line.length && !g.bar.some(function (b) { return jmPilihAktif_("line", b.line); })) return false;
      // v233: filter tahap -- item tanpa satu pun bar tahap itu ikut hilang,
      // supaya tidak ada judul item yang menggantung tanpa baris.
      if (JM_LIHAT.tahap.length && !g.bar.some(function (b) { return jmTahapAktif_(b.tahap); })) return false;
      return true;
    });
  // v246: sembunyi manual SESUDAH filter -- yang dihitung "disembunyikan"
  // hanya yang memang akan tampil kalau tidak disembunyikan.
  return jmPisahSembunyi_(lolos, function (g) { return g.item; })
    .sort(function (a, b) {
      if (a.mulaiMin !== b.mulaiMin) return a.mulaiMin < b.mulaiMin ? -1 : 1;
      return String(a.item.artikel).localeCompare(String(b.item.artikel));
    });
}

/**
 * v231: PIVOT -- grup = tahap (Sewing: tahap x line), baris = item.
 * Mengembalikan bentuk umum yang dimengerti jmRenderMatriks_ mode "tahap":
 *   { judul, sub, keterangan, tahap, baris: [ { item, label, sub, tahap, bar, mulaiMin } ] }
 *
 * Filter mengikuti semantik mode artikel supaya mengganti mode tidak mengubah
 * "siapa yang tampil": klien menyaring item; line menyaring item yang punya
 * bar Sewing di line itu (semua tahapnya tetap tampil) DAN di dalam Sewing
 * hanya sub-grup line itu. Satu pengecualian sadar: "sembunyikan yang lewat"
 * berlaku PER BARIS, bukan per item -- pada antrean cutting, cutting yang
 * sudah selesai memang harus hilang walau sewing-nya masih jalan.
 */
function jmKelompokTahap_() {
  const hariIni = JM_DATA.hariIni;
  const petaItem = {};
  (JM_DATA.items || []).forEach(function (it) { petaItem[it.kunci] = it; });

  // item yang lolos filter klien/line (semantik sama dengan jmKelompok_)
  const barPerItem = {};
  (JM_DATA.bar || []).forEach(function (b) {
    const it = petaItem[b.item] || (petaItem[b.item] = jmItemTakDikenal_(b.item));   // v256: lihat jmKelompok_
    if (!jmPilihAktif_("klien", it.idKlien)) return;
    if (!jmKeadaanLolos_(it)) return;
    (barPerItem[b.item] = barPerItem[b.item] || []).push(b);
  });
  const itemLolos = {};
  Object.keys(barPerItem).forEach(function (k) {
    if (JM_LIHAT.line.length && !barPerItem[k].some(function (b) { return jmPilihAktif_("line", b.line); })) return;
    itemLolos[k] = true;
  });
  // v246: sembunyi manual, semantik sama dengan mode artikel (per item).
  // Nilai baliknya tidak dipakai di sini; yang dibutuhkan efek sampingnya
  // (JM_SEMBUNYI_TERAKHIR / JM_TAMPIL_TERAKHIR untuk bilah & "hanya ini").
  jmPisahSembunyi_(Object.keys(itemLolos).map(function (k) { return petaItem[k]; }), function (it) { return it; });
  Object.keys(itemLolos).forEach(function (k) { if (JM_LIHAT.sembunyi[k]) delete itemLolos[k]; });

  // kunci grup: tahap | tahap+line (Sewing) -- disusun dalam urutan tahap resmi
  const grupPeta = {}, urutanGrup = [];
  function ambilGrup(kunci, judul, sub, tahap) {
    if (!grupPeta[kunci]) { grupPeta[kunci] = { judul: judul, sub: sub, tahap: tahap, barisPeta: {} }; urutanGrup.push(kunci); }
    return grupPeta[kunci];
  }
  const urutanTahap = JM_DATA.tahap || Object.keys(JM_KELAS_TAHAP);
  urutanTahap.forEach(function (tahap) {
    Object.keys(itemLolos).forEach(function (kItem) {
      barPerItem[kItem].filter(function (b) { return b.tahap === tahap; }).forEach(function (b) {
        let g, kunciBaris;
        if (tahap === "Sewing") {
          if (!jmPilihAktif_("line", b.line)) return;
          g = ambilGrup(tahap + "|" + b.line, tahap, b.namaLine || b.line, tahap);
          kunciBaris = kItem;
        } else {
          g = ambilGrup(tahap, tahap, "", tahap);
          kunciBaris = kItem + "|" + (b.sub || "");
        }
        if (!g.barisPeta[kunciBaris]) {
          const it = petaItem[kItem];
          g.barisPeta[kunciBaris] = { item: it, label: [it.artikel, it.style].filter(String).join(" ") || it.po,
            sub: (tahap === "Sewing") ? "" : (b.sub || ""), tahap: tahap, bar: [], mulaiMin: b.mulai, selesaiMax: b.selesai };
        }
        const r = g.barisPeta[kunciBaris];
        r.bar.push(b);
        if (b.mulai < r.mulaiMin) r.mulaiMin = b.mulai;
        if (b.selesai > r.selesaiMax) r.selesaiMax = b.selesai;
      });
    });
  });

  // urut Sewing per line (line id), susun baris, hitung header
  return urutanGrup.map(function (k) { return grupPeta[k]; }).map(function (g) {
    const baris = Object.keys(g.barisPeta).map(function (k) { return g.barisPeta[k]; })
      .filter(function (r) { return !(JM_LIHAT.sembunyiLewat && r.selesaiMax < hariIni); })
      // ANTREAN: yang mulai paling awal dulu; seri dipecah oleh deadline PO
      // terdekat (kosong paling belakang), lalu nama.
      .sort(function (a, b) {
        if (a.mulaiMin !== b.mulaiMin) return a.mulaiMin < b.mulaiMin ? -1 : 1;
        const da = a.item.deadline || "9999", db = b.item.deadline || "9999";
        if (da !== db) return da < db ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    // Total pcs hanya di tempat ia JUJUR: pada sub-grup Sewing per line satu
    // item bisa terbagi ke dua line, dan qtyPo penuh akan terhitung dua kali.
    // Di sana cukup jumlah item.
    let pcs = 0;
    const itemUnik = {};
    baris.forEach(function (r) { if (!itemUnik[r.item.kunci]) { itemUnik[r.item.kunci] = true; pcs += Number(r.item.qtyPo) || 0; } });
    const nItem = Object.keys(itemUnik).length;
    g.keterangan = nItem + " item" + ((g.tahap !== "Sewing" && pcs) ? " \u00b7 " + pcs.toLocaleString("id-ID") + " pcs" : "");
    g.baris = baris;
    return g;
  }).filter(function (g) { return g.baris.length; })
    .filter(function (g) { return jmTahapAktif_(g.tahap); });   // v233, v254: daftar
}

/** Baris-baris matriks untuk satu grup: satu per tahap; Sewing satu per line. */
function jmBarisGrup_(g) {
  const urutan = JM_DATA.tahap || Object.keys(JM_KELAS_TAHAP);
  const baris = [];
  urutan.forEach(function (tahap) {
    if (!jmTahapAktif_(tahap)) return;   // v233, v254: daftar
    const bars = g.bar.filter(function (b) { return b.tahap === tahap; });
    if (!bars.length) return;
    if (tahap === "Sewing") {
      const perLine = {};
      bars.forEach(function (b) { (perLine[b.line] = perLine[b.line] || []).push(b); });
      Object.keys(perLine).sort().forEach(function (idLine) {
        if (!jmPilihAktif_("line", idLine)) return;
        baris.push({ label: "Sewing", sub: perLine[idLine][0].namaLine || idLine, tahap: tahap, bar: perLine[idLine] });
      });
    } else if (JM_DATA.subTahap && JM_DATA.subTahap[tahap]) {
      // v224: tahap berjenis (Sampel, Pengiriman) -> satu baris per jenis,
      // urut sesuai daftar jenisnya; bar tanpa jenis (Pengiriman lama) di
      // baris "polos" paling atas.
      const perSub = {};
      bars.forEach(function (b) { (perSub[b.sub || ""] = perSub[b.sub || ""] || []).push(b); });
      [""].concat(JM_DATA.subTahap[tahap]).forEach(function (sub) {
        if (!perSub[sub]) return;
        baris.push({ label: tahap, sub: sub, tahap: tahap, bar: perSub[sub] });
      });
    } else {
      baris.push({ label: tahap, sub: "", tahap: tahap, bar: bars });
    }
  });
  baris.forEach(function (b) { b.keadaan = jmKeadaan_(g.item); });   // v256: rupa bar ikut nasib item
  return baris;
}

/* v256 -- KEADAAN ITEM: nasib item diturunkan backend dari sumbernya (PO atau
   order request); halaman hanya menampilkannya. aktif | rencana | batal |
   selesai | takdikenal. "disetujui" (request sudah jadi PO tapi kunci bar belum
   pindah) ditampilkan sebagai rencana + catatan. */
function jmKeadaan_(it) {
  const k = (it && it.keadaan) || "aktif";
  if (k === "disetujui") return "rencana";
  return k;
}
function jmKeadaanLolos_(it) {
  const k = jmKeadaan_(it);
  if (k === "takdikenal") return true;   // selalu tampil, apa pun filternya
  return jmPilihAktif_("keadaan", k);
}
function jmKelasKeadaan_(it) {
  const k = jmKeadaan_(it);
  return k === "aktif" ? "" : " jm-k-" + k;
}
const JM_LABEL_KEADAAN = { rencana: "Rencana", batal: "Batal", selesai: "Selesai", takdikenal: "Item tidak dikenal" };
function jmLencanaKeadaan_(it, kecil) {
  const k = jmKeadaan_(it);
  if (k === "aktif") return "";
  const tip = k === "rencana" ? "Order request " + (it.idOr || it.po) + (it.keadaan === "disetujui" ? " sudah disetujui -- kunci bar belum pindah ke PO" : " belum disetujui") :
    k === "batal" ? (it.jenis === "rencana" ? "Order request ditolak" : "PO " + (it.status || "dibatalkan")) :
    k === "selesai" ? "PO sudah selesai" : "Kunci item ini tidak ada di data PO maupun order request";
  return '<span class="jm-lencana jm-lencana-' + k + (kecil ? ' jm-lencana-kecil' : '') + '" title="' + jmEsc_(tip) + '">' + JM_LABEL_KEADAAN[k] + '</span>';
}
function jmItemTakDikenal_(kunci) {
  const bagian = String(kunci).split(" | ");
  return { kunci: kunci, po: bagian[0] || kunci, artikel: bagian[1] || "", style: bagian[2] || "",
    idKlien: "", namaKlien: "(tidak dikenal)", produk: "", deadline: "", tahapSaatIni: "",
    aktif: false, status: "", dibatalkan: false, qtyPo: 0, jenis: "takdikenal", keadaan: "takdikenal" };
}
/** Bar yang itemnya batal -- untuk tombol bersih-bersih. */
function jmBarBatal_() {
  const peta = {};
  (JM_DATA.items || []).forEach(function (it) { peta[it.kunci] = it; });
  return (JM_DATA.bar || []).filter(function (b) { return jmKeadaan_(peta[b.item]) === "batal"; });
}
/** fetch sederhana ke API, hasilnya promise JSON. Bukan jalur form (jmKirim_) -- tidak menyentuh pesan form. */
function jmPanggil_(action, muatan) {
  return fetch(JM_API_URL, { method: "POST", body: JSON.stringify(Object.assign({ idToken: JM_ID_TOKEN, action: action }, muatan || {})) })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      let j; try { j = JSON.parse(t); } catch (e) { throw new Error("jawaban server tidak terbaca: " + String(t).replace(/<[^>]*>/g, " ").trim().slice(0, 90)); }
      if (!j || !j.success) throw new Error((j && j.error) || "Permintaan ditolak server.");
      return j;
    });
}
/**
 * v256: bersih-bersih bar batal. Dua langkah, tidak pernah otomatis:
 *   1. minta PRATINJAU ke server (daftar id yang batal SAAT INI)
 *   2. tampilkan daftarnya, minta persetujuan, lalu COMMIT dengan id yang
 *      persis sama -- server hanya menghapus id yang diminta DAN masih batal.
 */
function jmBersihkanBatal_() {
  const tombol = document.getElementById("jm-btn-bersih-batal");
  if (tombol) { tombol.disabled = true; tombol.textContent = "Memeriksa…"; }
  jmPanggil_("bersihkanBarBatalJadwal", { commit: false })
    .then(function (res) {
      const calon = res.calon || [];
      if (!calon.length) { alert("Tidak ada bar batal di server saat ini."); return null; }
      const daftar = calon.map(function (c) {
        return "• " + c.item + " — " + c.tahap + (c.line ? " " + c.line : "") + " " + jmTanggalPendek_(c.mulai) + "–" + jmTanggalPendek_(c.selesai) + " (" + c.alasan + ")";
      }).join("\n");
      if (!confirm("Hapus " + calon.length + " bar batal dari SD Jadwal Produksi?\n\n" + daftar + "\n\nBaris di sheet akan dihapus. Ini tidak bisa dibatalkan.")) return null;
      return jmPanggil_("bersihkanBarBatalJadwal", { commit: true, ids: calon.map(function (c) { return c.id; }) });
    })
    .then(function (res) {
      if (res) alert(res.dihapus + " bar dihapus." + (res.masihBatal !== res.diminta ? " (" + (res.diminta - res.masihBatal) + " sudah berubah keadaan, dilewati)" : ""));
      if (tombol) { tombol.disabled = false; tombol.textContent = "Bersihkan bar batal"; }
      if (res) jmMuat();   // data segar dari server, bukan snapshot
    })
    .catch(function (e) {
      if (tombol) { tombol.disabled = false; tombol.textContent = "Bersihkan bar batal"; }
      alert("Bersih-bersih gagal: " + (e && e.message || e));
    });
}

/* ============================================================
   v235 -- POSISI GULIR HORIZONTAL
   ============================================================
   Sampai v234 matriks selalu terbuka di kolom PALING KIRI. Dengan jendela 6
   minggu (36 kolom) di layar HP yang cuma memuat ~9, "hari ini" dan hampir
   semua bar ada di luar layar sejak detik pertama -- tangkapan layar 2 Sep
   2026 memperlihatkan matriks terbuka di Sep 19-28 dengan SELURUH sel kosong.
   Orang harus menggulir mencari-cari sebelum melihat data apa pun.

   Tiga lapisan, sengaja saling melengkapi:
     1. gulir awal ke "hari ini" (atau bar paling awal kalau hari ini di luar
        jendela) -- menolong SEMUA orang tanpa satu klik pun
     2. penanda arah per baris untuk bar di luar layar -- PASIF, jadi orang
        tahu ke mana melihat tanpa mengklik dulu
     3. klik label kolom kiri -> gulir ke bar PERTAMA baris itu

   Yang SENGAJA TIDAK dilakukan: menggulir otomatis saat filter berubah atau
   saat baris lain diklik. Gulir yang bergerak sendiri tanpa diminta membuat
   orang kehilangan tempatnya -- lebih buruk daripada menggulir manual.
   Gerakan hanya saat digambar ulang total dan saat diklik. */

/** Sel <td>/<th> pertama pada kolom ke-i (0-based) di dalam wadah gulir. */
function jmKolomKiri_(gulir, i) {
  const th = gulir.querySelectorAll(".jm-h-hari .jm-th-hari")[i];
  return th ? th.offsetLeft : null;
}

/** Lebar kolom kiri yang menempel -- area yang TIDAK boleh dipakai menaruh bar. */
function jmLebarSticky_(gulir) {
  const s = gulir.querySelector(".jm-th-kiri");
  return s ? s.getBoundingClientRect().width : 0;
}

/**
 * Menggulir supaya kolom index `i` terlihat, dengan sedikit konteks di kirinya.
 * `mulus` false saat gambar pertama -- animasi ke posisi awal terlihat seperti
 * kegagalan, bukan fitur.
 */
function jmGulirKeKolom_(i, mulus) {
  const gulir = document.querySelector("#jm-matriks .jm-gulir");
  if (!gulir || i == null || i < 0) return;
  const kiri = jmKolomKiri_(gulir, i);
  if (kiri == null) return;
  const konteks = jmLebarSticky_(gulir) + 48;   // sedikit hari sebelumnya tetap terlihat
  const target = Math.max(0, kiri - konteks);
  if (mulus && gulir.scrollTo) gulir.scrollTo({ left: target, behavior: "smooth" });
  else gulir.scrollLeft = target;
}

/** Index kolom untuk sebuah tanggal ISO; -1 kalau di luar jendela. */
function jmIndexKolom_(iso, kolom) {
  for (let i = 0; i < kolom.length; i++) if (kolom[i].iso === iso) return i;
  return -1;
}

/** Lapisan 1: posisi awal = hari ini; kalau di luar jendela, bar paling awal. */
function jmGulirAwal_(kolom) {
  let i = jmIndexKolom_(JM_DATA.hariIni, kolom);
  if (i === -1) {
    let paling = null;
    (JM_DATA.bar || []).forEach(function (b) { if (!paling || b.mulai < paling) paling = b.mulai; });
    if (paling) {
      i = jmIndexKolom_(paling, kolom);
      // Bar mulai sebelum jendela -> kolom pertama sudah benar.
      if (i === -1) i = 0;
    }
  }
  if (i >= 0) jmGulirKeKolom_(i, false);
}

/**
 * Lapisan 2: penanda arah untuk baris yang SELURUH bar-nya di luar layar.
 * Dihitung dari posisi gulir NYATA, jadi ikut berubah saat orang menggulir.
 */
function jmPerbaruiPenanda_() {
  const gulir = document.querySelector("#jm-matriks .jm-gulir");
  if (!gulir) return;
  const batasKiri = gulir.scrollLeft + jmLebarSticky_(gulir);
  const batasKanan = gulir.scrollLeft + gulir.clientWidth;
  Array.prototype.forEach.call(gulir.querySelectorAll("tr.jm-r-tahap"), function (tr) {
    const label = tr.querySelector("td.jm-sticky");
    if (!label) return;
    let lama = label.querySelector(".jm-penanda");
    const sel = tr.querySelectorAll("td.jm-bar");
    let adaTerlihat = false, kiri = 0, kanan = 0;
    Array.prototype.forEach.call(sel, function (td) {
      const a = td.offsetLeft, z = a + td.offsetWidth;
      if (z > batasKiri && a < batasKanan) adaTerlihat = true;
      else if (z <= batasKiri) kiri++; else kanan++;
    });
    if (lama) lama.remove();
    if (!sel.length || adaTerlihat) return;
    const p = document.createElement("span");
    p.className = "jm-penanda";
    p.textContent = kiri ? "\u25C0" : "\u25B6";
    p.title = kiri ? "Jadwal baris ini ada di sebelah kiri" : "Jadwal baris ini ada di sebelah kanan";
    label.appendChild(p);
  });
}

/** Lapisan 3: klik label kolom kiri -> gulir ke bar PERTAMA baris itu. */
function jmKlikLabel_(tr) {
  const gulir = document.querySelector("#jm-matriks .jm-gulir");
  if (!gulir) return;
  const sel = tr.querySelectorAll("td.jm-bar");
  if (!sel.length) return;
  let paling = null;
  Array.prototype.forEach.call(sel, function (td) { if (paling === null || td.offsetLeft < paling) paling = td.offsetLeft; });
  const konteks = jmLebarSticky_(gulir) + 48;
  gulir.scrollTo
    ? gulir.scrollTo({ left: Math.max(0, paling - konteks), behavior: "smooth" })
    : (gulir.scrollLeft = Math.max(0, paling - konteks));
}

/** Dipasang sesudah matriks digambar. Idempoten -- wadahnya selalu baru. */
function jmPasangGulir_(kolom) {
  const gulir = document.querySelector("#jm-matriks .jm-gulir");
  if (!gulir) return;
  gulir.addEventListener("scroll", function () {
    if (gulir.__jmTunggu) return;
    gulir.__jmTunggu = true;
    // Penanda dihitung ulang saat menggulir, tapi lewat rAF: menghitung tiap
    // event scroll pada tabel 89 baris membuat gulirannya tersendat.
    requestAnimationFrame(function () { gulir.__jmTunggu = false; jmPerbaruiPenanda_(); });
  });
  gulir.addEventListener("click", function (ev) {
    const td = ev.target.closest && ev.target.closest("td.jm-sticky");
    if (!td) return;
    const tr = td.parentNode;
    if (tr && tr.classList.contains("jm-r-tahap")) jmKlikLabel_(tr);
  });
  jmGulirAwal_(kolom);
  jmPerbaruiPenanda_();
  jmPasTinggi_();               // v250
  jmPasangPengamatTinggi_();    // v252: sekali; idempoten
}

/** v231: sel-sel tanggal untuk SATU baris bar. Dipakai kedua mode. */
/* v249 -- JEDA. Satu tahap boleh punya beberapa ruas (baris data) di baris
   tampilan yang sama: jahit 1-10 Agu, berhenti karena kain kurang, lanjut
   8-15 Sep. Modelnya sudah menerimanya sejak v217 ("kembar" hanya kalau kedua
   tanggalnya sama). Yang belum ada: sel kosong DI ANTARA dua ruas tampak sama
   dengan sel kosong biasa, jadi jeda tidak terbaca sebagai jeda. Sekarang sel
   itu diberi garis putus-putus dan tooltip berisi keterangan ruas berikutnya
   (tempat alasan jedanya lazim ditulis). Sel sebelum ruas pertama dan sesudah
   ruas terakhir TIDAK ditandai -- itu bukan jeda. */
function jmSelBaris_(b, kolom, hariIni, deadline) {
  let html = "";
  const namaBaris = b.label + (b.sub ? " " + b.sub : "");
  if (!b.keadaan && b.item && typeof b.item === "object") b.keadaan = jmKeadaan_(b.item);   // v256: mode tahap
  kolom.forEach(function (k) {
    const kelas = jmKelasSel_(k, hariIni, deadline);
    const bar = b.bar.filter(function (x) { return x.mulai <= k.iso && k.iso <= x.selesai; });
    if (!bar.length) {
      let sebelum = null, sesudah = null;
      b.bar.forEach(function (x) {
        if (x.selesai < k.iso && (!sebelum || x.selesai > sebelum.selesai)) sebelum = x;
        if (x.mulai > k.iso && (!sesudah || x.mulai < sesudah.mulai)) sesudah = x;
      });
      if (sebelum && sesudah) {
        const tipJeda = "Jeda " + namaBaris + ": " + jmTanggalPendek_(jmIso_(jmTambahHari_(jmDariIso_(sebelum.selesai), 1))) +
          " - " + jmTanggalPendek_(jmIso_(jmTambahHari_(jmDariIso_(sesudah.mulai), -1))) +
          (sesudah.keterangan ? "\n" + sesudah.keterangan : "");
        html += '<td class="' + kelas + ' jm-jeda" title="' + jmEsc_(tipJeda) + '"></td>';
      } else {
        html += '<td class="' + kelas + '"></td>';
      }
      return;
    }
    const x = bar[0];
    const tepi = (x.mulai === k.iso ? " jm-bar-awal" : "") + (x.selesai === k.iso ? " jm-bar-akhir" : "");
    const tip = b.label + (b.sub ? " " + b.sub : "") + ": " + jmTanggalPendek_(x.mulai) + " - " + jmTanggalPendek_(x.selesai) +
      (x.qty ? " \u00b7 " + x.qty + " pcs" : "") + (x.keterangan ? "\n" + x.keterangan : "");
    html += '<td class="' + kelas + ' jm-bar jm-t-' + (JM_KELAS_TAHAP[b.tahap] || "lain") + tepi + (x.menunggu ? " jm-bar-menunggu" : "") +
      (b.keadaan && b.keadaan !== "aktif" ? " jm-bar-" + b.keadaan : "") +
      '" data-id="' + jmEsc_(x.id || "") + '" title="' + jmEsc_(tip) + (x.id ? "\n(klik untuk mengubah)" : "") + '"></td>';
  });
  return html;
}

function jmRenderMatriks_() {
  const wadah = document.getElementById("jm-matriks");
  JM_SEMBUNYI_TERAKHIR = []; JM_TAMPIL_TERAKHIR = [];   // v246: diisi ulang oleh pengelompokan
  if (!JM_DATA.sheetAda) { wadah.innerHTML = ""; jmRenderInfo_(0, 0); return; }

  const kolom = jmKolom_();
  const modeTahap = JM_LIHAT.mode === "tahap";
  const grup = modeTahap ? jmKelompokTahap_() : jmKelompok_();
  const hariIni = JM_DATA.hariIni;

  if (!grup.length) {
    wadah.innerHTML = '<div class="jm-kartu"><p class="jm-info">' +
      ((JM_DATA.bar || []).length
        ? (JM_SEMBUNYI_TERAKHIR.length
            ? 'Semua item yang cocok sedang disembunyikan. Klik <b>disembunyikan</b> di baris info di atas, lalu <b>Tampilkan semua</b>.'
            : 'Tidak ada item yang cocok dengan filter ini.')
        : (JM_BOLEH_TULIS
            ? 'Belum ada jadwal. Buka <b>Tambah jadwal</b> di atas untuk mulai mengisi.'
            : 'Belum ada baris jadwal. Isi lewat form (bagian PPIC/produksi) atau di sheet "SD Jadwal Produksi", lalu muat ulang.')) +
      '</p></div>';
    jmRenderInfo_(0, 0);
    return;
  }

  // ---- header: baris 1 = minggu (bulan + rentang), baris 2 = hari + tanggal
  // v221: TANPA rowspan. Sel kiri header dulu memakai rowspan="2" dan di
  // Chrome (terlihat di tablet, 31 Agu 2026) sel ber-rowspan yang sticky ke
  // atas kehilangan sticky ke kirinya: judul "Artikel & Tahap" ikut tergulir
  // sementara kolom kiri badan tabel tetap menempel, sehingga header tanggal
  // tampak menabrak kolom kiri. Sekarang tiap baris header punya sel kirinya
  // sendiri (baris kedua kosong), keduanya sticky kiri+atas.
  let thead = '<tr class="jm-h-minggu"><th class="jm-sticky jm-th-kiri">' +
    '<span>' + (modeTahap ? 'Tahap &amp; Artikel' : 'Artikel &amp; Tahap') + '</span></th>';
  for (let m = 0; m < JM_LIHAT.minggu; m++) {
    const a = kolom[m * 6].tgl, z = kolom[m * 6 + 5].tgl;
    const label = (a.getMonth() === z.getMonth())
      ? JM_BULAN[a.getMonth()] + " " + a.getFullYear()
      : JM_BULAN[a.getMonth()] + "\u2013" + JM_BULAN[z.getMonth()] + " " + z.getFullYear();
    thead += '<th class="jm-th-minggu" colspan="6">' + label + '</th>';
  }
  thead += '</tr><tr class="jm-h-hari"><th class="jm-sticky jm-th-kiri jm-th-kiri-2"></th>';
  kolom.forEach(function (k) {
    const kelas = ["jm-th-hari"];
    if (k.hari === 0) kelas.push("jm-awal-minggu");
    if (k.iso === hariIni) kelas.push("jm-hari-ini");
    thead += '<th class="' + kelas.join(" ") + '"><span class="jm-h-inisial">' + JM_HARI[k.hari] +
      '</span><span class="jm-h-tgl">' + k.tgl.getDate() + '</span></th>';
  });
  thead += '</tr>';

  // ---- badan
  let tbody = "";
  let jumlahBaris = 0;

  if (modeTahap) {
    const itemUnik = {};
    grup.forEach(function (g, gi) {
      tbody += '<tr class="jm-r-item jm-r-grup-tahap"><td class="jm-sticky jm-td-item">' +
        '<div class="jm-item-nama"><span class="jm-swatch jm-t-' + (JM_KELAS_TAHAP[g.tahap] || "lain") + '"></span>' +
          jmEsc_(g.judul) + (g.sub ? ' <span class="jm-tahap-sub">' + jmEsc_(g.sub) + '</span>' : '') + '</div>' +
        '<div class="jm-item-meta">' + jmEsc_(g.keterangan) + '</div></td>';
      kolom.forEach(function (k) { tbody += '<td class="' + jmKelasSel_(k, hariIni, null) + '"></td>'; });
      tbody += '</tr>';
      g.baris.forEach(function (b) {
        jumlahBaris++; itemUnik[b.item.kunci] = true;
        const it = b.item, dlLewat = it.deadline && it.deadline < hariIni;
        tbody += '<tr class="jm-r-tahap' + jmKelasKeadaan_(it) + '"><td class="jm-sticky jm-td-tahap jm-td-tahap-item" data-kunci="' + jmEsc_(it.kunci) + '" title="Klik: sembunyikan / fokus item ini">' +
          // v253: SATU baris -- nama item + deadline. Klien, PO, dan qty pindah ke
          // menu (klik nama). Alasannya dua: baris mode tahap jadi setinggi baris
          // mode artikel (30 px, bukan 44), dan kolom kiri bersih. Yang dijaga dari
          // v236 tetap dijaga: nama boleh menyusut (ellipsis), DEADLINE tidak pernah.
          '<div class="jm-item-baris-kecil"><span class="jm-item-nama-kecil">' + jmEsc_(b.label) +
            (b.sub ? ' <span class="jm-tahap-sub">' + jmEsc_(b.sub) + '</span>' : '') + '</span>' + jmLencanaKeadaan_(it, true) +
            (it.deadline ? '<span class="jm-dl' + (dlLewat ? ' jm-dl-lewat' : '') + '">' + jmTanggalPendek_(it.deadline) + '</span>' : '') +
          '</div></td>' + jmSelBaris_(b, kolom, hariIni, it.deadline) + '</tr>';
      });
      if (gi < grup.length - 1) tbody += '<tr class="jm-r-pisah"><td colspan="' + (kolom.length + 1) + '"></td></tr>';
    });
    wadah.innerHTML = '<div class="jm-gulir"><table class="jm-tabel"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
    jmRenderInfo_(Object.keys(itemUnik).length, jumlahBaris);
    jmPasangGulir_(kolom);   // v235
    return;
  }

  grup.forEach(function (g, gi) {
    const it = g.item;
    const baris = jmBarisGrup_(g);
    const deadlineLewat = it.deadline && it.deadline < hariIni;

    // Baris judul item
    const judul = [it.artikel, it.style].filter(String).join(" ");
    tbody += '<tr class="jm-r-item' + jmKelasKeadaan_(it) + '">' +
      '<td class="jm-sticky jm-td-item" data-kunci="' + jmEsc_(it.kunci) + '" title="Klik: sembunyikan / fokus item ini">' +
        '<div class="jm-item-nama">' + jmEsc_(judul || it.po) + jmLencanaKeadaan_(it) + '</div>' +
        // v236: klien & PO boleh menyusut, qty dan deadline tidak.
        // v239: di >=641px PO ikut dikunci (flex:0 0 auto), jadi hanya nama
        // klien yang menyusut. (v253: mode tahap tidak lagi menampilkan klien/PO
        // di baris -- hanya nama + deadline; rinciannya di menu klik.)
        '<div class="jm-item-meta"><span class="jm-klien">' + jmEsc_(it.namaKlien || it.idKlien) + '</span>' +
          '<span class="jm-mono">' + jmEsc_(it.po) + '</span>' +
          (it.qtyPo ? '<span class="jm-qty">&#183; ' + it.qtyPo.toLocaleString("id-ID") + ' pcs</span>' : '') +
          (it.deadline ? '<span class="jm-dl' + (deadlineLewat ? ' jm-dl-lewat' : '') + '">&#183; ' +
            jmTanggalPendek_(it.deadline) + '</span>' : '') +
        '</div>' +
      '</td>';
    kolom.forEach(function (k) {
      tbody += '<td class="' + jmKelasSel_(k, hariIni, it.deadline) + '"></td>';
    });
    tbody += '</tr>';

    // Baris tahap
    baris.forEach(function (b) {
      jumlahBaris++;
      tbody += '<tr class="jm-r-tahap">' +
        '<td class="jm-sticky jm-td-tahap"><span class="jm-swatch jm-t-' + (JM_KELAS_TAHAP[b.tahap] || "lain") + '"></span>' +
          jmEsc_(b.label) + (b.sub ? ' <span class="jm-tahap-sub">' + jmEsc_(b.sub) + '</span>' : '') +
        '</td>';
      tbody += jmSelBaris_(b, kolom, hariIni, it.deadline) + '</tr>';
    });
    if (gi < grup.length - 1) tbody += '<tr class="jm-r-pisah"><td colspan="' + (kolom.length + 1) + '"></td></tr>';
  });

  wadah.innerHTML = '<div class="jm-gulir"><table class="jm-tabel"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
  jmRenderInfo_(grup.length, jumlahBaris);
  jmPasangGulir_(kolom);   // v235
}

// ---------- form (v215) ----------

function jmBarDariId_(id) {
  return (JM_DATA && JM_DATA.bar || []).filter(function (b) { return b.id === id; })[0] || null;
}

function jmIsiFormPilihan_() {
  if (!JM_DATA) return;
  const selItem = document.getElementById("jm-in-item");
  const selTahap = document.getElementById("jm-in-tahap");
  const selLine = document.getElementById("jm-in-line");
  if (!selItem || !selTahap || !selLine) return;
  const nilaiItem = selItem.value;

  // item dikelompokkan per klien
  const perKlien = {};
  (JM_DATA.itemAktif || []).forEach(function (it) {
    (perKlien[it.namaKlien || it.idKlien] = perKlien[it.namaKlien || it.idKlien] || []).push(it);
  });
  selItem.innerHTML = '<option value="">-- pilih item --</option>' +
    Object.keys(perKlien).sort().map(function (k) {
      return '<optgroup label="' + jmEsc_(k) + '">' + perKlien[k].map(function (it) {
        return '<option value="' + jmEsc_(it.kunci) + '">' + jmEsc_([it.artikel, it.style].filter(String).join(" ")) +
          ' \u00b7 ' + (it.jenis === "rencana" ? 'Rencana \u00b7 ' : '') + jmEsc_(it.po) + (it.qtyPo ? ' (' + it.qtyPo + ' pcs)' : '') + '</option>';
      }).join("") + '</optgroup>';
    }).join("");
  if (nilaiItem) selItem.value = nilaiItem;

  const nilaiTahap = selTahap.value;
  selTahap.innerHTML = '<option value="">-- tahap --</option>' +
    (JM_DATA.tahap || []).map(function (t) { return '<option value="' + jmEsc_(t) + '">' + jmEsc_(t) + '</option>'; }).join("");
  if (nilaiTahap) selTahap.value = nilaiTahap;
  selLine.innerHTML = '<option value="">-- line --</option>' +
    (JM_DATA.lines || []).filter(function (l) { return l.aktif !== false; }).map(function (l) {
      return '<option value="' + jmEsc_(l.idLine) + '">' + jmEsc_(l.namaLine) + '</option>';
    }).join("");
  jmFormTahapBerubah();
}

/** Line hanya relevan untuk Sewing; Jenis hanya untuk tahap berjenis (v224). Keduanya
 *  disembunyikan di tahap lain, bukan sekadar dinonaktifkan. */
function jmFormTahapBerubah() {
  const tahap = (document.getElementById("jm-in-tahap") || {}).value || "";
  const w = document.getElementById("jm-in-line-wrap");
  if (w) w.classList.toggle("hidden", tahap !== "Sewing");
  const ws = document.getElementById("jm-in-sub-wrap");
  const sel = document.getElementById("jm-in-sub");
  const daftar = (JM_DATA && JM_DATA.subTahap && JM_DATA.subTahap[tahap]) || null;
  if (ws) ws.classList.toggle("hidden", !daftar);
  if (sel) {
    const lama = sel.value;
    const wajib = !!(JM_DATA && JM_DATA.subWajib && JM_DATA.subWajib[tahap]);
    sel.innerHTML = (daftar ? '<option value="">' + (wajib ? "-- pilih jenis --" : "(tanpa jenis)") + '</option>' +
      daftar.map(function (x) { return '<option value="' + jmEsc_(x) + '">' + jmEsc_(x) + '</option>'; }).join("") : "");
    if (daftar && daftar.indexOf(lama) !== -1) sel.value = lama;
    const lbl = document.getElementById("jm-in-sub-label");
    if (lbl) lbl.textContent = "Jenis" + (wajib ? "" : " (opsional)");
  }
}

/**
 * Saat item dipilih (dan bukan sedang edit): Tanggal Mulai = hari kerja
 * setelah bar terakhir item itu. Mengisi rantai tahap jadi tinggal ganti
 * tahap + geser tanggal selesai.
 */
function jmFormItemBerubah() {
  if (JM_EDIT_ID) return;
  const kunci = (document.getElementById("jm-in-item") || {}).value || "";
  const inMulai = document.getElementById("jm-in-mulai");
  const inSelesai = document.getElementById("jm-in-selesai");
  if (!inMulai || !inSelesai) return;
  let akhir = "";
  (JM_DATA.bar || []).forEach(function (b) { if (b.item === kunci && b.selesai > akhir) akhir = b.selesai; });
  let awal = akhir ? jmTambahHari_(jmDariIso_(akhir), 1) : jmDariIso_(JM_DATA.hariIni);
  if (awal.getDay() === 0) awal = jmTambahHari_(awal, 1); // Minggu -> Senin
  inMulai.value = jmIso_(awal);
  if (!inSelesai.value || inSelesai.value < inMulai.value) inSelesai.value = inMulai.value;
}

function jmFormMulaiBerubah() {
  const a = document.getElementById("jm-in-mulai"), z = document.getElementById("jm-in-selesai");
  if (a && z && (!z.value || z.value < a.value)) z.value = a.value;
}

function jmFormPesan_(teks, galat) {
  const el = document.getElementById("jm-form-pesan");
  if (!el) return;
  el.textContent = teks || "";
  el.classList.toggle("jm-form-galat", !!galat);
  el.classList.toggle("hidden", !teks);
}

function jmFormSibuk_(sibuk) {
  ["jm-btn-simpan", "jm-btn-hapus", "jm-btn-batal"].forEach(function (id) {
    const b = document.getElementById(id);
    if (b) b.disabled = !!sibuk;
  });
}

/** Buka form dalam mode edit untuk bar ber-ID. Dipanggil dari klik sel bar. */
function jmEdit(id) {
  if (!JM_BOLEH_TULIS) return;
  const b = jmBarDariId_(id);
  if (!b) { jmFormPesan_("Baris ini tidak punya ID -- muat ulang halaman, ID akan diberikan otomatis.", true); return; }
  JM_EDIT_ID = id;
  document.getElementById("jm-in-item").value = b.item;
  document.getElementById("jm-in-tahap").value = b.tahap;
  document.getElementById("jm-in-line").value = b.line || "";
  jmFormTahapBerubah();                                         // isi daftar jenis dulu
  document.getElementById("jm-in-sub").value = b.sub || "";
  document.getElementById("jm-in-mulai").value = b.mulai;
  document.getElementById("jm-in-selesai").value = b.selesai;
  document.getElementById("jm-in-qty").value = b.qty || "";
  document.getElementById("jm-in-ket").value = b.keterangan || "";
  jmFormPesan_("");
  jmFormModeTampil_();
  jmBukaForm();   // v250: modal, tidak perlu menggulir ke atas
}

function jmFormModeTampil_() {
  const edit = !!JM_EDIT_ID;
  const j = document.getElementById("jm-form-judul");
  if (j) j.textContent = edit ? "Ubah jadwal" : "Tambah jadwal";
  const h = document.getElementById("jm-btn-hapus");
  if (h) h.classList.toggle("hidden", !edit);
  const c = document.getElementById("jm-btn-batal");
  if (c) c.classList.toggle("hidden", !edit);
  // v249: "Lanjutkan tahap ini" -- dibuat lewat JS (template tidak berubah),
  // diselipkan sesudah tombol Batal, hanya tampil saat mengedit sebuah ruas.
  let l = document.getElementById("jm-btn-lanjut");
  if (!l && c && c.parentNode) {
    l = document.createElement("button");
    l.id = "jm-btn-lanjut"; l.type = "button"; l.className = "jm-btn hidden";
    l.textContent = "Lanjutkan tahap ini";
    l.title = "Buat ruas baru untuk tahap & line yang sama -- untuk jahit/potong yang terjeda lalu lanjut";
    l.onclick = jmFormLanjutkan;
    c.parentNode.insertBefore(l, c.nextSibling);
  }
  if (l) l.classList.toggle("hidden", !edit);
  const w = document.getElementById("jm-form-wrap");
  if (w) w.classList.toggle("jm-mode-edit", edit);
  const k = document.querySelector("#jm-modal .jm-modal-kotak");
  if (k) k.classList.toggle("jm-mode-edit", edit);
}

/* v249. Dari ruas yang sedang diedit, siapkan RUAS BARU untuk item, tahap,
   line, dan jenis yang sama: tanggal mulai = hari kerja pertama sesudah ruas
   itu selesai, keterangan diawali "Lanjutan" supaya alasan jedanya ditulis di
   situ (dan tampil di tooltip sel jeda). Ruas lama tidak disentuh -- kalau
   tanggal selesainya perlu dipendekkan ke hari berhentinya, ubah dulu lalu
   simpan, baru klik ini. */
function jmFormLanjutkan() {
  if (!JM_BOLEH_TULIS || !JM_EDIT_ID) return;
  const b = jmBarDariId_(JM_EDIT_ID);
  if (!b) return;
  JM_EDIT_ID = "";
  document.getElementById("jm-in-item").value = b.item;
  document.getElementById("jm-in-tahap").value = b.tahap;
  document.getElementById("jm-in-line").value = b.line || "";
  jmFormTahapBerubah();
  document.getElementById("jm-in-sub").value = b.sub || "";
  let awal = jmTambahHari_(jmDariIso_(b.selesai), 1);
  if (awal.getDay() === 0) awal = jmTambahHari_(awal, 1);   // Minggu -> Senin
  document.getElementById("jm-in-mulai").value = jmIso_(awal);
  document.getElementById("jm-in-selesai").value = jmIso_(awal);
  document.getElementById("jm-in-qty").value = "";
  document.getElementById("jm-in-ket").value = "Lanjutan";
  jmFormModeTampil_();
  const j = document.getElementById("jm-form-judul");
  if (j) j.textContent = "Tambah jadwal (lanjutan)";
  jmFormPesan_("Ruas lanjutan " + b.tahap + (b.namaLine ? " " + b.namaLine : "") +
    " -- isi tanggalnya, dan tulis alasan jedanya di keterangan.");
  const m = document.getElementById("jm-in-mulai");
  if (m && m.focus) m.focus();
}

function jmFormBatal() {
  JM_EDIT_ID = "";
  ["jm-in-qty", "jm-in-ket"].forEach(function (id) { const el = document.getElementById(id); if (el) el.value = ""; });
  jmFormPesan_("");
  jmFormModeTampil_();
  jmFormItemBerubah();
}

function jmFormSimpan() {
  if (!JM_BOLEH_TULIS) return;
  const data = {
    id: JM_EDIT_ID,
    item: document.getElementById("jm-in-item").value,
    tahap: document.getElementById("jm-in-tahap").value,
    line: document.getElementById("jm-in-line").value,
    sub: (document.getElementById("jm-in-sub") || {}).value || "",
    mulai: document.getElementById("jm-in-mulai").value,
    selesai: document.getElementById("jm-in-selesai").value,
    qty: Number(document.getElementById("jm-in-qty").value) || 0,
    keterangan: document.getElementById("jm-in-ket").value
  };
  // Validasi ringan di sini cuma untuk pesan yang cepat; aturan lengkap di backend.
  if (!data.item) { jmFormPesan_("Pilih item produksi dulu.", true); return; }
  if (!data.tahap) { jmFormPesan_("Pilih tahap.", true); return; }
  if (data.tahap === "Sewing" && !data.line) { jmFormPesan_("Tahap Sewing wajib pilih line.", true); return; }
  if (JM_DATA.subWajib && JM_DATA.subWajib[data.tahap] && !data.sub) { jmFormPesan_("Tahap " + data.tahap + " wajib pilih jenis.", true); return; }
  if (!data.mulai || !data.selesai) { jmFormPesan_("Isi tanggal mulai dan selesai.", true); return; }
  if (data.selesai < data.mulai) { jmFormPesan_("Tanggal selesai lebih awal dari mulai.", true); return; }

  jmFormSibuk_(true);
  jmFormPesan_("Menyimpan...");
  const cocok = function (b) {
    return b.item === data.item && b.tahap === data.tahap && (b.line || "") === (data.line || "") &&
      (b.sub || "") === (data.sub || "") && b.mulai === data.mulai && b.selesai === data.selesai;
  };
  const periksaSimpan = function (baru) {
    const ada = (baru.bar || []).filter(cocok)[0];
    if (!ada) return "";
    // kalau ini edit, bar lama (ID sama) harus sudah berubah -- cocok() memastikan itu
    return (JM_EDIT_ID ? "Perubahan tersimpan: " : "Tersimpan: ") + ada.tahap + (ada.namaLine ? " " + ada.namaLine : "") + (ada.sub ? " " + ada.sub : "") +
      " " + jmTanggalPendek_(ada.mulai) + "\u2013" + jmTanggalPendek_(ada.selesai) + ".";
  };
  const labelAntrean = data.tahap + (data.sub ? " " + data.sub : "") + " " + jmTanggalPendek_(data.mulai) + "\u2013" + jmTanggalPendek_(data.selesai);
  jmKirim_("simpanJadwalManual", { data: data }, function (res) {
    const bar = res.bar;
    if (!bar || !bar.id) throw new Error("jawaban server tanpa data baris");
    // Perbarui data lokal tanpa memuat ulang seluruh halaman: cepat, dan
    // posisi jendela/filter tidak berubah.
    const idx = (JM_DATA.bar || []).map(function (b) { return b.id; }).indexOf(bar.id);
    if (idx === -1) JM_DATA.bar.push(bar); else JM_DATA.bar[idx] = bar;
    jmSinkronItems_();
    const wasEdit = !!JM_EDIT_ID;
    JM_EDIT_ID = "";
    jmFormModeTampil_();
    jmIsiFilter_();
    jmRender();
    jmFormPesan_(
      (res.kembar
        ? "Sudah ada baris yang sama persis, jadi tidak ditambah lagi: "
        : (wasEdit ? "Perubahan tersimpan: " : "Tersimpan: ")) +
      bar.tahap + (bar.namaLine ? " " + bar.namaLine : "") + (bar.sub ? " " + bar.sub : "") +
      " " + jmTanggalPendek_(bar.mulai) + "\u2013" + jmTanggalPendek_(bar.selesai) + ".");
    // siap untuk tahap berikutnya dari item yang sama
    document.getElementById("jm-in-qty").value = "";
    document.getElementById("jm-in-ket").value = "";
    jmFormItemBerubah();
    jmGulirKeBar_(bar);
  }, periksaSimpan, labelAntrean);
}

function jmFormHapus() {
  if (!JM_BOLEH_TULIS || !JM_EDIT_ID) return;
  const b = jmBarDariId_(JM_EDIT_ID);
  const label = b ? (b.tahap + (b.namaLine ? " " + b.namaLine : "") + " " + jmTanggalPendek_(b.mulai) + "\u2013" + jmTanggalPendek_(b.selesai)) : JM_EDIT_ID;
  if (!window.confirm("Hapus jadwal " + label + "?")) return;
  jmFormSibuk_(true);
  jmFormPesan_("Menghapus...");
  const id = JM_EDIT_ID;
  const periksaHapus = function (baru) {
    return (baru.bar || []).some(function (b) { return b.id === id; }) ? "" : "Jadwal dihapus.";
  };
  jmKirim_("hapusJadwalManual", { id: id }, function () {
    JM_DATA.bar = (JM_DATA.bar || []).filter(function (x) { return x.id !== id; });
    jmSinkronItems_();
    JM_EDIT_ID = "";
    jmFormModeTampil_();
    jmIsiFilter_();
    jmRender();
    jmFormPesan_("Jadwal dihapus.");
    jmFormItemBerubah();
  }, periksaHapus, "hapus " + label);
}

/**
 * v217. Satu pintu untuk semua permintaan yang MENGUBAH data, supaya pesan
 * kegagalannya jujur.
 *
 * Versi sebelumnya memakai satu `.catch()` di ujung rantai. Masalahnya,
 * `.catch()` juga menangkap error yang terjadi SESUDAH server berhasil
 * menyimpan (saat memperbarui tampilan) -- dan pesannya berbunyi "Gagal
 * menghubungi server". Orang lalu menekan Simpan lagi, dan barisnya
 * bertambah. Persis itu yang terjadi 1 Sep 2026: tiga klik, tiga baris.
 *
 * Sekarang dibedakan tiga keadaan:
 *   1. Server menjawab "tidak boleh/tidak sah"  -> tampilkan alasannya
 *   2. Server berhasil, tampilan gagal diperbarui -> katakan SUDAH tersimpan,
 *      lalu muat ulang datanya
 *   3. Jawaban tidak sampai / tidak terbaca      -> katakan hasilnya TIDAK
 *      DIKETAHUI dan minta Muat ulang, JANGAN menyuruh mencoba lagi
 */
function jmKirim_(action, muatan, saatBerhasil, periksa, label) {
  const badan = Object.assign({ idToken: JM_ID_TOKEN, action: action }, muatan || {});
  fetch(JM_API_URL, { method: "POST", body: JSON.stringify(badan) })
    .then(function (r) { return r.text(); })
    .then(function (teks) {
      let res;
      try {
        res = JSON.parse(teks);
      } catch (eParse) {
        // Bukan JSON -> hampir selalu halaman HTML dari Google (sesi habis,
        // izin, atau deployment lama). Potongan awalnya ikut ditampilkan
        // supaya bisa dikenali tanpa membuka alat pengembang.
        throw new Error("jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 90));
      }
      jmFormSibuk_(false);
      if (!res || !res.success) {
        jmFormPesan_((res && res.error) || "Permintaan ditolak server.", true);
        return;
      }
      // ---- server SUDAH mengerjakan. Kegagalan di bawah ini bukan soal server.
      try {
        saatBerhasil(res);
      } catch (eUi) {
        jmFormPesan_("Tersimpan di server, tapi tampilan gagal diperbarui. Memuat ulang...", false);
        JM_EDIT_ID = "";
        jmFormModeTampil_();
        jmAmbilData_().then(jmTerapkanData_).catch(function () {});
      }
    })
    .catch(function (e) {
      // v217.1: JAWABAN TIDAK SAMPAI -> JANGAN MENYERAH, PERIKSA.
      //
      // "Failed to fetch" dari Apps Script hampir selalu berarti permintaan
      // SUDAH dikerjakan tapi jawabannya hilang di jalan (1 Sep 2026: tiga
      // klik, tiga baris, tiga kali "gagal"). Kalau halaman cuma bilang
      // "tidak diketahui", orang tetap harus menebak. Jadi halaman membaca
      // ulang data dari server -- jalur baca terbukti sampai -- lalu melihat
      // sendiri apakah perubahannya sudah ada. Yang dilaporkan ke orang
      // adalah KENYATAAN di sheet, bukan nasib satu paket HTTP.
      const sebab = (e && e.message) ? e.message : "sambungan terputus";
      if (typeof periksa !== "function") {
        jmFormSibuk_(false);
        jmFormPesan_("Hasilnya TIDAK DIKETAHUI (" + sebab + "). Klik Muat ulang untuk memeriksa.", true);
        return;
      }
      // v219: tidak lagi "jawaban tidak sampai" dengan huruf besar. Ini
      // kejadian biasa (lihat catatan v219 di simpro-global.js), dan orang
      // tidak perlu tahu mekanismenya -- cukup tahu hasil akhirnya benar.
      jmFormPesan_("Menyimpan... memastikan ke sheet.");
      if (window.console && console.info) console.info("[jadwal] jawaban simpan tidak terbaca (" + sebab + "); memastikan lewat baca ulang.");
      jmAmbilData_()
        .then(function (data) {
          jmFormSibuk_(false);
          jmTerapkanData_(data);
          const hasil = periksa(data);
          if (hasil) {
            JM_EDIT_ID = "";
            jmFormModeTampil_();
            jmFormPesan_(hasil);
            document.getElementById("jm-in-qty").value = "";
            document.getElementById("jm-in-ket").value = "";
            jmFormItemBerubah();
          } else {
            jmFormPesan_("TIDAK tersimpan (dipastikan dengan membaca ulang sheet). Sebab: " + sebab +
              ". Coba Simpan sekali lagi; kalau berulang, kirim pesan ini ke admin.", true);
          }
        })
        .catch(function () {
          // v226: benar-benar tanpa sambungan -> masuk kotak keluar.
          jmFormSibuk_(false);
          JM_EDIT_ID = ""; jmFormModeTampil_();
          jmAntreanTambah_(action, muatan, label);
          jmFormPesan_("Tidak ada sambungan. Disimpan di antrean HP ini dan akan dikirim otomatis saat sinyal kembali.");
          document.getElementById("jm-in-qty").value = ""; document.getElementById("jm-in-ket").value = "";
          jmFormItemBerubah();
        });
    });
}

/** items (yang punya bar) diturunkan dari bar + itemAktif -- sama dengan cara backend menyusunnya. */
function jmSinkronItems_() {
  const peta = {};
  (JM_DATA.itemAktif || []).concat(JM_DATA.items || []).forEach(function (it) { peta[it.kunci] = it; });
  const dipakai = {};
  (JM_DATA.bar || []).forEach(function (b) { dipakai[b.item] = true; });
  JM_DATA.items = Object.keys(dipakai).map(function (k) { return peta[k]; }).filter(Boolean);
}

/** Geser jendela kalau bar yang baru disimpan berada di luar tampilan. */
function jmGulirKeBar_(bar) {
  const kolom = jmKolom_();
  const awal = kolom[0].iso, akhir = kolom[kolom.length - 1].iso;
  if (bar.mulai >= awal && bar.mulai <= akhir) return;
  JM_LIHAT.mulai = jmSenin_(jmTambahHari_(jmDariIso_(bar.mulai), -7));
  jmSimpanLihat_();
  jmRender();
}

function jmKelasSel_(k, hariIni, deadline) {
  const kelas = ["jm-sel"];
  if (k.hari === 0) kelas.push("jm-awal-minggu");
  if (k.iso === hariIni) kelas.push("jm-hari-ini");
  if (deadline && k.iso === deadline) kelas.push("jm-deadline");
  return kelas.join(" ");
}

function jmTanggalPendek_(iso) {
  const d = jmDariIso_(iso);
  return d.getDate() + " " + JM_BULAN[d.getMonth()];
}

function jmRenderInfo_(jumlahItem, jumlahBaris) {
  const el = document.getElementById("jm-rentang");
  if (!el || !JM_LIHAT.mulai) return;
  const a = JM_LIHAT.mulai, z = jmTambahHari_(a, JM_LIHAT.minggu * 7 - 2);
  el.innerHTML = jmTanggalPendek_(jmIso_(a)) + " \u2013 " + jmTanggalPendek_(jmIso_(z)) + " " + z.getFullYear() +
    (jumlahItem || JM_SEMBUNYI_TERAKHIR.length
      ? ' <span class="jm-rentang-sub">' + jumlahItem + ' item &#183; ' + jumlahBaris + ' baris' +
        (JM_SEMBUNYI_TERAKHIR.length
          ? ' &#183; <button type="button" class="jm-rentang-sembunyi" onclick="jmBukaPanelSembunyi_(event)" title="Lihat & pulihkan item yang disembunyikan">' +
            JM_SEMBUNYI_TERAKHIR.length + ' disembunyikan</button>'
          : '') + '</span>'
      : '');
}

// ---------- legenda ----------

function jmRenderLegenda_() {
  const el = document.getElementById("jm-legenda");
  if (!el) return;
  el.innerHTML = Object.keys(JM_KELAS_TAHAP).filter(function (t) { return t !== "Pola & Konsumsi"; }).map(function (t) {
    return '<span class="jm-leg"><span class="jm-swatch jm-t-' + JM_KELAS_TAHAP[t] + '"></span>' + jmEsc_(t) + '</span>';
  }).join("") +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-dl"></span>deadline PO</span>' +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-ini"></span>hari ini</span>' +
  // v256: rupa keadaan
  '<span class="jm-leg"><span class="jm-swatch jm-t-sewing jm-bar-rencana"></span>rencana (order request)</span>' +
  '<span class="jm-leg"><span class="jm-swatch jm-t-sewing jm-bar-batal"></span>batal</span>';
}

// ---------- mulai ----------

window.addEventListener("load", function () {
  jmRenderLegenda_();
  jmRenderAntrean_();
  // v215: klik sel bar = edit. Delegasi di wadah, bukan onclick per sel --
  // matriks bisa ribuan sel dan dirender ulang tiap geser.
  const wadah = document.getElementById("jm-matriks");
  if (wadah) wadah.addEventListener("click", function (ev) {
    // v246: sel NAMA item (bukan sel bar) membuka menu sembunyikan/fokus.
    const sel = ev.target.closest && ev.target.closest("td[data-kunci]");
    if (sel) { jmBukaMenuItem_(sel.getAttribute("data-kunci"), ev); return; }
    const td = ev.target.closest && ev.target.closest("td.jm-bar[data-id]");
    if (td && td.getAttribute("data-id")) jmEdit(td.getAttribute("data-id"));
  });
  // v246: menu tertutup oleh klik di luar / Escape; chip di bilah memulihkan satu item.
  document.addEventListener("click", function (ev) {
    const m = document.getElementById("jm-menu-item");
    if (m && !m.classList.contains("hidden") && !m.contains(ev.target) &&
        !(ev.target.closest && ev.target.closest("td[data-kunci]"))) jmTutupMenuItem_();
    // v247: panel pemulih tertutup oleh klik di luar dirinya dan di luar pil-nya.
    const p = document.getElementById("jm-panel-sembunyi");
    if (p && !p.classList.contains("hidden") && !p.contains(ev.target) &&
        !(ev.target.closest && ev.target.closest(".jm-rentang-sembunyi"))) jmTutupPanelSembunyi_();
    // v254/v255: panel pilih (tahap, klien, line)
    ["tahap", "klien", "line", "keadaan"].forEach(function (j) {
      const pt = document.getElementById("jm-panel-" + j);
      if (pt && !pt.classList.contains("hidden") && !pt.contains(ev.target) &&
          !(ev.target.closest && ev.target.closest("#jm-f-" + j))) pt.classList.add("hidden");
    });
    const chip = ev.target.closest && ev.target.closest(".jm-sembunyi-chip[data-kunci]");
    if (chip) jmTampilkanItem(chip.getAttribute("data-kunci"));
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    // v251: bertingkat. Esc pertama menutup apa pun yang melayang (menu item,
    // panel pemulih, modal); kalau tidak ada yang melayang, Esc keluar fokus.
    const mi = document.getElementById("jm-menu-item");
    const ps = document.getElementById("jm-panel-sembunyi");
    const pt = ["tahap", "klien", "line", "keadaan"].map(function (j) { return document.getElementById("jm-panel-" + j); })
      .filter(function (p) { return p && !p.classList.contains("hidden"); })[0];
    const m = document.getElementById("jm-modal");
    const adaMelayang = (mi && !mi.classList.contains("hidden")) ||
      (ps && !ps.classList.contains("hidden")) || !!pt || (m && !m.classList.contains("hidden"));
    jmTutupMenuItem_(); jmTutupPanelSembunyi_(); jmTutupPanelPilih_();
    if (m && !m.classList.contains("hidden")) jmTutupForm();
    if (!adaMelayang && JM_FOKUS) jmFokus(false);
  });
  const sesi = jmBacaSesi_();
  if (sesi) { JM_ID_TOKEN = sesi; jmMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { jmShow("jm-login-box"); return; }
  google.accounts.id.initialize({ client_id: JM_OAUTH_CLIENT_ID, callback: jmHandleGoogleLogin });
  const t = document.getElementById("jm-google-btn");
  if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  jmShow("jm-login-box");
});
