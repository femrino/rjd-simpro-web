/**
 * ============================================================
 * SIMPRO -- simpro-kas  (v225)
 * ============================================================
 * BUKU KAS & BANK (kas.html) -- tahap 1 sistem keuangan.
 *
 * Halaman ini hanya MENCATAT dan MENAMPILKAN; semua aturan (kategori sah,
 * bulan tertutup, siapa boleh apa) ada di keuangan-kas.gs. Kas masuk dari
 * klien tidak diketik di sini -- dibaca backend dari SD Pelunasan.
 *
 * Bagian: saldo per akun -> form catat -> buku kas bulan -> arus kas 6 bulan
 * -> rekonsiliasi & tutup bulan (finance).
 *
 * DIMUAT DI : kas.html. URUTAN: simpro-global.js WAJIB lebih dulu.
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const KS_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const KS_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let KS_ID_TOKEN = null;
let KS_DATA = null;
let KS_BULAN = null;          // "yyyy-MM" yang sedang dilihat
let KS_BUKTI = null;          // { base64, mime, nama } foto yang siap dikirim
let KS_SIBUK = false;
// @K14: mode koreksi. Berisi {id, bukti, tanggal} baris yang sedang dikoreksi; null = form
// biasa. `let` tingkat atas, BUKAN window.* -- lihat aturan PF-1b di CLAUDE.md.
let KS_KOREKSI = null;
// @K14b: foto yang dipilih di panel pensil (sudah diperkecil). Direset tiap panel dibuka.
let KS_UBAH_FOTO = null;
// @K15: keadaan filter buku kas. `bulan` mencatat bulan yang rentang tanggalnya dipasang,
// supaya rentang itu dibuang saat bulan berganti (ia terikat bulan yang dibuka).
let KS_SARING = { q: "", arah: "", akun: "", kat: "", dari: "", sampai: "", sembunyi: false, bulan: null };

const KS_BULAN_NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KS_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ---------- util ----------
function ksEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function") ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/**
 * @K16 (v360): rupiah DENGAN sen. Sampai v359 tiga lapis membulatkan ke rupiah utuh, dan
 * parsernya membuang koma -- "12,34" terkirim sebagai 1234 tanpa peringatan. Sen dibutuhkan
 * karena saldo rekening bank bersen; tanpa itu selisih rekonsiliasi tidak pernah 0.
 * Server @385 menyimpan 2 desimal (ksRp_ / ksBulat2_).
 *
 * Tiga fungsi, satu format: ksRp untuk TAMPILAN ("1.234,56"; bilangan bulat tanpa ",00"),
 * ksParseRp_ untuk MEMBACA ketikan format Indonesia (titik = ribuan, koma = desimal),
 * ksRpIsian_ untuk MENGISI kotak dari angka ("1234,56" -- tanpa titik ribuan, karena
 * parser membuang titik). Menaruh String(12.34) ke kotak = "12.34" = terbaca 1234.
 */
function ksRp(n) {
  n = Math.round((Number(n) || 0) * 100) / 100;
  const sen = Math.abs(n) % 1 !== 0;
  return (n < 0 ? "\u2212" : "") + Math.abs(n).toLocaleString("id-ID", { minimumFractionDigits: sen ? 2 : 0, maximumFractionDigits: 2 });
}
/**
 * @K17 WK-1/2/6 (v361): tata bahasa KETAT -- bentuk yang tidak dikenal DITOLAK (NaN), bukan
 * ditebak. Parser v360 membuang titik selalu dan membulatkan sen berlebih, jadi tiga ketikan
 * wajar berubah nilai TANPA pesan: "12.50" (keypad HP ber-locale English cuma punya titik)
 * -> Rp 1.250; "12,345" (keypad locale Indonesia cuma punya koma) -> Rp 12,35; dan "\u2212500"
 * -- tanda minus yang dihasilkan ksRp SENDIRI -- -> +500. Yang diterima sekarang:
 *   a. desimal-titik yang tidak mungkin ribuan: satu titik, 1-2 digit di akhir  ("12.5", "1234.56")
 *   b. bentuk Indonesia: ribuan bertitik (opsional), sen koma 1-2 digit, atau ",-"  ("2.769.500,50")
 * Pemanggil WAJIB memeriksa isNaN dan menampilkan ksGalatRp_ -- NaN yang diteruskan ke JSON
 * menjadi null dan server membacanya 0.
 */
function ksParseRp_(v) {
  let t = String(v === null || v === undefined ? "" : v).trim().replace(/\u2212/g, "-").replace(/^Rp\s*/i, "").replace(/\s+/g, "");
  if (t === "") return 0;
  if (/^-?\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t) * 100) / 100;
  if (!/^-?(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2}|,-)?$/.test(t)) return NaN;
  const neg = t.charAt(0) === "-"; if (neg) t = t.slice(1);
  const bagian = t.replace(/,-$/, "").split(","), utuh = bagian[0].replace(/\./g, ""), sen = (bagian[1] || "").padEnd(2, "0");
  const n = Number(utuh) + Number(sen) / 100;
  return Math.round((neg ? -n : n) * 100) / 100;
}
/** Pesan untuk ketikan yang ditolak ksParseRp_ -- menyebut ketikannya dan bentuk yang benar. */
function ksGalatRp_(ketikan) {
  const k = String(ketikan === null || ketikan === undefined ? "" : ketikan).trim();
  if (/,\d{3,}$/.test(k)) return "Sen hanya 2 digit. Untuk ribuan pakai titik: 12.345 (yang diketik: '" + k + "').";
  return "Jumlah '" + k + "' tidak terbaca. Titik untuk ribuan, koma untuk sen: 2.769.500,50";
}
function ksRpIsian_(n) { n = Math.round((Number(n) || 0) * 100) / 100; return String(n).replace(".", ","); }
function ksTgl(iso) { if (!iso) return ""; const p = iso.split("-"); return Number(p[2]) + " " + KS_BULAN_PENDEK[Number(p[1]) - 1]; }
function ksNamaBulan(b) { const p = b.split("-"); return KS_BULAN_NAMA[Number(p[1]) - 1] + " " + p[0]; }
function ksGeserBulan(b, n) { const y = Number(b.slice(0, 4)), m = Number(b.slice(5, 7)) - 1 + n; const d = new Date(y, m, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function ksShow(id) {
  ["ks-login-box", "ks-loading", "ks-isi"].forEach(function (x) { const el = document.getElementById(x); if (el) el.classList.add("hidden"); });
  const t = document.getElementById(id); if (t) t.classList.remove("hidden");
}
function ksNamaAkun(kode) {
  const a = (KS_DATA && KS_DATA.akun || []).filter(function (x) { return x.kode === kode; })[0];
  return a ? a.nama : kode;
}

// ---------- sesi (pola sama dengan jadwal/upah) ----------
function ksBacaSesi_() {
  try { const raw = localStorage.getItem("db_session"); if (!raw) return null; const d = JSON.parse(raw); if (!d.exp || d.exp * 1000 <= Date.now()) return null; return d.token; } catch (e) { return null; }
}
function ksSimpanSesi_(token) {
  try { const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp })); } catch (e) { /* private mode */ }
}
function ksHandleGoogleLogin(response) { KS_ID_TOKEN = response.credential; ksSimpanSesi_(response.credential); ksMulai(); }
function ksLogout() {
  KS_ID_TOKEN = null; try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("ks-nav-logout"); if (b) b.classList.add("hidden");
  ksShow("ks-login-box");
}
function ksMulai() { if (typeof rjdJagaHalaman === "function") rjdJagaHalaman(KS_ID_TOKEN, KS_API_URL, ksMulaiIsi_); else ksMulaiIsi_(); }
function ksMulaiIsi_() {
  const b = document.getElementById("ks-nav-logout"); if (b) b.classList.remove("hidden");
  ksShow("ks-loading"); ksMuatPertama_();
}

// ---------- API ----------
function ksKirim_(action, muatan) {
  return fetch(KS_API_URL, { method: "POST", body: JSON.stringify(Object.assign({ idToken: KS_ID_TOKEN, action: action }, muatan || {})) })
    .then(function (r) { return r.text(); })
    .then(function (teks) {
      let d; try { d = JSON.parse(teks); } catch (e) { throw new Error("jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 80)); }
      if (!d || !d.success) throw new Error((d && d.error) || "Permintaan ditolak server.");
      return d;
    });
}
/* v228 -- SNAPSHOT LOKAL (Tipe B), khusus buku kas.
   Uang menuntut kehati-hatian lebih daripada daftar produksi: snapshot di sini
   HANYA dipakai oleh pemuatan pertama halaman (ksMulaiIsi_), TIDAK PERNAH oleh
   ksMuat() yang dipanggil ulang sesudah menyimpan transaksi, membatalkan, atau
   menutup bulan. Menampilkan saldo lama sesaat sesudah orang mencatat uang
   keluar adalah cara tercepat membuat orang mencatatnya dua kali.
   Kuncinya memuat BULAN supaya bulan berbeda tidak saling menimpa. */
var KS_SUDAH_SEGAR = false;
/* v229: umur snapshot halaman uang dipendekkan dari 3 hari jadi 1 hari.
   Daftar produksi yang basi cuma bikin orang menyegarkan; saldo kas yang basi
   bisa jadi dasar keputusan. Ubah angka ini ke 8 * 60 kalau ingin snapshot
   selalu mati semalam. */
var KS_SNAP_UMUR_MENIT = 24 * 60;
/* Waktu snapshot yang SEDANG ditampilkan -- dipakai bilah versi gagal. */
var KS_SNAP_WAKTU = null;

function ksMuatPertama_() {
  // v229r2: bulan yang DIMINTA dicatat SEBELUM snapshot menyentuh KS_BULAN.
  // Tanpa ini, membuka halaman tanggal 1 sesudah terakhir dipakai bulan lalu
  // akan meminta BULAN LALU ke server -- diam-diam, di halaman uang. `null`
  // berarti "biar server yang pilih bulan berjalan" (lihat ksMuat).
  var bulanDiminta = KS_BULAN || null;

  if (!KS_SUDAH_SEGAR && typeof rjdSnapshotBaca_ === "function") {
    // v229r2: KUNCINYA TETAP, bukan per bulan.
    //
    // v228 menyimpan dengan kunci "kas_<bulan>" (mis. kas_2026-09) tapi
    // MEMBACANYA dengan "kas_" + (KS_BULAN || "kini") -- dan pada pemuatan
    // pertama KS_BULAN masih null, karena bulan berjalan baru diketahui dari
    // jawaban server. Jadi yang dicari selalu "kas_kini", yang tidak pernah
    // ditulis. Snapshot kas TIDAK PERNAH kena sejak v228; halaman ini selalu
    // menunggu satu bolak-balik penuh, dan itulah "Memuat buku kas..." yang
    // tidak kunjung hilang.
    //
    // Kunci per bulan juga tidak ada gunanya: satu-satunya pembaca snapshot
    // adalah pemuatan pertama, dan ksGeser() sengaja tidak memakai snapshot.
    var snap = rjdSnapshotBaca_("kas_terakhir", KS_SNAP_UMUR_MENIT);
    if (snap && snap.data && snap.data.akun) {
      KS_DATA = snap.data; KS_BULAN = snap.data.bulan; KS_SNAP_WAKTU = snap.waktu;
      ksShow("ks-isi"); ksRender();
      // v229: bilah ditaruh di #ks-saldo, BUKAN #ks-buku. Penangan galat
      // ksMuat menimpa seluruh isi #ks-buku -- dulu bilahnya ikut terhapus
      // justru saat paling dibutuhkan, sementara kartu saldo di #ks-saldo
      // tetap memajang angka lama tanpa keterangan apa pun.
      if (typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("ks-saldo", snap.waktu);
    }
  }
  return ksMuat(bulanDiminta);
}

/* @K17 WK-5 (v362) -- DUA cacat di jalur baca-ulang SESUDAH tulis:
   (1) dua transaksi berurutan cepat = dua getKas berlomba, dan jawaban PERTAMA bisa datang
       TERAKHIR lalu menimpa KS_DATA dengan keadaan yang lebih tua. Tiap permintaan diberi nomor
       urut; jawaban yang bukan milik permintaan terbaru DIBUANG (sukses maupun gagal).
   (2) tulis sukses lalu getKas gagal 3x: kartu saldo, arus kas dan rekonsiliasi tetap memajang
       angka SEBELUM transaksi tanpa tanda apa pun (bilah snapshot tidak dipasang karena
       KS_SNAP_WAKTU sudah null sejak pemuatan segar pertama). KS_PRA_TULIS menyala begitu ada
       baca-ulang sesudah tulis dan baru padam oleh pemuatan yang BERHASIL -- bulan mana pun,
       karena jawaban segar mana pun sudah memuat transaksinya.
   Keduanya `let` tingkat atas: BUKAN properti window (lihat PF-1b), dibaca dengan nama polos. */
let KS_MUAT_URUT = 0;
let KS_PRA_TULIS = false;

function ksBilahPraTulis_(pasang) {
  let bar = document.getElementById("ks-pra-tulis");
  if (!pasang) { if (bar) bar.remove(); return; }
  // Di LUAR #ks-saldo: ksRenderSaldo_ menulis ulang isinya, bilah ini tidak boleh ikut hilang.
  const saldo = document.getElementById("ks-saldo"); if (!saldo || !saldo.parentNode) return;
  if (!bar) { bar = document.createElement("div"); bar.id = "ks-pra-tulis"; bar.className = "ks-pra-tulis"; saldo.parentNode.insertBefore(bar, saldo); }
  // Kalimatnya sengaja TIDAK berkata "sudah tercatat": jalur jawaban-hilang juga lewat sini, dan di
  // sana belum diketahui apakah servernya menulis. Yang pasti cuma: angka di bawah belum disegarkan.
  bar.innerHTML = '<b>Daftar gagal dimuat ulang sesudah perubahan terakhir.</b> Saldo, arus kas dan rekonsiliasi di bawah ini angka dari SEBELUM-nya -- jangan mencatat ulang sebelum memuat ulang. ' +
    '<button id="ks-pra-tulis-muat" class="ks-btn ks-btn-kecil-netral" type="button" onclick="ksMuat(KS_BULAN, { sesudahTulis: true })">Muat ulang</button>';
}

function ksMuat(bulan, opsi) {
  const urut = ++KS_MUAT_URUT;
  if (opsi && opsi.sesudahTulis) KS_PRA_TULIS = true;
  // v229r2: `null` EKSPLISIT = jangan pakai KS_BULAN, biar server memilih bulan
  // berjalan. Dibutuhkan karena snapshot sudah mengisi KS_BULAN dengan bulan
  // terakhir yang dilihat, dan itu belum tentu bulan sekarang. Pemanggil lama
  // (ksMuat(), ksMuat(KS_BULAN), ksMuat(ksGeserBulan(...))) tidak berubah.
  return ksKirim_("getKas", { bulan: (bulan === null ? undefined : (bulan || KS_BULAN || undefined)) })
    .then(function (d) {
      if (urut !== KS_MUAT_URUT) return;   // @K17 WK-5: jawaban permintaan yang sudah disusul
      KS_DATA = d; KS_BULAN = d.bulan; ksShow("ks-isi"); ksRender();
      KS_SUDAH_SEGAR = true; KS_SNAP_WAKTU = null;
      KS_PRA_TULIS = false; ksBilahPraTulis_(false);
      if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("kas_terakhir", d);
      if (typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("ks-saldo");
    })
    .catch(function (e) {
      if (urut !== KS_MUAT_URUT) return;   // @K17 WK-5
      ksShow("ks-isi");
      if (KS_PRA_TULIS) ksBilahPraTulis_(true);
      document.getElementById("ks-buku").innerHTML = '<div class="ks-kartu"><p class="ks-galat">' + ksEsc_(e.message || "Gagal memuat.") + '</p></div>';
      // v229: kalau yang tampil di atas adalah SALDO TERSIMPAN, katakan begitu.
      // ksRender menulis ulang #ks-saldo, jadi bilahnya dipasang SESUDAH ini.
      if (KS_SNAP_WAKTU && typeof rjdSnapshotBarGagal_ === "function") {
        rjdSnapshotBarGagal_("ks-saldo", KS_SNAP_WAKTU);
      }
    });
}

// ---------- render ----------
function ksRender() {
  ksRenderSaldo_(); ksRenderForm_(); ksRenderBulan_(); ksPasangSaring_(); ksRenderBuku_(); ksRenderArus_(); ksRenderRekon_(); ksRenderPeringatan_();
}

function ksRenderSaldo_() {
  const el = document.getElementById("ks-saldo"); if (!el) return;
  const d = KS_DATA; let total = 0;
  el.innerHTML = (d.akun || []).filter(function (a) { return a.aktif; }).map(function (a) {
    const s = d.saldo[a.kode] || 0; total += s;
    return '<div class="ks-saldo-kartu"><div class="ks-saldo-lbl">' + ksEsc_(a.nama) + '</div><div class="ks-saldo-nilai' + (s < 0 ? ' ks-minus' : '') + '">Rp ' + ksRp(s) + '</div></div>';
  }).join("") + '<div class="ks-saldo-kartu ks-saldo-total"><div class="ks-saldo-lbl">Total uang usaha</div><div class="ks-saldo-nilai">Rp ' + ksRp(total) + '</div></div>';
  const info = document.getElementById("ks-saldo-info");
  if (info) info.innerHTML = d.adaSaldoAwal ? 'Saldo per hari ini, ' + ksEsc_(ksTgl(d.hariIni)) + ' ' + d.hariIni.slice(0, 4) + '.'
    : '<b>Saldo awal belum diisi.</b> Catat saldo tiap akun per ' + ksEsc_(ksTgl(d.tanggalMulai)) + ' ' + d.tanggalMulai.slice(0, 4) + ' lewat form di bawah (arah "Saldo Awal", hanya owner/finance).';
}

function ksRenderForm_() {
  // @K16: keyboard HP "numeric" tidak punya tombol koma; atributnya hidup di template, jadi
  // propertinya yang disetel dari sini (pola oninput #sp-riw-cari, CLAUDE.md).
  const kJumlah = document.getElementById("ks-in-jumlah"); if (kJumlah) kJumlah.inputMode = "decimal";
  const d = KS_DATA;
  const selAkun = document.getElementById("ks-in-akun"), selTujuan = document.getElementById("ks-in-tujuan");
  const opsiAkun = (d.akun || []).filter(function (a) { return a.aktif; }).map(function (a) { return '<option value="' + ksEsc_(a.kode) + '">' + ksEsc_(a.nama) + '</option>'; }).join("");
  if (selAkun && !selAkun.options.length) selAkun.innerHTML = opsiAkun;
  if (selTujuan && !selTujuan.options.length) selTujuan.innerHTML = '<option value="">-- akun tujuan --</option>' + opsiAkun;
  const tgl = document.getElementById("ks-in-tanggal"); if (tgl && !tgl.value) tgl.value = d.hariIni;
  const saldoAwal = document.getElementById("ks-arah-saldoawal-wrap"); if (saldoAwal) saldoAwal.classList.toggle("hidden", !d.bisaFinance);
  ksFormArahBerubah();
}

/** Kategori mengikuti arah. Transfer: tanpa kategori, tampilkan akun tujuan. */
function ksFormArahBerubah() {
  const arah = (document.querySelector('input[name="ks-arah"]:checked') || {}).value || "Keluar";
  const wKat = document.getElementById("ks-in-kategori-wrap"), wTujuan = document.getElementById("ks-in-tujuan-wrap");
  const sel = document.getElementById("ks-in-kategori");
  const punyaKategori = arah === "Masuk" || arah === "Keluar";
  if (wKat) wKat.classList.toggle("hidden", !punyaKategori);
  if (wTujuan) wTujuan.classList.toggle("hidden", arah !== "Transfer");
  if (sel && KS_DATA) {
    ksPasangPanduanKategori_();
    const lama = sel.value;
    // @K13 KN-6: SEARAH, aktif saja, lalu URUT kolom Urutan (bukan urutan baris sheet).
    //
    // `k.aktif !== false` adalah lapis KEDUA, bukan penjaga utama: getKas_ sudah
    // menyaring (keuangan-kas.js) dan ksValidasi_ MENOLAK kategori nonaktif saat
    // simpan. Ia ditulis !== false, bukan === true, supaya server lama yang belum
    // mengirim medannya tidak diam-diam mengosongkan dropdown.
    //
    // Pembanding kedua (nama) bukan hiasan: 43 kategori memakai Urutan kelipatan 10
    // supaya ada ruang menyisipkan, dan dua baris berurutan sama adalah kesalahan
    // ketik yang WAJAR. Tanpa pembanding kedua, urutannya jadi milik urutan baris
    // sheet -- persis hal yang perubahan ini hapus.
    const daftar = (KS_DATA.kategori || []).filter(function (k) {
      // @K17 OM-8 (v362, gs >= @389): server MENANDAI kategori virtual (`virtual: true`); dulu cuma
      // "Pelunasan klien" yang disaring lewat nama hafalan, jadi "Uang muka order (DP)" (@382)
      // ditawarkan lalu ditolak server. Nama lama dipertahankan sebagai lapis kedua untuk server
      // yang belum mengirim medannya.
      return k.arah === arah && k.virtual !== true && k.kategori !== "Pelunasan klien" && k.aktif !== false;
    }).sort(function (a, b) {
      return (Number(a.urutan) || 0) - (Number(b.urutan) || 0) ||
        String(a.kategori).localeCompare(String(b.kategori), "id");
    });
    sel.innerHTML = '<option value="">-- kategori --</option>' + daftar.map(function (k) { return '<option value="' + ksEsc_(k.kategori) + '">' + ksEsc_(k.kategori) + '</option>'; }).join("");
    if (daftar.some(function (k) { return k.kategori === lama; })) sel.value = lama;
    ksPanduanKategori_();
  }
  const lblAkun = document.getElementById("ks-in-akun-label");
  if (lblAkun) lblAkun.textContent = arah === "Transfer" ? "Dari akun" : (arah === "Masuk" ? "Masuk ke akun" : (arah === "Saldo Awal" ? "Akun" : "Dibayar dari akun"));
  const tglIn = document.getElementById("ks-in-tanggal");
  if (tglIn && arah === "Saldo Awal" && KS_DATA) tglIn.value = KS_DATA.tanggalMulai;
}

/**
 * Panduan kategori (@K13 KN-9) -- teks Keterangan dari SD Kategori Kas.
 *
 * DISUNTIK DARI JS, mengikuti pola KP-8 (`ivPasangKotakRef_`, v305) dan dengan
 * alasan yang sama: markup form hidup di template Blogger, dan template TIDAK
 * ditempel tiap rilis. Kotak baru yang ditaruh di template menuntut satu langkah
 * manual; yang disuntik dari sini tidak. Brief K13 berbunyi "markup di template,
 * bukan disuntik JS -- ikuti pola KP-8", dua bagian yang saling bertentangan;
 * AUDIT-KEUANGAN.md sudah meluruskannya sekali di K12 dan itu yang dipakai.
 *
 * Kenapa dua belas Keterangan itu harus sampai ke layar: keputusan "aksesoris ke
 * 712, bukan 1301" dan "pencairan pinjaman BUKAN pendapatan" hidup di sana.
 * Panduan yang cuma ada di sheet adalah panduan yang tidak dibaca siapa pun saat
 * orang sedang mengisi form.
 */
function ksPasangPanduanKategori_() {
  if (document.getElementById("ks-kat-panduan")) return;   // idempoten, seperti KP-8
  const sel = document.getElementById("ks-in-kategori"); if (!sel || !sel.parentNode) return;
  const d = document.createElement("div");
  d.id = "ks-kat-panduan"; d.className = "ks-kat-panduan hidden";
  sel.parentNode.insertBefore(d, sel.nextSibling);
  sel.addEventListener("change", ksPanduanKategori_);
}

function ksPanduanKategori_() {
  const d = document.getElementById("ks-kat-panduan"); if (!d) return;
  const sel = document.getElementById("ks-in-kategori");
  const arah = (document.querySelector('input[name="ks-arah"]:checked') || {}).value || "Keluar";
  const nama = sel ? sel.value : "";
  const k = nama ? (KS_DATA && KS_DATA.kategori || []).filter(function (x) {
    return x.arah === arah && x.kategori === nama; })[0] : null;
  const teks = k ? String(k.keterangan || "").trim() : "";
  d.textContent = teks;
  d.classList.toggle("hidden", !teks);
}

/**
 * Memperkecil satu File gambar di browser (maks 1280 px, JPEG 0,75) supaya unggahan ringan
 * dari HP. Mengembalikan Promise {base64, mime, nama}; ditolak kalau berkasnya bukan gambar.
 * @K14b: dipisah dari ksBuktiDipilih supaya panel pensil memakai JALUR YANG SAMA -- dua
 * implementasi pengecilan foto adalah cara salah satunya diam-diam mengirim 8 MB.
 */
function ksKecilkanFoto_(f) {
  return new Promise(function (ok, gagal) {
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = function () {
      // @K17 WK-D1 (v362): galat di dalam onload TIDAK menolak promise-nya -- kanvas yang gagal
      // (gambar raksasa, memori HP habis) dulu berarti "Memperkecil foto..." selamanya.
      try {
        const maks = 1280; let w = img.width, h = img.height;
        if (w > maks || h > maks) { const r = Math.min(maks / w, maks / h); w = Math.round(w * r); h = Math.round(h * r); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", 0.75);
        const base64 = dataUrl.split(",")[1];
        if (!base64) throw new Error("kanvas kosong");
        URL.revokeObjectURL(url);
        ok({ base64: base64, mime: "image/jpeg", nama: f.name, kb: Math.round(dataUrl.length * 0.75 / 1024) });
      } catch (eK) {
        URL.revokeObjectURL(url);
        gagal(new Error("Foto tidak bisa diperkecil di perangkat ini -- coba foto lain atau ukuran lebih kecil."));
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); gagal(new Error("File bukan gambar -- lewati atau pilih foto.")); };
    img.src = url;
  });
}

/** Foto bukti form utama. */
function ksBuktiDipilih(input) {
  const f = input.files && input.files[0]; const info = document.getElementById("ks-bukti-info");
  KS_BUKTI = null;
  if (!f) { if (info) info.textContent = ""; return; }
  ksKecilkanFoto_(f)
    .then(function (b) { KS_BUKTI = { base64: b.base64, mime: b.mime, nama: b.nama }; if (info) info.textContent = "Bukti siap (" + b.kb + " KB)."; })
    .catch(function (e) { if (info) info.textContent = e.message; });
}

/** @K14b: foto bukti dari panel pensil. */
function ksUbahFotoDipilih(input) {
  const f = input.files && input.files[0]; const info = document.getElementById("ks-ub-bukti-info");
  KS_UBAH_FOTO = null;
  if (!f) { if (info) info.textContent = ""; return; }
  if (info) info.textContent = "Memperkecil foto...";
  ksKecilkanFoto_(f)
    .then(function (b) { KS_UBAH_FOTO = { base64: b.base64, mime: b.mime }; if (info) info.textContent = "Foto siap (" + b.kb + " KB) -- tekan Simpan."; })
    .catch(function (e) { if (info) info.textContent = e.message; });
}

function ksPesan_(teks, galat) {
  const el = document.getElementById("ks-form-pesan"); if (!el) return;
  el.textContent = teks || ""; el.classList.toggle("ks-form-galat", !!galat); el.classList.toggle("hidden", !teks);
}
/** @K17 WK-8 (v362): kategori dinonaktifkan di sheet sementara tab ini masih terbuka -- server
 *  menolak, tapi dropdown tetap menawarkannya sampai halaman dimuat ulang. Galat keluarga ini =
 *  daftar kategori di tab BASI, jadi dimuat ulang (ksRenderForm_ tidak mengosongkan isian). */
function ksGalatKategori_(e) { return /nonaktif|tidak ada untuk arah/i.test(String((e && e.message) || "")); }
function ksSibuk_(v) { KS_SIBUK = v; const b = document.getElementById("ks-btn-simpan"); if (b) b.disabled = v; }

function ksSimpan() {
  if (KS_SIBUK) return;
  const arah = (document.querySelector('input[name="ks-arah"]:checked') || {}).value || "";
  const data = {
    tanggal: document.getElementById("ks-in-tanggal").value, arah: arah,
    akun: document.getElementById("ks-in-akun").value, akunTujuan: document.getElementById("ks-in-tujuan").value,
    kategori: document.getElementById("ks-in-kategori").value,
    jumlah: ksParseRp_(document.getElementById("ks-in-jumlah").value),   // @K16: "12,34" = 12.34, bukan 1234
    ref: document.getElementById("ks-in-ref").value.trim(), pihak: document.getElementById("ks-in-pihak").value.trim(),
    keterangan: document.getElementById("ks-in-ket").value.trim(),
    buktiBase64: KS_BUKTI ? KS_BUKTI.base64 : "", buktiMime: KS_BUKTI ? KS_BUKTI.mime : ""
  };
  if (!data.tanggal) { ksPesan_("Isi tanggal.", true); return; }
  // @K17 WK-1/2: ketikan yang tidak terbaca DITOLAK di sini, dengan pesan -- sebelum "Isi jumlah",
  // karena NaN juga falsy dan pesannya akan menyesatkan ("isi" padahal sudah diisi).
  if (isNaN(data.jumlah)) { ksPesan_(ksGalatRp_(document.getElementById("ks-in-jumlah").value), true); return; }
  if (!data.jumlah) { ksPesan_("Isi jumlah.", true); return; }
  if ((arah === "Masuk" || arah === "Keluar") && !data.kategori) { ksPesan_("Pilih kategori.", true); return; }
  if (arah === "Transfer" && !data.akunTujuan) { ksPesan_("Pilih akun tujuan.", true); return; }
  // @K14: saat mengoreksi baris yang SUDAH berfoto, fotonya diwariskan server -- jangan tanya lagi.
  if (arah === "Keluar" && !KS_BUKTI && !(KS_KOREKSI && KS_KOREKSI.bukti) && !window.confirm("Tanpa foto bukti? Struk/nota sebaiknya difoto.")) return;
  if (KS_KOREKSI) { ksKirimKoreksi_(data); return; }
  ksSibuk_(true); ksPesan_("Menyimpan...");
  ksKirim_("simpanKas", { data: data })
    .then(function (res) {
      // @K17 WK-9: foto DIKIRIM tapi jawaban tidak membawa tautannya. gs >= @387 menolak sebelum
      // menulis, jadi ini lapis kedua -- tapi dulu bedanya cuma tiga kata yang hilang dari pesan sukses.
      const fotoHilang = !!data.buktiBase64 && !res.bukti && !res.kembar;
      ksPesan_(fotoHilang ? "Tercatat, TAPI foto bukti GAGAL tersimpan -- unggah ulang lewat tombol pensil di barisnya."
        : (res.kembar ? "Transaksi yang sama persis baru saja dicatat -- tidak digandakan." : "Tercatat: " + arah + " Rp " + ksRp(data.jumlah) + (data.kategori ? " (" + data.kategori + ")" : "") + (res.bukti ? " · bukti tersimpan" : "")), fotoHilang);
      ["ks-in-jumlah", "ks-in-ref", "ks-in-pihak", "ks-in-ket"].forEach(function (id) { document.getElementById(id).value = ""; });
      const fb = document.getElementById("ks-in-bukti"); if (fb) fb.value = ""; KS_BUKTI = null; const bi = document.getElementById("ks-bukti-info"); if (bi) bi.textContent = "";
      const bulanTrx = data.tanggal.slice(0, 7);
      // @K17 WK-5: tombol Simpan baru hidup SESUDAH baca-ulang selesai (ksMuat tidak pernah menolak).
      return ksMuat(bulanTrx, { sesudahTulis: true }).then(function () { ksSibuk_(false); });
    })
    .catch(function (e) {
      const jaringan = e instanceof TypeError;
      ksPesan_(jaringan ? "Jawaban server tidak sampai. Daftar dimuat ulang -- periksa apakah transaksinya sudah ada sebelum mencatat lagi." : e.message, true);
      if (jaringan) { ksMuat(data.tanggal.slice(0, 7), { sesudahTulis: true }).then(function () { ksSibuk_(false); }); return; }
      ksSibuk_(false);
      if (ksGalatKategori_(e)) ksMuat(KS_BULAN);   // @K17 WK-8
    });
}

/**
 * @K14 lapis A -- ubah keterangan / pihak / ref DI TEMPAT, lewat panel kecil di bawah
 * barisnya. Disuntik dari JS (pola KP-8): markup tabel memang dibangun JS. Hanya kolom
 * yang BERUBAH yang dikirim, dan kalau tidak ada yang berubah tidak ada permintaan sama
 * sekali -- servernya idempoten, tapi permintaan kosong tetap permintaan.
 */
function ksUbahCatatan(btn) {
  const id = btn.getAttribute("data-id");
  const t = (KS_DATA.transaksi || []).filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  const lama = document.querySelector("tr.ks-r-ubah"); if (lama) lama.remove();
  KS_UBAH_FOTO = null;   // foto milik panel sebelumnya tidak boleh ikut terkirim
  const tr = btn.closest("tr"); if (!tr) return;
  const kolom = tr.children.length;
  tr.insertAdjacentHTML("afterend",
    '<tr class="ks-r-ubah" data-id="' + ksEsc_(id) + '"><td colspan="' + kolom + '"><div class="ks-ubah-panel">' +
    '<label>Pihak<input id="ks-ub-pihak" type="text" value="' + ksEsc_(t.pihak) + '"></label>' +
    '<label>Ref<input id="ks-ub-ref" type="text" value="' + ksEsc_(t.ref) + '"></label>' +
    '<label class="ks-ubah-ket">Keterangan<input id="ks-ub-ket" type="text" value="' + ksEsc_(t.keterangan) + '"></label>' +
    // @K14b: foto. Kalau baris sudah berfoto, tautannya ditampilkan dan foto baru MENGGANTINYA.
    '<label class="ks-ubah-foto">' + (t.bukti ? 'Ganti foto (<a href="' + ksEsc_(t.bukti) + '" target="_blank" rel="noopener">lihat yang ada</a>)' : 'Tambah foto bukti') +
      '<input id="ks-ub-bukti" type="file" accept="image/*" onchange="ksUbahFotoDipilih(this)"><span id="ks-ub-bukti-info" class="ks-sub"></span></label>' +
    '<span class="ks-ubah-aksi"><button id="ks-ub-simpan" class="ks-btn ks-btn-utama" type="button" onclick="ksUbahCatatanSimpan(\'' + ksEsc_(id) + '\')">Simpan</button> ' +
    '<button id="ks-ub-batal" class="ks-btn" type="button" onclick="document.querySelector(\'tr.ks-r-ubah\').remove()">Batal</button></span>' +
    '<div id="ks-ub-pesan" class="ks-sub"></div></div></td></tr>');
  const k = document.getElementById("ks-ub-ket"); if (k) k.focus();
}

function ksUbahCatatanSimpan(id) {
  const t = (KS_DATA.transaksi || []).filter(function (x) { return x.id === id; })[0];
  const pesan = document.getElementById("ks-ub-pesan");
  if (!t) return;
  const perubahan = {};
  [["pihak", "ks-ub-pihak"], ["ref", "ks-ub-ref"], ["keterangan", "ks-ub-ket"]].forEach(function (p) {
    const v = String(document.getElementById(p[1]).value || "").trim();
    if (v !== String(t[p[0]] || "").trim()) perubahan[p[0]] = v;
  });
  // @K14b: foto dihitung sebagai perubahan walau tidak ada teks yang berganti.
  if (KS_UBAH_FOTO) { perubahan.buktiBase64 = KS_UBAH_FOTO.base64; perubahan.buktiMime = KS_UBAH_FOTO.mime; }
  if (!Object.keys(perubahan).length) { if (pesan) pesan.textContent = "Tidak ada yang berubah."; return; }
  const btn = document.getElementById("ks-ub-simpan"); if (btn) btn.disabled = true;
  if (pesan) pesan.textContent = "Menyimpan...";
  ksKirim_("ubahCatatanKas", { id: id, perubahan: perubahan })
    .then(function (res) {
      const fotoHilang = !!perubahan.buktiBase64 && !(res && res.bukti);   // @K17 WK-9
      KS_UBAH_FOTO = null;
      return ksMuat(KS_BULAN, { sesudahTulis: true }).then(function () {
        if (fotoHilang) window.alert("Catatan tersimpan, TAPI foto TIDAK tersimpan -- coba unggah lagi lewat pensil.");
      });
    })
    .catch(function (e) {
      // @K17 WK-4 (v362): jawaban hilang (TypeError) = server MUNGKIN sudah menulis. Dulu tombolnya
      // dinyalakan lagi dengan pesan mentah "Failed to fetch"; klik ulang dengan foto = berkas Drive
      // kedua + baris Log Bukti kedua. Sekarang sama dengan ksSimpan: beri tahu, lalu BACA ULANG.
      // Tombolnya sengaja TIDAK dihidupkan -- panelnya hilang bersama render ulang tabel.
      if (e instanceof TypeError) {
        window.alert("Jawaban server tidak sampai. Daftar dimuat ulang -- periksa barisnya dulu sebelum menyimpan lagi.");
        ksMuat(KS_BULAN, { sesudahTulis: true }); return;
      }
      if (btn) btn.disabled = false; if (pesan) pesan.textContent = e.message;
    });
}

/**
 * @K14 lapis B -- KOREKSI: form catat diisi nilai baris lama, orang mengubah yang salah,
 * lalu Simpan mengirim koreksiKas (pembalik + pengganti di server). Rasanya seperti edit;
 * baris lama tidak pernah disentuh. Kalau bulannya sudah ditutup, tanggal diisi HARI INI:
 * server menolak pengganti bertanggal di bulan tertutup (@342), jadi jangan menawarkan
 * nilai yang pasti ditolak.
 */
function ksKoreksi(btn) {
  // @K17 WK-D4 (v362): selama kirim berjalan form TIDAK boleh ditimpa -- `.then` koreksi yang
  // sedang berjalan memanggil ksBatalKoreksi() dan akan menghapus keadaan koreksi yang baru.
  if (KS_SIBUK) return;
  const id = btn.getAttribute("data-id");
  const t = (KS_DATA.transaksi || []).filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  const radio = document.querySelector('input[name="ks-arah"][value="' + t.arah + '"]');
  if (radio) { radio.checked = true; ksFormArahBerubah(); }
  const isi = function (elId, v) { const el = document.getElementById(elId); if (el) el.value = v; };
  isi("ks-in-tanggal", KS_DATA.tertutup ? KS_DATA.hariIni : t.tanggal);
  isi("ks-in-akun", t.akun); isi("ks-in-tujuan", t.akunTujuan || "");
  isi("ks-in-kategori", t.kategori); isi("ks-in-jumlah", ksRpIsian_(t.jumlah));   // @K16: koma desimal
  isi("ks-in-ref", t.ref); isi("ks-in-pihak", t.pihak); isi("ks-in-ket", t.keterangan);
  ksPanduanKategori_();
  // @K17 WK-8: nilai yang dipasang ke <select> yang tidak memuatnya hilang DIAM-DIAM (select
  // kosong terbaca "belum diisi"). Kategori lama yang sudah nonaktif disebut namanya.
  const selKat = document.getElementById("ks-in-kategori");
  const katHilang = !!t.kategori && (t.arah === "Masuk" || t.arah === "Keluar") && !!selKat && selKat.value !== t.kategori;
  KS_KOREKSI = { id: id, bukti: t.bukti || "", tanggal: t.tanggal };
  let bar = document.getElementById("ks-koreksi-bar");
  if (!bar) {
    const wrap = document.getElementById("ks-form-wrap");
    if (!wrap) return;
    bar = document.createElement("div"); bar.id = "ks-koreksi-bar"; bar.className = "ks-koreksi-bar";
    wrap.insertBefore(bar, wrap.firstChild);
  }
  bar.innerHTML = 'Mengoreksi <b class="ks-mono">' + ksEsc_(id) + '</b> -- ubah yang salah, lalu Simpan koreksi. Baris lama dibalik otomatis, tidak dihapus.' +
    (KS_DATA.tertutup ? " Bulan ini sudah ditutup: koreksinya bertanggal hari ini." : "") +
    (katHilang ? ' <b id="ks-koreksi-kat-hilang">Kategori lama "' + ksEsc_(t.kategori) + '" sudah tidak aktif -- pilih penggantinya.</b>' : "") +
    ' <button id="ks-koreksi-batal" class="ks-btn ks-btn-kecil-netral" type="button" onclick="ksBatalKoreksi()">Batalkan koreksi</button>';
  const simpan = document.getElementById("ks-btn-simpan"); if (simpan) simpan.textContent = "Simpan koreksi";
  const wrapEl = document.getElementById("ks-form-wrap"); if (wrapEl && wrapEl.scrollIntoView) wrapEl.scrollIntoView({ block: "start" });
}

function ksBatalKoreksi() {
  KS_KOREKSI = null;
  const bar = document.getElementById("ks-koreksi-bar"); if (bar) bar.remove();
  const simpan = document.getElementById("ks-btn-simpan"); if (simpan) simpan.textContent = "Simpan";
  ["ks-in-jumlah", "ks-in-ref", "ks-in-pihak", "ks-in-ket"].forEach(function (id) { const el = document.getElementById(id); if (el) el.value = ""; });
  // Tanggal ikut dikembalikan: terlihat di potret, sesudah koreksi dibatalkan form masih
  // memegang tanggal baris lama, dan entri manual berikutnya akan diam-diam bertanggal itu.
  const tglEl = document.getElementById("ks-in-tanggal"); if (tglEl && KS_DATA && KS_DATA.hariIni) tglEl.value = KS_DATA.hariIni;
  ksPesan_("");
}

function ksKirimKoreksi_(data) {
  const alasan = window.prompt("Alasan koreksi (wajib, min. 5 huruf, akan tercatat di baris pembalik):");
  if (alasan === null) return;
  if (String(alasan).trim().length < 5) { ksPesan_("Alasan koreksi minimal 5 huruf.", true); return; }
  const asal = KS_KOREKSI.id, bulanTrx = data.tanggal.slice(0, 7);
  ksSibuk_(true); ksPesan_("Mengoreksi...");
  ksKirim_("koreksiKas", { id: asal, data: data, alasan: String(alasan).trim() })
    .then(function (res) {
      ksBatalKoreksi();
      ksPesan_("Dikoreksi: " + asal + " -> " + res.id + " (pembalik " + res.pembalik + ")");
      const fb = document.getElementById("ks-in-bukti"); if (fb) fb.value = ""; KS_BUKTI = null;
      return ksMuat(bulanTrx, { sesudahTulis: true }).then(function () { ksSibuk_(false); });   // @K17 WK-5
    })
    .catch(function (e) {
      const jaringan = e instanceof TypeError;
      ksPesan_(jaringan ? "Jawaban server tidak sampai. Daftar dimuat ulang -- periksa apakah koreksinya sudah tercatat sebelum mengulang." : e.message, true);
      if (jaringan) { ksMuat(bulanTrx, { sesudahTulis: true }).then(function () { ksSibuk_(false); }); return; }
      ksSibuk_(false);
      if (ksGalatKategori_(e)) ksMuat(KS_BULAN);   // @K17 WK-8
    });
}

function ksRenderBulan_() {
  const el = document.getElementById("ks-bulan-judul"); if (el) el.textContent = ksNamaBulan(KS_BULAN);
  const badge = document.getElementById("ks-bulan-status");
  if (badge) { badge.textContent = KS_DATA.tertutup ? "Ditutup" : "Terbuka"; badge.classList.toggle("ks-badge-tutup", !!KS_DATA.tertutup); }
}
function ksGeser(n) { ksShow("ks-loading"); ksMuat(ksGeserBulan(KS_BULAN, n)); }

/**
 * Filter buku kas (@K15, v359): cari bebas, arah, akun, kategori, rentang tanggal,
 * sembunyikan yang dibatalkan.
 *
 * DISUNTIK DARI JS (pola KP-8, sama dengan panduan kategori di atas) dan DI LUAR
 * #ks-buku: tabelnya dirender ulang tiap ketukan, dan kotak yang ikut dibongkar
 * kehilangan fokus & isinya. Keadaannya di KS_SARING (`let` tingkat atas, bukan
 * window.* -- PF-1b), jadi ia bertahan saat daftar dimuat ulang sesudah
 * simpan / koreksi / ganti bulan. Yang SENGAJA tidak bertahan lintas bulan cuma
 * rentang tanggal, karena ia terikat bulan yang sedang dibuka.
 *
 * Data bulan di KS_DATA tidak disentuh; yang berubah hanya yang TAMPIL, dan tfoot
 * menyebutnya ("Tersaring N dari M") supaya total yang tersaring tidak terbaca
 * sebagai total bulan.
 */
function ksPasangSaring_() {
  if (document.getElementById("ks-saring")) return;   // idempoten, seperti KP-8
  const buku = document.getElementById("ks-buku"); if (!buku || !buku.parentNode) return;
  const d = document.createElement("div");
  d.id = "ks-saring"; d.className = "ks-saring";
  d.innerHTML =
    '<input type="search" id="ks-sr-q" class="ks-sr-q" placeholder="Cari pihak, keterangan, ref, ID, atau jumlah" oninput="ksSaringUbah()" autocomplete="off" aria-label="Cari transaksi">' +
    '<select id="ks-sr-arah" onchange="ksSaringUbah()" aria-label="Arah"><option value="">Semua arah</option><option>Masuk</option><option>Keluar</option><option>Transfer</option><option>Saldo Awal</option></select>' +
    '<select id="ks-sr-akun" onchange="ksSaringUbah()" aria-label="Akun"><option value="">Semua akun</option></select>' +
    '<select id="ks-sr-kat" onchange="ksSaringUbah()" aria-label="Kategori"><option value="">Semua kategori</option></select>' +
    '<span class="ks-sr-tgl"><input type="date" id="ks-sr-dari" onchange="ksSaringUbah()" aria-label="Dari tanggal"> &ndash; <input type="date" id="ks-sr-sampai" onchange="ksSaringUbah()" aria-label="Sampai tanggal"></span>' +
    '<label class="ks-sr-cek"><input type="checkbox" id="ks-sr-sembunyi" onchange="ksSaringUbah()"> sembunyikan yang dibatalkan</label>' +
    '<span id="ks-sr-info" class="ks-sr-info"></span>' +
    '<button type="button" id="ks-sr-hapus" class="ks-sr-hapus hidden" onclick="ksSaringHapus()">Hapus filter</button>';
  buku.parentNode.insertBefore(d, buku);
}

function ksSaringUbah() {
  const v = function (id) { const e = document.getElementById(id); return e ? e.value : ""; };
  KS_SARING.q = v("ks-sr-q").trim(); KS_SARING.arah = v("ks-sr-arah"); KS_SARING.akun = v("ks-sr-akun"); KS_SARING.kat = v("ks-sr-kat");
  KS_SARING.dari = v("ks-sr-dari"); KS_SARING.sampai = v("ks-sr-sampai");
  const c = document.getElementById("ks-sr-sembunyi"); KS_SARING.sembunyi = !!(c && c.checked);
  ksRenderBuku_();
}

function ksSaringHapus() {
  KS_SARING = { q: "", arah: "", akun: "", kat: "", dari: "", sampai: "", sembunyi: false, bulan: KS_SARING.bulan };
  ["ks-sr-q", "ks-sr-arah", "ks-sr-akun", "ks-sr-kat", "ks-sr-dari", "ks-sr-sampai"].forEach(function (id) { const e = document.getElementById(id); if (e) e.value = ""; });
  const c = document.getElementById("ks-sr-sembunyi"); if (c) c.checked = false;
  ksRenderBuku_();
}

function ksSaringAktif_() {
  const s = KS_SARING; return !!(s.q || s.arah || s.akun || s.kat || s.dari || s.sampai || s.sembunyi);
}

function ksSaringCocok_(t) {
  const s = KS_SARING;
  if (s.arah && t.arah !== s.arah) return false;
  // Transfer KE akun X ikut muncul saat menyaring akun X -- uangnya sampai ke sana.
  if (s.akun && t.akun !== s.akun && t.akunTujuan !== s.akun) return false;
  if (s.kat && t.kategori !== s.kat) return false;
  if (s.dari && String(t.tanggal) < s.dari) return false;       // ISO yyyy-MM-dd: urutan teks = urutan tanggal
  if (s.sampai && String(t.tanggal) > s.sampai) return false;
  if (s.sembunyi && (t.dibatalkanOleh || t.status === "Pembalik")) return false;
  if (s.q) {
    const q = s.q.toLowerCase();
    const tumpukan = [t.pihak, t.keterangan, t.ref, t.id, t.kategori, ksNamaAkun(t.akun), t.akunTujuan ? ksNamaAkun(t.akunTujuan) : ""]
      .map(function (x) { return String(x === null || x === undefined ? "" : x).toLowerCase(); }).join("\n");
    let kena = tumpukan.indexOf(q) !== -1;
    // Angka (boleh dengan titik/koma ribuan) juga dicocokkan ke jumlah, digit lawan digit --
    // "655.500" dan "655500" sama-sama menemukan Rp 655.500. Teks tetap ikut dicari, supaya
    // ref yang kebetulan angka saja tidak hilang.
    // @K17 WK-7 (v362): ketikan BERKOMA = orang menyebut jumlah sampai sen-nya, jadi dicocokkan
    // PERSIS dalam sen lewat parser yang sama dengan form. Dulu digit-lawan-digit: "12,34" ikut
    // menemukan Rp 1.212,34 / 12.340 / 1.234, dan "1234,00" TIDAK menemukan Rp 1.234 (ksRp tidak
    // mencetak ",00"). Tanpa koma tetap substring -- "655" menemukan 655.500 memang berguna.
    if (!kena && /^[\d.,]+$/.test(q)) {
      if (q.indexOf(",") !== -1) { const n = ksParseRp_(q); kena = !isNaN(n) && Math.round(n * 100) === Math.round(Math.abs(Number(t.jumlah) || 0) * 100); }
      else kena = ksRp(t.jumlah).replace(/[^0-9]/g, "").indexOf(q.replace(/[.,]/g, "")) !== -1;
    }
    if (!kena) return false;
  }
  return true;
}

function ksSaringIsiOpsi_(trx) {
  // Bulan berganti: rentang tanggal milik bulan lama dibuang, min/max mengikuti bulan baru.
  if (KS_SARING.bulan !== KS_BULAN) {
    KS_SARING.bulan = KS_BULAN; KS_SARING.dari = ""; KS_SARING.sampai = "";
    ["ks-sr-dari", "ks-sr-sampai"].forEach(function (id) { const e = document.getElementById(id); if (e) e.value = ""; });
  }
  const y = Number(KS_BULAN.slice(0, 4)), m = Number(KS_BULAN.slice(5, 7));
  const akhir = KS_BULAN + "-" + ("0" + new Date(y, m, 0).getDate()).slice(-2);
  ["ks-sr-dari", "ks-sr-sampai"].forEach(function (id) { const e = document.getElementById(id); if (e) { e.min = KS_BULAN + "-01"; e.max = akhir; } });
  const dipakai = {}; trx.forEach(function (t) { dipakai[t.akun] = 1; if (t.akunTujuan) dipakai[t.akunTujuan] = 1; });
  const akun = (KS_DATA.akun || []).filter(function (a) { return a.aktif || dipakai[a.kode]; })
    .map(function (a) { return { v: a.kode, t: a.nama }; });
  const kat = {}; trx.forEach(function (t) { if (t.kategori) kat[t.kategori] = 1; });
  const daftarKat = Object.keys(kat).sort(function (a, b) { return a.localeCompare(b, "id"); }).map(function (k) { return { v: k, t: k }; });
  ksSaringIsiSelect_("ks-sr-akun", "Semua akun", akun, KS_SARING.akun);
  ksSaringIsiSelect_("ks-sr-kat", "Semua kategori", daftarKat, KS_SARING.kat);
}

function ksSaringIsiSelect_(id, semua, daftar, terpilih) {
  const sel = document.getElementById(id); if (!sel) return;
  // Nilai terpilih yang tidak ada di daftar bulan ini TETAP dipasang sebagai opsi: <select>
  // yang tidak memuat nilainya menampilkannya kosong, sementara filternya terus bekerja
  // diam-diam -- daftar kosong yang tidak bisa dijelaskan.
  if (terpilih && !daftar.some(function (o) { return o.v === terpilih; })) daftar = daftar.concat([{ v: terpilih, t: terpilih + " (tidak ada bulan ini)" }]);
  sel.innerHTML = '<option value="">' + ksEsc_(semua) + '</option>' +
    daftar.map(function (o) { return '<option value="' + ksEsc_(o.v) + '">' + ksEsc_(o.t) + '</option>'; }).join("");
  sel.value = terpilih || "";
}

function ksSaringInfo_(n, m, aktif) {
  const info = document.getElementById("ks-sr-info"), hapus = document.getElementById("ks-sr-hapus");
  if (info) info.textContent = aktif ? "tersaring " + n + " dari " + m : "";
  if (hapus) hapus.classList.toggle("hidden", !aktif);
}

function ksRenderBuku_() {
  const el = document.getElementById("ks-buku"); if (!el) return;
  const semua = KS_DATA.transaksi || [];
  ksSaringIsiOpsi_(semua);
  // @K15: saringan dihitung di sini, bukan di ksMuat -- KS_DATA tetap utuh, yang berubah
  // hanya yang TAMPIL. Total di tfoot mengikuti yang tampil dan menyebutnya.
  const trx = semua.filter(ksSaringCocok_), aktif = ksSaringAktif_();
  ksSaringInfo_(trx.length, semua.length, aktif);
  if (!semua.length) { el.innerHTML = '<div class="ks-kartu"><p class="ks-info">Belum ada transaksi di ' + ksEsc_(ksNamaBulan(KS_BULAN)) + '.</p></div>'; return; }
  if (!trx.length) {
    el.innerHTML = '<div class="ks-kartu"><p class="ks-info">Tidak ada transaksi di ' + ksEsc_(ksNamaBulan(KS_BULAN)) + ' yang cocok dengan filter (' + semua.length +
      ' disembunyikan). <button type="button" class="ks-sr-hapus" onclick="ksSaringHapus()">Hapus filter</button></p></div>';
    return;
  }
  let masuk = 0, keluar = 0;
  // @K14: baris asli yang DIKOREKSI menunjuk penggantinya, supaya labelnya 'dikoreksi'
  // bukan 'dibatalkan' -- dua kejadian berbeda yang sampai @376 tampil sama.
  const penggantiDari = {};
  trx.forEach(function (t) { if (t.koreksiDari) penggantiDari[t.koreksiDari] = t.id; });
  const baris = trx.slice().reverse().map(function (t) {
    const batal = !!t.dibatalkanOleh, pembalik = t.status === "Pembalik";
    if (!batal && !pembalik) { if (t.arah === "Masuk") masuk += t.jumlah; else if (t.arah === "Keluar") keluar += t.jumlah; }
    const kelas = "ks-r" + (batal ? " ks-r-batal" : "") + (pembalik ? " ks-r-pembalik" : "");
    const arahTeks = t.arah === "Transfer" ? "Transfer → " + ksEsc_(ksNamaAkun(t.akunTujuan)) : t.arah;
    const tanda = t.arah === "Masuk" || t.arah === "Saldo Awal" ? "+" : (t.arah === "Keluar" ? "\u2212" : "");
    return '<tr class="' + kelas + '" data-id="' + ksEsc_(t.id) + '">' +
      '<td class="ks-td-tgl">' + ksEsc_(ksTgl(t.tanggal)) + '</td>' +
      '<td><span class="ks-arah ks-arah-' + t.arah.replace(/\s/g, "").toLowerCase() + '">' + arahTeks + '</span>' + (t.sumber === "pelunasan" ? ' <span class="ks-otomatis" title="dari SD Pelunasan">auto</span>' : '') + '</td>' +
      '<td>' + ksEsc_(ksNamaAkun(t.akun)) + '</td>' +
      '<td>' + ksEsc_(t.kategori) + (t.pihak ? '<div class="ks-sub">' + ksEsc_(t.pihak) + '</div>' : '') + (t.keterangan ? '<div class="ks-sub">' + ksEsc_(t.keterangan) + '</div>' : '') + '</td>' +
      '<td class="ks-mono">' + ksEsc_(t.ref) + '</td>' +
      '<td class="ks-td-rp ' + (t.arah === "Masuk" || t.arah === "Saldo Awal" ? "ks-plus" : (t.arah === "Keluar" ? "ks-min" : "")) + '">' + tanda + ksRp(t.jumlah) + '</td>' +
      '<td class="ks-td-aksi">' + (t.bukti ? '<a href="' + ksEsc_(t.bukti) + '" target="_blank" rel="noopener" title="Lihat bukti">📎</a>' : '') +
                // @K14 lapis A: pensil untuk SIAPA PUN yang boleh menyimpan kas -- bukan hanya finance.
        // Kelasnya sendiri (bukan .ks-btn-kecil) supaya hitungan tombol Batalkan di jalan21 tetap benar.
        (!batal && !pembalik && t.sumber === "kas" ? ' <button class="ks-btn-ubah" data-id="' + ksEsc_(t.id) + '" onclick="ksUbahCatatan(this)" type="button" title="Ubah keterangan / pihak / ref" aria-label="Ubah catatan">&#9998;</button>' : '') +
        // @K14 lapis B: Koreksi hanya finance, sama dengan Batalkan -- ia memindahkan uang.
        (KS_DATA.bisaFinance && !batal && !pembalik && t.sumber === "kas" ? ' <button class="ks-btn-koreksi" data-id="' + ksEsc_(t.id) + '" onclick="ksKoreksi(this)" type="button">Koreksi</button>' : '') +
        (KS_DATA.bisaFinance && !batal && !pembalik && t.sumber === "kas" ? ' <button class="ks-btn-kecil" data-id="' + ksEsc_(t.id) + '" onclick="ksBatalkan(this)" type="button">Batalkan</button>' : '') +
        // @K14: chip pada BARIS SENDIRI (div), bukan menempel di belakang tombol -- terukur di
        // potret 1400px chip-nya menyentuh tepi tabel. Sel aksi ber-nowrap, div memutus barisnya.
        (t.koreksiDari ? '<div class="ks-sub ks-koreksi-chip">koreksi dari ' + ksEsc_(t.koreksiDari) + '</div>' : '') +
        (batal ? '<span class="ks-sub">' + (penggantiDari[t.id] ? 'dikoreksi &rarr; ' + ksEsc_(penggantiDari[t.id]) : 'dibatalkan') + '</span>' : '') + '</td>' +
      '</tr>';
  }).join("");
  el.innerHTML = '<div class="ks-kartu ks-kartu-tabel"><table class="ks-tabel"><thead><tr><th>Tgl</th><th>Arah</th><th>Akun</th><th>Kategori / pihak</th><th>Ref</th><th class="ks-td-rp">Jumlah</th><th></th></tr></thead><tbody>' + baris + '</tbody>' +
    '<tfoot><tr><td colspan="5">' + (aktif ? 'Tersaring <b>' + trx.length + '</b> dari ' + semua.length + ' &middot; ' : '') + 'Masuk <b>Rp ' + ksRp(masuk) + '</b> · Keluar <b>Rp ' + ksRp(keluar) + '</b> · Bersih <b>Rp ' + ksRp(masuk - keluar) + '</b></td><td colspan="2"></td></tr></tfoot></table></div>';
}

function ksBatalkan(btn) {
  const id = btn.getAttribute("data-id");
  const alasan = window.prompt("Alasan pembatalan (wajib, akan tercatat):");
  if (alasan === null) return;
  btn.disabled = true;
  ksKirim_("batalkanKas", { id: id, alasan: alasan })
    .then(function () { return ksMuat(KS_BULAN, { sesudahTulis: true }); })
    .catch(function (e) {
      // @K17 WK-4 (v362): lihat ksUbahCatatanSimpan. Dulu klik ulang ditolak server ("sudah
      // dibatalkan") sementara tabel masih menampilkan barisnya aktif.
      if (e instanceof TypeError) {
        window.alert("Jawaban server tidak sampai. Daftar dimuat ulang -- periksa apakah " + id + " sudah dibatalkan sebelum mengulang.");
        ksMuat(KS_BULAN, { sesudahTulis: true }); return;
      }
      btn.disabled = false; window.alert(e.message);
    });
}

function ksRenderArus_() {
  const el = document.getElementById("ks-arus"); if (!el) return;
  const arus = KS_DATA.arusKas || []; if (!arus.length) { el.innerHTML = ""; return; }
  const kMasuk = {}, kKeluar = {};
  arus.forEach(function (b) { Object.keys(b.masuk).forEach(function (k) { kMasuk[k] = 1; }); Object.keys(b.keluar).forEach(function (k) { kKeluar[k] = 1; }); });
  const kolom = arus.map(function (b) { return '<th class="ks-td-rp">' + ksEsc_(KS_BULAN_PENDEK[Number(b.bulan.slice(5, 7)) - 1] + " " + b.bulan.slice(2, 4)) + '</th>'; }).join("");
  const barisK = function (nama, ambil, kelas) { return '<tr class="' + (kelas || "") + '"><td>' + ksEsc_(nama) + '</td>' + arus.map(function (b) { const v = ambil(b); return '<td class="ks-td-rp">' + (v ? ksRp(v) : '<span class="ks-nol">–</span>') + '</td>'; }).join("") + '</tr>'; };
  let html = '<tr class="ks-r-judul"><td>Saldo awal</td>' + arus.map(function (b) { return '<td class="ks-td-rp">' + ksRp(b.saldoAwal) + '</td>'; }).join("") + '</tr>';
  html += '<tr class="ks-r-grup"><td colspan="' + (arus.length + 1) + '">Masuk</td></tr>';
  Object.keys(kMasuk).sort().forEach(function (k) { html += barisK(k, function (b) { return b.masuk[k]; }); });
  html += barisK("Total masuk", function (b) { return b.totalMasuk; }, "ks-r-total");
  html += '<tr class="ks-r-grup"><td colspan="' + (arus.length + 1) + '">Keluar</td></tr>';
  Object.keys(kKeluar).sort().forEach(function (k) { html += barisK(k, function (b) { return b.keluar[k]; }); });
  html += barisK("Total keluar", function (b) { return b.totalKeluar; }, "ks-r-total");
  html += ksBarisKlasifikasi_(arus);
  html += barisK("Bersih (masuk − keluar)", function (b) { return b.totalMasuk - b.totalKeluar; }, "ks-r-total");
  html += '<tr class="ks-r-judul"><td>Saldo akhir</td>' + arus.map(function (b) { return '<td class="ks-td-rp">' + ksRp(b.saldoAkhir) + '</td>'; }).join("") + '</tr>';
  el.innerHTML = '<div class="ks-kartu ks-kartu-tabel"><table class="ks-tabel ks-tabel-arus"><thead><tr><th>Rp</th>' + kolom + '</tr></thead><tbody>' + html + '</tbody></table></div>';
}

/**
 * Dua baris kesehatan klasifikasi di bawah Total keluar (@K13 KN-6).
 *
 * Mengembalikan STRING KOSONG kalau server belum mengirim medannya (gs < @375).
 * Itu disengaja dan bukan kehati-hatian berlebih: menggambar "belum diklasifikasi
 * Rp 0" untuk server yang sama sekali tidak menghitungnya adalah angka yang
 * BERBOHONG, dan jalur yang tidak bisa memberi tahu kalau ia tidak aktif adalah
 * jalur yang suatu hari mati tanpa ada yang sadar.
 *
 * Ambang 5% menyalin `diagnosaKas` supaya layar dan terminal tidak pernah berbeda
 * pendapat; kalau salah satunya diubah, ubah keduanya.
 */
function ksBarisKlasifikasi_(arus) {
  if (!arus.some(function (b) { return typeof b.porsiLainLain === "number"; })) return "";
  const belum = '<tr class="ks-r-klas"><td>· belum diklasifikasi</td>' + arus.map(function (b) {
    const v = (b.belumDiklasifikasi && b.belumDiklasifikasi.keluar) || 0;
    return '<td class="ks-td-rp' + (v ? ' ks-awas' : '') + '">' + (v ? ksRp(v) : '<span class="ks-nol">–</span>') + '</td>';
  }).join("") + '</tr>';
  const porsi = '<tr class="ks-r-klas"><td>· porsi "Lain-lain"</td>' + arus.map(function (b) {
    if (!b.totalKeluar) return '<td class="ks-td-rp"><span class="ks-nol">–</span></td>';
    const p = Number(b.porsiLainLain) || 0;
    return '<td class="ks-td-rp' + (p > 5 ? ' ks-awas' : '') + '">' + String(p).replace(".", ",") + '%</td>';
  }).join("") + '</tr>';
  return belum + porsi;
}

function ksRenderRekon_() {
  const el = document.getElementById("ks-rekon"); if (!el) return;
  if (!KS_DATA.bisaFinance) { el.innerHTML = ""; return; }
  const b = KS_BULAN, rekon = KS_DATA.rekonsiliasi || {}, tutup = KS_DATA.tertutup;
  const arusBulan = (KS_DATA.arusKas || []).filter(function (x) { return x.bulan === b; })[0];
  const perAkun = arusBulan ? arusBulan.perAkunAkhir : {};
  let semuaCocok = true;
  const baris = (KS_DATA.akun || []).filter(function (a) { return a.aktif; }).map(function (a) {
    const r = rekon[a.kode]; const buku = perAkun[a.kode] || 0;
    const cocok = r && r.selisih === 0; if (!cocok) semuaCocok = false;
    return '<tr><td>' + ksEsc_(a.nama) + '</td><td class="ks-td-rp">' + ksRp(buku) + '</td>' +
      '<td>' + (tutup ? '<span class="ks-td-rp">' + (r ? ksRp(r.saldoBank) : "–") + '</span>' : '<input class="ks-in-rp" data-akun="' + ksEsc_(a.kode) + '" inputmode="decimal" placeholder="saldo menurut ' + ksEsc_(a.jenis === "Bank" ? "rekening" : "hitungan laci") + '" type="text" value="' + (r ? ksRpIsian_(r.saldoBank) : "") + '" data-awal="' + (r ? r.saldoBank : "") + '"/>') + '</td>' +
      '<td class="ks-td-rp ' + (r ? (cocok ? "ks-plus" : "ks-min") : "") + '">' + (r ? ksRp(r.selisih) : "–") + '</td>' +
      '<td>' + (r ? '<span class="ks-sub">' + ksEsc_(r.oleh.split("@")[0]) + '</span>' : (tutup ? '' : '<span class="ks-sub">belum</span>')) + '</td></tr>';
  }).join("");
  const bolehTutup = !tutup && semuaCocok && b < KS_DATA.hariIni.slice(0, 7);
  el.innerHTML = '<div class="ks-kartu"><div class="ks-kartu-judul">Rekonsiliasi ' + ksEsc_(ksNamaBulan(b)) + '</div>' +
    '<p class="ks-info">Isi saldo tiap akun per akhir bulan menurut rekening/laci. Selisih 0 = buku cocok. Bulan hanya bisa ditutup kalau semua akun cocok.</p>' +
    '<div class="ks-gulir"><table class="ks-tabel"><thead><tr><th>Akun</th><th class="ks-td-rp">Saldo buku</th><th>Saldo bank/laci</th><th class="ks-td-rp">Selisih</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>' +
    '<div class="ks-aksi">' + (tutup ? '<span class="ks-badge ks-badge-tutup">Bulan ini sudah ditutup</span>' :
      '<button class="ks-btn" onclick="ksRekonSimpan()" type="button">Simpan rekonsiliasi</button>' +
      '<button class="ks-btn ks-btn-utama" ' + (bolehTutup ? '' : 'disabled="disabled" title="Semua akun harus cocok dan bulan sudah lewat"') + ' onclick="ksTutupBulan()" type="button">Tutup bulan</button>') +
    '<span class="ks-form-pesan hidden" id="ks-rekon-pesan"></span></div></div>';
}

function ksRekonSimpan() {
  const inputs = Array.prototype.slice.call(document.querySelectorAll("#ks-rekon input[data-akun]"));
  // Hanya yang diisi DAN berubah dari nilai tersimpan -- rekonsiliasi yang
  // sama tidak ditulis ulang.
  // @K17 WK-3 (v361): predikat ini dulu membuang koma ("2769500,5" -> 27695005), jadi SETIAP saldo
  // bersen dianggap berubah dan dikirim ulang tiap klik -- baris kembar di SD Rekonsiliasi Kas, regresi
  // K16 (parser pengirimnya diganti, predikat ini terlewat). Kini dibandingkan dalam SEN, dengan
  // parser yang sama. data-awal KOSONG = belum pernah direkonsiliasi, BUKAN nol -- Number("") = 0
  // akan menelan rekonsiliasi pertama bersaldo 0.
  const pesan = document.getElementById("ks-rekon-pesan");
  const takTerbaca = inputs.filter(function (i) { return String(i.value).trim() !== "" && isNaN(ksParseRp_(i.value)); });
  if (takTerbaca.length) {
    pesan.classList.remove("hidden"); pesan.classList.add("ks-form-galat");
    pesan.textContent = ksNamaAkun(takTerbaca[0].getAttribute("data-akun")) + ": " + ksGalatRp_(takTerbaca[0].value);
    return;
  }
  const isi = inputs.filter(function (i) {
    const v = String(i.value).trim(); if (v === "") return false;
    const a = i.getAttribute("data-awal"), awal = (a === null || a === "") ? NaN : Number(a);
    return isNaN(awal) || Math.round(ksParseRp_(v) * 100) !== Math.round(awal * 100);
  });
  if (!isi.length) { window.alert("Tidak ada saldo baru/berubah untuk disimpan."); return; }
  pesan.classList.remove("hidden"); pesan.classList.remove("ks-form-galat"); pesan.textContent = "Menyimpan...";
  ksTombolRekon_(true);   // v308 (KF-6): klik ganda = baris rekonsiliasi kembar
  let rantai = Promise.resolve(), terkirim = 0;
  isi.forEach(function (i) {
    rantai = rantai.then(function () { return ksKirim_("rekonsiliasiKas", { data: { bulan: KS_BULAN, akun: i.getAttribute("data-akun"), saldoBank: ksParseRp_(i.value) } }); })
      .then(function () { terkirim++; });
  });
  rantai.then(function () { return ksMuat(KS_BULAN, { sesudahTulis: true }); }).catch(function (e) {
    // @K17 WK-D6 (v362): akun ke-1 tertulis, ke-2 gagal -> dulu TANPA baca-ulang, jadi data-awal
    // akun ke-1 basi dan Simpan berikutnya mengirimnya LAGI (baris rekonsiliasi kembar). Baca
    // ulang begitu ada yang sudah tertulis ATAU jawabannya hilang. Kalau belum ada satu pun yang
    // tertulis dan server menolak dengan alasan, ketikan di kotak lain JANGAN dibuang.
    const jaringan = e instanceof TypeError;
    const teks = jaringan ? "Jawaban server tidak sampai -- tabel dimuat ulang, periksa akun mana yang sudah tersimpan sebelum menyimpan lagi."
      : (terkirim ? terkirim + " akun tersimpan, lalu: " : "") + e.message;
    const tampil = function () {
      const p = document.getElementById("ks-rekon-pesan");
      if (p) { p.classList.remove("hidden"); p.classList.add("ks-form-galat"); p.textContent = teks; }
      ksTombolRekon_(false);   // tombol hasil render ulang tidak punya penanda sibuk -> tidak tersentuh
    };
    if (terkirim || jaringan) ksMuat(KS_BULAN, { sesudahTulis: true }).then(tampil); else tampil();
  });
}
/** v308 (KF-6): matikan/hidupkan tombol rekonsiliasi & tutup bulan selama permintaan berjalan. */
function ksTombolRekon_(sibuk) {
  Array.prototype.forEach.call(document.querySelectorAll("#ks-rekon button"), function (b) {
    if (sibuk) { b.dataset.sebelumSibuk = b.disabled ? "1" : "0"; b.disabled = true; }
    else if (b.dataset.sebelumSibuk !== undefined) { b.disabled = b.dataset.sebelumSibuk === "1"; delete b.dataset.sebelumSibuk; }   // tombol Tutup yang memang mati tetap mati
  });
}
function ksTutupBulan() {
  if (!window.confirm("Tutup " + ksNamaBulan(KS_BULAN) + "? Setelah ditutup, transaksi bertanggal di bulan ini tidak bisa ditambah; koreksi dicatat di bulan berjalan.")) return;
  ksTombolRekon_(true);   // v308 (KF-6)
  ksKirim_("tutupBulanKas", { bulan: KS_BULAN }).then(function () { ksMuat(KS_BULAN); }).catch(function (e) { window.alert(e.message); ksTombolRekon_(false); });
}

function ksRenderPeringatan_() {
  const el = document.getElementById("ks-peringatan"); if (!el) return;
  const p = KS_DATA.peringatan || [];
  if (!KS_DATA.sheetAda) { el.classList.remove("hidden"); el.innerHTML = '<b>Sheet "SD Kas" belum ada.</b> Jalankan <code>buatSheetKas()</code> di Apps Script.'; return; }
  if (!p.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = '<b>' + p.length + ' baris di SD Kas tidak bisa dihitung</b> -- perbaiki di sheet:<ul>' + p.map(function (x) { return '<li>Baris ' + x.baris + ' <span class="ks-mono">' + ksEsc_(x.id) + '</span>: ' + ksEsc_(x.pesan) + '</li>'; }).join("") + '</ul>';
}

// ---------- mulai ----------
window.addEventListener("load", function () {
  const sesi = ksBacaSesi_();
  if (sesi) { KS_ID_TOKEN = sesi; ksMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { ksShow("ks-login-box"); return; }
  google.accounts.id.initialize({ client_id: KS_OAUTH_CLIENT_ID, callback: ksHandleGoogleLogin });
  const t = document.getElementById("ks-google-btn"); if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  ksShow("ks-login-box");
});
