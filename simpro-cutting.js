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
  const menu = [["/", "Beranda"], null, ["https://www.rjdapparel.id/", "Profil"], ["/p/dashboard.html", "Dashboard"], ["/p/order-list.html", "Orderan"],
    ["/p/produksi.html", "Produksi"], ["/p/cutting.html", "Cutting per roll", true], ["/p/jadwal.html", "Jadwal Produksi"], ["/p/pengiriman.html", "Pengiriman"],
    ["/p/invoice.html", "Invoice"], ["/p/kas.html", "Buku Kas"], null, ["/p/sop.html", "SOP Produksi"], ["/p/upah.html", "Upah Borongan"]];
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
    '<div class="cr-kotak-login hidden" id="cr-login-box"><h2>Masuk dulu</h2><p>Halaman ini untuk staf produksi RJD Apparel.</p><div id="cr-google-btn"></div></div>' +
    '<div class="hidden" id="cr-loading"><p class="cr-info">Memuat...</p></div>' +
    '<div class="hidden" id="cr-isi">' +
    '<div class="cr-kartu cr-pilih"><label class="cr-f cr-f-po">Purchase Order<select id="cr-po"><option value="">Memuat daftar PO...</option></select></label>' +
    '<label class="cr-f cr-f-kw">Kain &#183; warna<select id="cr-kw" disabled><option value="">Pilih PO dulu</option></select></label></div>' +
    '<div class="cr-pesan hidden" id="cr-pesan-muat"></div>' +
    '<div id="cr-form"></div><div id="cr-laporan"></div></div></div>';
  const frag = document.createDocumentFragment();
  while (div.firstChild) frag.appendChild(div.firstChild);
  document.body.insertBefore(frag, document.body.firstChild);
  crEl_("cr-nav-logout").addEventListener("click", crLogout);
  crEl_("cr-menu-logout").addEventListener("click", crLogout);
  // Isian tabel milik SATU PO + kain . warna: berganti = tabelnya dibuang, jadi ditanya dulu kalau ada yang belum disimpan.
  const buang = function () { return !crAdaIsian_() || window.confirm("Isian tabel yang BELUM disimpan akan dibuang. Lanjut?"); };
  crEl_("cr-po").addEventListener("change", function () { if (CR.menyimpan || !buang()) { this.value = CR.po; return; } CR.baris = []; crPilihPO_(this.value); });
  crEl_("cr-kw").addEventListener("change", function () { if (CR.menyimpan || !buang()) { this.value = CR.kw; return; } CR.kw = this.value; CR.baris = []; CR.pesan = null; crRenderForm_(); crRenderLaporan_(); });
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
function crHandleGoogleLogin(response) { CR_ID_TOKEN = response.credential; crSimpanSesi_(response.credential); crMulai(); }
function crLogout() {
  CR_ID_TOKEN = null; try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = crEl_("cr-nav-logout"); if (b) b.classList.add("hidden");
  crShow("cr-login-box"); crPasangTombolGoogle_();
}
function crPasangTombolGoogle_() {
  if (typeof google === "undefined" || !google.accounts) return false;
  google.accounts.id.initialize({ client_id: CR_OAUTH_CLIENT_ID, callback: crHandleGoogleLogin });
  const t = crEl_("cr-google-btn"); if (t && !t.childNodes.length) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  return true;
}
function crMulai() { if (typeof rjdJagaHalaman === "function") rjdJagaHalaman(CR_ID_TOKEN, CR_API_URL, crMulaiIsi_); else crMulaiIsi_(); }
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
      if (!d || !d.success) { const g = new Error((d && d.error) || "Permintaan ditolak server."); g.server = true; throw g; }
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
  const sel = crEl_("cr-po");
  crKirim_("getDaftarPO").then(function (d) {
    CR.daftarPO = (d.daftar || []).filter(function (p) { return !/batal|cancel|selesai/i.test(String(p.status || "")); });
    let simpan = ""; try { simpan = localStorage.getItem("cr_po") || ""; } catch (e) { /* private mode */ }
    sel.innerHTML = '<option value="">-- pilih PO --</option>' + CR.daftarPO.map(function (p) {
      return '<option value="' + crEsc_(p.idPurchaseOrder) + '">' + crEsc_([p.idPurchaseOrder, p.namaKlien, (p.artikel || []).join(", ")].filter(function (x) { return x; }).join(" · ")) + '</option>';
    }).join("");
    crPesanMuat_("");
    if (simpan && CR.daftarPO.some(function (p) { return p.idPurchaseOrder === simpan; })) { sel.value = simpan; crPilihPO_(simpan); }
  }).catch(function (e) {
    sel.innerHTML = '<option value="">Daftar PO gagal dimuat</option>';
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
  return Object.assign({ uid: ++CR.uid, noRoll: "", panjang: "", idMarker: "", lapis: "", sisa: "", status: "", pesan: "", hasil: "" }, isi || {});
}
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
  const g = crGrupAktif_(), marker = crMarkerCocok_(), perRoll = {};
  let kolam = g && g.ringkasan ? Number(g.ringkasan.sisaAkhirYd) || 0 : 0;
  return (CR.baris || []).map(function (b, i) {
    const r = { b: b, i: i, galat: [], awas: [] };
    if (b.status === "ok") { r.ok = true; return r; }
    if (crBarisKosong_(b)) { r.kosong = true; return r; }
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
    const st = perRoll[r.kunci] || (perRoll[r.kunci] = { ada: ada, pertama: null, panjang: ada ? Number(ada.kirimYd) : null, akum: ada ? Number(ada.aktualYd) || 0 : 0, selesaiDi: null });
    r.ada = ada || null;
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
    '<b>sisa dalam METER</b> (hasil meteran) diisi di baris terakhir saat roll habis (0 kalau habis). Ketik <b>End cut</b> di No roll untuk gelaran dari kumpulan sisa.</p>' +
    '<datalist id="cr-daftar-roll">' + crRollTerbuka_().map(function (r) { return '<option value="' + crEsc_(r.noRoll) + '"></option>'; }).join("") + '<option value="End cut"></option></datalist>' +
    '<div class="cr-gulir"><table class="cr-tabel cr-isian"><thead><tr><th class="num">#</th><th>No roll</th><th>Panjang (yd)</th><th>Marker</th><th>Lapis</th><th>Sisa (m)</th><th>Hasil</th><th></th></tr></thead>' +
    '<tbody id="cr-isian-body">' + CR.baris.map(function (b, i) { return crBarisHtml_(b, i, marker); }).join("") + '</tbody></table></div>' +
    '<div class="cr-aksi"><button class="cr-btn" id="cr-tambah" type="button">+ 5 baris</button>' +
    '<button class="cr-btn" id="cr-tempel-buka" type="button">Tempel dari Excel</button>' +
    '<button class="cr-btn cr-btn-utama" id="cr-simpan" type="button">Simpan semua</button>' +
    '<div class="cr-pesan hidden" id="cr-pesan"></div></div>' +
    '<div class="cr-tempel hidden" id="cr-tempel"></div></div>';
  crEl_("cr-tanggal").value = tglLama || crHariIni_();
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
  if (b.status === "gagal" || b.status === "tunda") { b.status = ""; b.pesan = ""; }   // isian berubah: sebab lama kedaluwarsa
  crPerbaruiTabel_();
}
/** Perbarui sel turunan (panjang terkunci, hasil, sebab, warna baris) TANPA membangun ulang kotak isian -- fokus & kursor tetap. */
function crPerbaruiTabel_() {
  const R = crResolusi_(), body = crEl_("cr-isian-body"); if (!body) return R;
  R.forEach(function (r) {
    const tr = body.querySelector('tr[data-uid="' + r.b.uid + '"]'); if (!tr) return;
    const pj = tr.querySelector('[data-f="panjang"]'), sisa = tr.querySelector('[data-f="sisa"]'), hasil = tr.querySelector(".cr-hasil");
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
    tanggalPotong: (crEl_("cr-tanggal") && crEl_("cr-tanggal").value) || crHariIni_(), kodeKain: String((crEl_("cr-kode") && crEl_("cr-kode").value) || "").trim(),
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
      b.status = "ok"; b.pesan = "";
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
const CR_PETA_KOLOM = [["", "(abaikan)"], ["noRoll", "No roll"], ["panjang", "Panjang (yd)"], ["rasio", "Rasio / marker"], ["lapis", "Lapis"], ["sisa", "Sisa (m)"], ["sisaYd", "Sisa (yd, dikonversi ke m)"]];
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
function crTebakKolom_(judul, i, kolom) {
  if (judul) {
    const t = crNorm_(judul[i]);
    if (/no\.? ?roll|nomor roll|^roll$/.test(t)) return "noRoll";
    const meter = /\(m\)|meter/.test(t);   // lembar MANSL: "BAHAN KIRIM (m)", "SISA BAHAN (m)" = kolom input meteran
    if (/kirim|panjang roll/.test(t)) return meter ? "" : "panjang";
    if (/rasio|marker/.test(t)) return "rasio";
    if (/(layer|lapis)/.test(t) && !/qty|per ?layer|per ?lapis/.test(t)) return "lapis";
    if (/sisa/.test(t) && !/akhir/.test(t)) return meter ? "sisa" : "sisaYd";
    return "";
  }
  const urut = kolom === 4 ? ["noRoll", "panjang", "lapis", "sisa"] : ["noRoll", "panjang", "rasio", "lapis", "sisa"];
  return urut[i] || "";
}
function crTempelBaca_() {
  const u = crTempelUrai_(crEl_("cr-tempel-teks").value), el = crEl_("cr-tempel-peta");
  CR.tempel = u;
  if (!u.data.length) { el.innerHTML = '<p class="cr-galat">Tidak ada baris data yang terbaca.</p>'; return; }
  const marker = crMarkerCocok_();
  let h = '<p class="cr-info">' + u.data.length + ' baris terbaca' + (u.judul ? " (baris judul dilewati)" : "") + '. Periksa arti tiap kolom:</p><div class="cr-tempel-kolom">';
  for (let i = 0; i < u.kolom; i++) {
    const tebak = crTebakKolom_(u.judul, i, u.kolom);
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
  const baru = u.data.map(function (c) {
    // Sisa: kolom meter dipakai apa adanya; hanya kalau yang ada cuma kolom yard, ia dikonversi (2 desimal, koma).
    let sisa = ambil(c, "sisa");
    if (peta.sisa === undefined && peta.sisaYd !== undefined) {
      const v = crParse_(ambil(c, "sisaYd"));
      sisa = isNaN(v) ? ambil(c, "sisaYd") : String(Math.round(v * CR_YD * 100) / 100).replace(".", ",");
    }
    return crBarisBaru_({ noRoll: ambil(c, "noRoll"), panjang: ambil(c, "panjang"), lapis: ambil(c, "lapis"), sisa: sisa,
      idMarker: peta.rasio === undefined ? bawaan : crCocokRasio_(ambil(c, "rasio"), marker) });
  }).filter(function (b) { return !crBarisKosong_(b); });
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
      // Baris Total = JUMLAH KOLOM (sisa = sisa roll 353,24, bukan sisa akhir): sisa akhir sudah di kotak ringkasan. Laporan
      // cetak memakai sisa akhir di barisnya dan menerangkannya di catatan kaki -- perbedaan yang disetujui Femri 2 Nov 2026.
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
        '<span class="' + kelasSel(s.sisaAkhirYd < 0 ? s.sisaAkhirYd : 0) + '"><small>Sisa akhir</small><b>' + sel(s.sisaAkhirYd) + '</b></span>' +
        '<span><small>Hasil</small><b>' + (s.pcs || 0) + ' pcs</b></span></div>' +
        '<div class="cr-gulir"><table class="cr-tabel"><thead><tr><th rowspan="2">Roll</th><th rowspan="2" class="num">Kirim</th><th rowspan="2">Marker &#215; lapis</th><th rowspan="2" class="num">Aktual</th><th rowspan="2" class="num">Sisa</th><th rowspan="2" class="num">Selisih</th>' +
        '<th colspan="' + (sz.length + 1) + '" class="cr-sz-kepala">Hasil cutting per size (pcs)</th><th rowspan="2">Status</th></tr><tr>' +
        sz.map(function (z) { return '<th class="num cr-sz">' + crEsc_(z) + '</th>'; }).join("") + '<th class="num cr-sz-total">Total</th></tr></thead><tbody>' +
        g.roll.map(function (r) {
          return '<tr><td class="cr-no">' + crEsc_(r.noRoll || "-") + '</td><td class="num">' + sel(r.kirimYd) + '</td><td>' +
            (r.pemakaian.length ? r.pemakaian.map(function (x) { return crTeksPakai_(x); }).join("<br>") : "-") + '</td>' +
            '<td class="num">' + sel(r.aktualYd) + '</td><td class="num">' + sel(r.sisaYd) + (r.satuanUkur === "m" ? ' <small class="cr-ukur">(' + crAngka_(r.sisaUkur) + ' m)</small>' : "") + '</td><td class="num' + kelasSel(r.selisihYd) + '">' + sel(r.selisihYd) + '</td>' +
            selSz(r.perSize, r.pcs) + '<td><span class="cr-st cr-st-' + crNorm_(r.status).replace(/[^a-z]+/g, "-") + '">' + crEsc_(r.status) + '</span></td></tr>';
        }).join("") +
        (g.endCut && g.endCut.gelaran && g.endCut.gelaran.length ? '<tr class="cr-endcut"><td class="cr-no">End cut</td><td class="num">-</td><td>' + g.endCut.gelaran.map(function (x) { return crTeksPakai_(x); }).join("<br>") +
          '</td><td class="num">' + sel(g.endCut.yd) + '</td><td class="num">-</td><td class="num">-</td>' + selSz(g.endCut.perSize, g.endCut.pcs) + '<td><span class="cr-st">dari kumpulan sisa</span></td></tr>' : "") +
        '</tbody>' + kaki + '</table></div>' +
        (tanpa.length ? '<p class="cr-catatan">Tanpa roll (dicatat lewat form gelaran lama, tidak masuk neraca roll): ' + crEsc_(tanpa.join("; ")) + '.</p>' : "") +
        '</div>';
    }).join("") +
    ((L.gugur && L.gugur.length) || (L.yatim && L.yatim.length) ? '<p class="cr-catatan">Pemakaian yang tidak dihitung: ' + crEsc_((L.gugur || []).concat(L.yatim || []).join("; ")) + '.</p>' : "");
}

// ---------- mulai ----------
function crMulaiHalaman_() {
  crPasangKerangka_();
  const sesi = crBacaSesi_();
  if (sesi) { CR_ID_TOKEN = sesi; crMulai(); return; }
  crShow("cr-login-box");
  if (crPasangTombolGoogle_()) return;
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = function () { if (!CR_ID_TOKEN) crPasangTombolGoogle_(); };
  document.head.appendChild(s);
}
if (typeof rjdSaatDomSiap_ === "function") rjdSaatDomSiap_(crMulaiHalaman_);
else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", crMulaiHalaman_);
else crMulaiHalaman_();
