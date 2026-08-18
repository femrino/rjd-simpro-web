/**
 * ============================================================
 * SIMPRO -- simpro-dashboard
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : dashboard.html
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const DB_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const DB_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

function dbShow(id){
  ["db-login-box","db-loading","db-error","db-results"].forEach(function(x){
    document.getElementById(x).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

let DB_ID_TOKEN = null;

function dbSaveToken(token){
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  }catch(e){}
}
function dbGetCachedToken(){
  try{
    const raw = localStorage.getItem("db_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  }catch(e){ return null; }
}
function dbClearCachedToken(){
  try{ localStorage.removeItem("db_session"); }catch(e){}
}

function dbHandleGoogleLogin(response){
  dbShow("db-loading");
  DB_ID_TOKEN = response.credential;
  dbSaveToken(response.credential);
  dbFetch();
}

function dbLogout(){
  DB_ID_TOKEN = null;
  dbClearCachedToken();
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.disableAutoSelect();
  }
  const hero = document.getElementById("db-hero");
  if(hero) hero.style.display = "";
  const navLogout = document.getElementById("db-nav-logout");
  if(navLogout) navLogout.classList.add("hidden");
  const navTracking = document.getElementById("db-nav-tracking");
  if(navTracking) navTracking.classList.add("hidden");
  dbShow("db-login-box");
}

function dbSwitchTab(sectionName){
  document.querySelectorAll("#db-section-tabs .lp-section-tab").forEach(function(tab){
    tab.classList.toggle("active", tab.dataset.section === sectionName);
    // Gulung tab aktif ke tengah (v102) -- helper dari simpro-global.js.
    if (tab.dataset.section === sectionName && typeof rjdGulungTabKeTengah === "function") {
      rjdGulungTabKeTengah(tab);
    }
  });
  document.querySelectorAll("#db-app .lp-section-panel").forEach(function(panel){
    panel.style.display = (panel.dataset.panel === sectionName) ? "" : "none";
  });

  // Jadwal Produksi berat dihitung di server -- dimuat SAAT TAB DIBUKA saja,
  // bukan tiap dashboard render. Hasilnya di-cache di JP_DATA sampai Refresh.
  if(sectionName === "jadwal" && typeof jpMuatData === "function") jpMuatData(false);

}

document.querySelectorAll("#db-section-tabs .lp-section-tab").forEach(function(tab){
  tab.addEventListener("click", function(){
    dbSwitchTab(tab.dataset.section);
  });
});

// Wiring buat sub-tab & toggle di dalam tab "Detail Klien" (Produksi/Status
// Pengiriman/Tagihan) -- fungsi-fungsinya SENDIRI dari script global (shared
// sama Portal Klien), di sini cuma nyambungin ke elemen yang ada di markup Dashboard.
setupToggleGroup("lp-shipment-toggles", function(filterVal){
  renderShipments(window.LP_SHIPMENTS || [], filterVal);
});
setupToggleGroup("lp-order-toggles", function(filterVal){
  renderOrderList(window.LP_ORDERS || [], filterVal);
});
setupToggleGroup("lp-invoice-toggles", function(filterVal){
  renderInvoices(window.LP_INVOICES || [], filterVal);
});

setupToggleGroup("lp-orderan-toggles", function(filterVal){
  renderOrderanList(window.LP_ORDERAN || [], filterVal);
});
document.querySelectorAll(".lp-detail-tab").forEach(function(tab){
  tab.addEventListener("click", function(){
    switchSectionTab(tab.dataset.section);
  });
});

/**
 * Dipanggil dari klik baris klien di tab "Ringkasan Klien" -- lompat ke tab "Detail
 * Klien", sinkronin dropdown-nya, terus fetch data klien itu.
 */
/**
 * Buka detail 1 klien di PORTAL KLIEN (tab baru), bukan di dashboard.
 *
 * KENAPA: tab "Detail Klien" di dashboard dulu MENDUPLIKASI Portal Klien --
 * sub-tab yang sama (Profil/Orderan/Produksi/Pengiriman/Tagihan), data yang
 * sama, class yang sama. Dicek: NOL elemen yang cuma ada di dashboard, semuanya
 * juga ada di portal. Konsekuensi duplikat itu nyata: tiap perubahan tampilan
 * harus dikerjakan DUA KALI (CSS .lp-* sampai harus disalin ke cabang dashboard,
 * karena <b:if> mengisolasi CSS) -- dan itu sumber tampilan yang lama-lama
 * melenceng satu sama lain.
 *
 * Sekarang satu sumber saja: Portal Klien. Dibuka di TAB BARU biar konteks
 * dashboard (filter, posisi scroll, tab yang lagi dibuka) nggak hilang.
 * Portal membaca ?klien= dan langsung memilih klien itu -- lihat
 * renderInternalKlienPicker di blok Portal Klien.
 */
function dbOpenDetailKlien(klienId){
  if(!klienId) return;
  window.open("/p/tracking.html?klien=" + encodeURIComponent(klienId), "_blank", "noopener");
}

const DB_BULAN_NAMA = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/**
 * Isi dropdown Tahun (dinamis, ngikutin data yang beneran ada) dan Bulan (statis 1-12),
 * pasang listener biar re-render pas filter diganti. Cuma perlu dipanggil sekali per load.
 */
function dbSetupKontrolFilter(){
  const tahunSet = {};
  (window.DB_PO_AUDIT || []).forEach(function(o){ if(o.tahun) tahunSet[o.tahun] = true; });
  const tahunList = Object.keys(tahunSet).map(Number).sort(function(a,b){ return b - a; });

  const tahunEl = document.getElementById("db-kontrol-tahun");
  tahunEl.innerHTML = '<option value="semua">Semua Tahun</option>' +
    tahunList.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join("");
  // Default: tahun berjalan -- fallback ke "semua" kalau ternyata nggak ada PO
  // sama sekali di tahun ini (jaga-jaga biar nggak nampilin list kosong nyasar).
  const tahunSekarang = new Date().getFullYear();
  tahunEl.value = tahunList.indexOf(tahunSekarang) !== -1 ? String(tahunSekarang) : "semua";
  tahunEl.onchange = dbRenderKontrolData;

  const bulanEl = document.getElementById("db-kontrol-bulan");
  bulanEl.innerHTML = '<option value="semua">Semua Bulan</option>' +
    DB_BULAN_NAMA.map(function(nama, idx){ return '<option value="' + (idx+1) + '">' + nama + '</option>'; }).join("");
  bulanEl.value = "semua";
  bulanEl.onchange = dbRenderKontrolData;

  // Isi otomatis dari status yang BENERAN ada di data -- bukan hardcode, biar nggak
  // meleset kalau ternyata nilai enum di sheet beda dari dugaan.
  const statusSet = {};
  (window.DB_PO_AUDIT || []).forEach(function(o){ if(o.status) statusSet[o.status] = true; });
  const statusList = Object.keys(statusSet).sort();

  const statusEl = document.getElementById("db-kontrol-status");
  statusEl.innerHTML = '<option value="semua">Semua Status</option>' +
    statusList.map(function(s){ return '<option value="' + s + '">' + s + '</option>'; }).join("");
  // Default: "Selesai" -- fallback ke "semua" kalau nilai itu ternyata nggak ada
  // di data (jaga-jaga kalau enum status di sheet berubah/beda nama suatu saat).
  statusEl.value = statusList.indexOf("Selesai") !== -1 ? "Selesai" : "semua";
  statusEl.onchange = dbRenderKontrolData;
}

/**
 * Update angka badge kecil di tab utama Dashboard (Perlu Perhatian/Kontrol Data/
 * Aging Piutang) -- disembunyikan otomatis kalau angkanya 0, biar nggak keliatan
 * badge kosong yang nggak ada gunanya.
 */
/**
 * ============ DAFTAR PURCHASE ORDER ============
 * Menampilkan SEMUA order yang tercatat, bukan cuma yang lewat Form Order.
 * Sebelumnya order yang dibuat langsung di AppSheet tidak muncul di mana pun
 * di dashboard -- untuk mencetak SPK-nya harus mencari ID PO manual di sheet.
 *
 * Dimuat SEKALI saat tab pertama dibuka, lalu disaring di sisi klien. Daftar
 * PO bisa ratusan baris; memanggil server tiap kali mengetik di kotak cari
 * akan lambat dan boros kuota.
 */










function dbSetTabBadge(elId, count){
  const el = document.getElementById(elId);
  if(!el) return;
  if(count > 0){
    el.textContent = count;
    el.style.display = "inline-flex";
  } else {
    el.style.display = "none";
  }
}

function dbRenderKontrolData(){
  const filterTahun = document.getElementById("db-kontrol-tahun").value;
  const filterBulan = document.getElementById("db-kontrol-bulan").value;
  const filterStatus = document.getElementById("db-kontrol-status").value;

  const filtered = (window.DB_PO_AUDIT || []).filter(function(o){
    if(filterTahun !== "semua" && String(o.tahun) !== filterTahun) return false;
    if(filterBulan !== "semua" && String(o.bulan) !== filterBulan) return false;
    if(filterStatus !== "semua" && o.status !== filterStatus) return false;
    return true;
  });

  const tanpaPengiriman = filtered.filter(function(o){ return !o.adaPengiriman; });
  const tanpaInvoice = filtered.filter(function(o){ return !o.adaInvoice; });
  const adaGapQty = filtered.filter(function(o){ return o.adaGapQty; });

  // Badge tab -- jumlah PO yang punya MINIMAL 1 masalah data. Sengaja STABIL (nggak ikut
  // dropdown Tahun/Bulan/Status) biar jadi sinyal "berapa PO bolong yang perlu dibenerin"
  // yang tetap keliatan. Scope dibatasi biar angkanya actionable & nggak nakut-nakutin:
  //   - TAHUN BERJALAN aja (PO tahun-tahun lampau bukan prioritas kerja sekarang)
  //   - KECUALI order batal (batal ya wajar nggak ada pengiriman/invoice, bukan "bolong")
  // Cek batal-nya defensif (case-insensitive, nangkap "Cancel"/"Dibatalkan"/"Batal") karena
  // enum status diisi dinamis dari sheet -- nggak mau diam-diam gagal kalau ejaannya beda.
  // 1 PO kena 2 masalah tetap dihitung 1 (MINIMAL 1 masalah, bukan jumlah masalah).
  const thnBerjalan = new Date().getFullYear();
  const bermasalahTotal = (window.DB_PO_AUDIT || []).filter(function(o){
    if(Number(o.tahun) !== thnBerjalan) return false;
    const st = String(o.status || "").toLowerCase();
    if(st === "cancel" || st.indexOf("batal") !== -1) return false;
    return !o.adaPengiriman || !o.adaInvoice || o.adaGapQty;
  });
  dbSetTabBadge("db-tab-badge-kontrol", bermasalahTotal.length);

  const summaryEl = document.getElementById("db-kontrol-summary");
  summaryEl.innerHTML =
    '<div class="db-stat-card db-card-btn' + (dbKontrolActiveSubtab === "semua" ? " active" : "") + '" onclick="dbSelectKontrolSubtab(\'semua\')" style="background:var(--white);border:1px solid var(--line)">' +
      '<div class="db-stat-num" style="color:var(--ink)">' + filtered.length + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">TOTAL PO (periode ini)</div>' +
    '</div>' +
    '<div class="db-stat-card db-card-btn' + (dbKontrolActiveSubtab === "pengiriman" ? " active" : "") + '" onclick="dbSelectKontrolSubtab(\'pengiriman\')" style="background:' + (tanpaPengiriman.length ? '#FDECEA' : '#E3EFE6') + ';border:1px solid ' + (tanpaPengiriman.length ? '#E8A49C' : '#B7D6BE') + '">' +
      '<div class="db-stat-num" style="color:' + (tanpaPengiriman.length ? '#8f2c22' : '#2C6B3F') + '">' + tanpaPengiriman.length + '</div>' +
      '<div class="db-stat-label" style="color:' + (tanpaPengiriman.length ? '#8f2c22' : '#2C6B3F') + '">PO TANPA PENGIRIMAN</div>' +
    '</div>' +
    '<div class="db-stat-card db-card-btn' + (dbKontrolActiveSubtab === "invoice" ? " active" : "") + '" onclick="dbSelectKontrolSubtab(\'invoice\')" style="background:' + (tanpaInvoice.length ? '#FDECEA' : '#E3EFE6') + ';border:1px solid ' + (tanpaInvoice.length ? '#E8A49C' : '#B7D6BE') + '">' +
      '<div class="db-stat-num" style="color:' + (tanpaInvoice.length ? '#8f2c22' : '#2C6B3F') + '">' + tanpaInvoice.length + '</div>' +
      '<div class="db-stat-label" style="color:' + (tanpaInvoice.length ? '#8f2c22' : '#2C6B3F') + '">PO TANPA INVOICE</div>' +
    '</div>' +
    '<div class="db-stat-card db-card-btn' + (dbKontrolActiveSubtab === "gap" ? " active" : "") + '" onclick="dbSelectKontrolSubtab(\'gap\')" style="background:' + (adaGapQty.length ? '#FCF3E3' : '#E3EFE6') + ';border:1px solid ' + (adaGapQty.length ? '#E3C388' : '#B7D6BE') + '">' +
      '<div class="db-stat-num" style="color:' + (adaGapQty.length ? '#8A5D1F' : '#2C6B3F') + '">' + adaGapQty.length + '</div>' +
      '<div class="db-stat-label" style="color:' + (adaGapQty.length ? '#8A5D1F' : '#2C6B3F') + '">GAP QTY PO/KIRIM/INVOICE</div>' +
    '</div>';

  function renderList(elId, list, showBadge){
    const el = document.getElementById(elId);
    if(!list.length){
      el.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Tidak ada -- datanya lengkap semua untuk periode ini. \u2705</p>';
      return;
    }
    el.innerHTML = list.map(function(o){
      let badges = "";
      if(showBadge){
        if(!o.adaPengiriman) badges += '<span class="db-attention-badge menunggu_pengiriman">Belum Kirim</span>';
        if(!o.adaInvoice) badges += '<span class="db-attention-badge menunggu_invoice">Belum Invoice</span>';
      }
      return '<div class="db-attention-card">' +
        '<div>' +
          '<span style="font-family:monospace;font-size:11px;color:var(--thread)">' + o.kodeOrder + '</span>' +
          (o.jumlah ? '<span style="font-size:10px;color:var(--ink-soft);margin-left:8px">' + o.jumlah + ' pcs</span>' : '') +
          '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + o.tanggalPesanan + ' &#183; Status: ' + (o.status || "-") + ' &#183; Tahap: ' + o.tahap + '</div>' +
        '</div>' +
        (badges ? '<div style="display:flex;gap:4px;flex-wrap:wrap">' + badges + '</div>' : '') +
      '</div>';
    }).join("");
  }
  renderList("db-kontrol-pengiriman-list", tanpaPengiriman);
  renderList("db-kontrol-invoice-list", tanpaInvoice);

  // Gap Qty -- format beda dari renderList biasa (3 angka dibandingin, bukan badge
  // ya/tidak), jadi dirender terpisah. SENGAJA nggak pakai warna merah (itu kesannya
  // "pasti salah") -- angka yang beda cukup ditebalin + warna netral (amber), biar
  // yang mana perlu ditindaklanjuti itu keputusan yang baca, bukan sistem.
  function renderGapList(list){
    const el = document.getElementById("db-kontrol-gap-list");
    if(!list.length){
      el.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Tidak ada gap qty untuk periode ini. \u2705</p>';
      return;
    }
    // RANTAI KUANTITAS LIMA TITIK: order -> potong -> siap kirim -> kirim -> tagih.
    // Sebelumnya cuma tiga (PO/Kirim/Invoice), jadi kalau ada selisih tidak ada
    // yang bisa menjawab DI TITIK MANA selisih itu lahir -- kain kurang saat
    // potong? reject QC? atau memang belum dikirim? Dua titik tengah itu yang
    // sekarang tercatat (hasil-cutting.gs & qc-inspeksi.gs).
    //
    // Titik yang BELUM PUNYA CATATAN ditampilkan sebagai "-" abu-abu, BUKAN 0.
    // Nol berarti "diukur, hasilnya nol"; strip berarti "belum diukur". Dua hal
    // yang sangat berbeda, dan menyamakannya bikin orang mengira ada masalah
    // produksi padahal cuma pencatatannya yang belum jalan.
    el.innerHTML = list.map(function(o){
      function selisih_(nilai, tampil){
        if(!tampil || nilai === 0) return '';
        return ' <span style="color:#8A5D1F;font-weight:700">(' +
          (nilai > 0 ? '+' : '') + nilai + ')</span>';
      }
      function titik_(label, nilai, ada, delta, tampilDelta){
        if(!ada) return '<span style="opacity:.45">' + label + ': <b>&#183;</b></span>';
        return '<span>' + label + ': <b>' + nilai + '</b>' + selisih_(delta, tampilDelta) + '</span>';
      }
      // Delta dihitung terhadap titik SEBELUMNYA yang benar-benar terukur,
      // bukan selalu terhadap qty PO -- kalau tidak, order yang potongnya
      // memang bertahap terus tampil "kurang" tanpa alasan.
      const dPotong = o.adaCatatanPotong ? (o.qtyPotong - o.qtyPO) : 0;
      const dasarKirim = o.adaCatatanQC ? o.qtySiapKirim
        : (o.adaCatatanPotong ? o.qtyPotong : o.qtyPO);
      const dSiap = o.adaCatatanQC ? (o.qtySiapKirim - (o.adaCatatanPotong ? o.qtyPotong : o.qtyPO)) : 0;
      const dKirim = o.qtyDikirim - dasarKirim;
      const dInv = o.qtyInvoice - o.qtyDikirim;

      // Kirim melebihi yang lolos QC = barang keluar gudang tanpa lolos
      // pemeriksaan. Ini satu-satunya kondisi di daftar ini yang ditandai
      // merah, karena bukan sekadar selisih angka.
      const bahaya = o.adaCatatanQC && o.qtyDikirim > o.qtySiapKirim;

      return '<div class="db-attention-card"' +
          (bahaya ? ' style="border-left:3px solid var(--thread)"' : '') + '>' +
        '<div>' +
          '<span style="font-family:monospace;font-size:11px;color:var(--thread)">' + o.kodeOrder + '</span>' +
          '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + o.tanggalPesanan + ' &#183; Status: ' + (o.status || "-") + '</div>' +
          (bahaya ? '<div style="font-size:11px;color:var(--thread);font-weight:700;margin-top:3px">Dikirim ' +
            (o.qtyDikirim - o.qtySiapKirim) + ' pcs lebih banyak dari yang lolos QC</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:14px;font-family:monospace;font-size:12px;white-space:nowrap;flex-wrap:wrap">' +
          '<span>PO: <b>' + o.qtyPO + '</b></span>' +
          titik_('Potong', o.qtyPotong, o.adaCatatanPotong, dPotong, true) +
          titik_('Siap', o.qtySiapKirim, o.adaCatatanQC, dSiap, true) +
          '<span>Kirim: <b>' + o.qtyDikirim + '</b>' + selisih_(dKirim, true) + '</span>' +
          '<span>Invoice: <b>' + o.qtyInvoice + '</b>' + selisih_(dInv, true) + '</span>' +
        '</div>' +
      '</div>';
    }).join("");
  }
  // Urutin gap paling gede (PO vs Kirim, ATAU Kirim vs Invoice, dipilih yang lebih besar) duluan
  const gapSorted = adaGapQty.slice().sort(function(a, b){
    // "Dikirim melebihi yang lolos QC" naik paling atas -- itu bukan sekadar
    // selisih angka, tapi barang keluar gudang tanpa lolos pemeriksaan.
    const bahayaA = (a.adaCatatanQC && a.qtyDikirim > a.qtySiapKirim) ? 1 : 0;
    const bahayaB = (b.adaCatatanQC && b.qtyDikirim > b.qtySiapKirim) ? 1 : 0;
    if(bahayaA !== bahayaB) return bahayaB - bahayaA;
    const gapA = Math.max(Math.abs(a.gapPengiriman), Math.abs(a.gapInvoice));
    const gapB = Math.max(Math.abs(b.gapPengiriman), Math.abs(b.gapInvoice));
    return gapB - gapA;
  });
  renderGapList(gapSorted);

  // "Semua PO" -- urut terbaru dulu, pakai prefix 6-digit (YYMMDD) di kodeOrder karena
  // tanggal mentah nggak dikirim dari backend, cuma tahun/bulan/string yang udah diformat.
  const semuaSorted = filtered.slice().sort(function(a, b){
    return dbKodeOrderSortKey(b.kodeOrder) - dbKodeOrderSortKey(a.kodeOrder);
  });
  renderList("db-kontrol-semua-list", semuaSorted, true);
}

function dbKodeOrderSortKey(kode){
  const m = /^(\d{6})/.exec(kode || "");
  return m ? parseInt(m[1], 10) : -1;
}

// State sub-tab aktif buat Kontrol Data -- disimpan di luar fungsi render karena
// summaryEl.innerHTML digenerate ulang tiap filter ganti, jadi butuh diingat manual.
var dbKontrolActiveSubtab = "pengiriman";

/**
 * Diklik dari card "TOTAL PO" / "PO Tanpa Pengiriman" / "PO Tanpa Invoice" / "Gap Qty".
 * - "semua" -> tampilan full-width list semua PO.
 * - "pengiriman" / "invoice" -> balik ke grid 2 kolom audit; di mobile, kolom yang nggak
 *   dipilih disembunyikan lewat CSS .db-kontrol-col (lihat media query).
 * - "gap" -> tampilan full-width list Gap Qty PO/Kirim/Invoice.
 * Cuma salah satu dari 3 wrap (audit-wrap / semua-wrap / gap-wrap) yang ditampilin sekaligus.
 */
function dbSelectKontrolSubtab(target){
  dbKontrolActiveSubtab = target;
  // Scope ke #db-kontrol-summary aja -- kalau pakai ".db-card-btn" polos tanpa scope,
  // ini ikut nyala-in card "Semua" di section Perlu Perhatian (sama-sama pakai class
  // .db-card-btn dan sama-sama punya target "semua"), padahal beda section & beda state.
  document.querySelectorAll("#db-kontrol-summary .db-card-btn").forEach(function(card){
    card.classList.toggle("active", card.getAttribute("onclick").indexOf("'" + target + "'") !== -1);
  });

  const auditWrap = document.getElementById("db-kontrol-audit-wrap");
  const semuaWrap = document.getElementById("db-kontrol-semua-wrap");
  const gapWrap = document.getElementById("db-kontrol-gap-wrap");
  auditWrap.style.display = "none";
  semuaWrap.style.display = "none";
  gapWrap.style.display = "none";

  if(target === "semua"){
    semuaWrap.style.display = "block";
  } else if(target === "gap"){
    gapWrap.style.display = "block";
  } else {
    auditWrap.style.display = "";
    document.querySelectorAll(".db-kontrol-col").forEach(function(col){
      col.classList.toggle("active", col.getAttribute("data-subtab-col") === target);
    });
  }
}

function dbShowTahapDetail(tahap){
  const list = (window.DB_DETAIL_PRODUKSI || []).filter(function(o){ return o.tahap === tahap; });
  const detailEl = document.getElementById("db-tahap-detail");

  // Kasih highlight ke batang yang lagi aktif dipilih -- pola sama kayak .db-card-btn.active
  // (border-bottom tebal aja, bukan outline keliling) biar konsisten sama card di section lain.
  document.querySelectorAll(".db-chart-bar").forEach(function(bar){ bar.style.borderBottom = ""; });
  const barId = "db-bar-" + tahap.replace(/[^a-zA-Z0-9]/g, "");
  const activeBar = document.getElementById(barId);
  if(activeBar) activeBar.style.borderBottom = "3px solid var(--ink)";

  // ---- Header ringkasan agregat (adopsi prioritas 1 dari mockup redesign) ----
  // Panel kanan sekarang dibuka dengan kartu ringkasan: jumlah order di tahap ini,
  // kontribusinya terhadap total order aktif (%), dan bar visualnya -- BARU setelah
  // itu daftar order detail (yang sudah ada sebelumnya, dipertahankan utuh).
  const distArr = window.DB_DISTRIBUSI_TAHAP || [];
  const thisDist = distArr.filter(function(d){ return d.tahap === tahap; })[0];
  const jumlahTahap = thisDist ? thisDist.jumlah : list.length;
  const totalAktif = window.DB_TOTAL_ORDER_AKTIF || 0;
  const pct = totalAktif > 0 ? Math.round((jumlahTahap / totalAktif) * 100) : 0;
  const w = (window.DB_TAHAP_WARNA_MAP || {})[tahap] || { bg: "#E6ECF5", border: "#A9BEDD", teks: "#1F3A66" };
  const totalQty = list.reduce(function(s, o){ return s + (o.jumlah || 0); }, 0);

  const ringkasanHtml =
    '<div class="db-tahap-ringkas" style="border-left:4px solid ' + w.border + '">' +
      '<div class="db-tahap-ringkas-head">' +
        '<span class="db-tahap-ringkas-dot" style="background:' + w.border + '"></span>' +
        '<span class="db-tahap-ringkas-nama" style="color:' + w.teks + '">' + tahap + '</span>' +
      '</div>' +
      '<div class="db-tahap-ringkas-angka">' + jumlahTahap + '</div>' +
      '<div class="db-tahap-ringkas-sub">order aktif' + (totalQty ? ' &#183; ' + totalQty.toLocaleString("id-ID") + ' pcs' : '') + '</div>' +
      '<div class="db-tahap-ringkas-konten">' +
        '<div class="db-tahap-ringkas-konten-lbl">Kontribusi ke total order aktif</div>' +
        '<div class="db-tahap-ringkas-konten-pct">' + pct + '%</div>' +
        '<div class="db-tahap-ringkas-track"><div class="db-tahap-ringkas-fill" style="width:' + pct + '%;background:' + w.border + '"></div></div>' +
      '</div>' +
    '</div>';

  const ringkasSlot = document.getElementById("db-tahap-ringkas-slot");
  if(ringkasSlot) ringkasSlot.innerHTML = ringkasanHtml;

  if(!list.length){
    detailEl.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:var(--navy)">Order di tahap "' + tahap + '"</div>' +
      '<div class="db-panel-frame" style="margin-top:8px;flex:1;min-height:120px;display:flex"><div class="db-panel-scroll" style="flex:1;min-height:0;height:auto"><p style="color:var(--ink-soft);font-size:13px;margin:0">Tidak ada rincian order di tahap ini.</p></div></div>';
    dbSyncTahapHeight();
    return;
  }

  detailEl.innerHTML =
    '<div style="font-size:13px;font-weight:700;color:var(--navy)">Order di tahap "' + tahap + '" (' + list.length + ')</div>' +
    '<div class="db-panel-frame" style="margin-top:8px;flex:1;min-height:180px;display:flex"><div class="db-panel-scroll" style="flex:1;min-height:0;height:auto">' +
      list.map(function(o){
        return '<div class="db-attention-card">' +
          '<div>' +
            '<span style="font-family:monospace;font-size:11px;color:var(--thread)">' + o.kodeOrder + '</span>' +
            '<span style="font-size:10px;color:var(--ink);margin-left:8px">' + (o.jumlah ? o.jumlah + ' pcs' : '') + '</span>' +
          '</div>' +
          (o.deadline ? '<span style="font-size:10px;color:var(--ink-soft)">Deadline: ' + o.deadline + '</span>' : '') +
        '</div>';
      }).join("") +
    '</div></div>';

  dbSyncTahapHeight();
}

/**
 * Samakan tinggi kolom KANAN (daftar order) ke kolom KIRI (chart+insight+ringkasan)
 * supaya batas atas & bawah kedua kolom sejajar. Kolom kiri = acuan (tinggi natural).
 * Kolom kanan flex-column: dikasih tinggi = tinggi kiri, panel-frame flex-fill,
 * dan .db-panel-scroll di dalamnya overflow-y:auto -> yang scroll cuma daftar order.
 * Kalau layout lagi ketumpuk (mobile, media query max-width:760px -> display:block),
 * tinggi eksplisit dilepas biar mengalir natural.
 */
function dbSyncTahapHeight(){
  var kiri  = document.querySelector(".db-tahap-kiri");
  var kanan = document.getElementById("db-tahap-detail");
  if(!kiri || !kanan) return;
  // Diukur di frame berikutnya supaya layout sudah selesai dihitung browser.
  requestAnimationFrame(function(){
    kanan.style.height = "";              // reset dulu biar ukur natural / deteksi stacked
    if(kiri.offsetTop !== kanan.offsetTop) return;  // ketumpuk (mobile) -> biarin natural
    var h = kiri.offsetHeight;
    if(h > 120) kanan.style.height = h + "px";
  });
}
// Recalc saat ukuran window berubah (dipasang sekali saja, dijaga flag).
if(!window.DB_TAHAP_RESIZE_BOUND){
  window.addEventListener("resize", dbSyncTahapHeight);
  window.DB_TAHAP_RESIZE_BOUND = true;
}

/**
 * Render chart batang "Tren Order Masuk" -- pakai class CSS yang SAMA persis kayak
 * chart Distribusi Tahap Produksi (.db-chart-frame/.db-chart-col/.db-chart-bar/dst),
 * biar 2 chart yang bertetangga ini kelihatan konsisten satu sama lain tanpa perlu
 * CSS baru. Warna biru netral tunggal (bukan gradasi/multi-warna) -- ini murni angka
 * tren, bukan indikator status/urgency kayak chart Distribusi Tahap.
 */
function dbRenderTrenOrder(trenOrder){
  const chartEl = document.getElementById("db-tren-chart");
  if(!trenOrder.length){
    chartEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Belum ada data order.</p>';
    return;
  }
  const maxJumlah = Math.max.apply(null, trenOrder.map(function(t){ return t.jumlahOrder; }).concat([1]));
  chartEl.innerHTML = trenOrder.map(function(t){
    const heightPx = Math.max(3, Math.round((t.jumlahOrder / maxJumlah) * 130));
    return '<div class="db-chart-col" title="' + t.jumlahOrder + ' order &#183; ' + t.totalQty + ' pcs">' +
      '<div class="db-chart-num">' + t.jumlahOrder + '</div>' +
      '<div class="db-chart-bar" style="height:' + heightPx + 'px;background:#E6ECF5;border:1.5px solid #A9BEDD;box-sizing:border-box"></div>' +
      '<div class="db-chart-label">' + t.label + '</div>' +
    '</div>';
  }).join("");
}


// State filter aktif buat Perlu Perhatian -- diingat manual karena card di-render ulang
// tiap kali data dashboard di-fetch (dbFetch dipanggil ulang kalau ada aksi refresh).
var dbPerhatianActiveFilter = "semua";

// State filter aktif buat Aging Piutang -- pola sama kayak dbPerhatianActiveFilter.
var dbAgingActiveFilter = "semua";

// Warna makin "mendesak" seiring makin lama umurnya -- 0-14 netral (abu-abu, senada
// sama badge "belum_lunas_baru" di Perlu Perhatian, krn ini definisi yang sama persis),
// 60+ paling merah. Ini SATU-SATUNYA tempat gradasi warna aging didefinisikan.
const DB_AGING_WARNA = {
  "0-14": { bg: "#EFECE4", border: "#D8D3C7", teks: "#3D4A63" },
  "15-30": { bg: "#FCF3E3", border: "#EBCFA0", teks: "#8A5D1F" },
  "31-60": { bg: "#F6E0D8", border: "#E8B7A4", teks: "#A8442F" },
  "60+": { bg: "#FDECEA", border: "#E8A49C", teks: "#8f2c22" }
};

/**
 * Section BARU Dashboard -- Aging Piutang. Dipanggil dari dbRender(data) tiap data
 * dashboard baru dimuat/di-refresh. window.DB_AGING disimpan biar dbSelectAgingFilter
 * bisa render ulang list-nya tanpa perlu fetch ulang ke server.
 */
function dbRenderAgingPiutang(data){
  window.DB_AGING = data.agingPiutang || { ringkasanBucket: [], daftarPiutang: [], totalOutstanding: 0 };
  dbRenderAgingSummary(window.DB_AGING.ringkasanBucket);
  dbRenderAgingList(window.DB_AGING.daftarPiutang, dbAgingActiveFilter);
  dbSetTabBadge("db-tab-badge-aging", window.DB_AGING.daftarPiutang.length);
}

const OM_STATUS_CLASS = {
  "Pending": "om-status-pending",
  "Menunggu Verifikasi Klien Baru": "om-status-menunggu-verifikasi",
  "Disetujui": "om-status-disetujui",
  "Ditolak": "om-status-ditolak",
  "Revisi Diminta": "om-status-pending"
};

// Label tampilan badge -- dipisah dari g.status (nilai data mentah yg dipakai buat logika).
// "Pending" ditampilkan "Menunggu Proofing" biar sejajar gayanya dgn "Menunggu Verifikasi
// Klien Baru" (dua-duanya status nunggu -> dua-duanya "Menunggu X"). Ganti label doang,
// status aslinya nggak disentuh, jadi filter/aksi yg baca g.status tetap jalan.
const OM_STATUS_LABEL = {
  "Pending": "Menunggu Proofing",
  "Menunggu Verifikasi Klien Baru": "Menunggu Verifikasi Klien Baru",
  "Disetujui": "Disetujui",
  "Ditolak": "Ditolak",
  "Revisi Diminta": "Revisi Diminta"
};

const OM_SIZE_KOLOM = ["XS","S","M","L","XL","2XL","3XL","4XL","5XL","All Size"];

/**
 * Section BARU Dashboard -- Order Masuk (Form Order Klien). Beda dari section lain,
 * ini fetch TERPISAH (bukan bagian dari payload dbFetch() utama) -- lewat action
 * "getOrderRequests" di doPost, karena proofing/approve butuh round-trip sendiri
 * (bukan cuma tampilkan data, tapi juga aksi tulis). Dipanggil dari dbRender(data)
 * SETELAH dbRenderAgingPiutang(data) dipanggil.
 */
/* ============ TAB JADWAL PRODUKSI ============
   Menampilkan hasil penjadwalan-produksi.gs: papan beban divisi + estimasi
   selesai per order dengan timeline tiap tahap.
   Data diambil SEKALI per pembukaan tab (bukan tiap render dashboard), karena
   perhitungannya berat -- lihat dbSwitchTab. */
var JP_DATA = null;
var JP_FILTER = "semua";

function jpMuatData(paksa){
  if(JP_DATA && !paksa){ jpRender(); return; }
  document.getElementById("jp-beban").innerHTML = '<p class="jp-loading">Menghitung jadwal produksi...</p>';
  document.getElementById("jp-daftar").innerHTML = "";

  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, action: "getPenjadwalanProduksi" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.error){
      document.getElementById("jp-beban").innerHTML =
        '<p class="jp-loading" style="color:#8f2c22">' + data.error + '</p>';
      return;
    }
    JP_DATA = data;
    jpRender();
  })
  .catch(function(){
    document.getElementById("jp-beban").innerHTML =
      '<p class="jp-loading" style="color:#8f2c22">Gagal memuat jadwal produksi.</p>';
  });
}

function jpRender(){
  if(!JP_DATA) return;
  jpRenderPeringatan();
  jpRenderBeban();
  jpRenderDaftar();
  jpRenderAsumsi();
}

/* Peringatan kesiapan data. Ditampilkan JELAS di atas -- selama kapasitas
   belum diisi, semua angka di halaman ini masih turunan data historis yang
   sudah terbukti meleset. Lebih baik terang-terangan daripada dipercaya
   mentah-mentah lalu dijanjikan ke klien. */
function jpRenderPeringatan(){
  var el = document.getElementById("jp-warning");
  var kap = JP_DATA.kapasitas || {};
  var jumlahManual = Object.keys(kap).length;
  if(jumlahManual > 0){ el.classList.add("hidden"); return; }
  el.innerHTML = '<b>Kapasitas divisi belum diisi.</b> Angka di halaman ini masih diturunkan ' +
    'dari data historis dan bisa meleset jauh. Isi sheet <b>SD Kapasitas Divisi</b> ' +
    '(jalankan <code>buatSheetKapasitasDivisi()</code> di Apps Script), lalu muat ulang.';
  el.classList.remove("hidden");
}

function jpRenderBeban(){
  var beban = JP_DATA.beban || {};
  var html = "";
  Object.keys(beban).forEach(function(divisi){
    var minggu = beban[divisi];
    html += '<div class="jp-divisi">' +
      '<div class="jp-divisi-nama">' + divisi + '</div>' +
      '<div class="jp-minggu-row">' +
        minggu.map(function(m){
          var kelas = m.status === "kelebihan" ? "jp-lebih" : (m.status === "padat" ? "jp-padat" : "jp-lega");
          var tinggi = Math.min(100, m.utilisasi);
          return '<div class="jp-minggu" title="Minggu ' + m.mingguKe + ' (' + m.mulai + ')&#10;' +
                 m.hariKerjaTerpakai + ' dari ' + m.hariKerjaTersedia + ' hari kerja&#10;' +
                 m.jumlahOrder + ' order">' +
            '<div class="jp-bar-wrap"><div class="jp-bar ' + kelas + '" style="height:' + tinggi + '%"></div></div>' +
            '<div class="jp-minggu-pct">' + m.utilisasi + '%</div>' +
            '<div class="jp-minggu-lbl">M' + m.mingguKe + '</div>' +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>';
  });
  document.getElementById("jp-beban").innerHTML = html ||
    '<p class="jp-loading">Belum ada data beban.</p>';
}

function jpSetFilter(f){
  JP_FILTER = f;
  document.querySelectorAll("#jp-filter .lp-toggle").forEach(function(b){
    b.classList.toggle("active", b.dataset.filter === f);
  });
  jpRenderDaftar();
}

function jpRenderDaftar(){
  var list = (JP_DATA.estimasi || []).filter(function(r){
    if(JP_FILTER === "semua") return true;
    return r.status === JP_FILTER;
  });
  if(!list.length){
    document.getElementById("jp-daftar").innerHTML = '<p class="jp-loading">Tidak ada order pada filter ini.</p>';
    return;
  }
  document.getElementById("jp-daftar").innerHTML = list.map(function(r, i){
    var kelasStatus = "jp-st-" + r.status;
    var labelAkurasi = r.akurasi === "presisi" ? "" :
      '<span class="jp-akurasi" title="Sebagian divisi memakai perkiraan historis, bukan cycle time">&#8776; perkiraan</span>';
    var timeline = (r.timeline || []).map(function(t){
      if(t.status === "selesai") return '<div class="jp-tl-item jp-tl-done">' + t.divisi + ' &#183; selesai</div>';
      return '<div class="jp-tl-item"><b>' + t.divisi + '</b><span>' + t.tanggalSelesai + '</span>' +
        '<small>' + t.sisaPcs + ' pcs &#183; ' + t.hariKerja + ' hari</small></div>';
    }).join("");
    return '<div class="jp-order ' + kelasStatus + '">' +
      '<div class="jp-order-head" onclick="jpToggleDetail(' + i + ')">' +
        '<div>' +
          '<span class="jp-order-po">' + r.idPurchaseOrder + '</span>' +
          (r.prioritas ? '<span class="jp-prioritas">prioritas ' + r.prioritas + '</span>' : '') +
          '<div class="jp-order-meta">' + r.qty + ' pcs &#183; ' + (r.idKlien || "-") +
            (r.tahapSaatIni ? ' &#183; tahap: ' + r.tahapSaatIni : '') + '</div>' +
        '</div>' +
        '<div class="jp-order-tgl">' +
          '<div class="jp-est">' + r.tanggalEstimasi + ' ' + labelAkurasi + '</div>' +
          '<div class="jp-deadline">deadline: ' + (r.deadline || "-") + '</div>' +
          '<span class="jp-badge ' + kelasStatus + '">' + r.status + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="jp-timeline hidden" id="jp-tl-' + i + '">' + timeline + '</div>' +
    '</div>';
  }).join("");
}

function jpToggleDetail(i){
  var el = document.getElementById("jp-tl-" + i);
  if(el) el.classList.toggle("hidden");
}

function jpRenderAsumsi(){
  var kap = JP_DATA.kapasitas || {};
  var baris = Object.keys(kap).map(function(dv){
    var k = kap[dv];
    var isi = k.kapasitasManualPcs > 0
      ? k.kapasitasManualPcs + " pcs/hari (manual)"
      : k.jumlahOperator + " orang";
    return dv + ": " + isi + ", maks " + k.maksParalel + " order paralel";
  });
  document.getElementById("jp-asumsi").innerHTML =
    '<b>Dasar perhitungan</b><br/>Hari kerja Senin&#8211;Sabtu &#183; urutan antrian: prioritas manual, lalu deadline terdekat.' +
    (baris.length ? '<br/>' + baris.join('<br/>') : '');
}

function dbRenderOrderMasuk(){
  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, action: "getOrderRequests" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(!data.success){
      document.getElementById("db-ordermasuk-list").innerHTML =
        '<p style="color:var(--ink-soft);font-size:13px;padding:16px">' + (data.error || "Gagal memuat order masuk.") + '</p>';
      return;
    }
    window.DB_ORDER_MASUK = data.daftar || [];
    omRenderSummary(window.DB_ORDER_MASUK);
    omRenderList(window.DB_ORDER_MASUK);
    const perluAksi = window.DB_ORDER_MASUK.filter(function(g){
      return g.status === "Pending" || g.status === "Menunggu Verifikasi Klien Baru";
    }).length;
    dbSetTabBadge("db-tab-badge-ordermasuk", perluAksi);
  })
  .catch(function(){
    document.getElementById("db-ordermasuk-list").innerHTML =
      '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Gagal menghubungi server.</p>';
  });
}

function omRenderSummary(daftar){
  const jumlahPending = daftar.filter(function(g){ return g.status === "Pending"; }).length;
  const jumlahVerifikasi = daftar.filter(function(g){ return g.status === "Menunggu Verifikasi Klien Baru"; }).length;
  const jumlahDisetujui = daftar.filter(function(g){ return g.status === "Disetujui"; }).length;
  document.getElementById("db-ordermasuk-summary").innerHTML =
    '<div class="db-stat-card" style="background:#FCF3E3;border:1px solid #EBCFA0"><div class="db-stat-num" style="color:#8A5D1F">' + jumlahPending + '</div><div class="db-stat-label" style="color:#8A5D1F">MENUNGGU PROOFING</div></div>' +
    '<div class="db-stat-card" style="background:#E6ECF5;border:1px solid #A9BEDD"><div class="db-stat-num" style="color:#1F3A66">' + jumlahVerifikasi + '</div><div class="db-stat-label" style="color:#1F3A66">KLIEN BARU PERLU VERIFIKASI</div></div>' +
    '<div class="db-stat-card" style="background:#E3EFE6;border:1px solid #B7D6BE"><div class="db-stat-num" style="color:#2C6B3F">' + jumlahDisetujui + '</div><div class="db-stat-label" style="color:#2C6B3F">SUDAH DISETUJUI</div></div>';
}

function omRenderList(daftar){
  const el = document.getElementById("db-ordermasuk-list");
  if(!daftar.length){
    el.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Belum ada order masuk.</p>';
    return;
  }
  el.innerHTML = daftar.map(function(g, idx){
    const statusClass = OM_STATUS_CLASS[g.status] || "om-status-pending";
    const totalQty = g.items.reduce(function(sum, it){
      return sum + OM_SIZE_KOLOM.reduce(function(s, size){ return s + (it.sizeQty[size] || 0); }, 0);
    }, 0);
    const jumlahItem = rjdGroupOrderItems_(g.items).length;
    const labelIsi = jumlahItem + ' item &#183; ' + g.items.length + ' warna &#183; ' + totalQty + ' pcs';
    // Klik kartu -> MODAL PROOFING (dulu: buka-tutup detail inline). Modal
    // memakai komponen form yang sama dengan Form Order & Edit Order, jadi
    // tampilan proofing seragam dengan sisa sistem.
    return '<div class="om-group-card" id="om-group-' + idx + '">' +
      '<div class="om-group-head" onclick="omBukaModalProofing(' + idx + ')" title="Buka proofing order ini">' +
        '<div>' +
          '<span class="om-group-nama">' + (g.namaKlien || g.namaPerusahaanBaru || "(tanpa nama)") + '</span>' +
          '<div class="om-group-meta">' + labelIsi + ' &#183; Target kirim: ' + (g.targetTanggalKirim || "-") + '</div>' +
          '<div class="om-group-meta">Diajukan: ' + (g.diajukanOleh || "-") + '</div>' +
        '</div>' +
        '<span class="om-status-badge ' + statusClass + '">' + (OM_STATUS_LABEL[g.status] || g.status) + '</span>' +
      '</div>' +
      '<div style="padding:0 16px 12px;display:flex;gap:16px;flex-wrap:wrap" onclick="event.stopPropagation()">' +
        '<a class="lp-cetak-link" href="/p/cetak.html?jenis=konfirmasiorder&id=' + encodeURIComponent(g.idOrderRequest) + '" target="_blank">&#128424; Cetak Konfirmasi Order</a>' +
        // SPK STAFF ONLY -- sengaja cuma di Dashboard, TIDAK di kartu Orderan
        // Portal Klien. Backend juga menolak kalau klien memaksa buka URL-nya.
        '<a class="lp-cetak-link" href="/p/cetak.html?jenis=spk&id=' + encodeURIComponent(g.idOrderRequest) + '" target="_blank">&#128736; Cetak SPK</a>' +
      '</div>' +
    '</div>';
  }).join("");
}

/**
 * Susun HTML buat 1 slot lampiran yang isinya BISA lebih dari 1 URL (digabung
 * 1 sel sheet, dipisah "; " -- lihat simpanBanyakFileKeDrive_ di backend).
 * Sekarang dirender jadi THUMBNAIL (bukan link teks lagi) biar admin bisa lihat
 * desainnya langsung tanpa buka tab satu-satu. Logikanya didelegasikan ke
 * rjdBuildThumbHtml_() di blok global -- 1 salinan, dipakai bareng sama daftar
 * Orderan di tracking/Detail Klien. Tiap file tetap dapet nomor urut sendiri
 * ("Foto Desain 1", "Foto Desain 2", dst) & tetap bisa diklik buka file aslinya.
 */
function omBuildLampiranLinksHtml_(urlGabungan, ikon, labelDasar){
  const html = rjdBuildThumbHtml_(urlGabungan, ikon, labelDasar);
  return html ? '<div class="rjd-thumb-row">' + html + '</div>' : "";
}


/* ============ MODAL PROOFING (Dashboard > Order Masuk) ============
   Memakai KOMPONEN FORM ORDER yang sama dengan /p/order.html, modal "Ajukan
   Order Baru", dan modal "Edit Order" -- jadi susunan & urutan fieldnya identik
   di seluruh sistem. Bedanya cuma dua, dan dua-duanya memang wewenang admin:
     1. Ada kolom HARGA per Warna (opsi {harga:true})
     2. Ada tombol aksi proofing: Setujui / Tolak / Hapus
   Simpan memakai rute rewriteOrderRequest -- SAMA dengan modal Edit. Staff lolos
   gerbang izin, dan cuma staff yang harganya dihormati backend. Satu jalur
   simpan buat semua form. */
function omBukaModalProofing(idx){
  // Sumbernya window.DB_ORDER_MASUK -- array yang SAMA yang dipakai omRenderList,
  // jadi idx dari kartu pasti cocok (daftarnya nggak difilter sebelum di-render).
  var g = (window.DB_ORDER_MASUK || [])[idx];
  if(!g){ alert("Data order tidak ditemukan, coba Refresh."); return; }

  var klienBaruBelumVerif = (g.tipeKlien === "Baru" && g.status === "Menunggu Verifikasi Klien Baru");

  // Blok verifikasi klien baru -- gerbang sebelum order boleh diproofing.
  var verifHtml = klienBaruBelumVerif
    ? '<div class="om-verif-box">' +
        '<div class="om-verif-judul">Klien Baru &#183; perlu diverifikasi dulu</div>' +
        '<div class="om-verify-fields">' +
          '<input id="om-verify-nama-' + idx + '" placeholder="Nama resmi" value="' + (g.namaPerusahaanBaru || "") + '"/>' +
          '<input id="om-verify-kontak-' + idx + '" placeholder="Kontak Person" value="' + (g.picBaru || "") + '"/>' +
          '<input id="om-verify-tlp-' + idx + '" placeholder="No Telepon/WA" value="' + (g.noWaBaru || "") + '"/>' +
          '<input id="om-verify-email-' + idx + '" placeholder="Email" value="' + (g.emailBaru || "") + '"/>' +
        '</div>' +
        '<p class="om-verif-catatan">Order baru bisa disetujui jadi PO setelah klien ini punya Client ID.</p>' +
      '</div>'
    : '';

  var lampiran = omBuildLampiranLinksHtml_(g.urlFileLainnya, "\uD83D\uDCCE", "File Lainnya");
  var lampiranHtml = lampiran
    ? '<div class="of-foto-lama" style="margin-top:14px"><div class="of-foto-lama-lbl">Lampiran pengajuan</div>' +
      '<div class="rjd-thumb-row">' + lampiran + '</div></div>'
    : '';
  // Admin juga perlu bisa MENAMBAH/MENGGANTI lampiran level pengajuan saat proofing
  // (misal nyusulin size pack dari klien). Sebelumnya lampiran cuma bisa dilihat,
  // nggak bisa diunggah dari sini.
  var lampiranUploadHtml =
    '<label style="display:block;margin-top:14px"><span id="om-proofing-file-lbl">' +
      (lampiran
        ? 'Ganti Lampiran Pengajuan (opsional -- kalau diisi, lampiran di atas akan DIGANTI)'
        : 'Lampiran Pengajuan (opsional, misal size pack, foto referensi umum)') +
    '</span><input type="file" id="om-proofing-file" multiple="multiple"/></label>';

  // Tombol aksi -- beda per status, sama persis aturannya dengan versi lama.
  var aksiHtml;
  if(klienBaruBelumVerif){
    aksiHtml =
      '<button class="om-btn om-btn-success" onclick="omVerifikasiKlien(\'' + g.idOrderRequest + '\', ' + idx + ', true)" type="button">Terima &amp; Buat Client ID</button>' +
      '<button class="om-btn om-btn-danger" onclick="omVerifikasiKlien(\'' + g.idOrderRequest + '\', ' + idx + ', false)" type="button">Tolak Pengajuan</button>' +
      '<button class="om-btn" onclick="omHapus(\'' + g.idOrderRequest + '\')" style="color:#8f2c22" type="button">Hapus</button>';
  } else if(g.status === "Pending"){
    aksiHtml =
      '<button class="lp-edit-save" id="om-simpan-btn" onclick="omSimpanProofing(\'' + g.idOrderRequest + '\')" type="button">Simpan Perubahan</button>' +
      '<button class="om-btn om-btn-success" onclick="omApprove(\'' + g.idOrderRequest + '\')" type="button">Setujui Order</button>' +
      '<button class="om-btn om-btn-danger" onclick="omReject(\'' + g.idOrderRequest + '\')" type="button">Tolak</button>' +
      '<button class="om-btn" onclick="omHapus(\'' + g.idOrderRequest + '\')" style="color:#8f2c22" type="button">Hapus</button>';
  } else if(g.status === "Disetujui"){
    aksiHtml = '<span class="om-status-final">&#10003; Sudah jadi PO: <b>' + (g.idPurchaseOrderHasil || "-") + '</b></span>';
  } else {
    aksiHtml = '<button class="om-btn" onclick="omHapus(\'' + g.idOrderRequest + '\')" style="color:#8f2c22" type="button">Hapus</button>';
  }

  var overlay = document.createElement("div");
  overlay.className = "lp-edit-overlay";
  overlay.id = "om-proofing-overlay";
  overlay.innerHTML =
    '<div class="lp-edit-modal">' +
      '<div class="lp-edit-modal-head">' +
        '<div><div class="lp-edit-modal-title">Proofing Order</div>' +
        '<div class="lp-edit-modal-sub">' + (g.namaKlien || g.namaPerusahaanBaru || "(tanpa nama)") + ' &#183; ' + g.idOrderRequest + '</div></div>' +
        '<button class="lp-edit-close" onclick="omTutupModalProofing()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="lp-edit-modal-body">' +
        verifHtml +
        '<div id="om-proofing-items"></div>' +
        (klienBaruBelumVerif ? '' : '<button class="of-add-item-btn" onclick="ofTambahItem(\'om-proofing-items\', null, {harga:true})" type="button">+ ITEM</button>') +
        '<div class="of-form-section" style="margin-top:4px">' +
          '<h4>Detail Pengiriman</h4>' +
          '<label style="display:block">Target Tanggal Kirim <span class="of-hint-akhir">(deadline akhir)</span><input type="date" id="om-proofing-target" value="' + rjdTanggalKeIso_(g) + '"/></label>' +
          '<div class="of-jadwal-wrap">' +'<div class="of-jadwal-lbl">Jadwal Kirim Bertahap (opsional -- isi kalau pengiriman dipecah)</div>' +'<div class="of-jadwal" id="om-proofing-jadwal"></div>' +'<button class="of-jadwal-add" onclick="ofTambahBarisJadwal_(\'om-proofing-jadwal\')" type="button">+ Tambah Tahap</button>' +'</div>' +
          '<div class="of-jadwal-wrap">' +'<div class="of-jadwal-lbl">Estimasi Kain Dari Klien (opsional -- perkiraan kain yang akan dikirim klien)</div>' +'<div id="om-proofing-kaink"></div>' +'<button class="of-jadwal-add" onclick="ofTambahBarisKainKlien_(\'om-proofing-kaink\')" type="button">+ Tambah Kain</button>' +'</div>' +
          // Catatan klien ditaruh DI SINI supaya letaknya sama dengan modal Edit
          // Order (di bagian Detail Pengiriman, bukan menumpuk di atas sebelum
          // daftar ITEM). Di proofing sifatnya BACA SAJA -- ini catatan klien,
          // admin punya kolom sendiri. pre-wrap dipakai supaya ENTER & baris
          // kosong yang diketik klien tampil apa adanya.
          // Catatan klien BISA DIEDIT admin. Dulu tampil baca-saja, padahal saat
          // proofing admin sering perlu merapikan/menambah keterangan yang
          // disepakati lewat telepon -- kalau tidak, koreksinya cuma ada di
          // kepala admin dan tidak ikut tercetak di dokumen.
          '<label style="display:block;margin-top:14px">Catatan Klien' +
            '<textarea id="om-proofing-catatan-klien" class="rjd-autogrow" rows="3">' +
            rjdEscapeHtml_(g.catatanKlien || "") + '</textarea></label>' +
        '</div>' +
        lampiranHtml +
        (klienBaruBelumVerif ? '' : lampiranUploadHtml) +
      '</div>' +
      '<div class="lp-edit-modal-foot om-proofing-foot">' +
        '<button class="lp-edit-cancel" onclick="omTutupModalProofing()" type="button">Tutup</button>' +
        aksiHtml +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  rjdIsiFormDariOrder_("om-proofing-items", g.items, { harga: true });

  // Saran kain & warna untuk baris Estimasi Kain Dari Klien. Diambil dari
  // pengajuan ini sendiri -- supaya nama yang sudah diketik di bagian item
  // tidak diketik ulang dengan ejaan berbeda di bagian kain.
  if (typeof ofSetSaranKain_ === "function") {
    const kain = [];
    (g.items || []).forEach(function (it) {
      (it.komposisiKain || []).forEach(function (k) {
        if (k.nama && kain.indexOf(k.nama) === -1) kain.push(k.nama);
      });
    });
    ofSetSaranKain_(kain);
  }
  if (typeof ofSetSaranWarna_ === "function") {
    const warna = [];
    (g.items || []).forEach(function (it) {
      (it.warnaList || []).forEach(function (w) {
        if (w.warna && warna.indexOf(w.warna) === -1) warna.push(w.warna);
      });
    });
    ofSetSaranWarna_(warna);
  }
  ofMuatMasterArtikel_(g.idKlien || null);
  ofRenderJadwalKirim_("om-proofing-jadwal", g.jadwalKirim);
  ofRenderKainKlien_("om-proofing-kaink", g.kainDariKlien);
  rjdBindAutoGrowAll(overlay);
}

function omTutupModalProofing(){
  var ov = document.getElementById("om-proofing-overlay");
  if(ov) ov.remove();
  document.body.style.overflow = "";
}

/** Simpan perubahan proofing -- jalur SAMA dengan modal Edit (rewriteOrderRequest). */
async function omSimpanProofing(idOrderRequest){
  var btn = document.getElementById("om-simpan-btn");
  if(btn){ btn.disabled = true; btn.textContent = "Menyimpan..."; }

  var items;
  try{
    const mslh = ofCekItemBelumLengkap_("om-proofing-items");
    if(mslh.length){
      alert("Ada item yang belum lengkap dan TIDAK akan tersimpan:\n\n- " + mslh.join("\n- "));
      if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
      return;
    }
    items = await ofKumpulkanItemsAsync("om-proofing-items");
  }catch(e){
    alert(e.message || "Gagal membaca file.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }
  if(!items.length){
    alert("Isi minimal 1 item (Artikel & Warna wajib) dengan minimal 1 ukuran.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }

  // Lampiran level pengajuan. Kalau admin nggak pilih file baru, array-nya kosong
  // dan backend MEMPERTAHANKAN lampiran lama (lihat rewriteOrderRequest_).
  var fileLainnyaList = [];
  try{
    var inpFile = document.getElementById("om-proofing-file");
    fileLainnyaList = await ofBacaBanyakFileSebagaiBase64_(inpFile ? inpFile.files : null);
  }catch(eFile){
    alert(eFile.message || "Gagal membaca file lampiran.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }

  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: DB_ID_TOKEN,
      action: "rewriteOrderRequest",
      idOrderRequest: idOrderRequest,
      payload: {
        targetTanggalKirim: (document.getElementById("om-proofing-target").value || "").trim(),
        jadwalKirim: ofKumpulkanJadwalKirim_("om-proofing-jadwal"),
        kainDariKlien: ofKumpulkanKainKlien_("om-proofing-kaink"),
        catatanKlien: (function(){
          const el = document.getElementById("om-proofing-catatan-klien");
          return el ? el.value.trim() : undefined; // undefined = jangan sentuh nilai lama
        })(),
        items: items,
        fileLainnyaList: fileLainnyaList
      }
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){
      omTutupModalProofing();
      dbRenderOrderMasuk();
    } else {
      alert(data.error || "Gagal menyimpan perubahan.");
      if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    }
  })
  .catch(function(){
    alert("Gagal menghubungi server. Coba lagi.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
  });
}

function omVerifikasiKlien(idOrderRequest, idx, disetujui){
  const body = { idToken: DB_ID_TOKEN, action: "verifyKlienBaruRequest", idOrderRequest: idOrderRequest, disetujui: disetujui };
  if(disetujui){
    body.dataKlienFinal = {
      nama: document.getElementById("om-verify-nama-" + idx).value.trim(),
      kontakPerson: document.getElementById("om-verify-kontak-" + idx).value.trim(),
      nomorTelepon: document.getElementById("om-verify-tlp-" + idx).value.trim(),
      email1: document.getElementById("om-verify-email-" + idx).value.trim()
    };
  } else {
    const alasan = prompt("Alasan penolakan (opsional):");
    body.alasan = alasan || "";
  }
  fetch(DB_API_URL, { method: "POST", body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.success){ omTutupModalProofing(); dbRenderOrderMasuk(); } else { alert(data.error || "Gagal memproses verifikasi."); }
    });
}

function omApprove(idOrderRequest){
  if(!confirm("Setujui order ini? Akan otomatis dibuat Purchase Order baru.")) return;
  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, action: "approveOrderRequest", idOrderRequest: idOrderRequest })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){
      alert("Order disetujui. PO baru: " + data.idPurchaseOrder);
      omTutupModalProofing(); // aksi selesai -> modal ditutup biar nggak nampilin data basi
      dbRenderOrderMasuk();
    } else {
      alert(data.error || "Gagal approve order.");
    }
  });
}

function omReject(idOrderRequest){
  const alasan = prompt("Alasan penolakan (opsional):");
  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, action: "rejectOrderRequest", idOrderRequest: idOrderRequest, alasan: alasan || "" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){ omTutupModalProofing(); dbRenderOrderMasuk(); } else { alert(data.error || "Gagal menolak order."); }
  });
}

function omHapus(idOrderRequest){
  if(!confirm("Hapus order request '" + idOrderRequest + "' secara permanen? Tindakan ini tidak bisa dibatalkan.")) return;
  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, action: "hapusOrderRequest", idOrderRequest: idOrderRequest })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){ omTutupModalProofing(); dbRenderOrderMasuk(); } else { alert(data.error || "Gagal menghapus order."); }
  });
}

/**
 * Section BARU Dashboard -- Omset (Fase 1: Order & Invoice). Data mentah (SEMUA
 * bulan yang ada datanya dari server, bukan cuma 12 bulan terakhir -- lihat
 * getDashboardOmsetOrderTren_/getDashboardOmsetInvoiceTren_ di backend) disimpan
 * di window.DB_OMSET_ORDER / window.DB_OMSET_INVOICE. Filter Tahun/Bulan
 * beroperasi di atas data itu tanpa fetch ulang -- pola sama kayak
 * dbRenderKontrolData (dan lpApplyFilterPeriode di Portal Klien).
 *
 * Kartu ringkas ngikutin filter Bulan+Tahun yang lagi dipilih (kalau
 * Bulan="Semua Bulan", kartu nunjukin total 1 tahun penuh). Grafik tren di
 * bawahnya SELALU nunjukin 12 bulan (Jan-Des) dari Tahun yang dipilih --
 * nggak kepengaruh filter Bulan, karena fungsinya emang buat liat pola
 * sepanjang tahun, bukan angka 1 bulan doang.
 */
function dbSetupOmsetFilter(){
  const tahunSet = {};
  (window.DB_OMSET_ORDER || []).forEach(function(o){ if(o.tahun) tahunSet[o.tahun] = true; });
  (window.DB_OMSET_INVOICE || []).forEach(function(o){ if(o.tahun) tahunSet[o.tahun] = true; });
  (window.DB_OMSET_PRODUKSI || []).forEach(function(o){ if(o.tahun) tahunSet[o.tahun] = true; });
  const tahunList = Object.keys(tahunSet).map(Number).sort(function(a,b){ return b - a; });

  const tahunEl = document.getElementById("db-omset-tahun");
  const currentTahun = tahunEl.value; // biar nggak reset kalau dipanggil ulang (mis. abis Refresh)
  tahunEl.innerHTML = tahunList.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join("");
  const tahunSekarang = new Date().getFullYear();
  if(currentTahun && tahunList.indexOf(Number(currentTahun)) !== -1){
    tahunEl.value = currentTahun;
  } else {
    tahunEl.value = tahunList.indexOf(tahunSekarang) !== -1 ? String(tahunSekarang) : String(tahunList[0] || "");
  }
  tahunEl.onchange = dbRenderOmset;

  const bulanEl = document.getElementById("db-omset-bulan");
  const currentBulan = bulanEl.value;
  bulanEl.innerHTML = '<option value="semua">Semua Bulan</option>' +
    DB_BULAN_NAMA.map(function(nama, idx){ return '<option value="' + (idx+1) + '">' + nama + '</option>'; }).join("");
  bulanEl.value = currentBulan || "semua";
  bulanEl.onchange = dbRenderOmset;
}

// Warna & urutan Divisi buat Omset Produksi -- di scope GLOBAL (bukan di dalam
// dbRenderOmset) biar dipakai bareng sama kartu ringkas DAN chart gabungan/legend,
// warnanya selalu konsisten di semua tempat.
const DIVISI_OMSET_WARNA = {
  cutting: { bg: "#F3E9F0", border: "#DBAECB", teks: "#7A2F5C" },
  sewing: { bg: "#F6E9EE", border: "#E3AFC3", teks: "#8A2F52" },
  finishing: { bg: "#EBEDE8", border: "#C4CABD", teks: "#4A5240" }
};
const DIVISI_OMSET_LIST = [
  { key: "cutting", label: "Cutting" },
  { key: "sewing", label: "Sewing" },
  { key: "finishing", label: "Finishing" }
];

// Sama pola-nya kayak DIVISI_OMSET_* di atas, buat chart gabungan Order vs Invoice.
const ORDER_INVOICE_WARNA = {
  order: { bg: "#E6ECF5", border: "#A9BEDD", teks: "var(--ink)" },
  invoice: { bg: "#F6E0D8", border: "#E8A49C", teks: "var(--thread)" }
};
const ORDER_INVOICE_LIST = [
  { key: "order", label: "Order Masuk" },
  { key: "invoice", label: "Invoice" }
];

/** Render legend warna kecil (kotak warna + label) di atas chart gabungan -- dipakai bareng buat Order/Invoice & Produksi, biar nggak duplikat kode. */
function dbRenderChartLegend(elId, list, warnaMap){
  document.getElementById(elId).innerHTML = list.map(function(d){
    const w = warnaMap[d.key];
    return '<span style="display:flex;align-items:center;gap:5px;color:var(--ink-soft)">' +
      '<span style="width:10px;height:10px;border-radius:2px;background:' + w.bg + ';border:1.5px solid ' + w.border + ';display:inline-block"></span>' +
      d.label + '</span>';
  }).join("");
}

function dbRenderOmset(){
  const filterTahun = document.getElementById("db-omset-tahun").value;
  const filterBulan = document.getElementById("db-omset-bulan").value;
  const gridEl = document.getElementById("db-omset-summary");
  const produksiGridEl = document.getElementById("db-omset-produksi-summary");
  const produksiWarnEl = document.getElementById("db-omset-produksi-warning");
  if(!filterTahun){
    gridEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Belum ada data omset.</p>';
    produksiGridEl.innerHTML = "";
    produksiWarnEl.style.display = "none";
    document.getElementById("db-omset-produksi-legend").innerHTML = "";
    document.getElementById("db-omset-order-invoice-legend").innerHTML = "";
    ["db-omset-order-invoice-chart","db-omset-produksi-chart"].forEach(function(id){
      document.getElementById(id).innerHTML = "";
    });
    return;
  }

  const orderData = window.DB_OMSET_ORDER || [];
  const invoiceData = window.DB_OMSET_INVOICE || [];
  const produksiData = window.DB_OMSET_PRODUKSI || [];

  // ---------- Kartu ringkas: ngikutin filter Bulan+Tahun ----------
  function cocok(item){
    if(String(item.tahun) !== filterTahun) return false;
    if(filterBulan !== "semua" && String(item.bulan) !== filterBulan) return false;
    return true;
  }
  const orderCocok = orderData.filter(cocok);
  const invoiceCocok = invoiceData.filter(cocok);
  const omsetOrderTotal = orderCocok.reduce(function(sum, o){ return sum + o.totalOmset; }, 0);
  const jumlahOrderTotal = orderCocok.reduce(function(sum, o){ return sum + o.jumlahOrder; }, 0);
  const omsetInvoiceTotal = invoiceCocok.reduce(function(sum, o){ return sum + o.totalOmset; }, 0);
  const jumlahInvoiceTotal = invoiceCocok.reduce(function(sum, o){ return sum + o.jumlahInvoice; }, 0);

  gridEl.innerHTML =
    '<div class="db-stat-card" style="background:var(--white);border:1px solid var(--line)">' +
      '<div class="db-stat-num" style="color:var(--ink)">' + dbFormatRupiahRingkas(omsetOrderTotal) + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">OMSET ORDER MASUK &#183; ' + jumlahOrderTotal + ' PO</div>' +
    '</div>' +
    '<div class="db-stat-card" style="background:var(--white);border:1px solid var(--line)">' +
      '<div class="db-stat-num" style="color:var(--thread)">' + dbFormatRupiahRingkas(omsetInvoiceTotal) + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">OMSET INVOICE &#183; ' + jumlahInvoiceTotal + ' INVOICE</div>' +
    '</div>';

  // ---------- Grafik tren gabungan Order vs Invoice: SELALU 12 bulan (Jan-Des) dari Tahun terpilih ----------
  dbRenderChartLegend("db-omset-order-invoice-legend", ORDER_INVOICE_LIST, ORDER_INVOICE_WARNA);
  dbRenderGroupedBarChart("db-omset-order-invoice-chart", ORDER_INVOICE_LIST, ORDER_INVOICE_WARNA, {
    order: orderData, invoice: invoiceData
  }, filterTahun);

  // ---------- Fase 2: Omset Produksi per Divisi ----------
  const produksiCocok = produksiData.filter(cocok);
  // Hitung dulu berapa baris yang belum kehitung -- kalau ada, angka per divisi ditandai
  // "\u2248" (kira-kira) + kartunya diredupkan, biar jelas ini understate & nggak dipakai
  // ngambil keputusan sebelum resep produk / Harga Satuan PO lengkap.
  const totalTidakLengkap = produksiCocok.reduce(function(sum, r){ return sum + (r.jumlahBarisTidakLengkap || 0); }, 0);
  const produksiUnderstate = totalTidakLengkap > 0;
  produksiGridEl.classList.toggle("db-omset-understate", produksiUnderstate);
  produksiGridEl.innerHTML = DIVISI_OMSET_LIST.map(function(d){
    const rows = produksiCocok.filter(function(p){ return String(p.divisi).toLowerCase() === d.key; });
    const total = rows.reduce(function(sum, r){ return sum + r.totalOmset; }, 0);
    const w = DIVISI_OMSET_WARNA[d.key];
    const angka = (produksiUnderstate ? "\u2248 " : "") + dbFormatRupiahRingkas(total);
    return '<div class="db-stat-card" style="background:' + w.bg + ';border:1px solid ' + w.border + '">' +
      '<div class="db-stat-num" style="color:' + w.teks + '">' + angka + '</div>' +
      '<div class="db-stat-label" style="color:' + w.teks + '">OMSET ' + d.label.toUpperCase() + '</div>' +
    '</div>';
  }).join("");

  if(produksiUnderstate){
    produksiWarnEl.style.display = "block";
    produksiWarnEl.innerHTML = "&#9888; " + totalTidakLengkap + " baris data produksi periode ini belum kehitung ke omset -- resep produk atau Harga Satuan PO belum lengkap. Angka di atas ditandai \u2248 (understate) &#183; jangan dipakai buat keputusan sampai datanya lengkap.";
  } else {
    produksiWarnEl.style.display = "none";
  }

  dbRenderChartLegend("db-omset-produksi-legend", DIVISI_OMSET_LIST, DIVISI_OMSET_WARNA);
  // produksiData punya field "divisi" langsung (bukan dikelompokkan per-key kayak
  // orderData/invoiceData terpisah) -- jadi dipecah per key dulu biar bentuknya
  // sama kayak yang dibutuhin dbRenderGroupedBarChart ({order:[...], invoice:[...]}).
  const produksiPerDivisi = {};
  DIVISI_OMSET_LIST.forEach(function(d){
    produksiPerDivisi[d.key] = produksiData.filter(function(p){ return String(p.divisi).toLowerCase() === d.key; });
  });
  dbRenderGroupedBarChart("db-omset-produksi-chart", DIVISI_OMSET_LIST, DIVISI_OMSET_WARNA, produksiPerDivisi, filterTahun);
}

/**
 * Render 1 grafik batang 12 bulan (Jan-Des) buat Tahun yang dipilih. Bulan yang
 * nggak ada datanya (nggak ada baris dari server buat bulan itu) TETAP muncul
 * sebagai batang kosong (0) -- biar polanya kebaca urut Jan-Des, bukan cuma
 * bulan yang ada transaksi doang yang ditampilin (nanti Feb-Apr bisa keliatan
 * "berurutan" padahal aslinya Maret kosong di antaranya).
 *
 * filterDivisi (opsional, dipakai buat 3 chart Omset Produksi) -- kalau diisi,
 * cuma baris dengan divisi itu yang ke-hitung (dibandingin lowercase, biar nggak
 * kepengaruh kapitalisasi "Cutting" vs "cutting" dari data mentah).
 *
 * Angka Rupiah SENGAJA nggak dicetak di atas tiap batang (beda dari chart Tren
 * Order Masuk yang nyetak angka count) -- 12 batang + teks "Rp X.Xjt" bakal
 * kepepet/tabrakan di layar sempit. Nilai pastinya ada di tooltip (hover/tap
 * lama) &amp; di kartu ringkas di atas buat bulan yang lagi difilter.
 */
/**
 * Grafik batang GABUNGAN generik -- N seri warna beda berdampingan per bulan
 * (BUKAN ditumpuk/stacked). Dipakai buat Order vs Invoice (2 seri) DAN Omset
 * Produksi per Divisi (3 seri) -- satu fungsi, dua pemakaian, biar konsisten.
 *
 * Kenapa BUKAN stacked: seri-serinya nggak selalu berarti kalau dijumlah jadi
 * 1 angka (khususnya Omset Produksi -- Cutting/Sewing/Finishing dihitung
 * INDEPENDEN, jumlahnya bisa lebih besar dari nilai PO asli, numpuk jadi 1
 * batang bisa nyesatin kesannya "total gabungan").
 *
 * seriesList: [{key, label}, ...] -- urutan & label tiap seri
 * warnaMap: {key: {bg, border}, ...}
 * dataByKey: {key: [{tahun, bulan, totalOmset}, ...], ...} -- data mentah per seri
 *
 * CATATAN TINGGI BATANG (biar nggak overflow keluar frame): .db-chart-frame
 * pakai box-sizing:border-box (aturan global *{box-sizing:border-box}), jadi
 * height:170px itu SUDAH TERMASUK padding 20px atas+bawah & border 1px --
 * ruang bersih buat isi cuma ~128px (170 - 40 - 2). Dikurangi gap(6px) +
 * label(min-height 24px) = sisa ~98px buat batang. Dipakai 90px (bukan 130px
 * kayak sebelumnya) biar ada margin aman, nggak mepet ke batas.
 */
function dbRenderGroupedBarChart(elId, seriesList, warnaMap, dataByKey, filterTahun){
  const chartEl = document.getElementById(elId);
  const MAKS_TINGGI_BATANG = 90;

  // Kalau tahun terpilih = tahun berjalan, potong di bulan sekarang -- nggak usah nampilin
  // bulan yang belum kejadian (batang nol Agu-Des cuma bikin noise & ngecilin skala batang
  // yang beneran ada datanya). Tahun lampau tetap full Jan-Des.
  const skrg = new Date();
  const bulanAkhir = (Number(filterTahun) === skrg.getFullYear()) ? (skrg.getMonth() + 1) : 12;

  // perBulan[bulan][seriesKey] = totalOmset
  const perBulan = {};
  for(let b = 1; b <= 12; b++){
    perBulan[b] = {};
    seriesList.forEach(function(s){ perBulan[b][s.key] = 0; });
  }
  seriesList.forEach(function(s){
    (dataByKey[s.key] || []).forEach(function(t){
      if(String(t.tahun) !== filterTahun) return;
      if(!perBulan[t.bulan]) return;
      perBulan[t.bulan][s.key] += t.totalOmset;
    });
  });

  let maxNilai = 1;
  for(let b = 1; b <= bulanAkhir; b++){
    seriesList.forEach(function(s){ maxNilai = Math.max(maxNilai, perBulan[b][s.key]); });
  }

  const html = [];
  for(let b = 1; b <= bulanAkhir; b++){
    const barsHtml = seriesList.map(function(s){
      const nilai = perBulan[b][s.key];
      const heightPx = Math.max(nilai > 0 ? 2 : 0, Math.round((nilai / maxNilai) * MAKS_TINGGI_BATANG));
      const w = warnaMap[s.key];
      // flex:1 + max-width (BUKAN width fixed px) -- batang ikut nyusut kalau
      // layar sempit, nggak maksa lebar sendiri yang bisa dorong chart overflow
      // ke samping. max-width cuma nahan biar nggak kelewat lebar di layar gede.
      return '<div title="' + s.label + ': ' + dbFormatRupiah(nilai) + '" style="flex:1;min-width:0;max-width:14px;height:' + heightPx +
        'px;background:' + w.bg + ';border:1.5px solid ' + w.border + ';border-radius:2px 2px 0 0;box-sizing:border-box"></div>';
    }).join("");
    html.push(
      '<div class="db-chart-col">' +
        '<div style="display:flex;align-items:flex-end;justify-content:center;gap:2px;height:' + MAKS_TINGGI_BATANG + 'px;width:100%;min-width:0">' + barsHtml + '</div>' +
        '<div class="db-chart-label">' + DB_BULAN_NAMA[b-1].slice(0,3) + '</div>' +
      '</div>'
    );
  }
  chartEl.innerHTML = html.join("");
}

function dbRenderAgingSummary(ringkasanBucket){
  const gridEl = document.getElementById("db-aging-summary");
  const totalInvoice = ringkasanBucket.reduce(function(sum, b){ return sum + b.jumlahInvoice; }, 0);
  const cardSemua = '<div class="db-stat-card db-card-btn' + (dbAgingActiveFilter === "semua" ? " active" : "") + '" onclick="dbSelectAgingFilter(\'semua\')" style="background:var(--white);border:1px solid var(--line)">' +
      '<div class="db-stat-num" style="color:var(--ink)">' + totalInvoice + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">SEMUA BELUM LUNAS</div>' +
    '</div>';
  const cardsBucket = ringkasanBucket.map(function(b){
    const warna = DB_AGING_WARNA[b.key];
    const active = (dbAgingActiveFilter === b.key) ? " active" : "";
    return '<div class="db-stat-card db-card-btn db-aging-card' + active + '" onclick="dbSelectAgingFilter(\'' + b.key + '\')" style="background:' + warna.bg + ';border:1px solid ' + warna.border + '">' +
      '<div class="db-aging-label-row">' +
        '<span class="db-aging-dot" style="background:' + warna.teks + '"></span>' +
        '<span class="db-stat-label" style="color:' + warna.teks + '">' + b.label.toUpperCase() + '</span>' +
      '</div>' +
      '<div class="db-stat-num" style="color:' + warna.teks + ';margin-top:4px">' + b.jumlahInvoice + '</div>' +
      '<div style="font-size:10px;color:' + warna.teks + ';margin-top:2px;font-family:monospace">' + dbFormatRupiahRingkas(b.totalOutstanding) + '</div>' +
    '</div>';
  }).join("");
  gridEl.innerHTML = cardSemua + cardsBucket;
}

function dbSelectAgingFilter(filterKey){
  dbAgingActiveFilter = filterKey;
  document.querySelectorAll("#db-aging-summary .db-card-btn").forEach(function(card){
    card.classList.toggle("active", card.getAttribute("onclick").indexOf("'" + filterKey + "'") !== -1);
  });
  dbRenderAgingList((window.DB_AGING || {}).daftarPiutang || [], filterKey);
}

function dbRenderAgingList(list, filter){
  const el = document.getElementById("db-aging-list");
  const filtered = (filter === "semua") ? list : list.filter(function(p){ return p.bucket === filter; });
  if(!filtered.length){
    el.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:16px">Tidak ada piutang untuk filter ini. \u2705</p>';
    return;
  }
  el.innerHTML = filtered.map(function(p){
    const warna = DB_AGING_WARNA[p.bucket];
    return '<div class="db-attention-card">' +
      '<div>' +
        '<span style="font-family:monospace;font-size:11px;color:var(--thread)">' + p.idInvoice + '</span>' +
        '<span style="font-size:10px;color:var(--ink-soft);margin-left:8px">' + p.kodeOrder + '</span>' +
        '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + p.namaKlien + ' &#183; ' + p.tanggal + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<span class="db-attention-badge" style="background:' + warna.bg + ';color:' + warna.teks + '">' + p.hari + ' HARI</span>' +
        '<div style="font-weight:700;font-size:14px;margin-top:4px">' + dbFormatRupiah(p.outstanding) + '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

const DB_PERHATIAN_KATEGORI = [
  { key: "semua", label: "Semua", warna: null },
  { key: "terlambat", label: "Terlambat", warna: "terlambat", hint: "Order yang masih nyangkut di produksi & lewat deadline. Beda dari KPI 'Order Terlambat' di atas yang juga menghitung order yang sudah dikirim." },
  { key: "menunggu_pengiriman", label: "Pengiriman", warna: "menunggu_pengiriman" },
  { key: "menunggu_invoice", label: "Invoice", warna: "menunggu_invoice" },
  { key: "menunggu_pelunasan", label: "Pelunasan", warna: "menunggu_pelunasan" },
  { key: "belum_lunas_baru", label: "Belum Lunas", warna: "belum_lunas_baru" }
];

// Warna dasar tiap kategori -- disamain sama palet .db-attention-badge biar konsisten
// makna warnanya di seluruh Dashboard (badge & card make warna yang sama).
// "belum_lunas_baru" SENGAJA netral (abu-abu, bukan merah/kuning/hijau) -- ini status
// NORMAL (invoice baru terbit, belum lewat masa tenggang 14 hari), bukan sesuatu yang
// perlu buru-buru ditindaklanjuti. Beda dari "menunggu_pelunasan" yang emang udah nunggak.
const DB_PERHATIAN_WARNA = {
  terlambat: { bg: "#FDECEA", border: "#E8A49C", teks: "#8f2c22" },
  menunggu_pengiriman: { bg: "#E3EFE6", border: "#B7D6BE", teks: "#2C6B3F" },
  menunggu_invoice: { bg: "#FCF3E3", border: "#EBCFA0", teks: "#8A5D1F" },
  menunggu_pelunasan: { bg: "#FDECEA", border: "#E8A49C", teks: "#8f2c22" },
  belum_lunas_baru: { bg: "#EFECE4", border: "#D8D3C7", teks: "#3D4A63" }
};

function dbRenderPerhatianCards(perlu){
  const gridEl = document.getElementById("db-perhatian-toggles");
  gridEl.innerHTML = DB_PERHATIAN_KATEGORI.map(function(kat){
    const count = (kat.key === "semua") ? perlu.length : perlu.filter(function(p){ return p.jenisList.indexOf(kat.key) !== -1; }).length;
    const warna = kat.warna ? DB_PERHATIAN_WARNA[kat.warna] : null;
    const bg = warna ? warna.bg : "var(--white)";
    const border = warna ? warna.border : "var(--line)";
    const teks = warna ? warna.teks : "var(--ink)";
    const active = (dbPerhatianActiveFilter === kat.key) ? " active" : "";
    return '<div class="db-stat-card db-card-btn' + active + '" onclick="dbSelectPerhatianFilter(\'' + kat.key + '\')"' + (kat.hint ? ' title="' + kat.hint + '"' : '') + ' style="background:' + bg + ';border:1px solid ' + border + '">' +
      '<div class="db-stat-num" style="color:' + teks + '">' + count + '</div>' +
      '<div class="db-stat-label" style="color:' + teks + '">' + kat.label.toUpperCase() + '</div>' +
    '</div>';
  }).join("");
}

function dbSelectPerhatianFilter(filterKey){
  dbPerhatianActiveFilter = filterKey;
  document.querySelectorAll("#db-perhatian-toggles .db-card-btn").forEach(function(card){
    card.classList.toggle("active", card.getAttribute("onclick").indexOf("'" + filterKey + "'") !== -1);
  });
  dbRenderPerhatian(window.DB_PERLU_PERHATIAN || [], filterKey);
}

function dbRenderPerhatian(perlu, filter){
  const perhatianEl = document.getElementById("db-perhatian-list");
  const filtered = (filter === "semua") ? perlu : perlu.filter(function(p){ return p.jenisList.indexOf(filter) !== -1; });

  if(!filtered.length){
    perhatianEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Tidak ada order untuk filter ini.</p>';
    return;
  }

  function kartuPerhatian(p){
    const adaTerlambat = p.jenisList.indexOf("terlambat") !== -1;
    const badgesHtml = p.badges.map(function(b){
      return '<span class="db-attention-badge ' + b.jenis + '">' + b.label.toUpperCase() + '</span>';
    }).join(" ");
    return '<div class="db-attention-card">' +
      '<div>' +
        '<span style="font-family:monospace;font-size:11px;color:var(--thread)">' + p.kodeOrder + '</span>' +
        (p.jumlah ? '<span style="font-size:10px;color:var(--ink-soft);margin-left:8px">' + p.jumlah + ' pcs</span>' : '') +
        (adaTerlambat
          ? '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">Nyangkut di tahap: <b>' + p.tahap + '</b></div>'
          : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + badgesHtml + '</div>' +
    '</div>';
  }

  // Cuma di view "Semua" domain-nya dipisah (Produksi vs Tagihan) biar mata bisa misahin
  // "yang digarap" vs "yang ditagih" -- beda orang yang nanganin. Item yang masih punya
  // urusan produksi (terlambat / nunggu kirim) masuk Produksi walau juga nunggu bayar --
  // karena aksi utamanya kelarin & kirim dulu. Di view terfilter semua item udah 1
  // kategori, jadi tetap daftar rata (nggak dipisah).
  if(filter === "semua"){
    function domainProduksi(p){
      return p.jenisList.indexOf("terlambat") !== -1 || p.jenisList.indexOf("menunggu_pengiriman") !== -1;
    }
    const produksi = filtered.filter(domainProduksi);
    const tagihan = filtered.filter(function(p){ return !domainProduksi(p); });
    let html = "";
    if(produksi.length){
      html += '<div class="db-perhatian-domain">Produksi <span>&#183; ' + produksi.length + ' butuh digarap</span></div>' +
        produksi.map(kartuPerhatian).join("");
    }
    if(tagihan.length){
      html += '<div class="db-perhatian-domain">Tagihan &amp; Admin <span>&#183; ' + tagihan.length + ' butuh ditindak</span></div>' +
        tagihan.map(kartuPerhatian).join("");
    }
    perhatianEl.innerHTML = html;
    return;
  }

  perhatianEl.innerHTML = filtered.map(kartuPerhatian).join("");
}

function dbFetch() {
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke dbFetchIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(DB_ID_TOKEN, DB_API_URL, dbFetchIsi_);
  } else {
    dbFetchIsi_();
  }
}

function dbFetchIsi_() {
  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, page: "dashboard" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.error){
      dbClearCachedToken();
      document.getElementById("db-error-message").textContent = data.error;
      const navLogoutErr = document.getElementById("db-nav-logout");
      if(navLogoutErr) navLogoutErr.classList.add("hidden");
      const navTrackingErr = document.getElementById("db-nav-tracking");
      if(navTrackingErr) navTrackingErr.classList.add("hidden");
      const navRefreshErr = document.getElementById("db-nav-refresh");
      if(navRefreshErr) navRefreshErr.classList.add("hidden");
      dbShow("db-error");
      return;
    }
    dbRender(data);
  })
  .catch(function(){
    document.getElementById("db-error-message").textContent = "Gagal menghubungi server. Coba beberapa saat lagi.";
    dbShow("db-error");
  });
}

var DB_REFRESHING = false; // cegah klik dobel numpuk request bareng

/**
 * Refresh data TANPA reload browser -- dipanggil dari tombol ikon di nav bar
 * (sebelah tombol Keluar). Pola sama kayak lpRefreshData() di Portal Klien: gagal
 * diam-diam (data lama TETAP ditampilkan, ikon kasih tanda merah sebentar), bukan
 * dilempar ke layar error penuh -- itu cuma buat kasus token beneran ditolak backend.
 *
 * Beda dari dbFetch() biasa (dipakai pas login pertama): dbRender() sendiri sebenernya
 * SUDAH nggak reset tab/filter section (dbKontrolActiveSubtab & dbPerhatianActiveFilter
 * itu variable persist di luar fungsi render, jadi otomatis kebawa). Yang PERLU
 * dipulihkan manual cuma section tab teratas (Perlu Perhatian/Ringkasan Klien/Kontrol
 * Data), karena dbRender() nggak pernah menyentuhnya sama sekali -- jadi sebenarnya
 * udah aman dibiarkan, tapi tetap dijaga eksplisit di sini biar jelas & anti regresi.
 */
function dbRefreshData(){
  if(DB_REFRESHING) return;
  DB_REFRESHING = true;
  JP_DATA = null; // paksa hitung ulang jadwal produksi setelah Refresh

  const btn = document.getElementById("db-nav-refresh");
  const icon = document.getElementById("db-refresh-icon");
  if(btn) btn.disabled = true;
  if(icon) icon.classList.add("spinning");

  const activeTabEl = document.querySelector("#db-section-tabs .lp-section-tab.active");
  const activeSection = activeTabEl ? activeTabEl.dataset.section : "perhatian";

  fetch(DB_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: DB_ID_TOKEN, page: "dashboard" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.error){
      dbClearCachedToken();
      document.getElementById("db-error-message").textContent = data.error;
      const navLogoutErr = document.getElementById("db-nav-logout");
      if(navLogoutErr) navLogoutErr.classList.add("hidden");
      const navTrackingErr = document.getElementById("db-nav-tracking");
      if(navTrackingErr) navTrackingErr.classList.add("hidden");
      if(btn) btn.classList.add("hidden");
      dbShow("db-error");
      return;
    }
    dbRender(data);
    dbSwitchTab(activeSection); // jaga-jaga section tab teratas tetap sama abis render ulang
  })
  .catch(function(){
    // Gagal diam-diam -- kasih tanda merah sebentar di ikon, data lama tetap kebuka.
    if(btn){
      btn.classList.add("nav-icon-btn--error");
      btn.title = "Gagal refresh, coba lagi";
      setTimeout(function(){
        btn.classList.remove("nav-icon-btn--error");
        btn.title = "Refresh data";
      }, 3000);
    }
  })
  .finally(function(){
    DB_REFRESHING = false;
    if(btn) btn.disabled = false;
    if(icon) icon.classList.remove("spinning");
  });
}

function dbUpdateLastRefreshed(){
  const el = document.getElementById("db-last-updated");
  if(!el) return;
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  el.textContent = "Terakhir diperbarui " + jam;
}

function dbFormatRupiah(n){
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

// Versi ringkas khusus buat kartu statistik (ruang sempit) — >=1jt disingkat "Rp X,Xjt"
/**
 * Kumpulan nilai unik dari array, dibuang yang kosong/null, diurutkan alfabetis.
 * Dipakai buat isi dropdown filter Lokasi/Divisi di tab Kinerja Tim dari data
 * yang udah ada (bukan query terpisah ke backend).
 */
function dbUniqueSorted(arr){
  const seen = {};
  const out = [];
  arr.forEach(function(v){
    if(v && !seen[v]){ seen[v] = true; out.push(v); }
  });
  return out.sort();
}

/** Format Date jadi "yyyy-MM-dd" pakai JS biasa -- INI JALAN DI BROWSER, bukan
 * Apps Script, jadi Utilities.formatDate() nggak tersedia di sini. */
function dbFormatYmd(d){
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
}

/**
 * Isi dropdown Lokasi & Divisi dari data window.DB_LEADERBOARD_OPERATOR yang
 * udah dikirim backend (bukan dari sheet -- itu udah kepake buat men-generate
 * leaderboardOperator-nya sendiri). Dipanggil sekali per dbRender(), value
 * yang lagi dipilih dipertahankan (biar nggak ke-reset kalau Refresh).
 */
function dbSetupKinerjaFilter(){
  const data = window.DB_LEADERBOARD_OPERATOR || [];
  const lokasiSel = document.getElementById("db-kinerja-lokasi");
  const divisiSel = document.getElementById("db-kinerja-divisi");
  if(!lokasiSel || !divisiSel) return;

  const lokasiList = dbUniqueSorted(data.map(function(d){ return d.lokasi; }));
  const divisiList = dbUniqueSorted(data.map(function(d){ return d.divisi; }));

  const curLokasi = lokasiSel.value;
  lokasiSel.innerHTML = '<option value="">Semua Lokasi</option>' +
    lokasiList.map(function(l){ return '<option value="' + l + '">' + l + '</option>'; }).join("");
  lokasiSel.value = curLokasi;

  const curDivisi = divisiSel.value;
  divisiSel.innerHTML = '<option value="">Semua Divisi</option>' +
    divisiList.map(function(d){ return '<option value="' + d + '">' + d + '</option>'; }).join("");
  divisiSel.value = curDivisi;

  lokasiSel.onchange = dbRenderKinerja;
  divisiSel.onchange = dbRenderKinerja;
  const periodeSel = document.getElementById("db-kinerja-periode");
  if(periodeSel) periodeSel.onchange = dbRenderKinerja;
}

/**
 * Render leaderboard operator, sesuai filter Lokasi/Divisi/Periode aktif.
 *
 * CATATAN PENTING soal "rata-rata ter-bobot/hari": ini SUM(weightedOutput
 * harian) / jumlah HARI KERJA TERCATAT -- bukan hitung ulang weighted-average
 * yang presisi lintas beberapa hari dari nol (backend cuma ngirim
 * weightedOutput per hari, bukan sumOutputXCycle/sumCycleTime mentahnya per
 * hari). Ini pola SAMA PERSIS kayak yang dulu dipakai tab Produktivitas per
 * Lokasi (rataRata = sumWeighted/jumlahHari) -- sengaja konsisten.
 *
 * Konsekuensinya: operator yang cuma kerja 1-2 hari tercatat dalam periode
 * filter bisa keliatan ranking tinggi walau sample-nya kecil (1 hari bagus
 * bisa nge-dominasi rata-rata). Makanya "jumlah hari kerja" SENGAJA
 * ditampilkan bareng di tiap baris -- bukan disembunyikan -- biar Femri bisa
 * nilai sendiri mana ranking yang representatif vs kebetulan.
 */
function dbRenderKinerja(){
  const data = window.DB_LEADERBOARD_OPERATOR || [];
  const listEl = document.getElementById("db-kinerja-list");
  if(!listEl) return;

  const lokasiFilter = (document.getElementById("db-kinerja-lokasi") || {}).value || "";
  const divisiFilter = (document.getElementById("db-kinerja-divisi") || {}).value || "";
  const periodeHari = Number((document.getElementById("db-kinerja-periode") || {}).value || 30);

  const batas = new Date();
  batas.setDate(batas.getDate() - periodeHari);
  const batasKey = dbFormatYmd(batas);

  const filtered = data.filter(function(d){
    if(d.tanggal < batasKey) return false;
    if(lokasiFilter && d.lokasi !== lokasiFilter) return false;
    if(divisiFilter && d.divisi !== divisiFilter) return false;
    return true;
  });

  // Agregasi lintas hari per Nama
  const perNama = {};
  filtered.forEach(function(d){
    if(!perNama[d.nama]){
      perNama[d.nama] = { nama: d.nama, sumWeighted: 0, rawOutput: 0, hariSet: {}, lokasiSet: {}, divisiSet: {} };
    }
    const p = perNama[d.nama];
    p.sumWeighted += d.weightedOutput;
    p.rawOutput += d.rawOutput;
    p.hariSet[d.tanggal] = true;
    p.lokasiSet[d.lokasi] = true;
    p.divisiSet[d.divisi] = true;
  });

  const ranking = Object.keys(perNama).map(function(k){
    const p = perNama[k];
    const jumlahHari = Object.keys(p.hariSet).length;
    return {
      nama: p.nama,
      rataRataTerbobot: jumlahHari ? Math.round((p.sumWeighted / jumlahHari) * 100) / 100 : 0,
      rawOutput: p.rawOutput,
      jumlahHari: jumlahHari,
      lokasiLabel: Object.keys(p.lokasiSet).join(", "),
      divisiLabel: Object.keys(p.divisiSet).join(", ")
    };
  });

  ranking.sort(function(a, b){ return b.rataRataTerbobot - a.rataRataTerbobot; });

  if(!ranking.length){
    listEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Tidak ada data produktivitas operator untuk filter/periode ini.</p>';
    return;
  }

  // Ambang sampel: operator dgn hari kerja tercatat < AMBANG_HARI dipisah dari ranking
  // utama. Alasan: rata-rata ter-bobot/hari jadi liar kalau sampelnya kecil -- 1-2 hari
  // yang kebetulan bagus bisa nge-dominasi & nangkring di #1 padahal bukan yang paling
  // produktif beneran. Mereka TETAP ditampilkan (transparan, bukan disembunyikan), tapi
  // nggak diperingkat. Ambang diturunin ke 3 buat periode pendek (7 hari) biar ranking
  // utama nggak kosong; selain itu 7 hari kerja sebagai lantai statistik.
  const AMBANG_HARI = (periodeHari <= 7) ? 3 : 7;
  const utama = ranking.filter(function(r){ return r.jumlahHari >= AMBANG_HARI; });
  const belumCukup = ranking.filter(function(r){ return r.jumlahHari < AMBANG_HARI; });

  function barisKinerja(row, peringkat){
    // Lencana peringkat (adopsi prioritas 5 dari mockup redesign): #1 emas, #2 perak,
    // #3 perunggu, sisanya abu -- biar "siapa juara" kebaca sekejap, bukan deretan
    // #angka datar. Peringkat 0 = sampel belum cukup, nggak dikasih lencana.
    var rankHtml = "";
    if(peringkat){
      var tier = peringkat === 1 ? "gold" : (peringkat === 2 ? "silver" : (peringkat === 3 ? "bronze" : "plain"));
      rankHtml = '<span class="db-rank-badge db-rank-' + tier + '">' + peringkat + '</span>';
    }
    return '<div class="db-client-row' + (peringkat ? '' : ' db-kinerja-muted') + '">' +
      '<div class="db-kinerja-nama">' + rankHtml + '<span>' + row.nama +
        '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + row.divisiLabel + ' &#183; ' + row.lokasiLabel + '</div></span></div>' +
      '<div style="text-align:center;font-weight:700">' + row.rataRataTerbobot + '</div>' +
      '<div style="text-align:right">' + row.rawOutput + ' pcs' +
        '<div style="font-size:11px;color:var(--ink-soft)">' + row.jumlahHari + ' hari kerja</div></div>' +
    '</div>';
  }

  const kepala = '<div class="db-client-head"><div>OPERATOR</div><div style="text-align:center">RATA&#8211;RATA TER-BOBOT/HARI</div><div style="text-align:right">OUTPUT MENTAH</div></div>';

  let html = "";
  if(utama.length){
    html += '<div class="db-client-table">' + kepala +
      utama.map(function(row, idx){ return barisKinerja(row, idx + 1); }).join("") +
    '</div>';
  } else {
    html += '<p style="color:var(--ink-soft);font-size:13px;margin:0 0 12px">Belum ada operator dengan sampel cukup (&#8805; ' + AMBANG_HARI + ' hari kerja) di periode ini &#8212; semua di bawah masih sampel kecil, jadi nggak diperingkat.</p>';
  }

  if(belumCukup.length){
    html += '<div class="db-kinerja-subhead">Sampel belum cukup <span>&#183; &lt; ' + AMBANG_HARI + ' hari kerja &#183; nggak ikut diperingkat</span></div>' +
      '<div class="db-client-table">' + (utama.length ? '' : kepala) +
        belumCukup.map(function(row){ return barisKinerja(row, 0); }).join("") +
      '</div>';
  }

  listEl.innerHTML = html;
}

function dbFormatRupiahRingkas(n){
  if(n >= 1000000){
    return "Rp " + (n/1000000).toLocaleString("id-ID", {maximumFractionDigits:1}) + "jt";
  }
  return dbFormatRupiah(n);
}

/**
 * Pintasan: switch tab section + scroll ke bar tab. Dipakai kartu KPI yang clickable
 * dan strip "Harus kelar hari ini".
 */
function dbGoToTab(section){
  dbSwitchTab(section);
  const tabs = document.getElementById("db-section-tabs");
  if(tabs && tabs.scrollIntoView) tabs.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Zona aksi cepat "Harus kelar hari ini": 3 order TERLAMBAT paling parah, kelihatan di
 * atas tanpa scroll/klik tab. Sumbernya SAMA PERSIS dgn tab Perlu Perhatian
 * (window.DB_PERLU_PERHATIAN) -- ini cuma pintasan/view, bukan sumber data baru, jadi
 * angkanya nggak mungkin beda. Urutan: hari terlambat terbanyak dulu (di-parse dari
 * label badge "terlambat", karena backend nggak kirim field angka terpisah). Klik sel
 * -> loncat ke tab Perlu Perhatian dgn filter Terlambat aktif.
 */
function dbRenderTop3Urgent(perlu){
  const el = document.getElementById("db-urgent-strip");
  if(!el) return;
  function hariTerlambat(p){
    const b = (p.badges || []).filter(function(x){ return x.jenis === "terlambat"; })[0];
    if(!b) return 0;
    const m = String(b.label).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  const terlambat = (perlu || [])
    .filter(function(p){ return (p.jenisList || []).indexOf("terlambat") !== -1; })
    .sort(function(a, b){ return hariTerlambat(b) - hariTerlambat(a); })
    .slice(0, 3);
  if(!terlambat.length){
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML =
    '<div class="db-urgent-head">\u25CF Harus kelar hari ini &#183; ' + terlambat.length + ' paling mendesak</div>' +
    '<div class="db-urgent-grid">' +
    terlambat.map(function(p){
      const sub = p.tahap ? ("Nyangkut: " + p.tahap) : (p.jumlah ? (p.jumlah + " pcs") : "");
      return '<div class="db-urgent-cell" onclick="dbGoToTab(\'perhatian\');dbSelectPerhatianFilter(\'terlambat\')">' +
        '<div class="db-urgent-kode">' + p.kodeOrder + '</div>' +
        '<div class="db-urgent-hari">Telat ' + hariTerlambat(p) + ' hari</div>' +
        '<div class="db-urgent-tahap">' + sub + '</div>' +
      '</div>';
    }).join("") +
    '</div>';
}

/**
 * Alarm risiko kas: kalau outstanding numpuk di 1 klien (>=50% total), munculkan callout
 * amber di atas. Sumbernya SAMA dgn tab Ringkasan Klien & Aging (bukan data baru) -- ini
 * cuma nyatuin 2 fakta yang selama ini kepisah di 2 tab jadi 1 alarm yang kelihatan.
 * Enrichment "macet 60+ hari" nyocokin klien lewat namaKlien (idKlien nggak ada di sisi
 * aging); kalau nggak ketemu, bagian itu dilewati aja, alarm tetap tampil.
 * Klik -> loncat ke tab Aging Piutang.
 */
function dbRenderConcentrationAlert(ringkasanKlien, totalOutstanding, agingData){
  const el = document.getElementById("db-concentration-alert");
  if(!el) return;
  function sembunyikan(){ el.classList.add("hidden"); el.innerHTML = ""; }
  if(!totalOutstanding || totalOutstanding <= 0 || !ringkasanKlien || !ringkasanKlien.length){ sembunyikan(); return; }

  const berpiutang = ringkasanKlien
    .filter(function(k){ return (k.outstanding || 0) > 0; })
    .sort(function(a, b){ return (b.outstanding || 0) - (a.outstanding || 0); });
  if(!berpiutang.length){ sembunyikan(); return; }

  const top = berpiutang[0];
  const share = top.outstanding / totalOutstanding;
  const AMBANG = 0.5; // >=50% outstanding di 1 klien = konsentrasi patut diwaspadai
  if(share < AMBANG){ sembunyikan(); return; }

  // Enrich: berapa dari piutang klien ini yang udah macet 60+ hari
  let macet60 = 0;
  const daftar = (agingData && agingData.daftarPiutang) || [];
  daftar.forEach(function(p){
    if(p.namaKlien === top.namaKlien && p.bucket === "60+"){ macet60 += (p.outstanding || 0); }
  });

  const persen = Math.round(share * 100);
  const macetHtml = (macet60 > 0)
    ? ', <b>' + dbFormatRupiahRingkas(macet60) + '</b> di antaranya sudah <b>macet 60+ hari</b>'
    : '';

  el.classList.remove("hidden");
  el.setAttribute("onclick", "dbGoToTab('aging')");
  el.setAttribute("title", "Klik untuk lihat rincian umur piutang (aging)");
  el.innerHTML =
    '<span class="db-conc-icon">\u26A0</span>' +
    '<span class="db-conc-text">Konsentrasi piutang tinggi \u2014 <b>' + top.namaKlien + '</b> menahan <b>' +
      dbFormatRupiahRingkas(top.outstanding) + '</b> (<b>' + persen + '%</b> dari total outstanding)' + macetHtml +
      '. Risiko kas numpuk di satu nama.</span>' +
    '<span class="db-conc-cta">Lihat aging \u203A</span>';
}

function dbRender(data){
  dbUpdateLastRefreshed();
  // Reset cache detail klien tiap data dashboard baru masuk (login/Refresh) -- biar Detail
  // Klien ikut segar, nggak nyajiin snapshot lama.
  const hero = document.getElementById("db-hero");
  if(hero) hero.style.display = "none";

  const navLogout = document.getElementById("db-nav-logout");
  if(navLogout) navLogout.classList.remove("hidden");
  const navTracking = document.getElementById("db-nav-tracking");
  if(navTracking) navTracking.classList.remove("hidden");
  const navRefresh = document.getElementById("db-nav-refresh");
  if(navRefresh) navRefresh.classList.remove("hidden");

  document.getElementById("db-staff-nama").textContent = data.staffNama;

  const r = data.ringkasan;
  const statGrid = document.getElementById("db-ringkasan");
  statGrid.innerHTML =
    '<div class="db-stat-card" style="background:var(--ink)">' +
      '<div class="db-stat-num" style="color:#fff">' + r.orderAktif + '</div>' +
      '<div class="db-stat-label" style="color:#B9C2D6">ORDER AKTIF</div>' +
    '</div>' +
    '<div class="db-stat-card db-stat-clickable" style="background:#FDECEA;border:1px solid #E8A49C" onclick="dbGoToTab(\'perhatian\');dbSelectPerhatianFilter(\'terlambat\')" title="Semua order lewat deadline, TERMASUK yang sudah dikirim (tinggal urusan invoice). Untuk yang masih nyangkut di produksi, buka filter Terlambat di tab Perlu Perhatian.">' +
      '<div class="db-stat-num" style="color:#8f2c22">' + r.orderTerlambat + '</div>' +
      '<div class="db-stat-label" style="color:#8f2c22">ORDER TERLAMBAT \u203A</div>' +
    '</div>' +
    '<div class="db-stat-card db-stat-clickable" style="background:var(--white);border:1px solid var(--line)" onclick="dbGoToTab(\'aging\')" title="Total tagihan belum lunas. Klik untuk lihat rincian umur piutang (aging).">' +
      '<div class="db-stat-num" style="color:var(--thread)">' + dbFormatRupiahRingkas(r.totalOutstanding) + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">TOTAL OUTSTANDING \u203A</div>' +
    '</div>' +
    '<div class="db-stat-card" style="background:var(--white);border:1px solid var(--line)">' +
      '<div class="db-stat-num" style="color:var(--ink)">' + r.klienAktif + '</div>' +
      '<div class="db-stat-label" style="color:var(--ink-soft)">KLIEN AKTIF</div>' +
    '</div>';

  // 8 warna unik, 1 per tahap (bukan cycle/reuse warna kartu Section 1) -- sengaja di luar
  // keluarga merah/hijau/oranye karena warna itu udah punya makna "status" di bagian lain
  // dashboard (Terlambat/Pengiriman/Invoice). Batang bottleneck ditandai border 3px, bukan
  // warna merah, biar nggak nyampur sama sinyal "bermasalah" di tempat lain.
  const DB_TAHAP_WARNA = [
    { bg: "#E6ECF5", border: "#A9BEDD", teks: "#1F3A66" }, // Order & SPK
    { bg: "#EAF0F3", border: "#AFC9D3", teks: "#2C5566" }, // Pola & Marker
    { bg: "#ECE9F5", border: "#C3B7E0", teks: "#4A3580" }, // Sampel
    { bg: "#F3E9F0", border: "#DBAECB", teks: "#7A2F5C" }, // Cutting
    { bg: "#F6E9EE", border: "#E3AFC3", teks: "#8A2F52" }, // Sewing
    { bg: "#F0EAE3", border: "#D6C3AE", teks: "#6B4A32" }, // QC
    { bg: "#EBEDE8", border: "#C4CABD", teks: "#4A5240" }, // Finishing
    { bg: "#E9E9E7", border: "#C7C6C0", teks: "#3A3936" }  // Packing & Kirim
  ];

  const dist = data.distribusiTahap;
  window.DB_DETAIL_PRODUKSI = data.detailProduksi || [];
  // Disimpan supaya dbShowTahapDetail bisa hitung kontribusi % tiap tahap
  // terhadap total order aktif (adopsi pola panel-ringkasan dari mockup redesign).
  window.DB_DISTRIBUSI_TAHAP = dist;
  window.DB_TOTAL_ORDER_AKTIF = dist.reduce(function(s, d){ return s + d.jumlah; }, 0);
  window.DB_TAHAP_WARNA_MAP = {};
  dist.forEach(function(d, i){ window.DB_TAHAP_WARNA_MAP[d.tahap] = DB_TAHAP_WARNA[i % DB_TAHAP_WARNA.length]; });
  const maxJumlah = Math.max.apply(null, dist.map(function(d){ return d.jumlah; }).concat([1]));
  const hotJumlah = Math.max.apply(null, dist.map(function(d){ return d.jumlah; }).concat([0]));
  const chartEl = document.getElementById("db-tahap-chart");
  chartEl.innerHTML = dist.map(function(d, i){
    const heightPx = Math.max(3, Math.round((d.jumlah / maxJumlah) * 110));
    const clickable = d.jumlah > 0;
    const w = DB_TAHAP_WARNA[i % DB_TAHAP_WARNA.length];
    const isHot = d.jumlah > 0 && d.jumlah === hotJumlah;
    const borderW = isHot ? 3 : 1.5;
    const barStyle = 'height:' + heightPx + 'px;background:' + w.bg + ';border:' + borderW + 'px solid ' + w.border + ';box-sizing:border-box';
    return '<div class="db-chart-col"' + (clickable ? ' style="cursor:pointer" onclick="dbShowTahapDetail(\'' + d.tahap.replace(/'/g, "\\'") + '\')"' : '') + '>' +
      '<div class="db-chart-num" style="color:' + w.teks + (isHot ? ';font-weight:800' : '') + '">' + d.jumlah + '</div>' +
      '<div class="db-chart-bar" style="' + barStyle + '" id="db-bar-' + d.tahap.replace(/[^a-zA-Z0-9]/g,'') + '"></div>' +
      '<div class="db-chart-label">' + d.tahap.replace(" & ", " &amp;<br>") + '</div>' +
    '</div>';
  }).join("");
  document.getElementById("db-tahap-detail").innerHTML = "";
  var _rs = document.getElementById("db-tahap-ringkas-slot");
  if(_rs) _rs.innerHTML = "";

  const hotStage = dist.slice().sort(function(a,b){ return b.jumlah - a.jumlah; })[0];
  const insightEl = document.getElementById("db-tahap-insight");
  let insightHtml = (hotStage && hotStage.jumlah > 0)
    ? "\u25CF " + hotStage.tahap + " paling numpuk (" + hotStage.jumlah + " order) — kandidat bottleneck"
    : "";
  const menungguAdmin = data.sudahDikirimMenungguAdmin || 0;
  if(menungguAdmin > 0){
    insightHtml += (insightHtml ? '<br>' : '') +
      '<span style="color:var(--ink-soft)">\u25CB ' + menungguAdmin + ' order lainnya udah selesai produksi & dikirim — sengaja TIDAK dihitung di chart ini, tinggal urusan invoice/pelunasan (cek tab "Perlu Perhatian")</span>';
  }
  insightEl.innerHTML = insightHtml;

  // Otomatis buka detail buat tahap paling numpuk -- biar langsung kelihatan
  // tanpa perlu klik dulu (gantiin border tebal yang sebelumnya dipakai buat highlight).
  if(hotStage && hotStage.jumlah > 0){
    dbShowTahapDetail(hotStage.tahap);
  }

  // Section baru: Tren Order Masuk per Bulan
  dbRenderTrenOrder(data.trenOrder || []);

  // Section 3: Order Perlu Perhatian
  window.DB_PERLU_PERHATIAN = data.perluPerhatian || [];
  dbRenderTop3Urgent(window.DB_PERLU_PERHATIAN);
  dbRenderPerhatianCards(window.DB_PERLU_PERHATIAN);
  // Pakai filter yang lagi aktif (bukan hardcode "semua") -- sebelumnya card filter
  // nunjukkin state aktif yang benar tapi list di bawahnya diam-diam balik ke "semua"
  // tiap kali dbRender() dipanggil ulang (termasuk sekarang lewat tombol Refresh).
  dbRenderPerhatian(window.DB_PERLU_PERHATIAN, dbPerhatianActiveFilter);
  dbSetTabBadge("db-tab-badge-perhatian", window.DB_PERLU_PERHATIAN.length);

  // Section 4: Ringkasan per Klien
  const klienEl = document.getElementById("db-klien-table");
  const ringkasanKlien = data.ringkasanKlien || [];
  window.DB_RINGKASAN_KLIEN = ringkasanKlien;  // dipakai prefetch lazy pas tab Detail Klien dibuka
  if(!ringkasanKlien.length){
    klienEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Belum ada data klien aktif.</p>';
  } else {
    klienEl.innerHTML =
      '<div class="db-client-table">' +
        '<div class="db-client-head"><div>KLIEN</div><div style="text-align:center">ORDER AKTIF</div><div style="text-align:right">OUTSTANDING</div></div>' +
        ringkasanKlien.map(function(k){
          // Klik baris -> langsung lompat ke tab "Detail Klien" dengan klien ini
          // udah kepilih -- shortcut, bukan satu-satunya jalan (dropdown di tab Detail
          // Klien nyakup SEMUA klien termasuk yang lagi nggak aktif, baris ini nggak).
          const safeId = String(k.idKlien).replace(/'/g, "\\'");
          return '<div class="db-client-row" style="cursor:pointer" onclick="dbOpenDetailKlien(\'' + safeId + '\')" title="Buka detail klien ini di Portal Klien (tab baru)">' +
            '<div>' + k.namaKlien + '</div>' +
            '<div style="text-align:center">' + k.orderAktif + '</div>' +
            '<div style="text-align:right;font-weight:700">' + (k.outstanding > 0 ? dbFormatRupiah(k.outstanding) : '&#8212;') + '</div>' +
          '</div>';
        }).join("") +
      '</div>';
  }

  const klienTotalEl = document.getElementById("db-klien-total-outstanding");
  klienTotalEl.className = "lp-invoice-summary";
  klienTotalEl.innerHTML =
    '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:.04em;color:var(--ink-soft)">TOTAL OUTSTANDING</span>' +
    '<span style="font-size:18px;font-weight:800;color:var(--thread)">' + dbFormatRupiah(r.totalOutstanding) + '</span>';

  // Alarm konsentrasi klien -- nyatuin fakta dari Ringkasan Klien + Aging jadi 1 alarm di atas
  dbRenderConcentrationAlert(ringkasanKlien, r.totalOutstanding, data.agingPiutang || {});

  // Section 5: Kontrol Data
  window.DB_PO_AUDIT = data.poAudit || [];
  dbSetupKontrolFilter();
  dbRenderKontrolData();

  // Section 6: Aging Piutang
  dbRenderAgingPiutang(data);

  // Section 6d: Order Masuk (Form Order Klien) -- fetch TERPISAH lewat action
  // "getOrderRequests" (bukan bagian dari payload dbFetch() utama), lihat komentar
  // di definisi dbRenderOrderMasuk().
  dbRenderOrderMasuk();

  // Section 6c: Omset (Fase 1 -- Order & Invoice; Fase 2 -- Produksi per Divisi), per bulan+tahun
  window.DB_OMSET_ORDER = data.omsetOrderTren || [];
  window.DB_OMSET_INVOICE = data.omsetInvoiceTren || [];
  window.DB_OMSET_PRODUKSI = data.omsetProduksiTren || [];
  dbSetupOmsetFilter();
  dbRenderOmset();

  // Section 6b: Kinerja Tim (leaderboard operator ter-bobot Cycle Time)
  window.DB_LEADERBOARD_OPERATOR = data.leaderboardOperator || [];
  dbSetupKinerjaFilter();
  dbRenderKinerja();


  dbShow("db-results");
}

window.onload = function(){
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.initialize({
      client_id: DB_OAUTH_CLIENT_ID,
      callback: dbHandleGoogleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("db-google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }

  const cachedToken = dbGetCachedToken();
  if(cachedToken){
    DB_ID_TOKEN = cachedToken;
    dbShow("db-loading");
    dbFetch();
  }
};
