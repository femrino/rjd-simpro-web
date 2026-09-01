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
  minggu: 6,          // jumlah minggu yang digambar
  klien: "",          // filter ID klien ("" = semua)
  line: "",           // filter ID line ("" = semua)
  sembunyiLewat: true, // sembunyikan item yang semua bar-nya sudah lewat
  tahap: "",           // v233: filter tahap ("" = semua). SARINGAN TINGKAT-BARIS,
                       // beda dengan line yang tingkat-item -- lihat catatan di
                       // jmRenderLaci_. Nilainya utama saat dipadukan mode tahap:
                       // "Per tahap + Cutting" = daftar kerja harian kepala cutting.
  mode: "artikel"      // v231: "artikel" (grup = item, baris = tahap) | "tahap" (dibalik)
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
}
function jmToggleLegenda() {
  const l = document.getElementById("jm-legenda");
  if (l) l.classList.toggle("jm-legenda-buka");
}

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
  let selT = document.getElementById("jm-f-tahap");
  if (!selT) {
    selT = document.createElement("select");
    selT.id = "jm-f-tahap"; selT.onchange = jmUbahFilter;
    const selM2 = document.getElementById("jm-f-minggu");
    if (selM2 && selM2.parentNode === laci) laci.insertBefore(selT, selM2.nextSibling);
    else laci.insertBefore(selT, laci.firstChild);
  }
  const daftarTahap = (JM_DATA && JM_DATA.tahap) || [];
  if (selT.options.length !== daftarTahap.length + 1) {
    const nilaiT = selT.value;
    selT.innerHTML = '<option value="">Semua tahap</option>' +
      daftarTahap.map(function (t) { return '<option value="' + jmEsc_(t) + '">' + jmEsc_(t) + '</option>'; }).join("");
    selT.value = (nilaiT && daftarTahap.indexOf(nilaiT) !== -1) ? nilaiT : (JM_LIHAT.tahap || "");
  }

  let btn = document.getElementById("jm-btn-laci");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "jm-btn-laci"; btn.type = "button"; btn.className = "jm-btn jm-btn-laci";
    btn.onclick = jmToggleLaci;
    laci.parentNode.insertBefore(btn, laci);
  }
  const n = (JM_LIHAT.klien ? 1 : 0) + (JM_LIHAT.line ? 1 : 0) + (JM_LIHAT.tahap ? 1 : 0);
  btn.innerHTML = "Filter" + (n ? ' <span class="jm-laci-lencana">' + n + "</span>" : "");

  // Pelipat legenda -- hidup hanya di layar sempit (diatur CSS).
  const legenda = document.getElementById("jm-legenda");
  if (legenda && !document.getElementById("jm-btn-legenda")) {
    const bl = document.createElement("button");
    bl.id = "jm-btn-legenda"; bl.type = "button"; bl.className = "jm-btn-legenda";
    bl.textContent = "Keterangan";
    bl.onclick = jmToggleLegenda;
    legenda.parentNode.insertBefore(bl, legenda);
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
    w.innerHTML = '<button type="button" data-mode="artikel" onclick="jmGantiMode(\'artikel\')">Per artikel</button>' +
                  '<button type="button" data-mode="tahap" onclick="jmGantiMode(\'tahap\')">Per tahap</button>';
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
  try {
    const raw = sessionStorage.getItem("jm_lihat");
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.mulai) JM_LIHAT.mulai = jmDariIso_(d.mulai);
    if (d.minggu) JM_LIHAT.minggu = Number(d.minggu) || 6;
    if (typeof d.klien === "string") JM_LIHAT.klien = d.klien;
    if (typeof d.line === "string") JM_LIHAT.line = d.line;
    if (typeof d.sembunyiLewat === "boolean") JM_LIHAT.sembunyiLewat = d.sembunyiLewat;
    if (typeof d.tahap === "string") JM_LIHAT.tahap = d.tahap;
  } catch (e) { /* abaikan */ }
}

function jmSimpanLihat_() {
  try {
    sessionStorage.setItem("jm_lihat", JSON.stringify({
      mulai: JM_LIHAT.mulai ? jmIso_(JM_LIHAT.mulai) : null,
      minggu: JM_LIHAT.minggu, klien: JM_LIHAT.klien, line: JM_LIHAT.line,
      sembunyiLewat: JM_LIHAT.sembunyiLewat, tahap: JM_LIHAT.tahap
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
  const selK = document.getElementById("jm-f-klien");
  const selL = document.getElementById("jm-f-line");
  if (selK) {
    const klien = {};
    (JM_DATA.items || []).forEach(function (it) { klien[it.idKlien] = it.namaKlien || it.idKlien; });
    selK.innerHTML = '<option value="">Semua klien</option>' +
      Object.keys(klien).sort(function (a, b) { return String(klien[a]).localeCompare(String(klien[b])); })
        .map(function (id) { return '<option value="' + jmEsc_(id) + '">' + jmEsc_(klien[id]) + '</option>'; }).join("");
    selK.value = JM_LIHAT.klien;
    if (selK.value !== JM_LIHAT.klien) { JM_LIHAT.klien = ""; selK.value = ""; }
  }
  if (selL) {
    selL.innerHTML = '<option value="">Semua line</option>' +
      (JM_DATA.lines || []).map(function (l) {
        return '<option value="' + jmEsc_(l.idLine) + '">' + jmEsc_(l.namaLine) + '</option>';
      }).join("");
    selL.value = JM_LIHAT.line;
    if (selL.value !== JM_LIHAT.line) { JM_LIHAT.line = ""; selL.value = ""; }
  }
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
  JM_LIHAT.klien = (document.getElementById("jm-f-klien") || {}).value || "";
  JM_LIHAT.tahap = (document.getElementById("jm-f-tahap") || {}).value || "";
  JM_LIHAT.line = (document.getElementById("jm-f-line") || {}).value || "";
  JM_LIHAT.minggu = Number((document.getElementById("jm-f-minggu") || {}).value) || 6;
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
  if (!p.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = '<b>' + p.length + ' baris di sheet tidak bisa digambar</b> -- perbaiki di "SD Jadwal Produksi":' +
    '<ul>' + p.map(function (x) {
      return '<li>Baris ' + x.baris + (x.item ? ' <span class="jm-mono">' + jmEsc_(x.item) + '</span>' : '') +
        (x.tahap ? ' (' + jmEsc_(x.tahap) + ')' : '') + ': ' + jmEsc_(x.pesan) + '</li>';
    }).join("") + '</ul>';
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
    const it = petaItem[b.item];
    if (!it) return;
    if (JM_LIHAT.klien && it.idKlien !== JM_LIHAT.klien) return;
    if (!grup[b.item]) grup[b.item] = { item: it, bar: [], mulaiMin: b.mulai, selesaiMax: b.selesai };
    grup[b.item].bar.push(b);
    if (b.mulai < grup[b.item].mulaiMin) grup[b.item].mulaiMin = b.mulai;
    if (b.selesai > grup[b.item].selesaiMax) grup[b.item].selesaiMax = b.selesai;
  });

  return Object.keys(grup).map(function (k) { return grup[k]; })
    .filter(function (g) {
      if (JM_LIHAT.sembunyiLewat && g.selesaiMax < hariIni) return false;
      // Filter line: tampilkan item yang punya bar Sewing di line itu.
      if (JM_LIHAT.line && !g.bar.some(function (b) { return b.line === JM_LIHAT.line; })) return false;
      // v233: filter tahap -- item tanpa satu pun bar tahap itu ikut hilang,
      // supaya tidak ada judul item yang menggantung tanpa baris.
      if (JM_LIHAT.tahap && !g.bar.some(function (b) { return b.tahap === JM_LIHAT.tahap; })) return false;
      return true;
    })
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
    const it = petaItem[b.item]; if (!it) return;
    if (JM_LIHAT.klien && it.idKlien !== JM_LIHAT.klien) return;
    (barPerItem[b.item] = barPerItem[b.item] || []).push(b);
  });
  const itemLolos = {};
  Object.keys(barPerItem).forEach(function (k) {
    if (JM_LIHAT.line && !barPerItem[k].some(function (b) { return b.line === JM_LIHAT.line; })) return;
    itemLolos[k] = true;
  });

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
          if (JM_LIHAT.line && b.line !== JM_LIHAT.line) return;
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
    .filter(function (g) { return !JM_LIHAT.tahap || g.tahap === JM_LIHAT.tahap; });   // v233
}

/** Baris-baris matriks untuk satu grup: satu per tahap; Sewing satu per line. */
function jmBarisGrup_(g) {
  const urutan = JM_DATA.tahap || Object.keys(JM_KELAS_TAHAP);
  const baris = [];
  urutan.forEach(function (tahap) {
    if (JM_LIHAT.tahap && tahap !== JM_LIHAT.tahap) return;   // v233
    const bars = g.bar.filter(function (b) { return b.tahap === tahap; });
    if (!bars.length) return;
    if (tahap === "Sewing") {
      const perLine = {};
      bars.forEach(function (b) { (perLine[b.line] = perLine[b.line] || []).push(b); });
      Object.keys(perLine).sort().forEach(function (idLine) {
        if (JM_LIHAT.line && idLine !== JM_LIHAT.line) return;
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
  return baris;
}

/** v231: sel-sel tanggal untuk SATU baris bar. Dipakai kedua mode. */
function jmSelBaris_(b, kolom, hariIni, deadline) {
  let html = "";
  kolom.forEach(function (k) {
    const kelas = jmKelasSel_(k, hariIni, deadline);
    const bar = b.bar.filter(function (x) { return x.mulai <= k.iso && k.iso <= x.selesai; });
    if (!bar.length) { html += '<td class="' + kelas + '"></td>'; return; }
    const x = bar[0];
    const tepi = (x.mulai === k.iso ? " jm-bar-awal" : "") + (x.selesai === k.iso ? " jm-bar-akhir" : "");
    const tip = b.label + (b.sub ? " " + b.sub : "") + ": " + jmTanggalPendek_(x.mulai) + " - " + jmTanggalPendek_(x.selesai) +
      (x.qty ? " \u00b7 " + x.qty + " pcs" : "") + (x.keterangan ? "\n" + x.keterangan : "");
    html += '<td class="' + kelas + ' jm-bar jm-t-' + (JM_KELAS_TAHAP[b.tahap] || "lain") + tepi + (x.menunggu ? " jm-bar-menunggu" : "") +
      '" data-id="' + jmEsc_(x.id || "") + '" title="' + jmEsc_(tip) + (x.id ? "\n(klik untuk mengubah)" : "") + '"></td>';
  });
  return html;
}

function jmRenderMatriks_() {
  const wadah = document.getElementById("jm-matriks");
  if (!JM_DATA.sheetAda) { wadah.innerHTML = ""; jmRenderInfo_(0, 0); return; }

  const kolom = jmKolom_();
  const modeTahap = JM_LIHAT.mode === "tahap";
  const grup = modeTahap ? jmKelompokTahap_() : jmKelompok_();
  const hariIni = JM_DATA.hariIni;

  if (!grup.length) {
    wadah.innerHTML = '<div class="jm-kartu"><p class="jm-info">' +
      ((JM_DATA.bar || []).length
        ? 'Tidak ada item yang cocok dengan filter ini.'
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
        tbody += '<tr class="jm-r-tahap"><td class="jm-sticky jm-td-tahap jm-td-tahap-item">' +
          '<div class="jm-item-nama-kecil">' + jmEsc_(b.label) +
            (b.sub ? ' <span class="jm-tahap-sub">' + jmEsc_(b.sub) + '</span>' : '') + '</div>' +
          '<div class="jm-item-meta-kecil"><span class="jm-klien">' + jmEsc_(it.namaKlien || it.idKlien) + ' </span><span class="jm-mono">' + jmEsc_(it.po) + '</span>' +
            (it.deadline ? ' \u00b7 <span class="jm-dl' + (dlLewat ? ' jm-dl-lewat' : '') + '">' + jmTanggalPendek_(it.deadline) + '</span>' : '') +
          '</div></td>' + jmSelBaris_(b, kolom, hariIni, it.deadline) + '</tr>';
      });
      if (gi < grup.length - 1) tbody += '<tr class="jm-r-pisah"><td colspan="' + (kolom.length + 1) + '"></td></tr>';
    });
    wadah.innerHTML = '<div class="jm-gulir"><table class="jm-tabel"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
    jmRenderInfo_(Object.keys(itemUnik).length, jumlahBaris);
    return;
  }

  grup.forEach(function (g, gi) {
    const it = g.item;
    const baris = jmBarisGrup_(g);
    const deadlineLewat = it.deadline && it.deadline < hariIni;

    // Baris judul item
    const judul = [it.artikel, it.style].filter(String).join(" ");
    tbody += '<tr class="jm-r-item">' +
      '<td class="jm-sticky jm-td-item">' +
        '<div class="jm-item-nama">' + jmEsc_(judul || it.po) + '</div>' +
        '<div class="jm-item-meta">' + jmEsc_(it.namaKlien || it.idKlien) +
          ' <span class="jm-mono">' + jmEsc_(it.po) + '</span>' +
          (it.qtyPo ? ' &#183; ' + it.qtyPo.toLocaleString("id-ID") + ' pcs' : '') +
          (it.deadline ? ' &#183; <span class="jm-dl' + (deadlineLewat ? ' jm-dl-lewat' : '') + '">deadline ' +
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
          ' \u00b7 ' + jmEsc_(it.po) + (it.qtyPo ? ' (' + it.qtyPo + ' pcs)' : '') + '</option>';
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
  const w = document.getElementById("jm-form-wrap");
  if (w) { w.open = true; w.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

function jmFormModeTampil_() {
  const edit = !!JM_EDIT_ID;
  const j = document.getElementById("jm-form-judul");
  if (j) j.textContent = edit ? "Ubah jadwal" : "Tambah jadwal";
  const h = document.getElementById("jm-btn-hapus");
  if (h) h.classList.toggle("hidden", !edit);
  const c = document.getElementById("jm-btn-batal");
  if (c) c.classList.toggle("hidden", !edit);
  const w = document.getElementById("jm-form-wrap");
  if (w) w.classList.toggle("jm-mode-edit", edit);
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
    (jumlahItem ? ' <span class="jm-rentang-sub">' + jumlahItem + ' item &#183; ' + jumlahBaris + ' baris</span>' : '');
}

// ---------- legenda ----------

function jmRenderLegenda_() {
  const el = document.getElementById("jm-legenda");
  if (!el) return;
  el.innerHTML = Object.keys(JM_KELAS_TAHAP).filter(function (t) { return t !== "Pola & Konsumsi"; }).map(function (t) {
    return '<span class="jm-leg"><span class="jm-swatch jm-t-' + JM_KELAS_TAHAP[t] + '"></span>' + jmEsc_(t) + '</span>';
  }).join("") +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-dl"></span>deadline PO</span>' +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-ini"></span>hari ini</span>';
}

// ---------- mulai ----------

window.addEventListener("load", function () {
  jmRenderLegenda_();
  jmRenderAntrean_();
  // v215: klik sel bar = edit. Delegasi di wadah, bukan onclick per sel --
  // matriks bisa ribuan sel dan dirender ulang tiap geser.
  const wadah = document.getElementById("jm-matriks");
  if (wadah) wadah.addEventListener("click", function (ev) {
    const td = ev.target.closest && ev.target.closest("td.jm-bar[data-id]");
    if (td && td.getAttribute("data-id")) jmEdit(td.getAttribute("data-id"));
  });
  const sesi = jmBacaSesi_();
  if (sesi) { JM_ID_TOKEN = sesi; jmMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { jmShow("jm-login-box"); return; }
  google.accounts.id.initialize({ client_id: JM_OAUTH_CLIENT_ID, callback: jmHandleGoogleLogin });
  const t = document.getElementById("jm-google-btn");
  if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  jmShow("jm-login-box");
});
