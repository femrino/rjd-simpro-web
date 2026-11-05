/* simpro-cutting.js -- halaman /p/cutting.html: FORM CUTTING PER ROLL (langkah 2, 1 Nov 2026; butuh gs >= @428)
 *
 * Satu kiriman = satu marker x lapis dari SATU roll (atau dari kumpulan sisa = End cut). Server (cutting-roll.js,
 * simpanCuttingRoll) menulis gelaran + roll baru + sisa saat roll selesai + penghubung dalam satu lock; halaman ini
 * mengumpulkan isian dan menampilkan neraca per roll (getLaporanCuttingRoll): kirim, aktual, sisa, selisih.
 * Keputusan Femri 1 Nov 2026: input YARD, nomor roll wajib untuk roll baru, roll yang dipakai dua marker = dua baris
 * dengan nomor roll sama (sisa hanya di yang terakhir), End cut dari kumpulan sisa per kain/warna.
 * v395 (permintaan Femri sesudah mencoba MANSL 288): form satu-entri DIGANTI tabel isian banyak baris + tempel dari
 * Excel, satu tombol Simpan semua -- baris dikirim berurutan ke rute yang SAMA (lihat kepala bagian tabel isian).
 * v397 (permintaan Femri): SISA diketik dalam METER (hasil meteran di lantai) dan dikirim apa adanya ber-satuanSisa "m" --
 * server menyimpannya di kolom Satuan Sisa (v204), bukan angka yard hasil konversi layar. Panjang roll tetap yard (label).
 * Semua perbandingan antar-satuan di layar memakai CR_YD; neraca tetap yard, dengan angka ukur asli "(12,5 m)" di sel sisa.
 * v400 (permintaan Femri, bentuk lembar tim "HASIL CUTTING (PER-SIZE)"): neraca memecah hasil tiap roll PER SIZE -- kolom
 * size yang ada hasilnya di kelompok itu + Total, menggantikan kolom Pcs -- dan mendapat baris Total (jumlah kolom).
 * Data per size sudah dikirim server sejak @428 (perSize per roll / End cut / ringkasan); tidak butuh gs baru.
 * v401 (permintaan Femri: satu tempelan memuat beberapa hari kerja): TANGGAL PER BARIS -- kosong = ikut baris di atasnya, tempel
 * mengenali kolom DATE/TANGGAL (lihat crTanggal_ di kepala bagian tabel isian). Server tidak berubah: tiap baris kiriman sendiri.
 * v402 (permintaan Femri): PO dipilih dengan MENGETIK (pola cari PO halaman Produksi) -- lihat kepala bagian kotak PO.
 * v403 (keputusan Femri, butuh gs >= @432): SESI SIMPRO -- login Google sekali, lalu HP ini tetap masuk 30 hari sejak terakhir
 * dipakai; tidak ada lagi "Sesi login berakhir" tiap jam.
 * v404 (perluasan ke semua halaman staf, butuh gs >= @434): mekanisme sesinya PINDAH ke simpro-global.js (kepala berkas, "SESI
 * SIMPRO PERANGKAT") -- halaman ini kembali ke alur login standar; lihat nisan di bagian sesi.
 *
 * KERANGKA HALAMAN DISUSUN BERKAS INI, BUKAN TEMPLATE. Template Blogger v340 tidak punya cabang untuk /p/cutting.html,
 * jadi body-nya kosong; menambah cabang = tempel template (langkah manual). Header, menu, hero, kotak login dan wadah
 * isi dibuat crPasangKerangka_ dengan kelas yang SAMA dengan halaman lain (simpro-global.css), dan pustaka login
 * Google dimuat dari sini. Akibat yang diterima: kalau VERSI.json gagal dibaca, loader jatuh ke HALAMAN_CADANGAN yang
 * belum mengenal rute ini dan halamannya kosong (halaman lain tetap hidup). Menambahkannya ke cadangan menyentuh
 * simpro-loader.js = tempel template -- ditunda sampai ada alasan lain untuk menempel.
 *
 * Kunci kiriman (idPermintaan) TERIKAT ISIAN (rjdKunciIsian_, pola P18-A): jawaban yang hilang di jalan -> simpan
 * ulang isian yang sama -> server menjawab dengan catatan yang sudah ada atau MELANJUTKAN langkah yang belum, tidak
 * menggandakan. Kunci dilepas saat server menjawab (berhasil atau menolak), dipertahankan saat jawaban tidak sampai.
 */
const CR_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const CR_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";
const CR_YD = 0.9144;
const CR_KUNCI = "cutting-roll";
let CR_ID_TOKEN = null;
const CR = { daftarPO: [], po: "", konteks: null, lap: null, kw: "", urut: 0, menyimpan: false, pesan: null, baris: [], uid: 0, tempel: null };

// ---------- util ----------
function crEsc_(s) { return typeof rjdEscapeHtml_ === "function" ? rjdEscapeHtml_(s) : String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function crNorm_(s) { return String(s === null || s === undefined ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
function crKunciKw_(kain, warna) { return crNorm_(String(kain || "").trim() || "(tanpa kain)") + "||" + crNorm_(warna); }
function crAngka_(v) { const n = Number(v); return isNaN(n) ? "-" : n.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
/** "12,5" / "12.5" -> 12.5; kosong -> NaN. Satu tanda desimal saja; ribuan tidak diketik untuk yard. */
function crParse_(s) {
  const t = String(s === null || s === undefined ? "" : s).trim().replace(/\s+/g, "");
  if (!t) return NaN;
  if ((t.match(/[.,]/g) || []).length > 1) return NaN;
  return Number(t.replace(",", "."));
}
function crEl_(id) { return document.getElementById(id); }
function crHariIni_() { const d = new Date(); const p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }

// ---------- kerangka ----------
function crPasangKerangka_() {
  if (crEl_("cr-wrap")) return;
  // v405: isi & urutan = menu template halaman lain (+ Cutting per roll di bawah Produksi, seperti yang disisipkan simpro-global.js
  // di sana); tautan yang tidak berhak disembunyikan penyaring peran global (rjdPasangMenuPeran_, dipanggil satpam).
  const menu = [["/", "Beranda"], null, ["https://www.rjdapparel.id/", "Profil"], ["/p/dashboard.html", "Dashboard"], ["/p/order-list.html", "Orderan"],
    ["/p/produksi.html", "Produksi"], ["/p/cutting.html", "Cutting per roll", true], ["/p/jadwal.html", "Jadwal Produksi"], ["/p/pengiriman.html", "Pengiriman"],
    ["/p/invoice.html", "Invoice"], ["/p/kas.html", "Buku Kas"], null, ["/p/laporan-omset.html", "Laporan SPT"], ["/p/sop.html", "SOP Produksi"],
    ["/p/upah.html", "Upah Borongan"], ["/p/kalkulator-harga.html", "Kalkulator Harga"], null, ["/p/order.html", "Form Order"], ["/p/tracking.html", "Portal Klien"]];
  const div = document.createElement("div");
  div.innerHTML =
    '<div class="bg-canvas"><div class="bg-gradient"></div><div class="float-shape s1"></div><div class="float-shape s2"></div></div>' +
    '<div class="db-header"><a class="logo" href="/"><span class="navy">RJD</span><span class="terra">APPAREL</span><span class="dot"></span><span class="rjd-nama-sistem">SIMPRO</span></a>' +
    '<div class="db-nav-actions"><button class="db-nav-cta hidden" id="cr-nav-logout" type="button">Keluar</button>' +
    '<details class="rjd-menu"><summary aria-label="Menu halaman" class="db-nav-icon-btn rjd-menu-btn" title="Menu halaman">' +
    '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg></summary>' +
    '<div class="rjd-menu-panel">' + menu.map(function (m) { return m ? '<a href="' + m[0] + '"' + (m[2] ? ' class="rjd-active"' : "") + '>' + m[1] + '</a>' : '<hr class="rjd-menu-divider"/>'; }).join("") +
    '<hr class="rjd-menu-divider"/><button class="rjd-menu-logout" id="cr-menu-logout" type="button">Keluar</button></div></details></div></div>' +
    '<header class="hero cr-hero"><div class="cr-hero-isi"><div class="eyebrow">Produksi</div><h1>Cutting <em>per roll</em>.</h1>' +
    '<p class="lead">Catat tiap gelaran dari roll yang dipakai. Sisa dicatat saat roll habis; selisih per roll terhitung sendiri.</p></div></header>' +
    '<div class="cr-wrap" id="cr-wrap">' +
    '<div class="cr-kotak-login hidden" id="cr-login-box"><h2>Masuk dulu</h2><p>Halaman ini untuk staf produksi RJD Apparel. Cukup sekali: perangkat ini tetap masuk selama dipakai ' +
    '(berakhir kalau 30 hari tidak dipakai -- 12 jam untuk akun yang membuka keuangan -- atau dicabut admin).</p><p class="cr-galat hidden" id="cr-login-pesan"></p><div id="cr-google-btn"></div></div>' +
    '<div class="hidden" id="cr-loading"><p class="cr-info">Memuat...</p></div>' +
    '<div class="hidden" id="cr-isi">' +
    '<div class="cr-kartu cr-pilih"><div class="cr-f cr-f-po"><label for="cr-po">Purchase Order</label><div class="cr-po-kotak">' +
    '<input id="cr-po" type="search" autocomplete="off" spellcheck="false" placeholder="Memuat daftar PO..." disabled role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cr-po-daftar"/>' +
    '<div class="cr-po-daftar hidden" id="cr-po-daftar" role="listbox"></div></div></div>' +
    '<label class="cr-f cr-f-kw">Kain &#183; warna<select id="cr-kw" disabled><option value="">Pilih PO dulu</option></select></label></div>' +
    '<div class="cr-pesan hidden" id="cr-pesan-muat"></div>' +
    '<div id="cr-form"></div><div id="cr-laporan"></div></div></div>';
  const frag = document.createDocumentFragment();
  while (div.firstChild) frag.appendChild(div.firstChild);
  document.body.insertBefore(frag, document.body.firstChild);
  crEl_("cr-nav-logout").addEventListener("click", crLogout);
  crEl_("cr-menu-logout").addEventListener("click", crLogout);
  crPoPasang_();
  crEl_("cr-kw").addEventListener("change", function () { if (CR.menyimpan || !crBuangIsian_()) { this.value = CR.kw; return; } CR.kw = this.value; CR.baris = []; CR.pesan = null; crRenderForm_(); crRenderLaporan_(); });
}
// Isian tabel milik SATU PO + kain . warna: berganti = tabelnya dibuang, jadi ditanya dulu kalau ada yang belum disimpan.
function crBuangIsian_() { return !crAdaIsian_() || window.confirm("Isian tabel yang BELUM disimpan akan dibuang. Lanjut?"); }

/* ---------- kotak PO yang bisa DIKETIK (v402, permintaan Femri: daftar PO panjang) ----------
 * Pola halaman Produksi (spCariPO): ketik -> daftar PO yang cocok -> pilih. Bedanya: kotak yang diklik tanpa ketikan langsung
 * menampilkan SEMUA PO aktif (pengganti daftar <select> lama), ketikan dipecah per kata dan SEMUA kata harus ada (urutan bebas:
 * "guru nooha"), dan bisa dipilih dengan panah + Enter. PO Selesai / Dibatalkan tetap tidak ditawarkan (sama dengan v394).
 * Isi kotak sesudah memilih = nomor PO; ketikan yang tidak dipilih dikembalikan ke PO terpilih saat kotak ditinggalkan.
 * Nomor PO yang diketik UTUH lalu Enter / ditinggalkan juga memilihnya (event change). */
function crPoSaring_(q) {
  const kata = crNorm_(q).split(" ").filter(function (x) { return x; });
  return (CR.daftarPO || []).filter(function (p) {
    const teks = crNorm_([p.idPurchaseOrder, p.noSO, p.namaKlien, (p.artikel || []).join(" ")].join(" "));
    return kata.every(function (k) { return teks.indexOf(k) !== -1; });
  });
}
function crPoBuka_(q) {
  const dd = crEl_("cr-po-daftar"), inp = crEl_("cr-po"); if (!dd || !inp) return;
  CR.poHasil = crPoSaring_(q).slice(0, 50); CR.poSorot = CR.poHasil.length ? 0 : -1;
  dd.innerHTML = CR.poHasil.length ? CR.poHasil.map(function (p, i) {
    const sub = [p.namaKlien, (p.artikel || []).join(", ")].filter(function (x) { return x; }).join(" · ");
    return '<div class="cr-po-opsi' + (i === CR.poSorot ? " aktif" : "") + '" role="option" data-id="' + crEsc_(p.idPurchaseOrder) + '"><b>' + crEsc_(p.idPurchaseOrder) + '</b>' +
      (sub ? '<span class="cr-po-sub">' + crEsc_(sub) + '</span>' : "") + '</div>';
  }).join("") : '<div class="cr-po-kosong">Tidak ada PO aktif yang cocok. PO Selesai / Dibatalkan tidak ditampilkan.</div>';
  dd.classList.remove("hidden"); inp.setAttribute("aria-expanded", "true");
}
function crPoTutup_() {
  const dd = crEl_("cr-po-daftar"), inp = crEl_("cr-po");
  if (dd) dd.classList.add("hidden"); if (inp) inp.setAttribute("aria-expanded", "false");
}
function crPoSorot_(n) {
  const dd = crEl_("cr-po-daftar"); if (!dd || !CR.poHasil || !CR.poHasil.length) return;
  CR.poSorot = (n + CR.poHasil.length) % CR.poHasil.length;
  Array.prototype.forEach.call(dd.querySelectorAll(".cr-po-opsi"), function (el, i) { el.classList.toggle("aktif", i === CR.poSorot); if (i === CR.poSorot && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); });
}
function crPoPilih_(id) {
  const inp = crEl_("cr-po"); crPoTutup_();
  if (!id || id === CR.po) { if (inp) inp.value = CR.po; return; }
  if (CR.menyimpan || !crBuangIsian_()) { if (inp) inp.value = CR.po; return; }
  if (inp) inp.value = id;
  CR.baris = []; crPilihPO_(id);
}
function crPoPasang_() {
  const inp = crEl_("cr-po"), dd = crEl_("cr-po-daftar");
  inp.addEventListener("focus", function () { if (inp.disabled) return; inp.select(); crPoBuka_(""); });
  inp.addEventListener("input", function () { crPoBuka_(inp.value); });
  inp.addEventListener("keydown", function (ev) {
    const buka = !dd.classList.contains("hidden");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (!buka) crPoBuka_(inp.value); else crPoSorot_(CR.poSorot + (ev.key === "ArrowDown" ? 1 : -1)); }
    else if (ev.key === "Enter" && buka) { ev.preventDefault(); const p = (CR.poHasil || [])[CR.poSorot]; if (p) crPoPilih_(p.idPurchaseOrder); }
    else if (ev.key === "Escape") { ev.preventDefault(); crPoTutup_(); inp.value = CR.po; }   // bawaan type=search: Escape MENGOSONGKAN kotak
  });
  // Sesudah memilih, kotak masih terfokus -- klik berikutnya tidak memicu focus, jadi daftar dibuka dari sini.
  inp.addEventListener("click", function () { if (!inp.disabled && dd.classList.contains("hidden")) { inp.select(); crPoBuka_(""); } });
  // mousedown, bukan click: click datang SESUDAH blur, saat daftarnya sudah ditutup.
  dd.addEventListener("mousedown", function (ev) {
    const o = ev.target.closest ? ev.target.closest(".cr-po-opsi") : null; if (!o) return;
    ev.preventDefault(); crPoPilih_(o.getAttribute("data-id"));
  });
  inp.addEventListener("change", function () {
    const t = crNorm_(inp.value), p = (CR.daftarPO || []).filter(function (x) { return crNorm_(x.idPurchaseOrder) === t; })[0];
    if (p) crPoPilih_(p.idPurchaseOrder);
  });
  inp.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement === inp) return; crPoTutup_(); inp.value = CR.po; }, 150); });
}
function crShow(id) {
  ["cr-login-box", "cr-loading", "cr-isi"].forEach(function (x) { const el = crEl_(x); if (el) el.classList.add("hidden"); });
  const t = crEl_(id); if (t) t.classList.remove("hidden");
}

// ---------- sesi (pola kas/jadwal/upah) ----------
function crBacaSesi_() {
  try { const raw = localStorage.getItem("db_session"); if (!raw) return null; const d = JSON.parse(raw); if (!d.exp || d.exp * 1000 <= Date.now()) return null; return d.token; } catch (e) { return null; }
}
function crSimpanSesi_(token) {
  try { const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp })); } catch (e) { /* private mode */ }
}
/* NISAN v404: sesi SIMPRO v403 milik halaman ini (CR_KUNCI_SESI "cr_sesi_simpro", crTukarSesi_, crSesiHabis_, pemeriksaan
 * getPeranSaya sebelum satpam) DIPINDAH ke simpro-global.js supaya berlaku di semua halaman staf tanpa menyalin kode ke tiap
 * halaman: global menaruh sesi perangkat ke db_session SEBELUM skrip ini berjalan (crBacaSesi_ membacanya seperti login
 * Google), menukar login Google baru pada panggilan API pertama, dan menangani sesiHabis dengan lapisan "Sesi perangkat
 * berakhir" (z-index di atas layar satpam -- jadi pemeriksaan-dulu v403 tidak dibutuhkan lagi). Sesi lama di
 * "cr_sesi_simpro" dipindah global ke kelas lantai sekali jalan. Keluar = removeItem("db_session"), yang disadap global
 * untuk mencabut sesi perangkat di server. */
/** Kotak login (+ pesan sebabnya kalau ada); tombol Google dipasang, pustakanya dimuat sekali. */
function crTampilLogin_(pesan) {
  crShow("cr-login-box");
  const p = crEl_("cr-login-pesan"); if (p) { p.textContent = pesan || ""; p.classList.toggle("hidden", !pesan); }
  const b = crEl_("cr-nav-logout"); if (b) b.classList.add("hidden");
  if (crPasangTombolGoogle_() || document.getElementById("cr-gsi")) return;
  const s = document.createElement("script");
  s.id = "cr-gsi"; s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = function () { if (!CR_ID_TOKEN) crPasangTombolGoogle_(); };
  document.head.appendChild(s);
}
function crHandleGoogleLogin(response) { CR_ID_TOKEN = response.credential; crSimpanSesi_(response.credential); crMulai(); }
function crLogout() {
  CR_ID_TOKEN = null; try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  crTampilLogin_("");
}
function crPasangTombolGoogle_() {
  if (typeof google === "undefined" || !google.accounts) return false;
  google.accounts.id.initialize({ client_id: CR_OAUTH_CLIENT_ID, callback: crHandleGoogleLogin });
  const t = crEl_("cr-google-btn"); if (t && !t.childNodes.length) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  return true;
}
function crMulai() {
  if (typeof rjdJagaHalaman === "function") rjdJagaHalaman(CR_ID_TOKEN, CR_API_URL, crMulaiIsi_); else crMulaiIsi_();
}
function crMulaiIsi_() {
  const b = crEl_("cr-nav-logout"); if (b) b.classList.remove("hidden");
  crShow("cr-isi"); crMuatDaftarPO_();
}

// ---------- API ----------
/** Galat jaringan DIBEDAKAN dari galat render/server: hanya yang pertama yang boleh mempertahankan kunci kiriman. */
function crKirim_(action, muatan) {
  return fetch(CR_API_URL, { method: "POST", body: JSON.stringify(Object.assign({ idToken: CR_ID_TOKEN, action: action }, muatan || {})) })
    .then(function (r) { return r.text(); }, function () { const g = new Error("Jawaban server tidak sampai -- sambungan terputus di tengah jalan."); g.jaringan = true; throw g; })
    .then(function (teks) {
      let d; try { d = JSON.parse(teks); } catch (e) { throw new Error("Jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 80)); }
      if (!d || !d.success) {
        const g = new Error((d && d.error) || "Permintaan ditolak server."); g.server = true;
        if (d && d.sesiHabis) g.sesiHabis = true;   // lapisan "Sesi perangkat berakhir" dipasang penjaga fetch global
        throw g;
      }
      return d;
    });
}
function crPesanMuat_(teks) {
  const el = crEl_("cr-pesan-muat"); if (!el) return;
  if (!teks) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.classList.remove("hidden"); el.className = "cr-pesan cr-pesan-galat"; el.textContent = teks;
}

// ---------- daftar PO ----------
function crMuatDaftarPO_() {
  const inp = crEl_("cr-po");
  crKirim_("getDaftarPO").then(function (d) {
    CR.daftarPO = (d.daftar || []).filter(function (p) { return !/batal|cancel|selesai/i.test(String(p.status || "")); });
    let simpan = ""; try { simpan = localStorage.getItem("cr_po") || ""; } catch (e) { /* private mode */ }
    inp.disabled = false; inp.placeholder = "Ketik nomor PO, klien, atau artikel";
    crPesanMuat_("");
    if (simpan && CR.daftarPO.some(function (p) { return p.idPurchaseOrder === simpan; })) { inp.value = simpan; crPilihPO_(simpan); }
  }).catch(function (e) {
    inp.placeholder = "Daftar PO gagal dimuat";
    crPesanMuat_("Daftar PO gagal dimuat: " + e.message + " Muat ulang halaman untuk mencoba lagi.");
  });
}

function crPilihPO_(po) {
  CR.po = po || ""; CR.konteks = null; CR.lap = null; CR.kw = ""; CR.pesan = null; CR.baris = [];
  try { if (CR.po) localStorage.setItem("cr_po", CR.po); } catch (e) { /* private mode */ }
  const kw = crEl_("cr-kw");
  kw.disabled = true; kw.innerHTML = '<option value="">' + (CR.po ? "Memuat..." : "Pilih PO dulu") + '</option>';
  crEl_("cr-form").innerHTML = ""; crEl_("cr-laporan").innerHTML = "";
  if (!CR.po) return;
  crMuatPO_(true);
}
/** Marker + laporan per roll, paralel. Jawaban untuk PO yang sudah ditinggalkan dibuang (urut). */
function crMuatPO_(pertama) {
  const urut = ++CR.urut, po = CR.po;
  if (!pertama) crEl_("cr-laporan").insertAdjacentHTML("afterbegin", '<p class="cr-info" id="cr-segarkan">Memperbarui neraca...</p>');
  else crEl_("cr-laporan").innerHTML = '<p class="cr-info">Memuat marker &amp; roll...</p>';
  return Promise.all([crKirim_("getMarkerPO", { idPurchaseOrder: po }), crKirim_("getLaporanCuttingRoll", { idPurchaseOrder: po })])
    .then(function (h) {
      if (urut !== CR.urut || po !== CR.po) return;
      CR.konteks = h[0]; CR.lap = h[1];
      crPesanMuat_("");
      crRenderPilihKw_(); crRenderForm_(); crRenderLaporan_();
    })
    .catch(function (e) {
      if (urut !== CR.urut || po !== CR.po) return;
      const s = crEl_("cr-segarkan"); if (s) s.remove();
      if (pertama) crEl_("cr-laporan").innerHTML = "";
      crPesanMuat_("Data PO " + po + " gagal dimuat: " + e.message + (e.jaringan ? " Pilih PO-nya lagi untuk mencoba." : ""));
    });
}

/** Pilihan kain x warna: dari rencana PO (jenis kain & warna per item) DITAMBAH kelompok yang sudah punya roll/gelaran. */
function crRenderPilihKw_() {
  const kw = crEl_("cr-kw"), daftar = [], ada = {};
  const tambah = function (kain, warna, asal) { const k = crKunciKw_(kain, warna); if (ada[k]) return; ada[k] = true; daftar.push({ k: k, kain: kain, warna: warna, asal: asal }); };
  ((CR.konteks && CR.konteks.daftarItem) || []).forEach(function (it) {
    const kain = (it.jenisKain && it.jenisKain.length) ? it.jenisKain : (CR.konteks.jenisKain || []);
    const warna = (it.warna && it.warna.length) ? it.warna : (CR.konteks.warna || []);
    kain.forEach(function (k) { warna.forEach(function (w) { tambah(k, w, "rencana"); }); });
  });
  ((CR.lap && CR.lap.kain) || []).forEach(function (g) { tambah(g.jenisKain, g.warna, "tercatat"); });
  if (!daftar.length) { kw.innerHTML = '<option value="">PO ini belum punya rencana kain/warna</option>'; kw.disabled = true; return; }
  const lama = CR.kw;
  kw.innerHTML = '<option value="">-- pilih kain &#183; warna --</option>' + daftar.map(function (x) {
    return '<option value="' + crEsc_(x.k) + '">' + crEsc_(x.kain + " · " + x.warna) + '</option>';
  }).join("");
  kw.disabled = false;
  CR.kwDaftar = daftar;
  if (lama && ada[lama]) kw.value = lama; else if (daftar.length === 1) { kw.value = daftar[0].k; CR.kw = daftar[0].k; } else CR.kw = "";
}
/** Neraca memakai KODE marker (yang dikenal operator, mis. "MK-01"), bukan ID (MRK261101-034); ID jadi cadangan kalau
 *  marker itu tidak ada lagi di daftar PO (dibatalkan/digantikan sesudah digelar). */
function crNamaMarker_(id) {
  const m = ((CR.konteks && CR.konteks.marker) || []).filter(function (x) { return x.idMarker === id; })[0];
  return (m && String(m.kodeMarker || "").trim()) || id || "-";
}
/** "kode x lapis" satu kesatuan: spasi TAK-PUTUS (chr 160) supaya lapisnya tidak jatuh ke baris sendiri di HP. */
const CR_NBSP = String.fromCharCode(160);
function crTeksPakai_(x) { return crEsc_(crNamaMarker_(x.idMarker)) + CR_NBSP + "×" + CR_NBSP + crEsc_(x.lapis); }
/**
 * 5 Nov 2026 (permintaan Femri): baris neraca untuk roll / End cut dengan BEBERAPA pemakaian -- satu <tr> per pemakaian.
 * `kepala` = sel yang digabung (rowspan: Roll & Kirim), hanya di baris pertama. `ekor` (Sisa + Selisih) dan `status` hanya di
 * baris TERAKHIR; baris lain sel kosong. Pemakaian penutup roll (rollSelesai) SELALU terakhir, urutan lain dipertahankan.
 * Baris yang bukan terakhir bergaris putus-putus supaya satu roll tetap terbaca satu kelompok.
 */
function crPakaiBaris_(pakai, kepala, ekor, status, sel, selSz, kelas) {
  const urut = pakai.map(function (x, i) { return { x: x, i: i }; })
    .sort(function (a, b) { return ((a.x.rollSelesai ? 1 : 0) - (b.x.rollSelesai ? 1 : 0)) || (a.i - b.i); }).map(function (o) { return o.x; });
  return urut.map(function (x, i) {
    const akhir = i === urut.length - 1;
    const k = [kelas, akhir ? "" : "cr-roll-dalam"].filter(function (c) { return c; }).join(" ");
    return '<tr' + (k ? ' class="' + k + '"' : '') + '>' + (i === 0 ? kepala : '') + '<td>' + crTeksPakaiKoreksi_(x) + '</td>' +
      '<td class="num">' + sel(x.aktualYd) + '</td>' + (akhir ? ekor : '<td class="num"></td><td class="num"></td>') +
      selSz(x.perSize, x.pcs) + (akhir ? status : '<td></td>') + '</tr>';
  }).join("");
}
/* ============================================================
 * KOREKSI BARIS NERACA (5 Nov 2026, permintaan Femri: "perlu solusi untuk edit jika ada kesalahan input"; butuh gs >= @442)
 * Tombol pensil di sel Marker x lapis tiap pemakaian (roll & End cut) membuka panel berisi nilai LAMA. Yang dikirim ke
 * koreksiCuttingRoll HANYA medan yang diubah: server mengganti gelaran (pengganti ditulis dulu, lama dibatalkan) atau menimpa
 * sisa / data roll dengan jejak, dan mencatat Log Koreksi Cutting. Sisa hanya di baris PENUTUP roll; End cut tanpa sisa/roll;
 * kirim (yd) hanya untuk roll yang dicatat dalam yard. Alasan wajib (server juga menolak). Kunci kiriman terikat isian
 * (rjdKunciIsian_) dan tombol dikunci selama mengirim: jawaban yang hilang -> Simpan lagi TANPA mengubah = kiriman yang sama.
 * Ikon SVG (bukan teks): textContent sel tidak berubah, jadi pencocokan teks marker di tempat lain tetap utuh.
 * ============================================================ */
const CR_KOREKSI_IKON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false"><path d="M11.3 1.9a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L5.6 13.2 2 14l.8-3.6 8.5-8.5zM10.6 3.7l1.7 1.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function crTombolKoreksi_(x) {
  if (!x || !x.idPemakaian) return "";
  return '<button class="cr-koreksi-btn" type="button" data-koreksi="' + crEsc_(x.idPemakaian) + '" aria-label="Koreksi ' + crEsc_(crNamaMarker_(x.idMarker)) +
    ' &#215; ' + crEsc_(x.lapis) + '" title="Koreksi baris ini">' + CR_KOREKSI_IKON + '</button>';
}
/** Teks marker x lapis + tombol koreksi dalam SATU kotak tak terputus: tanpa itu tombol turun ke baris kedua di sel yang teks markernya
 *  panjang (MOTIFPANELDEPANBELAKANGXL x 20) dan baris neraca meninggi 21 px -- terukur jalan137 J. */
function crTeksPakaiKoreksi_(x) { return '<span class="cr-pakai">' + crTeksPakai_(x) + crTombolKoreksi_(x) + '</span>'; }
function crCariPakai_(id) {
  let hasil = null;
  ((CR.lap && CR.lap.kain) || []).forEach(function (g) {
    (g.roll || []).forEach(function (r) { (r.pemakaian || []).forEach(function (x) { if (x.idPemakaian === id) hasil = { g: g, r: r, x: x, endCut: false }; }); });
    ((g.endCut && g.endCut.gelaran) || []).forEach(function (x) { if (x.idPemakaian === id) hasil = { g: g, r: null, x: x, endCut: true }; });
  });
  return hasil;
}
function crDesimalTeks_(v) { return v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","); }
function crKoreksiKlik_(ev) {
  const t = ev.target.closest ? ev.target.closest("[data-koreksi]") : null;
  if (!t) return;
  crKoreksiBuka_(t.getAttribute("data-koreksi"));
}
function crKoreksiTutup_() { const el = crEl_("cr-koreksi-latar"); if (el && !(CR.koreksi && CR.koreksi.mengirim)) { el.remove(); CR.koreksi = null; } }
function crKoreksiBuka_(id) {
  const k = crCariPakai_(id); if (!k) return;
  const lama = crEl_("cr-koreksi-latar"); if (lama) lama.remove();
  const x = k.x, r = k.r, g = k.g, penutup = !!(r && x.rollSelesai), kirimYd = !!(r && (!r.satuanAsli || /^y/i.test(r.satuanAsli)));
  const sisaAwal = penutup ? (r.satuanUkur === "m" ? crDesimalTeks_(r.sisaUkur) : crDesimalTeks_(r.sisaYd)) : "", satuanAwal = penutup ? (r.satuanUkur === "m" ? "m" : "yds") : "";
  // Marker: kain kelompok ini (atau marker tanpa kain), bukan Batal / Digantikan -- pagar yang sama dengan form (crMarkerCocok_).
  const marker = ((CR.konteks && CR.konteks.marker) || []).filter(function (m) {
    const st = crNorm_(m.status);
    return !(st === "batal" || st === "digantikan" || !(m.pcsPerLapis > 0)) && (!m.jenisKain || crNorm_(m.jenisKain) === crNorm_(g.jenisKain));
  });
  if (!marker.some(function (m) { return m.idMarker === x.idMarker; })) marker.unshift({ idMarker: x.idMarker, kodeMarker: crNamaMarker_(x.idMarker) + " (marker sekarang)" });
  CR.koreksi = { id: id, awal: { tanggal: x.tanggal || "", idMarker: x.idMarker || "", lapis: String(x.lapis), sisa: sisaAwal, satuan: satuanAwal, noRoll: r ? String(r.noRoll || "") : "",
    kirim: r ? crDesimalTeks_(r.kirimYd) : "" }, penutup: penutup, roll: !!r, kirimYd: kirimYd, mengirim: false };
  const judul = (k.endCut ? "End cut" : "Roll " + crEsc_(r.noRoll || "-")) + " &#183; " + crTeksPakai_(x);
  const el = document.createElement("div");
  el.id = "cr-koreksi-latar"; el.className = "cr-koreksi-latar";
  el.innerHTML = '<div class="cr-koreksi" role="dialog" aria-modal="true" aria-labelledby="crk-judul">' +
    '<h3 id="crk-judul">Koreksi &#8212; ' + judul + '</h3>' +
    '<p class="cr-koreksi-ket">Catatan lama tidak dihapus: gelaran lama dibatalkan dan diganti, sisa &amp; data roll lama tersimpan di catatannya. Yang dikirim hanya isian yang kamu ubah.</p>' +
    '<div class="cr-koreksi-isian">' +
    '<label class="cr-f">Tanggal potong<input id="crk-tanggal" type="date" value="' + crEsc_(CR.koreksi.awal.tanggal) + '"/></label>' +
    '<label class="cr-f">Marker<select id="crk-marker">' + marker.map(function (m) { return '<option value="' + crEsc_(m.idMarker) + '"' + (m.idMarker === x.idMarker ? " selected" : "") + '>' +
      crEsc_(m.kodeMarker || m.idMarker) + '</option>'; }).join("") + '</select></label>' +
    '<label class="cr-f">Lapis<input id="crk-lapis" type="text" inputmode="numeric" value="' + crEsc_(x.lapis) + '"/></label>' +
    (penutup ? '<label class="cr-f">Sisa roll<span class="cr-koreksi-sisa"><input id="crk-sisa" type="text" inputmode="decimal" value="' + crEsc_(sisaAwal) + '"/>' +
      '<select id="crk-satuan"><option value="m"' + (satuanAwal === "m" ? " selected" : "") + '>m</option><option value="yds"' + (satuanAwal === "yds" ? " selected" : "") + '>yd</option></select></span></label>' : '') +
    (r ? '<label class="cr-f">No roll<input id="crk-noroll" type="text" value="' + crEsc_(r.noRoll || "") + '"/></label>' +
      (kirimYd ? '<label class="cr-f">Kirim (yd)<input id="crk-kirim" type="text" inputmode="decimal" value="' + crEsc_(CR.koreksi.awal.kirim) + '"/></label>' : '') : '') +
    '<label class="cr-f cr-koreksi-alasan">Alasan koreksi<input id="crk-alasan" type="text" maxlength="200" placeholder="mis. salah ketik lapis 18 jadi 16"/></label>' +
    '</div><p class="cr-pesan hidden" id="crk-pesan" role="status"></p>' +
    '<div class="cr-aksi"><button class="cr-btn" id="crk-batal" type="button">Batal</button><button class="cr-btn cr-btn-utama" id="crk-simpan" type="button">Simpan koreksi</button></div></div>';
  document.body.appendChild(el);
  el.addEventListener("click", function (ev) { if (ev.target === el) crKoreksiTutup_(); });
  el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") crKoreksiTutup_(); });
  crEl_("crk-batal").addEventListener("click", crKoreksiTutup_);
  crEl_("crk-simpan").addEventListener("click", crKoreksiSimpan_);
  const fokus = crEl_("crk-lapis"); if (fokus) fokus.focus();
}
function crKoreksiPesan_(teks, ok) {
  const el = crEl_("crk-pesan"); if (!el) return;
  el.className = "cr-pesan " + (ok ? "cr-pesan-ok" : "cr-pesan-galat"); el.textContent = teks;
}
function crKoreksiPayload_() {
  const K = CR.koreksi, a = K.awal, nilai = function (id) { const e = crEl_(id); return e ? String(e.value || "").trim() : null; };
  const p = { idPemakaian: K.id, alasan: nilai("crk-alasan") || "" };
  const tgl = nilai("crk-tanggal"), mk = nilai("crk-marker"), lapis = nilai("crk-lapis");
  if (tgl !== null && tgl !== a.tanggal) p.tanggalPotong = tgl;
  if (mk !== null && mk !== a.idMarker) p.idMarker = mk;
  if (lapis !== null && lapis !== a.lapis) p.jumlahLapis = lapis;
  if (K.penutup) {
    const sisa = nilai("crk-sisa"), sat = nilai("crk-satuan");
    if (sisa !== a.sisa || sat !== a.satuan) { p.sisa = sisa; p.satuanSisa = sat; }
  }
  if (K.roll) {
    const no = nilai("crk-noroll"), kirim = nilai("crk-kirim");
    if (no !== null && no !== a.noRoll) p.noRoll = no;
    if (K.kirimYd && kirim !== null && kirim !== a.kirim) p.panjangYd = kirim;
  }
  return p;
}
async function crKoreksiSimpan_() {
  const K = CR.koreksi; if (!K || K.mengirim) return;
  const p = crKoreksiPayload_();
  const berubah = Object.keys(p).filter(function (k) { return k !== "idPemakaian" && k !== "alasan"; });
  if (!berubah.length) { crKoreksiPesan_("Belum ada yang diubah -- ganti isian yang salah dulu.", false); return; }
  if (String(p.alasan).length < 5) { crKoreksiPesan_("Isi alasan koreksi (minimal 5 huruf), mis. 'salah ketik lapis 18 jadi 16'.", false); crEl_("crk-alasan").focus(); return; }
  const nama = "koreksi-cr:" + K.id;
  p.idPermintaan = typeof rjdKunciIsian_ === "function" ? rjdKunciIsian_(nama, p) : String(Date.now()) + "-" + K.id;
  const tombol = crEl_("crk-simpan"); K.mengirim = true; tombol.disabled = true; tombol.textContent = "Menyimpan...";
  crKoreksiPesan_("Menyimpan koreksi...", true);
  try {
    const d = await crKirim_("koreksiCuttingRoll", { payload: p });
    if (typeof rjdKunciLepas_ === "function") rjdKunciLepas_(nama);
    K.mengirim = false; crKoreksiTutup_();
    // CR.pesan supaya pesannya bertahan: crMuatPO_ menggambar ulang form (crRenderForm_ menampilkan CR.pesan) -- pola crSimpanSemua.
    CR.pesan = { teks: "Koreksi tersimpan" + (d.sudahTercatat ? " (sudah tercatat sebelumnya)" : "") + ((d.perubahan || []).length ? ": " + d.perubahan.join("; ") : "") + ".", ok: true };
    crTampilPesan_("Koreksi tersimpan" + (d.sudahTercatat ? " (sudah tercatat sebelumnya)" : "") + ((d.perubahan || []).length ? ": " + d.perubahan.join("; ") : "") + ".", true);
    crMuatPO_(false);
  } catch (e) {
    if (!e.jaringan && typeof rjdKunciLepas_ === "function") rjdKunciLepas_(nama);
    K.mengirim = false; tombol.disabled = false; tombol.textContent = "Simpan koreksi";
    crKoreksiPesan_(e.jaringan ? "Jawaban server tidak sampai -- koreksi MUNGKIN sudah tersimpan. Simpan lagi TANPA mengubah isian: server mengenali kiriman yang sama."
      : "Tidak tersimpan: " + e.message, false);
  }
}
function crKwAktif_() { return (CR.kwDaftar || []).filter(function (x) { return x.k === CR.kw; })[0] || null; }
function crGrupAktif_() { return ((CR.lap && CR.lap.kain) || []).filter(function (g) { return crKunciKw_(g.jenisKain, g.warna) === CR.kw; })[0] || null; }
function crMarkerCocok_() {
  const kw = crKwAktif_(); if (!kw) return [];
  return ((CR.konteks && CR.konteks.marker) || []).filter(function (m) {
    const st = crNorm_(m.status);
    if (st === "batal" || st === "digantikan" || !(m.pcsPerLapis > 0)) return false;
    return !m.jenisKain || crNorm_(m.jenisKain) === crNorm_(kw.kain);
  });
}
function crRollTerbuka_() {
  const g = crGrupAktif_(); if (!g) return [];
  return g.roll.filter(function (r) { return r.status === "Belum dipakai" || r.status === "Dipakai"; });
}

// ---------- tabel isian (v395, 1 Nov 2026: permintaan Femri "jangan simpan satu per satu per roll") ----------
/* Satu BARIS = satu marker x lapis dari satu roll -- persis satu kiriman simpanCuttingRoll. Tabelnya cuma mengumpulkan
 * banyak baris lalu mengirimnya BERURUTAN ke rute yang sama (pola daftar bentangan spGbSimpan, v335-v337): baris yang
 * tersimpan dikunci hijau, yang gagal tetap merah beserta sebabnya, Simpan berikutnya hanya mengirim yang belum.
 * Aturan yang dipegang tabel (diperiksa SEMUA sebelum satu baris pun dikirim):
 *   - No roll yang sama di beberapa baris = satu roll; panjang hanya di baris PERTAMA roll baru (roll yang sudah tercatat
 *     memakai panjang neraca); baris lanjutan memakai idRoll yang dijawab server untuk baris pertamanya.
 *   - Sisa diisi = roll SELESAI, dan hanya boleh di baris TERAKHIR roll itu (server juga menolak roll yang sudah ditutup).
 *   - "End cut" di kolom No roll = gelaran dari kumpulan sisa, tanpa panjang & tanpa sisa.
 * Baris lanjutan yang baris pertamanya GAGAL ditunda, bukan dikirim sebagai roll tanpa identitas.
 * Kunci kiriman per BARIS (rjdKunciIsian_ "cutting-roll:<uid>"): kiriman ulang baris yang jawabannya hilang = kunci sama. */
function crBarisBaru_(isi) {
  return Object.assign({ uid: ++CR.uid, tanggal: "", tglMentah: "", noRoll: "", panjang: "", idMarker: "", lapis: "", sisa: "", status: "", pesan: "", hasil: "" }, isi || {});
}
/* Tanggal PER BARIS (v401, permintaan Femri: satu tabel/tempelan bisa memuat beberapa hari kerja). b.tanggal kosong = IKUT
 * baris di atasnya (baris pertama ikut kotak "Tanggal potong") -- bentuk sel DATE yang digabung per hari di lembar tim, yang
 * saat disalin hanya membawa tanggal di baris pertama harinya. Server tidak berubah: tiap baris memang kiriman sendiri. */
const CR_BULAN = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
/** Teks tanggal tempelan -> "yyyy-mm-dd"; "" kalau kosong; null kalau tidak terbaca. Angka dibaca HARI/BULAN (lembar Indonesia);
 *  tanpa tahun = tahun kotak Tanggal potong; nama bulan Indonesia/Inggris; jam di belakang dibuang; serial Excel 5 digit. */
function crTanggal_(teks, tahunBawaan) {
  const t = String(teks === null || teks === undefined ? "" : teks).trim().toLowerCase().replace(/\s+\d{1,2}[:.]\d{2}([:.]\d{2})?$/, "");
  if (!t) return "";
  const jadi = function (y, m, d) {
    y = Number(y); m = Number(m); d = Number(d); if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!y || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  };
  let a;
  if ((a = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return jadi(a[1], a[2], a[3]);
  if ((a = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/))) return jadi(a[3] || tahunBawaan, a[2], a[1]);
  if ((a = t.match(/^(?:[a-z]+,?\s+)?(\d{1,2})[\s\-/.]+([a-z]+)\.?(?:[\s\-/.,]+(\d{2}|\d{4}))?$/))) {
    const m = CR_BULAN[a[2].slice(0, 3)]; return m ? jadi(a[3] || tahunBawaan, m, a[1]) : null;
  }
  if (/^\d{5}$/.test(t) && Number(t) > 36526 && Number(t) < 73051) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 864e5); return jadi(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}
function crTglTeks_(iso) { const a = String(iso || "").split("-"); return a.length === 3 ? a[2] + "/" + a[1] + "/" + a[0] : String(iso || ""); }
function crTglBawaan_() { return (crEl_("cr-tanggal") && crEl_("cr-tanggal").value) || crHariIni_(); }
function crBarisKosong_(b) { return !String(b.noRoll).trim() && !String(b.panjang).trim() && !String(b.lapis).trim() && !String(b.sisa).trim(); }
function crAdaIsian_() { return (CR.baris || []).some(function (b) { return b.status !== "ok" && !crBarisKosong_(b); }); }
function crTambahBaris_(n) {
  const marker = crMarkerCocok_();
  for (let i = 0; i < n; i++) {
    const atas = CR.baris[CR.baris.length - 1];
    CR.baris.push(crBarisBaru_({ idMarker: (atas && atas.idMarker) || (marker[0] ? marker[0].idMarker : "") }));
  }
}
function crEndCut_(teks) { return /^(end ?cut|ec)$/i.test(String(teks || "").trim()); }

/** Hitung & periksa seluruh tabel. Satu fungsi untuk tampilan DAN pengiriman -- yang dikirim persis yang dilihat. */
function crResolusi_() {
  const g = crGrupAktif_(), marker = crMarkerCocok_(), perRoll = {}, hariIni = crHariIni_();
  let kolam = g && g.ringkasan ? Number(g.ringkasan.sisaAkhirYd) || 0 : 0, tglAtas = crTglBawaan_();
  return (CR.baris || []).map(function (b, i) {
    const r = { b: b, i: i, galat: [], awas: [] };
    // Rantai tanggal berjalan lewat SEMUA baris (yang tersimpan memegang tanggal kirimannya, baris kosong boleh jadi pemisah hari).
    if (b.tanggal) tglAtas = b.tanggal;
    r.tanggal = b.tglMentah ? "" : tglAtas; r.ikut = !b.tanggal && !b.tglMentah;
    if (b.status === "ok") { r.ok = true; return r; }
    if (crBarisKosong_(b)) { r.kosong = true; return r; }
    if (b.tglMentah) r.galat.push("Tanggal \"" + b.tglMentah + "\" tidak terbaca -- pilih di kotak Tanggal.");
    else if (r.tanggal > hariIni) r.galat.push("Tanggal " + crTglTeks_(r.tanggal) + " belum terjadi.");
    const no = String(b.noRoll).trim();
    r.endCut = crEndCut_(no);
    r.m = marker.filter(function (m) { return m.idMarker === b.idMarker; })[0] || null;
    if (!r.m) r.galat.push("Pilih marker.");
    const lapisT = String(b.lapis).trim();
    if (!/^\d+$/.test(lapisT) || Number(lapisT) <= 0) r.galat.push("Lapis harus bilangan bulat > 0.");
    else r.lapis = Number(lapisT);
    if (r.m && r.lapis) { const meter = (Number(r.m.panjangMarker) + Number(r.m.allowancePerLapis || 0)) * r.lapis; r.yd = Math.round(meter / CR_YD * 100) / 100; r.pcs = r.m.pcsPerLapis * r.lapis; }
    if (r.endCut) {
      if (String(b.sisa).trim()) r.galat.push("End cut tidak punya sisa -- kosongkan kolom Sisa.");
      if (r.yd) { if (r.yd > kolam + 0.01) r.awas.push("lebih dari kumpulan sisa (" + crAngka_(Math.round(kolam * 100) / 100) + " yd)"); kolam -= r.yd; }
      return r;
    }
    if (!no) { r.galat.push("No roll wajib (tulisan di label roll), atau ketik End cut."); return r; }
    r.kunci = crNorm_(no);
    const ada = g ? g.roll.filter(function (x) { return crNorm_(x.noRoll) === r.kunci; })[0] : null;
    const st = perRoll[r.kunci] || (perRoll[r.kunci] = { ada: ada, pertama: null, panjang: ada ? Number(ada.kirimYd) : null, akum: ada ? Number(ada.aktualYd) || 0 : 0, selesaiDi: null, tgl: "" });
    r.ada = ada || null;
    // Satu roll dipotong MAJU: sisa dicatat di baris terakhirnya, jadi tanggal baris berikutnya tidak boleh lebih awal.
    if (r.tanggal) {
      if (st.tgl && r.tanggal < st.tgl) r.galat.push("Tanggal mundur: baris sebelumnya roll " + no + " bertanggal " + crTglTeks_(st.tgl) + ".");
      else st.tgl = r.tanggal;
    }
    if (ada && ada.status !== "Belum dipakai" && ada.status !== "Dipakai") {
      r.galat.push("Roll " + no + " sudah selesai di neraca -- sisa yang dipakai lagi dicatat sebagai End cut.");
    }
    if (!ada) {
      if (st.pertama === null) {
        st.pertama = i; r.pertamaBaru = true;
        const pj = crParse_(b.panjang);
        if (!(pj > 0)) r.galat.push("Panjang roll (yd) wajib di baris pertama roll " + no + ".");
        else st.panjang = pj;
      } else r.lanjutan = st.pertama;
    }
    if (st.selesaiDi !== null) r.galat.push("Roll " + no + " sudah ditandai selesai di baris " + (st.selesaiDi + 1) + " -- sisa hanya di baris terakhir roll itu.");
    if (String(b.sisa).trim()) {
      const s = crParse_(b.sisa);
      if (isNaN(s) || s < 0) r.galat.push("Sisa harus angka METER hasil meteran (0 kalau habis).");
      else {
        const sYd = s / CR_YD;   // sisa diukur meter, roll & kumpulan sisa dalam yard
        r.sisa = s; st.selesaiDi = i;
        if (st.panjang !== null && sYd > st.panjang + 0.01) r.galat.push("Sisa " + crAngka_(s) + " m lebih panjang dari roll (" + crAngka_(st.panjang) + " yd = " + crAngka_(Math.round(st.panjang * CR_YD * 100) / 100) + " m).");
        else kolam += sYd;
      }
    }
    r.panjangRoll = st.panjang;
    if (r.yd) {
      st.akum += r.yd;
      if (st.panjang !== null) { r.perkiraanSisa = Math.round((st.panjang - st.akum) * 100) / 100; if (r.perkiraanSisa < -0.01) r.awas.push("melebihi panjang roll"); }
    }
    return r;
  });
}

function crRenderForm_() {
  const el = crEl_("cr-form"); if (!el) return;
  const kw = crKwAktif_();
  if (!kw) { el.innerHTML = CR.po && CR.konteks ? '<p class="cr-info">Pilih kain &#183; warna untuk mulai mencatat.</p>' : ""; return; }
  const marker = crMarkerCocok_();
  if (!marker.length) {
    el.innerHTML = '<div class="cr-kartu"><p class="cr-info">Belum ada marker siap pakai untuk ' + crEsc_(kw.kain) + '. Minta tim pola mengisinya di halaman Produksi &gt; Marker.</p></div>';
    return;
  }
  if (!CR.baris.length) crTambahBaris_(5);
  const tglLama = crEl_("cr-tanggal") ? crEl_("cr-tanggal").value : "", kodeLama = crEl_("cr-kode") ? crEl_("cr-kode").value : "";
  el.innerHTML = '<div class="cr-kartu cr-form"><h2 class="cr-judul">Catat gelaran &#8212; ' + crEsc_(kw.kain + " · " + kw.warna) + '</h2>' +
    '<div class="cr-baris"><label class="cr-f cr-f-tgl">Tanggal potong<input id="cr-tanggal" type="date"/></label>' +
    '<label class="cr-f cr-f-kode">Kode kain (semua baris)<input id="cr-kode" type="text" autocomplete="off" placeholder="opsional"/></label></div>' +
    '<p class="cr-info cr-petunjuk">Satu baris = satu marker &#215; lapis dari satu roll. No roll yang sama di beberapa baris = satu roll: panjang cukup di baris pertamanya, ' +
    '<b>sisa dalam METER</b> (hasil meteran) diisi di baris terakhir saat roll habis (0 kalau habis). Ketik <b>End cut</b> di No roll untuk gelaran dari kumpulan sisa. ' +
    '<b>Tanggal</b> abu-abu = ikut baris di atasnya (baris pertama ikut Tanggal potong); ganti di baris pertama tiap hari, kosongkan untuk kembali ikut.</p>' +
    '<datalist id="cr-daftar-roll">' + crRollTerbuka_().map(function (r) { return '<option value="' + crEsc_(r.noRoll) + '"></option>'; }).join("") + '<option value="End cut"></option></datalist>' +
    '<div class="cr-gulir"><table class="cr-tabel cr-isian"><thead><tr><th class="num">#</th><th>Tanggal</th><th>No roll</th><th>Panjang (yd)</th><th>Marker</th><th>Lapis</th><th>Sisa (m)</th><th>Hasil</th><th></th></tr></thead>' +
    '<tbody id="cr-isian-body">' + CR.baris.map(function (b, i) { return crBarisHtml_(b, i, marker); }).join("") + '</tbody></table></div>' +
    '<div class="cr-aksi"><button class="cr-btn" id="cr-tambah" type="button">+ 5 baris</button>' +
    '<button class="cr-btn" id="cr-tempel-buka" type="button">Tempel dari Excel</button>' +
    '<button class="cr-btn cr-btn-utama" id="cr-simpan" type="button">Simpan semua</button>' +
    '<div class="cr-pesan hidden" id="cr-pesan"></div></div>' +
    '<div class="cr-tempel hidden" id="cr-tempel"></div></div>';
  crEl_("cr-tanggal").value = tglLama || crHariIni_();
  crEl_("cr-tanggal").addEventListener("input", function () { crPerbaruiTabel_(); });   // baris yang ikut berganti tanggal
  crEl_("cr-kode").value = kodeLama;
  const body = crEl_("cr-isian-body");
  body.addEventListener("input", crUbahSel_);
  body.addEventListener("change", crUbahSel_);
  body.addEventListener("click", function (ev) {
    const t = ev.target.closest ? ev.target.closest("[data-hapus]") : null; if (!t || CR.menyimpan) return;
    CR.baris = CR.baris.filter(function (b) { return String(b.uid) !== t.getAttribute("data-hapus"); });
    if (!CR.baris.length) crTambahBaris_(1);
    crRenderForm_();
  });
  crEl_("cr-tambah").addEventListener("click", function () { if (CR.menyimpan) return; crTambahBaris_(5); crRenderForm_(); });
  crEl_("cr-tempel-buka").addEventListener("click", crTempelBuka_);
  crEl_("cr-simpan").addEventListener("click", crSimpanSemua);
  if (CR.pesan) crTampilPesan_(CR.pesan.teks, CR.pesan.ok);
  crPerbaruiTabel_();
}
function crBarisHtml_(b, i, marker) {
  const kunci = b.status === "ok" ? " disabled" : "";
  return '<tr data-uid="' + b.uid + '"><td class="num cr-nomor">' + (i + 1) + '</td>' +
    '<td><input class="cr-in cr-in-tgl" data-f="tanggal" type="date" value="' + crEsc_(b.tanggal) + '"' + kunci + '/></td>' +
    '<td><input class="cr-in cr-in-no" data-f="noRoll" list="cr-daftar-roll" type="text" autocomplete="off" value="' + crEsc_(b.noRoll) + '"' + kunci + '/></td>' +
    '<td><input class="cr-in cr-in-yd" data-f="panjang" type="text" inputmode="decimal" autocomplete="off" value="' + crEsc_(b.panjang) + '"' + kunci + '/></td>' +
    '<td><select class="cr-in cr-in-marker" data-f="idMarker"' + kunci + '><option value="">-- marker --</option>' + marker.map(function (m) {
      return '<option value="' + crEsc_(m.idMarker) + '"' + (m.idMarker === b.idMarker ? " selected" : "") + '>' + crEsc_([m.kodeMarker || m.idMarker, crAngka_(m.panjangMarker) + " " + (m.satuanPanjang || "m"), m.pcsPerLapis + " pcs/lapis"].join(" · ")) + '</option>';
    }).join("") + '</select></td>' +
    '<td><input class="cr-in cr-in-lapis" data-f="lapis" type="text" inputmode="numeric" autocomplete="off" value="' + crEsc_(b.lapis) + '"' + kunci + '/></td>' +
    '<td><input class="cr-in cr-in-yd" data-f="sisa" type="text" inputmode="decimal" autocomplete="off" value="' + crEsc_(b.sisa) + '"' + kunci + '/></td>' +
    '<td class="cr-hasil"></td>' +
    '<td>' + (b.status === "ok" ? "" : '<button class="cr-hapus" data-hapus="' + b.uid + '" type="button" aria-label="Hapus baris ' + (i + 1) + '" title="Hapus baris">&#215;</button>') + '</td></tr>';
}
function crUbahSel_(ev) {
  const el = ev.target, f = el.getAttribute && el.getAttribute("data-f"); if (!f) return;
  const tr = el.closest("tr"), uid = tr ? tr.getAttribute("data-uid") : "";
  const b = CR.baris.filter(function (x) { return String(x.uid) === uid; })[0]; if (!b || b.status === "ok") return;
  b[f] = el.value;
  if (f === "tanggal") b.tglMentah = "";   // dipilih orang: tempelan yang tak terbaca tidak berlaku lagi; kosong = ikut atas
  if (b.status === "gagal" || b.status === "tunda") { b.status = ""; b.pesan = ""; }   // isian berubah: sebab lama kedaluwarsa
  crPerbaruiTabel_();
}
/** Perbarui sel turunan (panjang terkunci, hasil, sebab, warna baris) TANPA membangun ulang kotak isian -- fokus & kursor tetap. */
function crPerbaruiTabel_() {
  const R = crResolusi_(), body = crEl_("cr-isian-body"); if (!body) return R;
  R.forEach(function (r) {
    const tr = body.querySelector('tr[data-uid="' + r.b.uid + '"]'); if (!tr) return;
    const pj = tr.querySelector('[data-f="panjang"]'), sisa = tr.querySelector('[data-f="sisa"]'), hasil = tr.querySelector(".cr-hasil"), tg = tr.querySelector('[data-f="tanggal"]');
    // Kotak tanggal menampilkan tanggal YANG DIPAKAI (milik sendiri atau ikut atas, abu-abu); kotak yang sedang diketik tidak ditimpa.
    if (tg && !r.ok) {
      if (tg !== document.activeElement) tg.value = r.b.tglMentah ? "" : (r.b.tanggal || r.tanggal || "");
      tg.classList.toggle("cr-tgl-ikut", !!r.ikut);
    }
    const pjTerkunci = !r.ok && !r.kosong && (r.endCut || !!r.ada || r.lanjutan !== undefined);
    if (pj && !r.ok) { pj.disabled = pjTerkunci; pj.placeholder = pjTerkunci ? (r.endCut ? "-" : crAngka_(r.panjangRoll)) : "roll baru"; }
    if (sisa && !r.ok) { sisa.disabled = !!r.endCut; sisa.placeholder = r.endCut ? "-" : "jika habis"; }
    tr.className = r.ok ? "cr-baris-ok" : (r.b.status === "gagal" ? "cr-baris-gagal" : (r.b.status === "tunda" ? "cr-baris-tunda" : (!r.kosong && r.galat.length ? "cr-baris-salah" : "")));
    let h = "";
    if (r.ok) h = '<span class="cr-ok">' + crEsc_(r.b.hasil) + '</span>';
    else if (!r.kosong) {
      if (r.yd) h += '<b>' + r.pcs + ' pcs</b> &#183; ' + crAngka_(r.yd) + ' yd' + (r.perkiraanSisa !== undefined ? ' &#183; sisa &#8776; ' + crAngka_(r.perkiraanSisa) + ' yd (' + crAngka_(Math.round(r.perkiraanSisa * CR_YD * 100) / 100) + ' m)' : "") + (r.sisa !== undefined ? ' &#183; <b>SELESAI</b>' : "");
      if (r.awas.length) h += ' <span class="cr-awas">' + crEsc_(r.awas.join("; ")) + '</span>';
      const sebab = r.b.pesan ? [r.b.pesan] : r.galat;
      if (sebab.length) h += '<div class="cr-galat">' + crEsc_(sebab.join(" ")) + '</div>';
    }
    if (hasil) hasil.innerHTML = h;
  });
  return R;
}
function crTampilPesan_(teks, ok) {
  const el = crEl_("cr-pesan"); if (!el) return;
  el.className = "cr-pesan " + (ok ? "cr-pesan-ok" : "cr-pesan-galat"); el.textContent = teks;
}

/** Payload satu baris -- bentuknya sama dengan kiriman form satu-entri v394 (rute simpanCuttingRoll tidak berubah). */
function crPayload_(r, idRollBaru) {
  const kw = crKwAktif_(), m = r.m;
  const item = ((CR.konteks && CR.konteks.daftarItem) || []).filter(function (it) { return !m.style || crNorm_(it.style) === crNorm_(m.style); })[0] || {};
  const p = { idPurchaseOrder: CR.po, jenisKain: kw.kain, warna: kw.warna, idMarker: m.idMarker, jumlahLapis: r.lapis,
    tanggalPotong: r.tanggal || crTglBawaan_(), kodeKain: String((crEl_("cr-kode") && crEl_("cr-kode").value) || "").trim(),
    brand: m.brand || item.brand || "", artikel: m.artikel || item.artikel || "", style: m.style || item.style || "", sumber: r.endCut ? "End cut" : "Roll" };
  if (!r.endCut) {
    if (r.ada) p.idRoll = r.ada.idRoll;
    else if (r.pertamaBaru) p.rollBaru = { noRoll: String(r.b.noRoll).trim(), panjangYd: r.panjangRoll };
    else p.idRoll = idRollBaru[r.kunci];
    if (r.sisa !== undefined) { p.rollSelesai = true; p.sisa = r.sisa; p.satuanSisa = "m"; }
  }
  return p;
}

async function crSimpanSemua() {
  if (CR.menyimpan) return;
  const R = crPerbaruiTabel_(), kirim = R.filter(function (r) { return !r.ok && !r.kosong; });
  if (!kirim.length) { crTampilPesan_("Belum ada baris yang diisi.", false); return; }
  const salah = kirim.filter(function (r) { return r.galat.length; });
  if (salah.length) {
    crTampilPesan_(salah.length + " baris belum benar (baris " + salah.map(function (r) { return r.i + 1; }).join(", ") + ") -- lihat tulisan merah di barisnya. Belum ada yang dikirim.", false);
    return;
  }
  CR.menyimpan = true; CR.pesan = null;
  const tombol = crEl_("cr-simpan"); tombol.disabled = true; tombol.textContent = "Menyimpan...";
  const idRollBaru = {};
  let ok = 0, gagal = 0, tunda = 0;
  for (let n = 0; n < kirim.length; n++) {
    const r = kirim[n], b = r.b;
    if (!r.endCut && !r.ada && !r.pertamaBaru && !idRollBaru[r.kunci]) {
      b.status = "tunda"; b.pesan = "Ditunda: baris pertama roll " + String(b.noRoll).trim() + " belum tersimpan."; tunda++; crPerbaruiTabel_(); continue;
    }
    const p = crPayload_(r, idRollBaru), nama = CR_KUNCI + ":" + b.uid;
    p.idPermintaan = typeof rjdKunciIsian_ === "function" ? rjdKunciIsian_(nama, p) : String(Date.now()) + "-" + b.uid;
    crTampilPesan_("Menyimpan " + (n + 1) + " dari " + kirim.length + ": " + (r.endCut ? "End cut" : "roll " + String(b.noRoll).trim()) + " ...", true);
    try {
      const d = await crKirim_("simpanCuttingRoll", { payload: p });
      if (typeof rjdKunciLepas_ === "function") rjdKunciLepas_(nama);
      if (r.pertamaBaru && d.idRoll) idRollBaru[r.kunci] = d.idRoll;
      b.status = "ok"; b.pesan = ""; b.tanggal = p.tanggalPotong;   // tersimpan: tanggalnya beku, tidak ikut perubahan di atasnya
      b.hasil = (d.sudahTercatat ? "sudah tercatat sebelumnya " : "") + (d.idGelaran || "") + (d.totalPotongan !== undefined ? " · " + d.totalPotongan + " pcs" : "") +
        (d.kainTerpakaiYd !== undefined ? " · " + crAngka_(d.kainTerpakaiYd) + " yd" : "") + (d.rollSelesai ? " · roll selesai" + (d.sisa !== undefined && d.sisa !== null ? ", sisa " + crAngka_(d.sisa) + " " + (d.satuanSisa || "m") : "") : "") + (d.peringatan ? " -- PERHATIAN: " + d.peringatan : "");
      ok++;
    } catch (e) {
      if (!e.jaringan && typeof rjdKunciLepas_ === "function") rjdKunciLepas_(nama);
      b.status = "gagal";
      b.pesan = e.jaringan ? "Jawaban server tidak sampai -- baris ini MUNGKIN sudah tercatat. Simpan lagi TANPA mengubahnya: server mengenali kiriman yang sama." : "Tidak tersimpan: " + e.message;
      gagal++;
    }
    crPerbaruiTabel_();
  }
  CR.menyimpan = false; tombol.disabled = false; tombol.textContent = "Simpan semua";
  if (!gagal && !tunda) {
    CR.baris = []; CR.pesan = { teks: ok + " baris tersimpan.", ok: true };
  } else {
    CR.pesan = { teks: ok + " tersimpan, " + gagal + " gagal" + (tunda ? ", " + tunda + " ditunda" : "") + ". Baris yang tersimpan dikunci hijau; tekan Simpan semua lagi untuk mengirim sisanya saja.", ok: false };
  }
  crTampilPesan_(CR.pesan.teks, CR.pesan.ok);
  if (ok) crMuatPO_(false); else crRenderForm_();
}

// ---------- tempel dari Excel ----------
/* Kolom ditebak dari baris JUDUL kalau ada (lembar tim: "RASIO", "BAHAN KIRIM PER-ROLL", "JUMLAH LAYER", "SISA BAHAN"),
 * kalau tidak dari urutan; tebakannya selalu bisa diubah sebelum dimasukkan. Nomor roll TIDAK dikarang kalau kolomnya
 * tidak ada: keputusan Femri, nomor = tulisan di label roll -- barisnya merah sampai diketik. Rasio dicocokkan ke kode
 * marker ("1" -> "Rasio 1 - ..."); yang tidak cocok TEPAT SATU marker dibiarkan kosong (dipilih orang), tidak ditebak. */
const CR_PETA_KOLOM = [["", "(abaikan)"], ["tanggal", "Tanggal"], ["noRoll", "No roll"], ["panjang", "Panjang (yd)"], ["rasio", "Rasio / marker"], ["lapis", "Lapis"], ["sisa", "Sisa (m)"], ["sisaYd", "Sisa (yd, dikonversi ke m)"]];
function crTempelBuka_() {
  const el = crEl_("cr-tempel"); if (!el) return;
  el.classList.remove("hidden");
  el.innerHTML = '<p class="cr-info">Salin baris dari Excel / Google Sheets (boleh beserta baris judulnya), tempel di sini, lalu tekan Baca.</p>' +
    '<textarea id="cr-tempel-teks" rows="6" spellcheck="false"></textarea>' +
    '<div class="cr-aksi"><button class="cr-btn" id="cr-tempel-baca" type="button">Baca</button><button class="cr-btn" id="cr-tempel-tutup" type="button">Tutup</button></div>' +
    '<div id="cr-tempel-peta"></div>';
  crEl_("cr-tempel-baca").addEventListener("click", crTempelBaca_);
  crEl_("cr-tempel-tutup").addEventListener("click", function () { el.classList.add("hidden"); el.innerHTML = ""; });
  crEl_("cr-tempel-teks").focus();
}
function crTempelUrai_(teks) {
  const baris = String(teks || "").split(/\r?\n/).map(function (l) { return l.indexOf("\t") !== -1 ? l.split("\t") : l.split(";"); })
    .map(function (c) { return c.map(function (x) { return String(x).trim(); }); })
    .filter(function (c) { return c.some(function (x) { return x; }) && !/^total/i.test(c.filter(function (x) { return x; })[0] || ""); });
  if (!baris.length) return { judul: null, data: [], kolom: 0 };
  const huruf = function (x) { return /[a-z]{3,}/i.test(x) && !crEndCut_(x) && isNaN(crParse_(x)); };
  const judul = baris[0].filter(huruf).length >= Math.max(1, Math.ceil(baris[0].filter(function (x) { return x; }).length / 2)) ? baris[0] : null;
  const data = judul ? baris.slice(1) : baris;
  return { judul: judul, data: data, kolom: Math.max.apply(null, baris.map(function (c) { return c.length; })) };
}
/** Kolom berisi TANGGAL menurut isinya (v401): tiap sel terisi terbaca tanggal DAN bertanda "/" "-" atau nama bulan --
 *  "6.10" (panjang gelaran) juga terbaca tanggal, jadi titik saja tidak dihitung. */
function crKolomTanggal_(data, i) {
  const isi = (data || []).map(function (c) { return String(c[i] || "").trim(); }).filter(function (x) { return x; });
  return isi.length > 0 && isi.every(function (x) { return /[-/]|[a-z]{3}/i.test(x) && !!crTanggal_(x, "2000"); });
}
function crTebakKolom_(judul, i, kolom, data) {
  if (judul) {
    const t = crNorm_(judul[i]);
    if (/^(date|tanggal|tgl)\b/.test(t)) return "tanggal";
    if (/no\.? ?roll|nomor roll|^roll$/.test(t)) return "noRoll";
    const meter = /\(m\)|meter/.test(t);   // lembar MANSL: "BAHAN KIRIM (m)", "SISA BAHAN (m)" = kolom input meteran
    if (/kirim|panjang roll/.test(t)) return meter ? "" : "panjang";
    if (/rasio|marker/.test(t)) return "rasio";
    if (/(layer|lapis)/.test(t) && !/qty|per ?layer|per ?lapis/.test(t)) return "lapis";
    if (/sisa/.test(t) && !/akhir/.test(t)) return meter ? "sisa" : "sisaYd";
    return crKolomTanggal_(data, i) ? "tanggal" : "";
  }
  // Tanpa judul: kolom tanggal (dikenali dari isinya) dilewati, sisanya urutan bawaan.
  let tgl = -1;
  for (let k = 0; k < kolom; k++) if (crKolomTanggal_(data, k)) { tgl = k; break; }
  if (i === tgl) return "tanggal";
  const j = tgl !== -1 && i > tgl ? i - 1 : i, n = tgl !== -1 ? kolom - 1 : kolom;
  const urut = n === 4 ? ["noRoll", "panjang", "lapis", "sisa"] : ["noRoll", "panjang", "rasio", "lapis", "sisa"];
  return urut[j] || "";
}
function crTempelBaca_() {
  const u = crTempelUrai_(crEl_("cr-tempel-teks").value), el = crEl_("cr-tempel-peta");
  CR.tempel = u;
  if (!u.data.length) { el.innerHTML = '<p class="cr-galat">Tidak ada baris data yang terbaca.</p>'; return; }
  const marker = crMarkerCocok_();
  let h = '<p class="cr-info">' + u.data.length + ' baris terbaca' + (u.judul ? " (baris judul dilewati)" : "") + '. Periksa arti tiap kolom:</p><div class="cr-tempel-kolom">';
  for (let i = 0; i < u.kolom; i++) {
    const tebak = crTebakKolom_(u.judul, i, u.kolom, u.data);
    h += '<label class="cr-f">' + crEsc_(u.judul ? (u.judul[i] || "Kolom " + (i + 1)) : "Kolom " + (i + 1)) +
      '<select data-kolom="' + i + '">' + CR_PETA_KOLOM.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === tebak ? " selected" : "") + '>' + k[1] + '</option>'; }).join("") + '</select>' +
      '<small>' + crEsc_(u.data.slice(0, 3).map(function (c) { return c[i] || "-"; }).join(" · ")) + '</small></label>';
  }
  h += '</div><label class="cr-f cr-f-marker">Marker untuk baris tanpa rasio<select id="cr-tempel-marker">' +
    marker.map(function (m) { return '<option value="' + crEsc_(m.idMarker) + '">' + crEsc_(m.kodeMarker || m.idMarker) + '</option>'; }).join("") + '</select></label>' +
    '<div class="cr-aksi"><button class="cr-btn cr-btn-utama" id="cr-tempel-masuk" type="button">Masukkan ' + u.data.length + ' baris ke tabel</button></div>';
  el.innerHTML = h;
  crEl_("cr-tempel-masuk").addEventListener("click", crTempelMasukkan_);
}
function crCocokRasio_(teks, marker) {
  const t = crNorm_(teks); if (!t) return "";
  const cocok = marker.filter(function (m) {
    const k = crNorm_(m.kodeMarker || "");
    if (k === t) return true;
    if (/^\d+$/.test(t)) return new RegExp("^rasio\\s*" + t + "(\\D|$)").test(k);
    return k.indexOf(t + " ") === 0;
  });
  return cocok.length === 1 ? cocok[0].idMarker : "";
}
function crTempelMasukkan_() {
  const u = CR.tempel; if (!u || !u.data.length) return;
  const peta = {};
  Array.prototype.forEach.call(document.querySelectorAll("#cr-tempel-peta select[data-kolom]"), function (s) { if (s.value) peta[s.value] = Number(s.getAttribute("data-kolom")); });
  const marker = crMarkerCocok_(), bawaan = crEl_("cr-tempel-marker") ? crEl_("cr-tempel-marker").value : "";
  const ambil = function (c, k) { return peta[k] === undefined ? "" : (c[peta[k]] || ""); };
  const tahun = crTglBawaan_().slice(0, 4);
  let tglBawa = "";   // baris yang isinya CUMA tanggal (pemisah hari di lembar) menurunkan tanggalnya ke baris data berikutnya
  const baru = u.data.map(function (c) {
    const mentah = String(ambil(c, "tanggal")).trim(), iso = crTanggal_(mentah, tahun);
    // Sisa: kolom meter dipakai apa adanya; hanya kalau yang ada cuma kolom yard, ia dikonversi (2 desimal, koma).
    let sisa = ambil(c, "sisa");
    if (peta.sisa === undefined && peta.sisaYd !== undefined) {
      const v = crParse_(ambil(c, "sisaYd"));
      sisa = isNaN(v) ? ambil(c, "sisaYd") : String(Math.round(v * CR_YD * 100) / 100).replace(".", ",");
    }
    return crBarisBaru_({ noRoll: ambil(c, "noRoll"), panjang: ambil(c, "panjang"), lapis: ambil(c, "lapis"), sisa: sisa,
      tanggal: iso || "", tglMentah: iso === null ? mentah : "",
      idMarker: peta.rasio === undefined ? bawaan : crCocokRasio_(ambil(c, "rasio"), marker) });
  }).filter(function (b) {
    if (crBarisKosong_(b)) { if (b.tanggal) tglBawa = b.tanggal; return false; }
    if (!b.tanggal && !b.tglMentah && tglBawa) b.tanggal = tglBawa;
    tglBawa = "";
    return true;
  });
  CR.baris = CR.baris.filter(function (b) { return b.status === "ok" || !crBarisKosong_(b); }).concat(baru);
  CR.tempel = null;
  CR.pesan = { teks: baru.length + " baris dari Excel masuk tabel -- periksa (baris merah belum lengkap), lalu Simpan semua.", ok: true };
  crRenderForm_();
}

// ---------- laporan per roll ----------
/** Kolom size neraca (v400): hanya size yang ADA hasilnya di kelompok itu, urut size PO (getMarkerPO) lalu urutan baku. */
function crSizeKolom_(perSize) {
  const urut = ((CR.konteks && CR.konteks.sizeTersedia) || []).concat(LP_SIZE_ORDER_DIKENAL, ["All Size"]);
  const pos = function (z) { const i = urut.indexOf(z); return i === -1 ? 999 : i; };
  return Object.keys(perSize || {}).filter(function (z) { return perSize[z]; }).sort(function (a, b) { return pos(a) - pos(b) || a.localeCompare(b); });
}
function crRenderLaporan_() {
  const el = crEl_("cr-laporan"); if (!el) return;
  if (el && !el.dataset.koreksiPasang) { el.addEventListener("click", crKoreksiKlik_); el.dataset.koreksiPasang = "1"; }   // 5 Nov 2026: tombol koreksi
  const L = CR.lap; if (!L) { el.innerHTML = ""; return; }
  const grup = (L.kain || []).slice().sort(function (a, b) { return (crKunciKw_(b.jenisKain, b.warna) === CR.kw) - (crKunciKw_(a.jenisKain, a.warna) === CR.kw); });
  if (!grup.length) { el.innerHTML = '<div class="cr-kartu"><p class="cr-info">Belum ada roll maupun gelaran tercatat untuk PO ini.</p></div>'; return; }
  const sel = function (v) { return v === null || v === undefined ? "-" : crAngka_(v); };
  const kelasSel = function (v) { return v === null || v === undefined ? "" : (v < -0.005 ? " cr-minus" : (v > 0.005 ? " cr-plus" : "")); };
  el.innerHTML = '<h2 class="cr-judul cr-judul-lap">Neraca per roll &#8212; ' + crEsc_(L.idPurchaseOrder) + ' <span class="cr-satuan">(yard)</span></h2>' +
    grup.map(function (g) {
      const s = g.ringkasan || {}, aktif = crKunciKw_(g.jenisKain, g.warna) === CR.kw;
      const sz = crSizeKolom_(s.perSize);
      // sel kosong untuk size tanpa hasil (seperti lembar tim) -- angka 0 di 5 kolom x 50 roll menenggelamkan yang terisi
      const selSz = function (ps, pcs) {
        return sz.map(function (z) { return '<td class="num cr-sz">' + (ps && ps[z] ? ps[z] : "") + '</td>'; }).join("") + '<td class="num cr-sz-total"><b>' + (pcs || 0) + '</b></td>';
      };
      // Baris Total = JUMLAH KOLOM (sisa = sisa roll 353,24, bukan sisa potongan): sisa potongan sudah di kotak ringkasan. Laporan
      // cetak memakai sisa potongan di barisnya dan menerangkannya di catatan kaki -- perbedaan yang disetujui Femri 2 Nov 2026.
      const kaki = '<tfoot><tr class="cr-total"><td class="cr-no">Total</td><td class="num">' + sel(s.materialYd) + '</td><td></td><td class="num">' +
        sel(Math.round(((s.konsumsiRollYd || 0) + (s.endCutYd || 0)) * 100) / 100) + '</td><td class="num">' + sel(s.sisaRollYd) + '</td><td class="num' + kelasSel(s.shortYd) + '">' +
        sel(s.shortYd) + '</td>' + selSz(s.perSize, s.pcs) + '<td></td></tr></tfoot>';
      const tanpa = Object.keys(g.tanpaRoll || {}).map(function (j) { const t = g.tanpaRoll[j]; return t.gelaran + " gelaran " + j + " (" + crAngka_(t.yd) + " yd, " + t.pcs + " pcs)"; });
      return '<div class="cr-kartu cr-grup' + (aktif ? " cr-grup-aktif" : "") + '" data-kw="' + crEsc_(crKunciKw_(g.jenisKain, g.warna)) + '">' +
        '<h3 class="cr-grup-judul">' + crEsc_(g.jenisKain + " · " + g.warna) + '</h3>' +
        '<div class="cr-ring">' +
        '<span><small>Material</small><b>' + sel(s.materialYd) + '</b></span>' +
        '<span><small>Konsumsi roll</small><b>' + sel(s.konsumsiRollYd) + '</b></span>' +
        '<span><small>Sisa roll</small><b>' + sel(s.sisaRollYd) + '</b></span>' +
        '<span class="cr-ring-short' + kelasSel(s.shortYd) + '"><small>Selisih (' + s.rollSelesai + ' roll selesai)</small><b>' + sel(s.shortYd) + (s.shortPersen === null || s.shortPersen === undefined ? "" : " (" + crAngka_(s.shortPersen) + "%)") + '</b></span>' +
        '<span><small>End cut</small><b>' + sel(s.endCutYd) + (s.endCutPcs ? " &#183; " + s.endCutPcs + " pcs" : "") + '</b></span>' +
        // 5 Nov 2026 (opsi 1 Femri): "Sisa akhir" -> "Sisa potongan" -- satu istilah dengan laporan cetak; klien MANSL 288 membaca
        // "sisa akhir 98,52 yd" sebagai kain utuh, padahal itu potongan pendek (sisa roll selesai - End cut), hasil hitungan.
        '<span class="' + kelasSel(s.sisaAkhirYd < 0 ? s.sisaAkhirYd : 0) + '" title="Potongan pendek sisa roll selesai dikurangi End cut -- bukan kain utuh, hasil hitungan"><small>Sisa potongan</small><b>' + sel(s.sisaAkhirYd) + '</b></span>' +
        '<span><small>Hasil</small><b>' + (s.pcs || 0) + ' pcs</b></span></div>' +
        '<div class="cr-gulir"><table class="cr-tabel"><thead><tr><th rowspan="2">Roll</th><th rowspan="2" class="num">Kirim</th><th rowspan="2">Marker &#215; lapis</th><th rowspan="2" class="num">Aktual</th><th rowspan="2" class="num">Sisa</th><th rowspan="2" class="num">Selisih</th>' +
        '<th colspan="' + (sz.length + 1) + '" class="cr-sz-kepala">Hasil cutting per size (pcs)</th><th rowspan="2">Status</th></tr><tr>' +
        sz.map(function (z) { return '<th class="num cr-sz">' + crEsc_(z) + '</th>'; }).join("") + '<th class="num cr-sz-total">Total</th></tr></thead><tbody>' +
        g.roll.map(function (r) {
          const sisaSel = '<td class="num">' + sel(r.sisaYd) + (r.satuanUkur === "m" ? ' <small class="cr-ukur">(' + crAngka_(r.sisaUkur) + ' m)</small>' : "") + '</td><td class="num' + kelasSel(r.selisihYd) + '">' + sel(r.selisihYd) + '</td>';
          const statusSel = '<td><span class="cr-st cr-st-' + crNorm_(r.status).replace(/[^a-z]+/g, "-") + '">' + crEsc_(r.status) + '</span></td>';
          if (r.pemakaian.length <= 1) {
            return '<tr><td class="cr-no">' + crEsc_(r.noRoll || "-") + '</td><td class="num">' + sel(r.kirimYd) + '</td><td>' +
              (r.pemakaian.length ? r.pemakaian.map(function (x) { return crTeksPakaiKoreksi_(x); }).join("<br>") : "-") + '</td>' +
              '<td class="num">' + sel(r.aktualYd) + '</td>' + sisaSel + selSz(r.perSize, r.pcs) + statusSel + '</tr>';
          }
          // 5 Nov 2026 (permintaan Femri): roll yang digelar beberapa marker/rasio = SATU BARIS PER PEMAKAIAN. Yang digabung
          // (rowspan) HANYA Roll & Kirim; Aktual & hasil per size milik pemakaiannya; Sisa, Selisih & Status milik ROLL -> di
          // baris terakhir (baris penutup roll, seperti lembar tim). Dulu satu baris dengan marker ber-<br> dan angka dijumlah:
          // roll 10 MCONX A34 'Inner Rasio 1 x 4 + Inner Rasio 2 x 8' terbaca 100,61 yd / S 20 tanpa bisa dipisah per rasio.
          return crPakaiBaris_(r.pemakaian, '<td class="cr-no"' + ' rowspan="' + r.pemakaian.length + '">' + crEsc_(r.noRoll || "-") + '</td><td class="num" rowspan="' +
            r.pemakaian.length + '">' + sel(r.kirimYd) + '</td>', sisaSel, statusSel, sel, selSz, "");
        }).join("") +
        (g.endCut && g.endCut.gelaran && g.endCut.gelaran.length === 1 ? '<tr class="cr-endcut"><td class="cr-no">End cut</td><td class="num">-</td><td>' + g.endCut.gelaran.map(function (x) { return crTeksPakaiKoreksi_(x); }).join("<br>") +
          '</td><td class="num">' + sel(g.endCut.yd) + '</td><td class="num">-</td><td class="num">-</td>' + selSz(g.endCut.perSize, g.endCut.pcs) + '<td><span class="cr-st">dari kumpulan sisa</span></td></tr>' : "") +
        // End cut beberapa gelaran: pola yang sama (satu baris per gelaran, label & kirim digabung, keterangan di baris terakhir).
        (g.endCut && g.endCut.gelaran && g.endCut.gelaran.length > 1 ? crPakaiBaris_(g.endCut.gelaran, '<td class="cr-no" rowspan="' + g.endCut.gelaran.length +
          '">End cut</td><td class="num" rowspan="' + g.endCut.gelaran.length + '">-</td>', '<td class="num">-</td><td class="num">-</td>',
          '<td><span class="cr-st">dari kumpulan sisa</span></td>', sel, selSz, "cr-endcut") : "") +
        '</tbody>' + kaki + '</table></div>' +
        (tanpa.length ? '<p class="cr-catatan">Tanpa roll (dicatat lewat form gelaran lama, tidak masuk neraca roll): ' + crEsc_(tanpa.join("; ")) + '.</p>' : "") +
        '</div>';
    }).join("") +
    ((L.gugur && L.gugur.length) || (L.yatim && L.yatim.length) ? '<p class="cr-catatan">Pemakaian yang tidak dihitung: ' + crEsc_((L.gugur || []).concat(L.yatim || []).join("; ")) + '.</p>' : "");
}

// ---------- mulai ----------
function crMulaiHalaman_() {
  crPasangKerangka_();
  const t = crBacaSesi_();   // sesi perangkat (ditaruh simpro-global.js) atau login Google yang masih berlaku
  if (t) { CR_ID_TOKEN = t; crMulai(); return; }
  crTampilLogin_("");
}
if (typeof rjdSaatDomSiap_ === "function") rjdSaatDomSiap_(crMulaiHalaman_);
else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", crMulaiHalaman_);
else crMulaiHalaman_();
