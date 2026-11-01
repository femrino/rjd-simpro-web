/* simpro-cutting.js -- halaman /p/cutting.html: FORM CUTTING PER ROLL (langkah 2, 1 Nov 2026; butuh gs >= @428)
 *
 * Satu Simpan = satu marker x lapis dari SATU roll (atau dari kumpulan sisa = End cut). Server (cutting-roll.js,
 * simpanCuttingRoll) menulis gelaran + roll baru + sisa saat roll selesai + penghubung dalam satu lock; halaman ini
 * cuma mengumpulkan isian dan menampilkan neraca per roll (getLaporanCuttingRoll): kirim, aktual, sisa, selisih.
 * Keputusan Femri 1 Nov 2026: input YARD, nomor roll wajib untuk roll baru, roll yang dipakai dua marker = dua kali
 * Simpan dengan roll yang sama (sisa hanya di yang terakhir), End cut dari kumpulan sisa per kain/warna.
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
const CR = { daftarPO: [], po: "", konteks: null, lap: null, kw: "", urut: 0, menyimpan: false, rollPilih: "", pesan: null };

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
  crEl_("cr-po").addEventListener("change", function () { crPilihPO_(this.value); });
  crEl_("cr-kw").addEventListener("change", function () { CR.kw = this.value; CR.rollPilih = ""; CR.pesan = null; crRenderForm_(); crRenderLaporan_(); });
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
  CR.po = po || ""; CR.konteks = null; CR.lap = null; CR.kw = ""; CR.rollPilih = ""; CR.pesan = null;
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

// ---------- form ----------
function crRenderForm_() {
  const el = crEl_("cr-form"); if (!el) return;
  const kw = crKwAktif_();
  if (!kw) { el.innerHTML = CR.po && CR.konteks ? '<p class="cr-info">Pilih kain &#183; warna untuk mulai mencatat.</p>' : ""; return; }
  const marker = crMarkerCocok_(), roll = crRollTerbuka_();
  if (!marker.length) {
    el.innerHTML = '<div class="cr-kartu"><p class="cr-info">Belum ada marker siap pakai untuk ' + crEsc_(kw.kain) + '. Minta tim pola mengisinya di halaman Produksi &gt; Marker.</p></div>';
    return;
  }
  el.innerHTML = '<div class="cr-kartu cr-form"><h2 class="cr-judul">Catat gelaran &#8212; ' + crEsc_(kw.kain + " · " + kw.warna) + '</h2>' +
    '<div class="cr-sumber"><label><input type="radio" name="cr-sumber" value="Roll" checked/> Dari roll</label>' +
    '<label><input type="radio" name="cr-sumber" value="End cut"/> End cut (dari kumpulan sisa)</label></div>' +
    '<div class="cr-baris" id="cr-baris-roll"><label class="cr-f cr-f-roll">Roll<select id="cr-roll">' +
    roll.map(function (r) { return '<option value="' + crEsc_(r.idRoll) + '">' + crEsc_("Roll " + (r.noRoll || "-") + " · kirim " + crAngka_(r.kirimYd) + " yd" + (r.aktualYd ? " · terpakai " + crAngka_(r.aktualYd) + " yd" : "")) + '</option>'; }).join("") +
    '<option value="baru">+ Roll baru</option></select></label>' +
    '<label class="cr-f cr-f-no cr-rollbaru">No roll<input id="cr-noroll" type="text" autocomplete="off" placeholder="tulisan di label roll"/></label>' +
    '<label class="cr-f cr-f-yd cr-rollbaru">Panjang roll (yd)<input id="cr-panjang" type="text" inputmode="decimal" autocomplete="off" placeholder="mis. 115,5"/></label></div>' +
    '<div class="cr-baris"><label class="cr-f cr-f-marker">Marker<select id="cr-marker">' +
    marker.map(function (m) { return '<option value="' + crEsc_(m.idMarker) + '">' + crEsc_([m.kodeMarker || m.idMarker, m.style, crAngka_(m.panjangMarker) + " " + (m.satuanPanjang || "m"), m.pcsPerLapis + " pcs/lapis"].filter(function (x) { return x; }).join(" · ")) + '</option>'; }).join("") +
    '</select></label><label class="cr-f cr-f-lapis">Lapis<input id="cr-lapis" type="text" inputmode="numeric" autocomplete="off"/></label>' +
    '<label class="cr-f cr-f-tgl">Tanggal potong<input id="cr-tanggal" type="date"/></label>' +
    '<label class="cr-f cr-f-kode">Kode kain<input id="cr-kode" type="text" autocomplete="off" placeholder="opsional"/></label></div>' +
    '<div class="cr-baris cr-baris-selesai" id="cr-baris-selesai"><label class="cr-cek"><input id="cr-selesai" type="checkbox"/> Roll ini SELESAI &#8212; catat sisanya</label>' +
    '<label class="cr-f cr-f-yd hidden" id="cr-sisa-wrap">Sisa roll (yd)<input id="cr-sisa" type="text" inputmode="decimal" autocomplete="off" placeholder="0 kalau habis"/></label></div>' +
    '<div class="cr-hitung" id="cr-hitung"></div>' +
    '<div class="cr-aksi"><button class="cr-btn cr-btn-utama" id="cr-simpan" type="button">Simpan</button><div class="cr-pesan hidden" id="cr-pesan"></div></div></div>';
  crEl_("cr-tanggal").value = crHariIni_();
  const r = crEl_("cr-roll");
  if (CR.rollPilih && roll.some(function (x) { return x.idRoll === CR.rollPilih; })) r.value = CR.rollPilih; else if (!roll.length) r.value = "baru";
  Array.prototype.forEach.call(el.querySelectorAll("input, select"), function (x) { x.addEventListener(x.tagName === "SELECT" || x.type === "radio" || x.type === "checkbox" ? "change" : "input", crPerbarui_); });
  crEl_("cr-simpan").addEventListener("click", crSimpan);
  if (CR.pesan) crTampilPesan_(CR.pesan.teks, CR.pesan.ok);
  crPerbarui_();
}
function crSumber_() { const x = document.querySelector('input[name="cr-sumber"]:checked'); return x ? x.value : "Roll"; }
function crMarkerPilih_() { const id = crEl_("cr-marker") ? crEl_("cr-marker").value : ""; return crMarkerCocok_().filter(function (m) { return m.idMarker === id; })[0] || null; }
/** Tampilan mengikuti pilihan + hitungan perkiraan; nilai yang tersimpan tetap dihitung SERVER dari marker. */
function crPerbarui_() {
  const endCut = crSumber_() === "End cut";
  const rollSel = crEl_("cr-roll"), baru = !endCut && rollSel && rollSel.value === "baru";
  crEl_("cr-baris-roll").classList.toggle("hidden", endCut);
  crEl_("cr-baris-selesai").classList.toggle("hidden", endCut);
  Array.prototype.forEach.call(document.querySelectorAll(".cr-rollbaru"), function (x) { x.classList.toggle("hidden", !baru); });
  const selesai = !endCut && crEl_("cr-selesai").checked;
  crEl_("cr-sisa-wrap").classList.toggle("hidden", !selesai);
  if (!endCut && rollSel && rollSel.value !== "baru") CR.rollPilih = rollSel.value;

  const m = crMarkerPilih_(), lapis = Number(String(crEl_("cr-lapis").value).trim()), h = crEl_("cr-hitung"), bagian = [];
  if (m && lapis > 0 && /^\d+$/.test(String(crEl_("cr-lapis").value).trim())) {
    const meter = (Number(m.panjangMarker) + Number(m.allowancePerLapis || 0)) * lapis, yd = meter / CR_YD;
    bagian.push("Kain terpakai &#8776; <b>" + crAngka_(Math.round(yd * 100) / 100) + " yd</b> (" + crAngka_(Math.round(meter * 100) / 100) + " m) &#183; <b>" + (m.pcsPerLapis * lapis) + " pcs</b>");
    const g = crGrupAktif_();
    if (endCut) {
      const s = g ? g.ringkasan : null, tersedia = s ? s.sisaAkhirYd : 0;
      bagian.push("Kumpulan sisa " + crEsc_(crKwAktif_().kain) + ": " + crAngka_(tersedia) + " yd" + (yd > tersedia + 0.01 ? ' &#8212; <span class="cr-awas">lebih dari sisa roll yang tercatat; periksa roll yang belum diukur atau lapisnya</span>' : ""));
    } else if (rollSel && rollSel.value !== "baru") {
      const r = (g ? g.roll : []).filter(function (x) { return x.idRoll === rollSel.value; })[0];
      if (r) { const sisa = r.kirimYd - r.aktualYd - yd; bagian.push("Perkiraan sisa roll " + crEsc_(r.noRoll || "-") + " sesudah ini &#8776; " + crAngka_(Math.round(sisa * 100) / 100) + " yd" + (sisa < -0.01 ? ' &#8212; <span class="cr-awas">melebihi panjang roll</span>' : "")); }
    } else if (baru) {
      const p = crParse_(crEl_("cr-panjang").value);
      if (p > 0) { const sisa = p - yd; bagian.push("Perkiraan sisa roll baru sesudah ini &#8776; " + crAngka_(Math.round(sisa * 100) / 100) + " yd" + (sisa < -0.01 ? ' &#8212; <span class="cr-awas">melebihi panjang roll</span>' : "")); }
    }
  }
  h.innerHTML = bagian.map(function (x) { return "<div>" + x + "</div>"; }).join("");
}
function crTampilPesan_(teks, ok) {
  const el = crEl_("cr-pesan"); if (!el) return;
  el.className = "cr-pesan " + (ok ? "cr-pesan-ok" : "cr-pesan-galat"); el.textContent = teks;
}

/** Kumpulkan isian -> { payload } atau { galat }. Pemeriksaan di sini mencegah salah ketik; penjaga sebenarnya server. */
function crKumpulkan_() {
  const kw = crKwAktif_(), m = crMarkerPilih_(), endCut = crSumber_() === "End cut";
  if (!CR.po || !kw) return { galat: "Pilih PO dan kain · warna dulu." };
  if (!m) return { galat: "Pilih marker." };
  const lapisT = String(crEl_("cr-lapis").value).trim();
  if (!/^\d+$/.test(lapisT) || Number(lapisT) <= 0) return { galat: "Lapis harus bilangan bulat lebih dari 0 (mis. 48)." };
  const item = ((CR.konteks && CR.konteks.daftarItem) || []).filter(function (it) { return !m.style || crNorm_(it.style) === crNorm_(m.style); })[0] || {};
  const p = { idPurchaseOrder: CR.po, jenisKain: kw.kain, warna: kw.warna, idMarker: m.idMarker, jumlahLapis: Number(lapisT),
    tanggalPotong: crEl_("cr-tanggal").value || crHariIni_(), kodeKain: String(crEl_("cr-kode").value || "").trim(),
    brand: m.brand || item.brand || "", artikel: m.artikel || item.artikel || "", style: m.style || item.style || "", sumber: endCut ? "End cut" : "Roll" };
  if (!endCut) {
    const v = crEl_("cr-roll").value;
    if (v === "baru") {
      const no = String(crEl_("cr-noroll").value || "").trim(), pj = crParse_(crEl_("cr-panjang").value);
      if (!no) return { galat: "Nomor roll wajib diisi untuk roll baru (tulisan di label roll)." };
      if (!(pj > 0)) return { galat: "Panjang roll (yard) wajib diisi -- angka, satu tanda desimal (mis. 115,5)." };
      p.rollBaru = { noRoll: no, panjangYd: pj };
    } else if (v) p.idRoll = v;
    else return { galat: "Pilih roll." };
    if (crEl_("cr-selesai").checked) {
      const s = crParse_(crEl_("cr-sisa").value);
      if (isNaN(s) || s < 0) return { galat: "Roll ditandai selesai: isi sisanya dalam yard (0 kalau habis)." };
      p.rollSelesai = true; p.sisaYd = s;
    }
  }
  return { payload: p };
}

function crSimpan() {
  if (CR.menyimpan) return;
  const k = crKumpulkan_();
  if (k.galat) { crTampilPesan_(k.galat, false); return; }
  const p = k.payload;
  p.idPermintaan = typeof rjdKunciIsian_ === "function" ? rjdKunciIsian_(CR_KUNCI, p) : String(Date.now());
  CR.menyimpan = true;
  const tombol = crEl_("cr-simpan"); tombol.disabled = true; tombol.textContent = "Menyimpan...";
  crTampilPesan_("Menyimpan...", true);
  const lepas = function () { CR.menyimpan = false; const t = crEl_("cr-simpan"); if (t) { t.disabled = false; t.textContent = "Simpan"; } };
  crKirim_("simpanCuttingRoll", { payload: p }).then(function (d) {
    if (typeof rjdKunciLepas_ === "function") rjdKunciLepas_(CR_KUNCI);
    lepas();
    const teks = (d.sudahTercatat ? "Sudah tercatat sebelumnya (" + (d.idGelaran || "") + ") -- tidak dicatat dua kali." :
      "Tersimpan " + d.idGelaran + ": " + (d.sumber === "End cut" ? "End cut" : "roll " + d.noRoll) + ", " + d.jumlahLapis + " lapis, " + d.totalPotongan + " pcs, kain " + crAngka_(d.kainTerpakaiYd) + " yd" +
      (d.rollSelesai ? " -- roll SELESAI, sisa " + crAngka_(d.sisaYd) + " yd." : ".")) + (d.peringatan ? " PERHATIAN: " + d.peringatan : "");
    CR.pesan = { teks: teks, ok: !d.peringatan };
    CR.rollPilih = (d.rollSelesai || d.sumber === "End cut") ? "" : (d.idRoll || CR.rollPilih);
    crMuatPO_(false);
    crTampilPesan_(teks, !d.peringatan);
    const lap = crEl_("cr-lapis"); if (lap) lap.value = "";
  }).catch(function (e) {
    lepas();
    if (!e.jaringan && typeof rjdKunciLepas_ === "function") rjdKunciLepas_(CR_KUNCI);
    crTampilPesan_(e.jaringan ? e.message + " Gelaran ini MUNGKIN sudah tercatat. Tekan Simpan lagi TANPA mengubah isian: server mengenali kiriman yang sama dan tidak mencatatnya dua kali."
      : "Tidak tersimpan: " + e.message, false);
  });
}

// ---------- laporan per roll ----------
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
        '<div class="cr-gulir"><table class="cr-tabel"><thead><tr><th>Roll</th><th class="num">Kirim</th><th>Marker &#215; lapis</th><th class="num">Aktual</th><th class="num">Sisa</th><th class="num">Selisih</th><th class="num">Pcs</th><th>Status</th></tr></thead><tbody>' +
        g.roll.map(function (r) {
          return '<tr><td class="cr-no">' + crEsc_(r.noRoll || "-") + '</td><td class="num">' + sel(r.kirimYd) + '</td><td>' +
            (r.pemakaian.length ? r.pemakaian.map(function (x) { return crTeksPakai_(x); }).join("<br>") : "-") + '</td>' +
            '<td class="num">' + sel(r.aktualYd) + '</td><td class="num">' + sel(r.sisaYd) + '</td><td class="num' + kelasSel(r.selisihYd) + '">' + sel(r.selisihYd) + '</td>' +
            '<td class="num">' + (r.pcs || 0) + '</td><td><span class="cr-st cr-st-' + crNorm_(r.status).replace(/[^a-z]+/g, "-") + '">' + crEsc_(r.status) + '</span></td></tr>';
        }).join("") +
        (g.endCut && g.endCut.gelaran && g.endCut.gelaran.length ? '<tr class="cr-endcut"><td class="cr-no">End cut</td><td class="num">-</td><td>' + g.endCut.gelaran.map(function (x) { return crTeksPakai_(x); }).join("<br>") +
          '</td><td class="num">' + sel(g.endCut.yd) + '</td><td class="num">-</td><td class="num">-</td><td class="num">' + (g.endCut.pcs || 0) + '</td><td><span class="cr-st">dari kumpulan sisa</span></td></tr>' : "") +
        '</tbody></table></div>' +
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
