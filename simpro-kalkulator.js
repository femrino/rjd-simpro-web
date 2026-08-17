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

function khHandleLogin(response){
  KH_ID_TOKEN = response.credential;
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
  khShow("kh-isi");
}

window.onload = function(){
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
    jenisOrder: khNilai_("kh-jenis"),
    smvManual: khAngka_("kh-smv"),
    kainPerPcs: khAngka_("kh-kain"),
    aksesorisManualPerPcs: khAngka_("kh-aks"),
    jasaLuarPerPcs: khAngka_("kh-jasa"),
    jenisArtikelSetup: khNilai_("kh-setupjenis"),
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
  if (!(p.smvManual > 0) && !p.artikel) {
    khFormError_("Isi SMV manual (menit per pcs), atau isi nama Artikel supaya menitnya ditarik dari resep.");
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
