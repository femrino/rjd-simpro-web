/**
 * ============================================================
 * SIMPRO -- simpro-kalkulator
 * ============================================================
 * DIMUAT DI : kalkulator-harga.html (STAFF ONLY, area keuangan)
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file ini memakai
 *             rjdJagaHalaman & kawan-kawan dari sana.
 *
 * Backend   : action "hitungHargaPenawaran" di simpro-tracking-api.gs,
 *             handler khHandleHitungHarga di kalkulator-harga.gs.
 *             Backend adalah SATU-SATUNYA tempat rumus hidup -- file ini
 *             cuma mengirim masukan dan menggambar jawaban, supaya tidak
 *             pernah ada dua versi rumus yang bisa saling berbeda.
 *
 * v222: sesi tersimpan (db_session) + tombol Keluar + hamburger.
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const KH_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const KH_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let KH_ID_TOKEN = null;
let KH_PAYLOAD_TERAKHIR = null;   // dipakai tombol Simpan -- payload yang SAMA
let KH_SEDANG_HITUNG = false;

/* ============================================================
 * KERANGKA HALAMAN
 * ============================================================ */

function khShow(id){
  ["kh-login-box","kh-loading","kh-error","kh-isi"].forEach(function(x){
    var el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  var t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function khTampilkanError(pesan){
  document.getElementById("kh-error-message").textContent = pesan;
  khShow("kh-error");
}

/* ============================================================
 * SESI & KELUAR (v222)
 * ============================================================
 * Dulu halaman ini satu-satunya halaman staff tanpa sesi tersimpan dan tanpa
 * tombol Keluar: tiap buka harus login lagi, dan hamburger tidak pernah
 * muncul karena digate ke tombol Keluar yang tidak ada. Sekarang memakai
 * "db_session" yang sama dengan dashboard/produksi/jadwal, jadi login di satu
 * halaman berlaku di semua. */
function khBacaSesi_(){
  try {
    var raw = localStorage.getItem("db_session");
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}
function khSimpanSesi_(token){
  try {
    var p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp }));
  } catch (e) { /* private mode */ }
}
function khLogout(){
  KH_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
  var b = document.getElementById("kh-nav-logout");
  if (b) b.classList.add("hidden");
  khShow("kh-login-box");
}

function khHandleLogin(response){
  KH_ID_TOKEN = response.credential;
  khSimpanSesi_(response.credential);
  khShow("kh-loading");
  // Satpam halaman -- pola yang sama dengan laporan omset. Dibungkus typeof:
  // kalau simpro-global.js gagal dimuat, halaman tetap jalan; backend
  // (pastikanBoleh_ + penjaga staff di rute) tetap menolak data untuk yang
  // tidak berhak, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(KH_ID_TOKEN, KH_API_URL, khTampilkanForm_);
  } else {
    khTampilkanForm_();
  }
}

function khTampilkanForm_(){
  var b = document.getElementById("kh-nav-logout");
  if (b) b.classList.remove("hidden");   // v222: sekaligus membuka hamburger (gate CSS)
  khShow("kh-isi");
  khBangunForm_();
}



/* khPilihJenis & KH_JENIS dipensiunkan (v130): jenis order jadi dropdown
   biasa (#kh-jenis) atas permintaan Femri -- lebih ringkas di baris tiga
   kolom, dan nilainya ikut draf otomatis seperti field lain. */

/* ============================================================
 * AUTO-HITUNG BERJEDA + DRAF FORM (v130)
 * ============================================================
 * Rumus hidup di server (latensi 1-3 dtk) -- menghitung per ketukan =
 * hasil berkedip dan respons balapan. Aturannya:
 * - jeda 1 dtk setelah perubahan terakhir, baru hitung;
 * - kalau hitungan lain sedang jalan, coba lagi 700 md kemudian
 *   (khHitung sudah menjaga diri lewat KH_SEDANG_HITUNG, jadi respons
 *   tidak pernah saling salip);
 * - form belum layak (qty kosong dsb.) -> diam, tanpa error mengganggu;
 * - tiap perubahan juga menyimpan DRAF ke localStorage: buka halaman
 *   lagi, isian terakhir kembali.
 */
let KH_AUTO_TIMER = null;

function khOnUbah_(){
  khSimpanDraf_();
  if (KH_AUTO_TIMER) clearTimeout(KH_AUTO_TIMER);
  KH_AUTO_TIMER = setTimeout(khAutoHitung_, 1000);
}

function khAutoHitung_(){
  if (KH_SEDANG_HITUNG) {   // let se-scope, BUKAN window.* (perbaikan dlm v130)
    KH_AUTO_TIMER = setTimeout(khAutoHitung_, 700);
    return;
  }
  const p = khSusunPayload_();
  const smv3 = (p.smvCutting || 0) + (p.smvSewing || 0) + (p.smvFinishing || 0);
  if (!(p.qty > 0) || (!(smv3 > 0) && !p.artikel)) return;   // belum layak: diam
  khHitung();
}

/* ============================================================
 * PEMBANDING SMV (v132) -- menutup celah menawar MODEL BARU
 * ============================================================ */
let KH_PEMBANDING = [];

function khMuatPembanding_(){
  fetch(KH_API_URL, { method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "getDaftarSmvArtikel", idToken: KH_ID_TOKEN }) })
  .then(function(r){ return r.json(); })
  .then(function(d){
    const sel = document.getElementById("kh-pembanding");
    if (!sel) return;
    if (d.error || !(d.daftar || []).length) {
      sel.innerHTML = '<option value="">' + (d.error ? "gagal memuat" :
        "belum ada resep artikel di arsip") + '</option>';
      return;
    }
    KH_PEMBANDING = d.daftar;
    window.KH_RASIO = d.rasio || null;
    khTampilRasio_();
    sel.innerHTML = '<option value="">-- pilih artikel serupa --</option>' +
      d.daftar.map(function(x, i){
        return '<option value="' + i + '">' + khEsc_(
          [x.artikel, x.style].filter(Boolean).join(" \u00b7 ")) +
          ' \u2014 ' + x.totalMenit + ' mnt' +
          (x.cakupan < 100 ? ' (resep ' + x.cakupan + '%)' : '') + '</option>';
      }).join("");
  })
  .catch(function(){ /* biarkan; dropdown tetap berpesan */ });
}

function khPakaiPembanding_(){
  const sel = document.getElementById("kh-pembanding");
  const x = KH_PEMBANDING[Number(sel && sel.value)];
  if (!x) return;
  document.getElementById("kh-smv-cut").value = x.cutting || "";
  document.getElementById("kh-smv-sew").value = x.sewing || "";
  document.getElementById("kh-smv-fin").value = x.finishing || "";
  if (x.cakupan < 100) {
    khFormError_("Resep pembanding baru terisi " + x.cakupan +
      "% \u2014 menitnya kemungkinan TERLALU RENDAH. Naikkan Model baru % lebih tebal.");
  } else {
    khFormError_("");
  }
  khOnUbah_();   // simpan draf + auto-hitung
}

function khTampilRasio_(){
  const w = document.getElementById("kh-rasio-wrap");
  const inf = document.getElementById("kh-rasio-info");
  if (!w || !inf || !window.KH_RASIO) return;
  const r = window.KH_RASIO;
  w.style.display = "";
  inf.innerHTML = "Tidak ada pembanding serupa? <b>Estimasi dari jumlah proses</b>: " +
    "median arsipmu <b>" + r.menitPerProses + " mnt/proses</b> (rentang " + r.p25 +
    "\u2013" + r.p75 + ", dari " + r.artikelDipakai + " artikel bercakupan tinggi). " +
    "Ini anak tangga paling kasar \u2014 pakai <b>Model baru %</b> tebal (15\u201325).";
}

function khEstimasiDariProses_(){
  const r = window.KH_RASIO;
  const n = parseFloat(String((document.getElementById("kh-jml-proses") || {}).value || "").replace(",", "."));
  if (!r || !(n > 0)) { khFormError_("Isi jumlah proses dulu (dari pecah proses model barunya)."); return; }
  const total = n * r.menitPerProses;
  const b1 = function (x) { return Math.round(x * 10) / 10; };
  document.getElementById("kh-smv-cut").value = b1(total * r.shareCutting);
  document.getElementById("kh-smv-sew").value = b1(total * r.shareSewing);
  document.getElementById("kh-smv-fin").value = b1(total * r.shareFinishing);
  khFormError_("Estimasi kasar dari " + n + " proses \u00d7 " + r.menitPerProses +
    " mnt (rentang total " + b1(n * r.p25) + "\u2013" + b1(n * r.p75) +
    " mnt). Naikkan Model baru % 15\u201325, dan timbang ulang begitu sampel jadi.");
  khOnUbah_();
}

const KH_DRAF_KUNCI = "kh_draf_v3";

function khSimpanDraf_(){
  try {
    const d = { jenis: KH_JENIS, isi: {} };
    document.querySelectorAll(".kh-grid > div input[id], .kh-grid > div select[id]").forEach(function (el) {
      if (el.value) d.isi[el.id] = el.value;
    });
    localStorage.setItem(KH_DRAF_KUNCI, JSON.stringify(d));
  } catch (e) { /* mode privat: biarkan */ }
}

function khPulihkanDraf_(){
  try {
    const raw = localStorage.getItem(KH_DRAF_KUNCI);
    if (!raw) return;
    const d = JSON.parse(raw);
    Object.keys(d.isi || {}).forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = d.isi[id];
    });
    if (d.jenis) { const s = document.getElementById("kh-jenis"); if (s) s.value = d.jenis; }
  } catch (e) { /* draf rusak: mulai bersih */ }
}

/**
 * v128: form dibangun ulang mengikuti REFERENSI Femri (20 Agu 2026) --
 * markup pindah ke sini (pola cangkang v115: template cuma wadah, isi
 * milik JS supaya rilis form berikutnya cukup satu file). Perubahan inti:
 * - SMV pecah per divisi (Cutting/Sewing/Finishing) -- dijumlah backend;
 * - BIAYA SEKALI JALAN = 4 kotak Rupiah langsung, menggantikan kunci
 *   "jenis artikel setup" yang kemarin terisi angka 1000000;
 * - ASUMSI PABRIK terlihat & bisa disetel (kosong = bawaan backend);
 * - jenis order jadi dua tombol; rumus TETAP seluruhnya di backend.
 */
function khBangunForm_(){
  const kolom = document.querySelector(".kh-grid > div");
  if (!kolom || document.getElementById("kh-smv-sew")) return;
  const F = function(label, id, ph, sub){
    return '<div class="kh-field"><label>' + label + '</label>' +
      (sub ? '<p class="kh-sub">' + sub + '</p>' : '') +
      '<input id="' + id + '" type="text" inputmode="decimal" placeholder="' + (ph || "") + '"/></div>';
  };
  kolom.innerHTML =
    '<div class="kh-card"><h2>Pekerjaan yang ditawar</h2>' +
      '<div class="kh-row3">' + F("Brand","kh-brand","") + F("Artikel","kh-artikel","") + F("Style","kh-style","") + '</div>' +
      '<div class="kh-field"><label>Menit kerja per pcs (SMV)</label>' +
        '<p class="kh-sub">Skala menit resep RJD. Kosongkan ketiganya untuk menarik dari resep Archive_PecahProses.</p>' +
        '<div class="kh-row3 kh-smvbox">' +
          '<div><input id="kh-smv-cut" inputmode="decimal" type="text"/><span>Cutting</span></div>' +
          '<div><input id="kh-smv-sew" inputmode="decimal" type="text"/><span>Sewing</span></div>' +
          '<div><input id="kh-smv-fin" inputmode="decimal" type="text"/><span>Finishing</span></div>' +
        '</div></div>' +
      '<div class="kh-field"><label>Pembanding SMV (untuk model baru)</label>' +
        '<p class="kh-sub">Model baru belum punya jejak menit? Ambil dari artikel serupa yang pernah jalan, lalu naikkan <b>Model baru %</b> 10\u201315 sebagai bantalan.</p>' +
        '<div style="display:flex;gap:8px">' +
          '<select id="kh-pembanding" style="flex:1"><option value="">-- muat daftar dulu --</option></select>' +
          '<button class="kh-btn" id="kh-pembanding-pakai" onclick="khPakaiPembanding_()" style="width:auto;padding:0 18px" type="button">Pakai</button>' +
        '</div>' +
        '<div id="kh-rasio-wrap" style="display:none;margin-top:10px">' +
          '<p class="kh-sub" id="kh-rasio-info"></p>' +
          '<div style="display:flex;gap:8px">' +
            '<input id="kh-jml-proses" inputmode="numeric" placeholder="jumlah proses (dari pecah proses)" style="flex:1" type="text"/>' +
            '<button class="kh-btn" onclick="khEstimasiDariProses_()" style="width:auto;padding:0 18px" type="button">Estimasi</button>' +
          '</div>' +
        '</div></div>' +
      '<div class="kh-row3">' + F("Qty (pcs)","kh-qty","wajib \u2014 mis. 1000") +
        '<div class="kh-field"><label>Jenis order</label>' +
          '<select id="kh-jenis"><option value="CMT">CMT</option><option value="Maklon">Maklon</option></select></div>' +
        F("Margin target %","kh-margin","bawaan 20") + '</div>' +
    '</div>' +
    '<div class="kh-card"><h2>Bahan &amp; jasa luar (Rp per pcs)</h2>' +
      F("Kain","kh-kain","bawaan 0 \u2014 kain dari klien","konsumsi marker &#215; harga kain. Nol untuk CMT &#8212; kain dari klien.") +
      F("Aksesoris","kh-aks","mis. 3500","benang, kancing, label, hangtag, poly &#8212; PER PCS. Kosongkan untuk otomatis dari resep + SD Master Harga Aksesoris.") +
      F("Jasa luar","kh-jasa","bawaan 0","bordir / sablon / printing / wash pihak ketiga, per pcs.") +
    '</div>' +
    '<div class="kh-card"><h2>Biaya sekali jalan (Rp)</h2>' +
      '<p class="kh-sub">Dikeluarkan sekali berapa pun jumlah ordernya, lalu dibagi ke seluruh pcs. Inilah sebabnya 50 pcs tidak boleh sama harganya dengan 5.000 pcs. Kosong semua = ambil dari SD Biaya Setup.</p>' +
      '<div class="kh-row2">' + F("Sample &amp; approval","kh-set-sample","mis. 450000") + F("Marker &amp; pola","kh-set-marker","mis. 250000") + '</div>' +
      '<div class="kh-row2">' + F("Setel lini / ganti model","kh-set-lini","mis. 600000") + F("Administrasi &amp; kirim","kh-set-admin","mis. 300000") + '</div>' +
    '</div>' +
    '<div class="kh-card"><h2>Risiko &amp; keadaan</h2>' +
      '<div class="kh-row2">' + F("Reject / rework %","kh-reject","bawaan 3") + F("Termin pembayaran (hari)","kh-termin","bawaan 0 \u2014 lunas di muka") + '</div>' +
      '<div class="kh-row2">' + F("Model baru %","kh-belajar","bawaan 0","kurva belajar; 0 untuk artikel rutin") + F("Kesulitan bahan %","kh-bahan","bawaan 0","licin / stretch / motif matching") + '</div>' +
    '</div>' +
    '<div class="kh-card"><h2>Asumsi pabrik</h2>' +
      '<p class="kh-sub">Kosong = bawaan sistem. Isi untuk simulasi &#8212; angka-angka ini menentukan seluruh harga di sebelah kanan.</p>' +
      '<div class="kh-row2">' + F("Upah borongan / bulan (Rp)","kh-upah-bulan","bawaan sistem") + F("Biaya tetap / bulan (Rp)","kh-tetap-bulan","bawaan sistem") + '</div>' +
      '<div class="kh-row3">' + F("Kapasitas menit / bulan","kh-kapasitas","mis. 472500") + F("Efisiensi lini %","kh-efisiensi","bawaan 50") + F("Bunga modal / bulan %","kh-bunga","bawaan 1,5") + '</div>' +
    '</div>' +
    '<button class="kh-btn" id="kh-btn-hitung" onclick="khHitung()" type="button">Hitung Harga</button>' +
    '<div class="kh-form-error" id="kh-form-error"></div>';

  // v130: draf terakhir dikembalikan, lalu SEMUA perubahan input memicu
  // auto-hitung berjeda (lihat khOnUbah_). Tombol tetap ada sebagai jangkar.
  khPulihkanDraf_();
  khMuatPembanding_();
  kolom.addEventListener("input", khOnUbah_);
  kolom.addEventListener("change", khOnUbah_);   // select tidak selalu memicu "input"
    // Perbaikan v129: tombol memakai kelas & id LAMA (kh-btn / kh-btn-hitung)
    // -- khHitung men-disable lewat id itu dan CSS-nya menempel di kelas itu;
    // versi v128 memakai nama baru: gaya hilang & khHitung mati di baris
    // pertama (null.disabled), klik terasa diam. Kotak error juga sempat
    // berkelas "hidden" global (!important) yang mengalahkan .tampil.
}

window.onload = function(){
  // v222: sesi tersimpan dari halaman lain -> langsung masuk tanpa tombol Google.
  var sesi = khBacaSesi_();
  if (sesi) {
    KH_ID_TOKEN = sesi;
    khShow("kh-loading");
    if (typeof rjdJagaHalaman === "function") rjdJagaHalaman(KH_ID_TOKEN, KH_API_URL, khTampilkanForm_);
    else khTampilkanForm_();
    return;
  }
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({
      client_id: KH_OAUTH_CLIENT_ID,
      callback: khHandleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("kh-google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }
};

/* ============================================================
 * MASUKAN
 * ============================================================ */

function khNilai_(id){
  var el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function khAngka_(id){
  var n = parseFloat(String(khNilai_(id)).replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
}

function khJenisGanti(){
  var maklon = khNilai_("kh-jenis") === "Maklon";
  document.getElementById("kh-field-kain").style.display = maklon ? "" : "none";
}

function khFormError_(pesan){
  var el = document.getElementById("kh-form-error");
  el.textContent = pesan || "";
  el.classList.toggle("tampil", !!pesan);
}

function khSusunPayload_(){
  return {
    action: "hitungHargaPenawaran",
    idToken: KH_ID_TOKEN,
    brand: khNilai_("kh-brand"),
    artikel: khNilai_("kh-artikel"),
    style: khNilai_("kh-style"),
    qty: khAngka_("kh-qty"),
    jenisOrder: khNilai_("kh-jenis") || "CMT",
    smvCutting: khAngka_("kh-smv-cut"),
    smvSewing: khAngka_("kh-smv-sew"),
    smvFinishing: khAngka_("kh-smv-fin"),
    kainPerPcs: khAngka_("kh-kain"),
    aksesorisManualPerPcs: khAngka_("kh-aks"),
    jasaLuarPerPcs: khAngka_("kh-jasa"),
    setupSample: khAngka_("kh-set-sample"),
    setupMarker: khAngka_("kh-set-marker"),
    setupLini: khAngka_("kh-set-lini"),
    setupAdmin: khAngka_("kh-set-admin"),
    asumsiUpahBulanan: khAngka_("kh-upah-bulan"),
    asumsiBiayaTetapBulanan: khAngka_("kh-tetap-bulan"),
    asumsiKapasitasMenit: khAngka_("kh-kapasitas"),
    asumsiEfisiensiPersen: khAngka_("kh-efisiensi"),
    asumsiBungaPersen: khAngka_("kh-bunga"),
    marginPersen: khAngka_("kh-margin"),
    rejectPersen: khAngka_("kh-reject"),
    belajarPersen: khAngka_("kh-belajar"),
    bahanPersen: khAngka_("kh-bahan"),
    terminHari: khAngka_("kh-termin")
  };
}

/* ============================================================
 * HITUNG
 * ============================================================ */

function khHitung(){
  if (KH_SEDANG_HITUNG) return;
  khFormError_("");

  var p = khSusunPayload_();
  if (!(p.qty > 0)) { khFormError_("Qty wajib diisi."); return; }
  // v129: payload v3 mengirim SMV per divisi, bukan smvManual tunggal.
  var smv3 = (p.smvCutting || 0) + (p.smvSewing || 0) + (p.smvFinishing || 0);
  if (!(smv3 > 0) && !p.artikel) {
    khFormError_("Isi menit SMV (Cutting/Sewing/Finishing), atau isi nama Artikel supaya menitnya ditarik dari resep.");
    return;
  }

  KH_SEDANG_HITUNG = true;
  var btn = document.getElementById("kh-btn-hitung");
  btn.disabled = true; btn.textContent = "Menghitung...";
  document.getElementById("kh-simpan-ok").classList.remove("tampil");

  fetch(KH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(p)
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.error) { khFormError_(d.error); return; }
    KH_PAYLOAD_TERAKHIR = p;
    khRender_(d.hasil);
  })
  .catch(function(e){
    khFormError_("Gagal menghubungi server: " + String(e && e.message ? e.message : e));
  })
  .finally(function(){
    KH_SEDANG_HITUNG = false;
    btn.disabled = false; btn.textContent = "Hitung Harga";
  });
}

/* ============================================================
 * GAMBAR HASIL
 * ============================================================ */

function khRp(n){
  if (!isFinite(n)) return "-";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function khRentang_(a, b){
  return khRp(a) + " - " + Math.round(b).toLocaleString("id-ID");
}
function khEsc_(s){
  return String(s || "").replace(/[&<>"']/g, function(c){
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

function khRender_(h){
  var wadah = document.getElementById("kh-hasil");
  var html = "";

  /* ---------- hero ---------- */
  html += "<div class='kh-hero'>";
  html += "<div class='kh-lbl'>Harga tawar per pcs (margin " +
    Math.round(h.harga.marginPersen) + "%)</div>";
  html += "<div class='kh-big'>" + khRentang_(h.harga.tawarMin, h.harga.tawarMax) +
    " <small>/ pcs</small></div>";
  html += "<div class='kh-lbl'>Harga lantai " +
    khRentang_(h.harga.lantaiMin, h.harga.lantaiMax) +
    " &middot; di bawah ini rugi</div>";
  html += "<div class='kh-hero-row'>";
  html += "<div><div class='kh-lbl'>Nilai order</div><div class='kh-v'>" +
    khRentang_(h.keputusan.nilaiOrderMin, h.keputusan.nilaiOrderMax) + "</div></div>";
  html += "<div><div class='kh-lbl'>Laba order</div><div class='kh-v'>" +
    khRentang_(h.keputusan.labaOrderMin, h.keputusan.labaOrderMax) + "</div></div>";
  html += "<div><div class='kh-lbl'>Kontribusi / menit</div><div class='kh-v'>" +
    khRp(h.keputusan.kontribusiPerMenit) + "</div></div>";
  html += "</div></div>";

  /* ---------- susunan biaya, dengan bar proporsi (gaya prototipe) ---------- */
  var dasar = h.harga.lantaiMax > 0 ? h.harga.lantaiMax : 1;
  var smvKet = h.smv.sumber === "resep"
    ? (Math.round(h.smv.efektif * 10) / 10) + " mnt dari resep" +
      (h.smv.prosesTotal ? ", " + h.smv.prosesTerisi + "/" + h.smv.prosesTotal + " proses" : "")
    : (Math.round(h.smv.efektif * 10) / 10) + " mnt (manual) x " + khRp(h.tarif.upahPerMenit) + "/mnt";

  var baris = [
    ["Upah borongan", h.perPcs.upah, h.perPcs.upah, "var(--terra)", smvKet],
    ["Overhead pabrik", h.perPcs.overheadMin, h.perPcs.overheadMax, "var(--navy-soft)",
      (Math.round(h.smv.efektif / h.tarif.efisiensi * 10) / 10) + " mnt kapasitas @ efisiensi " +
      Math.round(h.tarif.efisiensi * 100) + "%"],
    ["Kain", h.perPcs.kain, h.perPcs.kain, "var(--gold)", "Maklon"],
    ["Aksesoris", h.perPcs.aksesoris, h.perPcs.aksesoris, "var(--sky)",
      "sumber: " + h.perPcs.sumberAksesoris],
    ["Jasa luar", h.perPcs.jasaLuar, h.perPcs.jasaLuar, "var(--emerald)", "bordir / sablon / wash"],
    ["Biaya sekali jalan", h.perPcs.setup, h.perPcs.setup, "var(--amber)",
      khRp(h.perPcs.setupTotal) + " : " + h.identitas.qty.toLocaleString("id-ID") + " pcs"]
  ];

  html += "<div class='kh-card'><h2>Susunan biaya per pcs</h2><table class='kh-tabel'>";
  baris.forEach(function(b){
    if (!(b[2] > 0.5)) return;
    var f = Math.min(1, b[2] / dasar);
    html += "<tr><td><b>" + khEsc_(b[0]) + "</b>" +
      "<div class='kh-bar'><i style='width:" + (f * 100).toFixed(1) + "%;background:" + b[3] + "'></i></div>" +
      "<span class='kh-sub'>" + khEsc_(b[4]) + "</span></td>" +
      "<td>" + (b[1] === b[2] ? khRp(b[1]) : khRentang_(b[1], b[2])) +
      "<div class='kh-sub' style='text-align:right'>" + Math.round(b[2] / dasar * 100) + "%</div></td></tr>";
  });
  html += khBaris_("Cadangan reject", h.perPcs.rejectPersen + "% dari output", "(pembagi)");
  html += khBaris_("Modal kerja", "termin pembayaran",
    khRentang_(h.perPcs.modalKerjaMin, h.perPcs.modalKerjaMax));
  html += "<tr class='kh-tot'><td>Harga lantai</td><td>" +
    khRentang_(h.harga.lantaiMin, h.harga.lantaiMax) + "</td></tr>";
  html += "<tr class='kh-tot' style='border-top:1px dashed var(--line,#E5E0D6)'><td>Harga tawar @ " +
    Math.round(h.harga.marginPersen) + "%</td><td>" +
    khRentang_(h.harga.tawarMin, h.harga.tawarMax) + "</td></tr>";
  html += "</table>";

  if (h.peringatan && h.peringatan.length) {
    html += "<div class='kh-warn'><b>Periksa sebelum menawar:</b><ul>";
    h.peringatan.forEach(function(p){ html += "<li>" + khEsc_(p) + "</li>"; });
    html += "</ul></div>";
  }
  html += "</div>";

  /* ---------- kurva harga menurut jumlah ---------- */
  if (h.kurva && h.kurva.length > 2) {
    html += "<div class='kh-card'><h2>Harga menurut jumlah order</h2>" +
      khGambarKurva_(h.kurva, h.identitas.qty) +
      "<div class='kh-legend'><span><i style='background:var(--terra)'></i>harga tawar (batas atas)</span>" +
      "<span><i style='background:var(--navy-soft)'></i>jumlah yang sedang dihitung</span></div>" +
      "<div class='kh-note'>" + khKurvaCatatan_(h.kurva) + "</div></div>";
  }

  /* ---------- beban kapasitas ---------- */
  var kapHari = h.tarif.kapasitasMenitBulan / 25;
  var hariPenuh = kapHari > 0 ? h.keputusan.menitOrderTotal / kapHari : 0;
  html += "<div class='kh-card'><h2>Beban kapasitas &amp; waktu</h2>";
  html += khKv_("Menit kapasitas yang dimakan order ini",
    Math.round(h.keputusan.menitOrderTotal).toLocaleString("id-ID") + " mnt");
  html += khKv_("Porsi kapasitas sebulan",
    (Math.round(h.keputusan.bebanKapasitasBulan * 1000) / 10) + "%");
  html += khKv_("Kalau seluruh pabrik dikerahkan",
    (Math.round(hariPenuh * 10) / 10) + " hari kerja");
  html += khKv_("Kalau berbagi dengan 2 order lain",
    Math.ceil(hariPenuh * 3) + " hari kerja");
  html += "<div class='kh-note'><b>Kontribusi " + khRp(h.keputusan.kontribusiPerMenit) +
    " per menit</b> adalah pembanding antar order yang sebenarnya, bukan margin persen. " +
    "Saat kapasitas penuh (Januari sd Maret) yang langka bukan uang tapi menit; " +
    "di musim sepi, terima yang kontribusinya masih di atas tarif overhead (" +
    khRp(h.tarif.ohMaxPerMenit) + "/mnt), karena biaya tetap jalan terus entah ada order atau tidak.</div>";
  html += "</div>";

  wadah.innerHTML = html;
  document.getElementById("kh-btn-simpan").classList.remove("hidden");
}

/* SVG kurva -- data dari backend, di sini murni menggambar. */
function khGambarKurva_(kurva, qtyAktif){
  var W = 620, H = 210, PL = 56, PR = 14, PT = 14, PB = 26;
  var vals = kurva.map(function(p){ return p.tawarMax; });
  var maks = Math.max.apply(null, vals) * 1.06;
  var min = Math.min.apply(null, vals) * 0.92;
  function lx(i){ return PL + (W - PL - PR) * (i / (kurva.length - 1)); }
  function ly(v){ return PT + (H - PT - PB) * (1 - (v - min) / Math.max(1, maks - min)); }

  var s = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' role='img' " +
    "aria-label='Harga per pcs menurun seiring jumlah order membesar'>";
  [0, .5, 1].forEach(function(f){
    var v = min + (maks - min) * f, y = ly(v);
    s += "<line x1='" + PL + "' y1='" + y.toFixed(1) + "' x2='" + (W - PR) +
      "' y2='" + y.toFixed(1) + "' stroke='#EFEAE0' stroke-width='1'/>" +
      "<text x='" + (PL - 6) + "' y='" + (y + 3).toFixed(1) +
      "' text-anchor='end' class='kh-svg-t'>" + Math.round(v / 1000) + "rb</text>";
  });
  var d = kurva.map(function(p, i){
    return (i ? "L" : "M") + lx(i).toFixed(1) + " " + ly(p.tawarMax).toFixed(1);
  }).join(" ");
  s += "<path d='" + d + "' fill='none' stroke='#BD4335' stroke-width='2.5' stroke-linejoin='round'/>";
  kurva.forEach(function(p, i){
    var tanda = p.qty === qtyAktif;
    var tampilLabel = tanda || p.qty === 50 || p.qty === 500 || p.qty === 5000;
    if (tanda || tampilLabel) {
      s += "<circle cx='" + lx(i).toFixed(1) + "' cy='" + ly(p.tawarMax).toFixed(1) +
        "' r='" + (tanda ? 5 : 3.2) + "' fill='" + (tanda ? "#2A3754" : "#BD4335") + "'/>";
    }
    if (tampilLabel) {
      s += "<text x='" + lx(i).toFixed(1) + "' y='" + (H - 8) +
        "' text-anchor='middle' class='kh-svg-t'>" +
        p.qty.toLocaleString("id-ID") + "</text>";
    }
  });
  s += "</svg>";
  return s;
}

function khKurvaCatatan_(kurva){
  var kecil = kurva[0], besar = kurva[kurva.length - 1];
  var selisih = kecil.tawarMax > 0 ? (kecil.tawarMax - besar.tawarMax) / kecil.tawarMax : 0;
  return "Order " + kecil.qty + " pcs berongkos " + khRp(kecil.tawarMax) +
    " per pcs; " + besar.qty.toLocaleString("id-ID") + " pcs cukup " +
    khRp(besar.tawarMax) + " -- selisih " + Math.round(selisih * 100) +
    "%, seluruhnya dari biaya sekali jalan yang dibagi lebih sedikit kepala. " +
    "Kalkulator lama memberi angka datar berapa pun jumlahnya; itu sebabnya " +
    "order kecil selalu terasa capek tapi tidak terasa untungnya.";
}

function khKv_(label, nilai){
  return "<div class='kh-kv'><span>" + khEsc_(label) + "</span><b>" + nilai + "</b></div>";
}

function khBaris_(judul, sub, nilai){
  return "<tr><td>" + khEsc_(judul) +
    (sub ? "<div class='kh-sub'>" + khEsc_(sub) + "</div>" : "") +
    "</td><td>" + nilai + "</td></tr>";
}

/* ============================================================
 * SIMPAN QUOTE
 * ============================================================ */

function khSimpan(){
  if (!KH_PAYLOAD_TERAKHIR) return;
  var btn = document.getElementById("kh-btn-simpan");
  btn.disabled = true; btn.textContent = "Menyimpan...";

  // Payload PERSIS yang tadi dihitung + tanda simpan. Kalau input diubah
  // setelah hitung, yang tersimpan tetap yang terakhir DIHITUNG -- angka di
  // layar dan angka di SD Quote tidak boleh bisa berbeda.
  var p = Object.assign({}, KH_PAYLOAD_TERAKHIR, { simpan: true });

  fetch(KH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(p)
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.error) { khFormError_(d.error); return; }
    var ok = document.getElementById("kh-simpan-ok");
    ok.textContent = "Tersimpan ke SD Quote: " + (d.idQuote || "(tanpa ID)") +
      ". Isi kolom Status setelah klien menjawab.";
    ok.classList.add("tampil");
  })
  .catch(function(e){ khFormError_("Gagal menyimpan: " + String(e && e.message ? e.message : e)); })
  .finally(function(){ btn.disabled = false; btn.textContent = "Simpan sebagai Penawaran"; });
}
