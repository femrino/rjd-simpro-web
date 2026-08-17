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
  html += "<div><div class='kh-lbl'>Kontribusi / menit</div><div class='kh-v'>" +
    khRp(h.keputusan.kontribusiPerMenit) + "</div></div>";
  html += "<div><div class='kh-lbl'>Beban kapasitas</div><div class='kh-v'>" +
    (Math.round(h.keputusan.bebanKapasitasBulan * 1000) / 10) + "% sebulan</div></div>";
  html += "</div></div>";

  /* ---------- susunan biaya ---------- */
  html += "<div class='kh-card'><h2>Susunan biaya per pcs</h2><table class='kh-tabel'>";
  var smvKet = h.smv.sumber === "resep"
    ? "resep" + (h.smv.cakupan !== null && h.smv.cakupan < 1
        ? ", terisi " + Math.round(h.smv.cakupan * 100) + "%" : "")
    : "manual";
  html += khBaris_("Upah borongan",
    (Math.round(h.smv.efektif * 10) / 10) + " mnt (" + smvKet + ")",
    khRp(h.perPcs.upah));
  html += khBaris_("Overhead pabrik",
    "efisiensi " + Math.round(h.tarif.efisiensi * 100) + "%",
    khRentang_(h.perPcs.overheadMin, h.perPcs.overheadMax));
  if (h.perPcs.kain > 0) html += khBaris_("Kain", "Maklon", khRp(h.perPcs.kain));
  html += khBaris_("Aksesoris", "sumber: " + khEsc_(h.perPcs.sumberAksesoris),
    khRp(h.perPcs.aksesoris));
  if (h.perPcs.jasaLuar > 0) html += khBaris_("Jasa luar", "bordir / sablon / wash",
    khRp(h.perPcs.jasaLuar));
  html += khBaris_("Biaya sekali jalan",
    "dibagi " + h.identitas.qty.toLocaleString("id-ID") + " pcs",
    khRp(h.perPcs.setup));
  html += khBaris_("Cadangan reject", h.perPcs.rejectPersen + "% dari output", "(pembagi)");
  html += khBaris_("Modal kerja", "termin pembayaran",
    khRentang_(h.perPcs.modalKerjaMin, h.perPcs.modalKerjaMax));
  html += "<tr class='kh-tot'><td>Harga lantai</td><td>" +
    khRentang_(h.harga.lantaiMin, h.harga.lantaiMax) + "</td></tr>";
  html += "</table>";

  /* ---------- peringatan ---------- */
  if (h.peringatan && h.peringatan.length) {
    html += "<div class='kh-warn'><b>Periksa sebelum menawar:</b><ul>";
    h.peringatan.forEach(function(p){ html += "<li>" + khEsc_(p) + "</li>"; });
    html += "</ul></div>";
  }
  html += "</div>";

  wadah.innerHTML = html;
  document.getElementById("kh-btn-simpan").classList.remove("hidden");
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
