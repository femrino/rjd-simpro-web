/**
 * ============================================================
 * SIMPRO -- simpro-global
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : semua halaman
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

/**
 * ============ FUNGSI BERSAMA: label pembayaran invoice ============
 * Aturan penamaan uang yang sudah diterima, dipakai di 2 tempat: kartu invoice
 * (Portal Klien / tab Detail Klien) & invoice cetak (halaman cetak.html).
 * Ditaruh global biar aturannya CUMA ADA 1 -- kalau cuma di-hardcode di
 * masing-masing tempat, gampang beda sendiri pas salah satunya diubah.
 *
 * Kenapa perlu: field "dp" dari backend itu sebenarnya TOTAL PEMBAYARAN DITERIMA
 * (sumbernya SD Pelunasan), bukan khusus uang muka. Jadi nggak boleh selalu
 * disebut "DP" -- kalau tagihannya udah lunas, itu pelunasan, bukan uang muka.
 *   masih ada sisa -> "DP diterima"        (memang uang muka)
 *   sisa nol       -> "Pembayaran diterima" (pelunasan penuh)
 */
function labelPembayaranDiterima_(outstanding){
  return (outstanding > 0) ? "DP diterima" : "Pembayaran diterima";
}

/**
 * ============ FUNGSI BERSAMA: thumbnail lampiran Drive ============
 * Dipakai di 2 tempat: tab "Order Masuk" (dashboard) & daftar Orderan (tracking +
 * tab Detail Klien). Ditaruh global (sebelum <b:if>) biar CUMA ADA 1 SALINAN.
 *
 * Ambil file ID dari URL Drive. Backend (simpanFileBase64KeDrive_ di order-request.gs)
 * nyimpen hasil file.getUrl() -> "https://drive.google.com/file/d/<ID>/view?usp=..."
 * Ditangani juga format "?id=<ID>" biar tahan kalau formatnya beda. Bukan URL Drive /
 * ID nggak ketemu -> balikin "" (nanti dirender jadi link teks biasa, bukan error).
 */
/**
 * Amankan teks dari klien sebelum masuk innerHTML. WAJIB dipakai untuk SEMUA
 * isi yang berasal dari form order (catatan, warna, artikel, dst) -- sebelum
 * ini teks itu disisipkan mentah, jadi karakter seperti &lt; atau &amp; bisa
 * merusak tampilan dokumen, dan tag HTML yang terlanjur diketik klien ikut
 * dieksekusi browser.
 *
 * Dipasangkan dengan CSS white-space:pre-wrap di elemen penampung supaya
 * ENTER & baris kosong yang diketik klien di form tetap terlihat sama persis
 * di dokumen cetak -- tanpa itu HTML meruntuhkan semuanya jadi satu paragraf.
 */
function rjdEscapeHtml_(s){
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rjdDriveFileId_(url){
  if(!url) return "";
  const s = String(url);
  const m = s.match(/\/d\/([-\w]{20,})/) || s.match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : "";
}

/**
 * Bikin HTML thumbnail buat 1 slot lampiran yang isinya BISA banyak URL (digabung
 * 1 sel sheet, dipisah "; " -- lihat simpanBanyakFileKeDrive_ di backend).
 *
 * Kenapa aman: file di Drive udah di-set ANYONE_WITH_LINK/VIEW sama backend, jadi
 * thumbnail-nya bisa ke-load tanpa ubah apa pun di backend. Tetap dikasih DEGRADASI
 * ANGGUN -- kalau gambar gagal load (file bukan gambar, atau izin Drive diubah manual
 * suatu saat), img-nya disembunyiin & otomatis balik jadi link teks seperti perilaku
 * lama. Jadi nggak ada kondisi di mana tampilannya rusak/kosong.
 *
 * Klik thumbnail -> buka file asli di tab baru (sama kayak link lama).
 */
function rjdBuildThumbHtml_(urlGabungan, ikon, labelDasar){
  if(!urlGabungan) return "";
  const urls = String(urlGabungan).split(";").map(function(u){ return u.trim(); }).filter(Boolean);
  if(!urls.length) return "";
  return urls.map(function(u, i){
    const label = labelDasar + (urls.length > 1 ? " " + (i + 1) : "");
    const id = rjdDriveFileId_(u);
    if(!id){
      return '<a class="rjd-thumb-teks" href="' + u + '" rel="noopener" target="_blank">' + ikon + ' ' + label + '</a>';
    }
    return '<a class="rjd-thumb" href="' + u + '" rel="noopener" target="_blank" title="' + label + '">' +
      '<img alt="' + label + '" loading="lazy" src="https://drive.google.com/thumbnail?id=' + id + '&amp;sz=w200"' +
        ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-block\'"/>' +
      '<span class="rjd-thumb-fallback">' + ikon + ' ' + label + '</span>' +
    '</a>';
  }).join("");
}

/**
 * ============ FUNGSI BERSAMA: render detail klien ============
 * Dipakai di 2 tempat: halaman Tracking (berdiri sendiri, prefix "lp-") dan tab
 * "Detail Klien" di Dashboard (embedded di dalam #db-app). SENGAJA ditaruh di sini
 * (global, sebelum <b:if>) biar CUMA ADA 1 SALINAN -- kalau ada bug/perbaikan di
 * cara nampilin progress produksi/pengiriman/tagihan, cukup diubah di 1 tempat,
 * otomatis kepake di kedua halaman. JANGAN diduplikasi lagi ke branch manapun.
 *
 * Markup yang dibutuhin fungsi-fungsi ini (HARUS ada, id/class harus persis sama,
 * di branch manapun dia dipanggil): #lp-nama-klien, #lp-tab-tagihan, .lp-detail-tab
 * + .lp-detail-panel (Produksi/Pengiriman/Tagihan), #lp-order-toggles +
 * #lp-order-list, #lp-shipment-toggles + #lp-shipment-list, #lp-invoice-toggles +
 * #lp-invoice-summary + #lp-invoice-list.
 */

function formatRupiah(n){
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function badgeClassFor(status){
  if(status === "Lunas") return "lp-badge-lunas";
  if(status === "DP Diterima") return "lp-badge-dp";
  if(status === "Dibatalkan") return "lp-badge-batal";
  return "lp-badge-belum"; // Belum Dibayar / default
}

/**
 * Urutan size yang dikenal (paling umum dipakai di apparel Indonesia). Kalau semua
 * size di 1 divisi cocok sama daftar ini, urutkan sesuai itu -- kalau nggak (misal
 * size numerik kayak 38/40/42 buat kemeja, atau ada yang typo), fallback ke numerik
 * ascending, atau alfabetis kalau numerik pun nggak cocok. Ini kosmetik doang (biar
 * kolom matrix nggak acak-acakan urutannya) -- backend TETAP sumber kebenaran datanya.
 * NOTASI 2XL/3XL/4XL/5XL (bukan XXL/XXXL) -- sesuai konvensi yang dipakai di data RJD.
 */
var LP_SIZE_ORDER_DIKENAL = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
function sortSizeLabels(sizes){
  const semuaDikenal = sizes.every(function(s){ return LP_SIZE_ORDER_DIKENAL.indexOf(String(s).toUpperCase()) !== -1; });
  if(semuaDikenal){
    return sizes.slice().sort(function(a, b){
      return LP_SIZE_ORDER_DIKENAL.indexOf(String(a).toUpperCase()) - LP_SIZE_ORDER_DIKENAL.indexOf(String(b).toUpperCase());
    });
  }
  const semuaNumerik = sizes.every(function(s){ return s !== "" && !isNaN(parseFloat(s)); });
  if(semuaNumerik){
    return sizes.slice().sort(function(a, b){ return parseFloat(a) - parseFloat(b); });
  }
  return sizes.slice().sort(); // fallback alfabetis
}

/**
 * Urutan Divisi TETAP buat pill matrix Warna x Size: Cutting -> Sewing -> Finishing.
 * "Interlining" SENGAJA DIBUANG dari tampilan ini (permintaan Femri) -- kalau ada
 * Divisi lain yang nggak dikenal di daftar ini (bukan Interlining), tetap ditampilkan,
 * ditaruh di akhir (bukan ikut dibuang) -- cuma Interlining spesifik yang di-filter.
 */
var LP_DIVISI_ORDER_DIKENAL = ["cutting", "sewing", "finishing"];
function urutkanFilterDivisiGroups(groups){
  return groups
    .filter(function(g){ return String(g.divisi).trim().toLowerCase() !== "interlining"; })
    .slice()
    .sort(function(a, b){
      const ia = LP_DIVISI_ORDER_DIKENAL.indexOf(String(a.divisi).trim().toLowerCase());
      const ib = LP_DIVISI_ORDER_DIKENAL.indexOf(String(b.divisi).trim().toLowerCase());
      if(ia === -1 && ib === -1) return 0; // dua2nya nggak dikenal, biarin urutan asli
      if(ia === -1) return 1; // yang dikenal (ada di daftar) duluan
      if(ib === -1) return -1;
      return ia - ib;
    });
}

/** Warna sel matrix -- REUSE palette .lp-badge-* (hijau/amber/merah) yang sudah ada. */
function matrixCellClass(persen){
  if(persen === null || persen === undefined) return "lp-matrix-cell-notarget";
  if(persen >= 100) return "lp-matrix-cell-good";
  if(persen >= 50) return "lp-matrix-cell-medium";
  return "lp-matrix-cell-low";
}

/**
 * Susun HTML matrix Warna x Size per Divisi dari order.breakdownWarnaSize (lihat
 * attachBreakdownWarnaSizeForOrder_ di backend). Collapsed by default -- baru
 * kerender isinya beneran saat toggle di-klik (lihat wiring di renderOrderList),
 * jadi nggak nge-build DOM berat kalau kliennya nggak buka.
 * Kalau order belum punya data breakdown (misal belum ada produksi tercatat, atau
 * order belum sampai proses manapun), balikin string kosong -- nggak nampilin
 * apa-apa (bukan pesan error, karena ini kondisi normal buat order baru).
 */
function buildWarnaSizeSectionHtml(order){
  const groupsMentah = order.breakdownWarnaSize;
  if(!groupsMentah || !groupsMentah.length) return "";

  // Filter Interlining + urutkan Cutting->Sewing->Finishing (lihat urutkanFilterDivisiGroups)
  const groups = urutkanFilterDivisiGroups(groupsMentah);
  if(!groups.length) return ""; // abis di-filter Interlining, ternyata kosong semua

  const divisiList = groups.map(function(g){ return g.divisi; });
  const pillsHtml = divisiList.length > 1
    ? '<div class="lp-toggle-row lp-matrix-divisi-pills">' +
        divisiList.map(function(d, i){
          return '<button type="button" class="lp-toggle lp-matrix-divisi-btn' + (i === divisiList.length - 1 ? ' active' : '') + '" data-divisi-idx="' + i + '">' + d + '</button>';
        }).join('') +
      '</div>'
    : '';

  const matricesHtml = groups.map(function(g, i){
    const warnaList = [];
    const sizeSet = {};
    g.matrix.forEach(function(cell){
      if(warnaList.indexOf(cell.warna) === -1) warnaList.push(cell.warna);
      sizeSet[cell.size] = true;
    });
    warnaList.sort(); // ascending alfabetis (permintaan Femri)
    const sizeList = sortSizeLabels(Object.keys(sizeSet));

    const cellMap = {};
    g.matrix.forEach(function(cell){ cellMap[cell.warna + "|" + cell.size] = cell; });

    const headRow = '<tr><th></th>' + sizeList.map(function(s){ return '<th>' + s + '</th>'; }).join('') + '</tr>';
    const bodyRows = warnaList.map(function(w){
      const cells = sizeList.map(function(s){
        const cell = cellMap[w + "|" + s];
        if(!cell) return '<td class="lp-matrix-cell-empty">&#8212;</td>';
        const persenHtml = (cell.persen === null) ? '' : '<div class="lp-matrix-persen">' + cell.persen + '%</div>';
        return '<td class="' + matrixCellClass(cell.persen) + '" title="' + w + ' &#183; Size ' + s + '">' +
          '<div class="lp-matrix-out">' + cell.output + (cell.qtyTarget ? ('/' + cell.qtyTarget) : '') + '</div>' +
          persenHtml +
          '</td>';
      }).join('');
      return '<tr><th>' + w + '</th>' + cells + '</tr>';
    }).join('');

    return '<div class="lp-matrix-wrap" data-divisi-idx="' + i + '" style="' + (i === groups.length - 1 ? '' : 'display:none') + '">' +
      '<table class="lp-matrix"><thead>' + headRow + '</thead><tbody>' + bodyRows + '</tbody></table>' +
      '</div>';
  }).join('');

  return (
    '<div class="lp-matrix-toggle-row">' +
      '<button type="button" class="lp-matrix-toggle-btn">Lihat progress per warna &amp; ukuran &#9662;</button>' +
    '</div>' +
    '<div class="lp-matrix-section" style="display:none">' + pillsHtml + matricesHtml + '</div>'
  );
}

/**
 * Pasang event listener buat toggle buka/tutup matrix & switch pill Divisi.
 * DISKOP ke elemen `card` doang (querySelector/querySelectorAll dari card, BUKAN
 * document.getElementById) -- sengaja begini karena renderOrderList bikin banyak
 * card sekaligus dalam 1 list, kalau pakai id global bakal collision (cuma card
 * pertama yang kepencet). Dipanggil sekali per card, setelah card di-append ke DOM.
 */
function wireWarnaSizeSection(card){
  const toggleBtn = card.querySelector(".lp-matrix-toggle-btn");
  if(!toggleBtn) return; // order ini nggak punya data breakdown, nggak ada yang perlu di-wire

  toggleBtn.addEventListener("click", function(){
    const section = card.querySelector(".lp-matrix-section");
    const sedangTerbuka = section.style.display !== "none";
    section.style.display = sedangTerbuka ? "none" : "";
    toggleBtn.innerHTML = "Lihat progress per warna &amp; ukuran " + (sedangTerbuka ? "&#9662;" : "&#9652;");
  });

  card.querySelectorAll(".lp-matrix-divisi-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      card.querySelectorAll(".lp-matrix-divisi-btn").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      const target = btn.dataset.divisiIdx;
      card.querySelectorAll(".lp-matrix-wrap").forEach(function(w){
        w.style.display = (w.dataset.divisiIdx === target) ? "" : "none";
      });
    });
  });
}

function renderOrderList(orders, filter){
  const list = document.getElementById("lp-order-list");
  list.innerHTML = "";

  const filtered = (filter === "semua" ? orders : orders.filter(function(o){ return !o.selesaiTuntas && !o.dibatalkan; }))
    .slice()
    .sort(function(a, b){ return String(b.kodeOrder).localeCompare(String(a.kodeOrder)); }); // terbaru di atas -- kodeOrder diawali tanggal (yyMMdd/...), jadi sortable langsung

  if(!filtered.length){
    const pesan = (filter === "aktif")
      ? "Tidak ada order aktif saat ini — semua order sudah selesai & lunas."
      : "Belum ada order tercatat.";
    list.innerHTML = '<p style="color:var(--ink-soft);font-size:14px">' + pesan + '</p>';
    return;
  }

  filtered.forEach(function(order){
    const card = document.createElement("div");
    card.className = "lp-order-card";

    const stepsHtml = window.LP_TAHAP_PRODUKSI.map(function(tahap, idx){
      let cls = "lp-step";
      if(idx < order.tahapIndex) cls += " done";
      else if(idx === order.tahapIndex) cls += " current";
      return '<div class="' + cls + '"><div class="lp-step-dot">' + (idx+1) + '</div><div class="lp-step-label">' + tahap + '</div></div>';
    }).join("");

    const badgeHtml = order.dibatalkan
      ? '<div class="lp-order-badge-wrap"><span class="lp-badge lp-badge-batal">Dibatalkan</span></div>'
      : order.menungguPelunasan
      ? '<div class="lp-order-badge-wrap"><span class="lp-badge lp-badge-belum">Menunggu Pelunasan</span></div>'
      : order.invoiceBelumDibuat
      ? '<div class="lp-order-badge-wrap"><span class="lp-badge lp-badge-dp">Menunggu Invoice</span></div>'
      : '';

    card.innerHTML =
      '<div class="lp-order-head">' +
        '<div><div class="lp-order-code">' + order.kodeOrder + '</div>' +
        '<div class="lp-order-produk">' + order.produk + ' &#183; ' + order.qty + ' pcs</div>' +
        badgeHtml +
        '</div>' +
        '<div class="lp-order-est">Estimasi selesai<br/><b>' + (order.estimasi || '-') + '</b></div>' +
      '</div>' +
      '<div class="lp-stepper">' + stepsHtml + '</div>' +
      buildWarnaSizeSectionHtml(order);

    list.appendChild(card);
    wireWarnaSizeSection(card);
  });
}

function renderInvoices(invoices, filter){
  const summaryEl = document.getElementById("lp-invoice-summary");
  const listEl = document.getElementById("lp-invoice-list");
  listEl.innerHTML = "";

  if(!invoices.length){
    summaryEl.innerHTML = "";
    listEl.innerHTML = '<p style="color:var(--ink-soft);font-size:14px">Belum ada invoice tercatat.</p>';
    return;
  }

  const filtered = invoices.filter(function(inv){
    if(filter === "semua") return true;
    if(filter === "outstanding") return inv.outstanding > 0;
    return inv.status === filter; // "Lunas"
  }).sort(function(a, b){ return String(b.idInvoice).localeCompare(String(a.idInvoice)); }); // terbaru di atas -- format INV-{YYMM}.{counter}, sortable langsung

  if(!filtered.length){
    listEl.innerHTML = '<p style="color:var(--ink-soft);font-size:14px">Tidak ada invoice untuk filter ini.</p>';
  } else {
    filtered.forEach(function(inv){
      const card = document.createElement("div");
      card.className = "lp-invoice-card";
      card.innerHTML =
        '<div>' +
          '<div class="lp-invoice-code">' + inv.idInvoice + ' &#183; ' + inv.tanggal + '</div>' +
          '<div class="lp-invoice-order">Order: ' + inv.kodeOrder + (inv.jumlah ? ' &#183; ' + inv.jumlah + ' pcs' : '') + '</div>' +
          (inv.dp > 0 ? '<div style="font-size:12px;color:var(--ink-soft);margin-top:4px">' + labelPembayaranDiterima_(inv.outstanding) + ': ' + formatRupiah(inv.dp) + '</div>' : '') +
          '<a class="lp-cetak-link" href="/p/cetak.html?jenis=invoice&id=' + encodeURIComponent(inv.idInvoice) + '" target="_blank">&#128424; Cetak Invoice</a>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<span class="lp-badge ' + badgeClassFor(inv.status) + '">' + inv.status + '</span>' +
          '<div class="lp-invoice-amount">' + formatRupiah(inv.totalTagihan) + '</div>' +
          (inv.outstanding > 0 ? '<div class="lp-invoice-outstanding" style="color:var(--thread)">Outstanding: ' + formatRupiah(inv.outstanding) + '</div>' : '') +
        '</div>';
      listEl.appendChild(card);
    });
  }

  // Total Outstanding selalu dihitung dari SEMUA invoice (bukan hasil filter) — biar angka totalnya konsisten
  const totalOutstanding = invoices.reduce(function(sum, inv){ return sum + (inv.outstanding || 0); }, 0);
  summaryEl.className = "lp-invoice-summary";
  summaryEl.innerHTML =
    '<div><div class="lbl">Total Outstanding</div></div>' +
    '<div class="val ' + (totalOutstanding > 0 ? "owed" : "zero") + '">' + formatRupiah(totalOutstanding) + '</div>';
}

function renderShipments(shipments, filter){
  const listEl = document.getElementById("lp-shipment-list");
  listEl.innerHTML = "";

  const filtered = (filter === "semua" ? shipments : shipments.filter(function(s){ return s.jenisPengiriman === filter; }))
    .slice()
    .sort(function(a, b){ return String(b.idPengiriman).localeCompare(String(a.idPengiriman)); }); // terbaru di atas -- format SJ-{YYMM}.{counter}, sortable langsung

  if(!filtered.length){
    listEl.innerHTML = '<p style="color:var(--ink-soft);font-size:14px">Tidak ada data pengiriman untuk filter ini.</p>';
    return;
  }

  filtered.forEach(function(s){
    const card = document.createElement("div");
    card.className = "lp-shipment-card";
    card.innerHTML =
      '<div class="lp-shipment-head">' +
        '<span class="lp-shipment-code">' + s.idPengiriman + ' &#183; ' + s.tanggal + '</span>' +
        '<span class="lp-shipment-tag">' + s.jenisPengiriman + '</span>' +
      '</div>' +
      '<div class="lp-shipment-meta">Order <b>' + s.kodeOrder + '</b> &#183; ' + s.jumlah + ' pcs</div>' +
      '<div class="lp-shipment-meta">Metode: <b>' + s.metode + '</b>' + (s.noResi ? ' &#183; Resi: ' + s.noResi : '') + '</div>' +
      (s.catatan ? '<div class="lp-shipment-meta" style="margin-top:4px;font-style:italic">' + s.catatan + '</div>' : '') +
      '<a class="lp-cetak-link" href="/p/cetak.html?jenis=suratjalan&id=' + encodeURIComponent(s.idPengiriman) + '" target="_blank">&#128424; Cetak Surat Jalan</a>';
    listEl.appendChild(card);
  });
}

function setupToggleGroup(containerId, onSelect){
  const container = document.getElementById(containerId);
  if(!container) return;
  container.querySelectorAll(".lp-toggle").forEach(function(btn){
    btn.addEventListener("click", function(){
      container.querySelectorAll(".lp-toggle").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      onSelect(btn.dataset.filter);
    });
  });
}

/**
 * Switch sub-tab detail klien aktif (Produksi / Pengiriman / Tagihan).
 * Discoped ke class .lp-detail-tab/.lp-detail-panel (BUKAN .lp-section-tab
 * yang dipakai tab utama Dashboard) -- lihat komentar CSS-nya kenapa ini penting.
 */
function switchSectionTab(sectionName){
  document.querySelectorAll(".lp-detail-tab").forEach(function(tab){
    tab.classList.toggle("active", tab.dataset.section === sectionName);
  });
  document.querySelectorAll(".lp-detail-panel").forEach(function(panel){
    panel.style.display = (panel.dataset.panel === sectionName) ? "" : "none";
  });
  // Filter periode nggak relevan di tab Profil (data profil nggak punya tanggal),
  // jadi disembunyikan di situ biar nggak bikin bingung. window.LP_ADA_PERIODE
  // diisi lpSetupFilterPeriode -- kalau klien memang nggak punya data berperiode
  // sama sekali, filter tetap disembunyikan di SEMUA tab.
  var wrapFilter = document.getElementById("lp-filter-periode");
  if(wrapFilter){
    var bolehTampil = (sectionName !== "profil") && (window.LP_ADA_PERIODE === true);
    wrapFilter.style.display = bolehTampil ? "" : "none";
  }
}

/**
 * Isi konten detail klien (nama, 3 sub-tab produksi/pengiriman/tagihan) dari response
 * backend. MURNI soal nge-render konten -- TIDAK ngurusin show/hide layar top-level
 * (lp-hero/lp-login-box/dst di Tracking, atau db-app/db-hero di Dashboard) atau
 * elemen yang spesifik ke satu halaman aja (internal-bar, nav buttons) -- itu jadi
 * tanggung jawab si pemanggil (renderOrders() di Tracking, dbRenderDetailKlien() di
 * Dashboard), karena beda konteks butuh perlakuan beda di bagian itu.
 */

/* ============ FILTER PERIODE (Tahun/Bulan) -- Portal Klien ============
   DIPINDAH dari tab "Detail Klien" Dashboard yang sudah dihapus. Logikanya sama
   persis: menyaring data MENTAH yang sudah ada di memori lalu me-render ulang
   lewat lpRenderKlienData() -- TANPA fetch ulang ke server, dan TANPA mengubah
   lpRenderKlienData itu sendiri. Jadi filter ini murni lapisan di atasnya. */
var RJD_BULAN_NAMA = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/**
 * Isi dropdown Tahun (dinamis, ikut data yang benar-benar ada) & Bulan (statis 1-12),
 * lalu pasang listener. Dipanggil tiap data klien selesai dimuat -- pilihan
 * di-reset ke "Semua" tiap ganti klien, biar nggak kebawa filter klien sebelumnya.
 */
function lpSetupFilterPeriode(data){
  window.LP_KLIEN_DATA_RAW = data;
  var tahunSet = {};
  (data.orders || []).forEach(function(o){ if(o.tahun) tahunSet[o.tahun] = true; });
  (data.invoices || []).forEach(function(inv){ if(inv.tahun) tahunSet[inv.tahun] = true; });
  (data.shipments || []).forEach(function(sh){ if(sh.tahun) tahunSet[sh.tahun] = true; });
  // Order Request ikut menyumbang pilihan tahun. Datanya datang dari fetch
  // TERPISAH (window.LP_ORDERAN), bukan bagian dari data klien -- itu sebabnya
  // dulu tab Orderan sama sekali nggak kena filter.
  (window.LP_ORDERAN || []).forEach(function(g){
    var t = lpPeriodeOrderRequest_(g).tahun;
    if(t) tahunSet[t] = true;
  });
  var tahunList = Object.keys(tahunSet).map(Number).sort(function(a,b){ return b - a; });

  var wrap = document.getElementById("lp-filter-periode");
  var tahunEl = document.getElementById("lp-filter-tahun");
  var bulanEl = document.getElementById("lp-filter-bulan");
  if(!wrap || !tahunEl || !bulanEl) return;

  // Kalau datanya cuma dari 1 tahun DAN sedikit, filter cuma jadi kekacauan visual.
  // Disembunyikan kalau nggak ada data periode sama sekali.
  window.LP_ADA_PERIODE = tahunList.length > 0;
  if(!tahunList.length){ wrap.style.display = "none"; return; }
  // Tampil/tidaknya diatur switchSectionTab (disembunyikan di tab Profil).
  var tabAktif = document.querySelector(".lp-detail-tab.active");
  wrap.style.display = (tabAktif && tabAktif.dataset.section === "profil") ? "none" : "";

  // Pilihan yang sedang aktif DIPERTAHANKAN kalau masih valid -- fungsi ini bisa
  // dipanggil ULANG saat daftar Order Request selesai dimuat (fetch terpisah),
  // dan pilihan filter user nggak boleh ke-reset gara-gara itu.
  var tahunSebelum = tahunEl.value || "semua";
  var bulanSebelum = bulanEl.value || "semua";

  tahunEl.innerHTML = '<option value="semua">Semua Tahun</option>' +
    tahunList.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join("");
  tahunEl.value = (tahunSebelum === "semua" || tahunList.indexOf(Number(tahunSebelum)) !== -1) ? tahunSebelum : "semua";
  tahunEl.onchange = lpApplyFilterPeriode;

  bulanEl.innerHTML = '<option value="semua">Semua Bulan</option>' +
    RJD_BULAN_NAMA.map(function(nama, idx){ return '<option value="' + (idx+1) + '">' + nama + '</option>'; }).join("");
  bulanEl.value = bulanSebelum;
  bulanEl.onchange = lpApplyFilterPeriode;
}

/**
 * Ambil {tahun, bulan} dari 1 order request. Backend nggak mengirim tahun/bulan
 * untuk data ini (beda dengan orders/invoices/shipments), jadi diturunkan di sini
 * dari "Waktu Diajukan" -- itu tanggal yang paling masuk akal buat menyaring
 * "order yang diajukan bulan X".
 */
function lpPeriodeOrderRequest_(g){
  var raw = g && g.waktuDiajukan;
  if(!raw) return { tahun: null, bulan: null };
  var d = new Date(raw);
  if(isNaN(d.getTime())) return { tahun: null, bulan: null };
  return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
}

/** Terapkan filter ke SEMUA sub-tab sekaligus, dari data mentah di memori. */
function lpApplyFilterPeriode(){
  var raw = window.LP_KLIEN_DATA_RAW;
  if(!raw) return;
  var filterTahun = document.getElementById("lp-filter-tahun").value;
  var filterBulan = document.getElementById("lp-filter-bulan").value;

  function cocok(tahun, bulan){
    if(filterTahun !== "semua" && String(tahun) !== filterTahun) return false;
    if(filterBulan !== "semua" && String(bulan) !== filterBulan) return false;
    return true;
  }
  function cocokPeriode(item){ return cocok(item.tahun, item.bulan); }

  var filtered = Object.assign({}, raw, {
    orders: (raw.orders || []).filter(cocokPeriode),
    invoices: (raw.invoices || []).filter(cocokPeriode),
    shipments: (raw.shipments || []).filter(cocokPeriode)
  });
  // pertahankanTab: jangan lempar user balik ke tab Produksi tiap ganti filter.
  lpRenderKlienData(filtered, { pertahankanTab: true });

  // Tab ORDERAN dirender dari sumber terpisah, jadi disaring & dirender sendiri.
  // Filter status (Semua/Pending/Disetujui/Ditolak) yang sedang aktif dipertahankan.
  var orderanSemua = window.LP_ORDERAN || [];
  var orderanTersaring = orderanSemua.filter(function(g){
    var p = lpPeriodeOrderRequest_(g);
    return cocok(p.tahun, p.bulan);
  });
  var tombolAktif = document.querySelector("#lp-orderan-toggles .lp-toggle.active");
  renderOrderanList(orderanTersaring, tombolAktif ? tombolAktif.dataset.filter : "semua");
}

function lpRenderKlienData(data, opsi){
  document.getElementById("lp-nama-klien").textContent = data.klienNama;

  // Sembunyikan TAB "Tagihan" kalau role tidak berhak lihat invoice.
  // Default true (tampil) supaya alur klien normal (yang tidak kirim field ini) tidak berubah.
  const bisaLihatInvoice = data.bisaLihatInvoice !== false;
  const tabTagihan = document.getElementById("lp-tab-tagihan");
  if(tabTagihan){
    tabTagihan.style.display = bisaLihatInvoice ? "" : "none";
  }

  // Mulai dari tab "Produksi" tiap kali DATA BARU dimuat (misal abis ganti klien).
  // TAPI JANGAN saat cuma me-render ulang karena filter periode diubah -- dulu
  // ini bikin user yang lagi di tab Tagihan/Pengiriman terlempar balik ke Produksi
  // tiap kali ganti filter, sehingga filternya SEOLAH-OLAH cuma bekerja di Produksi.
  if(!(opsi && opsi.pertahankanTab)) switchSectionTab("produksi");

  window.LP_ROLE = data.role || "klien";
  window.LP_ORDERS = data.orders || [];
  window.LP_TAHAP_PRODUKSI = data.tahapProduksi || [];
  renderOrderList(window.LP_ORDERS, "aktif");

  window.LP_INVOICES = data.invoices || [];
  renderInvoices(window.LP_INVOICES, "semua");
  window.LP_SHIPMENTS = data.shipments || [];
  renderShipments(window.LP_SHIPMENTS, "semua");

  // Profil & Orderan -- FETCH TERPISAH (bukan bagian dari payload dashboard/tracking
  // utama), sama pola kayak dbRenderOrderMasuk() di Dashboard. idKlien dikirim
  // cuma kalau role internal (staff milih klien lewat dropdown) -- klien biasa
  // nggak perlu kirim apa-apa, di-resolve otomatis dari email login-nya sendiri.
  lpFetchProfilDanOrderan(data.role === "internal" ? data.klienIdAktif : null);

  // Reset toggle visual ke pilihan default ("Aktif" utk order, "Semua" utk pengiriman/invoice)
  // -- perlu di-reset manual soalnya toggle sebelumnya (dari klien lain) bisa aja masih
  // ke-mark "active" di DOM walau datanya udah keganti.
  document.querySelectorAll("#lp-order-toggles .lp-toggle").forEach(function(b){
    b.classList.toggle("active", b.dataset.filter === "aktif");
  });
  document.querySelectorAll("#lp-shipment-toggles .lp-toggle, #lp-invoice-toggles .lp-toggle, #lp-orderan-toggles .lp-toggle").forEach(function(b){
    b.classList.toggle("active", b.dataset.filter === "semua");
  });
}

/**
 * Fetch data Profil Klien + riwayat Orderan (Order Request) -- TERPISAH dari
 * payload dashboard/tracking utama, sama pola kayak dbRenderOrderMasuk() di
 * Dashboard. idKlienUntukFetch cuma diisi kalau staff (mode internal) --
 * klien biasa cukup kirim idToken, backend resolve idKlien-nya sendiri.
 */
/**
 * Helper universal buat ambil API URL & token login yang benar, APAPUN
 * branch yang lagi aktif (Portal Klien pakai LP_API_URL/LP_ID_TOKEN, Dashboard
 * pakai DB_API_URL/DB_ID_TOKEN -- dua-duanya CUMA didefinisikan di dalam
 * <script> branch masing-masing, BUKAN di area global ini). Fungsi kayak
 * lpFetchProfilDanOrderan() dipanggil dari KEDUA branch (lewat lpRenderKlienData
 * yang shared), jadi WAJIB pakai helper ini, JANGAN pernah refer ke
 * LP_API_URL/DB_API_URL langsung dari fungsi di area global ini -- bakal
 * ReferenceError begitu jalan di branch yang variabelnya nggak ada.
 */
function lpApiUrlUniversal_(){
  if (typeof DB_API_URL !== "undefined") return DB_API_URL;
  if (typeof LP_API_URL !== "undefined") return LP_API_URL;
  if (typeof OF_API_URL !== "undefined") return OF_API_URL;
  return null;
}
function lpIdTokenUniversal_(){
  // Tiap cabang punya nama variabel token sendiri: DB_ (dashboard), LP_
  // (tracking/portal), OF_ (halaman Form Order). SEMUANYA harus dijaga
  // `typeof` -- versi lama mengakses LP_ID_TOKEN tanpa penjagaan, sehingga di
  // halaman Form Order (yang tidak punya LP_) fungsi ini melempar
  // ReferenceError sebelum sempat memanggil server. Akibatnya daftar artikel
  // tersimpan tidak pernah termuat & selektornya tetap tersembunyi.
  if (typeof DB_ID_TOKEN !== "undefined") return DB_ID_TOKEN;
  if (typeof LP_ID_TOKEN !== "undefined") return LP_ID_TOKEN;
  if (typeof OF_ID_TOKEN !== "undefined") return OF_ID_TOKEN;
  return null;
}

function lpFetchProfilDanOrderan(idKlienUntukFetch){
  const apiUrl = lpApiUrlUniversal_();
  const idToken = lpIdTokenUniversal_();
  const bodyIdKlien = idKlienUntukFetch ? { idKlien: idKlienUntukFetch } : {};

  fetch(apiUrl, {
    method: "POST",
    body: JSON.stringify(Object.assign({ idToken: idToken, action: "getProfilKlien" }, bodyIdKlien))
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success) renderProfil(data.data);
    else document.getElementById("lp-profil-form").innerHTML = '<p style="color:var(--ink-soft);font-size:13px">' + (data.error || "Gagal memuat profil.") + '</p>';
  })
  .catch(function(){
    document.getElementById("lp-profil-form").innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Gagal menghubungi server.</p>';
  });

  fetch(apiUrl, {
    method: "POST",
    body: JSON.stringify(Object.assign({ idToken: idToken, action: "getOrderRequestsForKlien" }, bodyIdKlien))
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){
      window.LP_ORDERAN = data.daftar || [];
      renderOrderanList(window.LP_ORDERAN, "semua");
      // Order Request baru saja tersedia -> daftar tahun di filter periode
      // disegarkan supaya tahun yang cuma ada di data ini ikut muncul.
      // Pilihan filter yang sedang aktif dipertahankan (lihat lpSetupFilterPeriode).
      if(window.LP_KLIEN_DATA_RAW) lpSetupFilterPeriode(window.LP_KLIEN_DATA_RAW);
    } else {
      document.getElementById("lp-orderan-list").innerHTML = '<p style="color:var(--ink-soft);font-size:13px">' + (data.error || "Gagal memuat riwayat order.") + '</p>';
    }
  })
  .catch(function(){
    document.getElementById("lp-orderan-list").innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Gagal menghubungi server.</p>';
  });
}

function renderProfil(p){
  window.LP_PROFIL_ID_KLIEN_SAAT_INI = p.id;
  const adaEmail2 = !!(p.email2 && p.email2.trim());
  const adaEmail3 = !!(p.email3 && p.email3.trim());
  const peringatanLogin = '<p style="font-size:11px;color:var(--thread);margin:-8px 0 16px">&#9888; Email ini bisa dipakai buat login — kalau diubah, pastikan sudah benar sebelum simpan.</p>';

  document.getElementById("lp-profil-form").innerHTML =
    '<div class="lp-profil-card">' +
      '<label class="lp-profil-label">Nama Perusahaan/Brand<input disabled type="text" value="' + (p.nama || "") + '"/></label>' +
      '<p style="font-size:11.5px;color:var(--ink-soft);margin:-8px 0 16px">Nama ini dipakai sebagai identitas utama di sistem kami — hubungi admin RJD Apparel kalau perlu diubah.</p>' +
      '<label class="lp-profil-label">Alamat<textarea id="lp-profil-alamat" rows="2">' + (p.alamat || "") + '</textarea></label>' +
      '<label class="lp-profil-label">Kontak Person<input id="lp-profil-kontak" type="text" value="' + (p.kontakPerson || "") + '"/></label>' +
      '<label class="lp-profil-label">No Telepon/WA<input id="lp-profil-telepon" type="text" value="' + (p.telepon || "") + '"/></label>' +
      '<p style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin:8px 0 4px">Email Login <span style="font-weight:400;color:var(--ink-soft)">(sampai 3, salah satu bisa dipakai login)</span></p>' +
      '<label class="lp-profil-label">Email 1<input id="lp-profil-email" type="email" value="' + (p.email || "") + '"/></label>' +
      peringatanLogin +
      '<div id="lp-profil-email2-wrap" class="' + (adaEmail2 ? "" : "hidden") + '">' +
        '<label class="lp-profil-label">Email 2<input id="lp-profil-email2" type="email" value="' + (p.email2 || "") + '"/></label>' +
        peringatanLogin +
      '</div>' +
      '<div id="lp-profil-email3-wrap" class="' + (adaEmail3 ? "" : "hidden") + '">' +
        '<label class="lp-profil-label">Email 3<input id="lp-profil-email3" type="email" value="' + (p.email3 || "") + '"/></label>' +
        peringatanLogin +
      '</div>' +
      '<button class="lp-profil-tambah-email ' + ((!adaEmail2) ? "" : "hidden") + '" id="lp-profil-tambah-email2-btn" onclick="lpTampilkanEmailSlot(2)" type="button">+ Tambah Email Login</button>' +
      '<button class="lp-profil-tambah-email ' + ((adaEmail2 && !adaEmail3) ? "" : "hidden") + '" id="lp-profil-tambah-email3-btn" onclick="lpTampilkanEmailSlot(3)" type="button">+ Tambah Email Login</button>' +
      // ---- Standar Produksi ----
      // Yang MEMEGANG dokumen ini kliennya, jadi dia yang paling tepat
      // mengunggahnya. Diunggah SEKALI, lalu otomatis ikut di SPK setiap
      // ordernya -- tidak perlu dikirim ulang tiap order.
      // Size chart DEFAULT klien -- untuk klien yang ukurannya sama di semua
      // artikel. Cukup diisi sekali di sini; form order boleh dibiarkan kosong.
      '<div class="lp-standar-blok">' +
        '<div class="lp-standar-judul">Size Chart Default</div>' +
        '<div class="lp-standar-hint">Ukuran baku yang berlaku untuk SEMUA artikel Anda. ' +
          'Kalau ada artikel yang ukurannya beda, isi di form order artikel itu -- yang lebih ' +
          'khusus selalu menang.</div>' +
        '<div class="of-matrix-wrap"><table class="of-matrix of-sc-tabel">' +
          '<thead><tr><th class="of-th-warna">Ukuran</th>' +
            LP_SC_SIZE.map(function(sz){ return '<th class="of-th-size">' + sz + '</th>'; }).join("") +
            '<th></th></tr></thead>' +
          '<tbody id="lp-sc-daftar"></tbody>' +
        '</table></div>' +
        '<button class="of-jadwal-add" onclick="lpTambahBarisSCKlien_()" type="button">+ Tambah Ukuran</button>' +
      '</div>' +
      '<div class="lp-standar-blok">' +
        '<div class="lp-standar-judul">Standar Produksi</div>' +
        '<div class="lp-standar-hint">Dokumen standar kerja yang berlaku untuk SEMUA order Anda ' +
          '(mis. standar jahitan &amp; finishing). Cukup diunggah sekali -- otomatis dilampirkan ke ' +
          'surat perintah kerja produksi.</div>' +
        '<div id="lp-standar-daftar"></div>' +
        '<label class="lp-profil-label"><span id="lp-standar-lbl-file">Unggah dokumen (PDF/gambar, boleh lebih dari satu)</span>' +
          '<input accept="image/*,application/pdf" id="lp-standar-file" multiple="multiple" type="file"/></label>' +
        '<label class="lp-profil-label">Ringkasan singkat (opsional -- ikut tercetak di SPK)' +
          '<textarea id="lp-standar-catatan" rows="2">' + rjdEscapeHtml_(p.standarCatatan || "") + '</textarea></label>' +
      '</div>' +
      '<div style="margin-top:8px">' +
        '<button class="btn btn-solid" id="lp-profil-simpan-btn" onclick="lpSimpanProfil()" type="button">Simpan Perubahan</button>' +
        '<span id="lp-profil-status" style="margin-left:12px;font-size:12.5px;color:var(--ink-soft)"></span>' +
      '</div>' +
    '</div>';
  lpRenderStandarDaftar_(p.standarUrl);
  lpRenderSCKlien_(p.sizeChartDefault);
}

/**
 * Editor size chart default klien. Kolom size-nya TETAP (XS..5XL) karena di
 * tingkat klien belum diketahui artikel mana yang akan dipakai -- beda dengan
 * di form order, yang kolomnya mengikuti size aktif item itu.
 */
const LP_SC_SIZE = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

function lpTambahBarisSCKlien_(prefill){
  const wadah = document.getElementById("lp-sc-daftar");
  if(!wadah) return;
  const b = document.createElement("tr");
  b.className = "of-sc-baris";
  b.innerHTML =
    '<td class="of-td-sc-nama"><input class="of-f-sc-nama" placeholder="nama ukuran (mis. Lingkar Dada)" type="text"/></td>' +
    LP_SC_SIZE.map(function(sz){
      return '<td class="of-td-sc-nilai"><input class="of-f-sc-nilai" data-size="' + sz + '" placeholder="-" type="text"/></td>';
    }).join("") +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="this.closest(\'.of-sc-baris\').remove()" title="Hapus" type="button">&#10005;</button></td>';
  wadah.appendChild(b);
  if(prefill){
    b.querySelector(".of-f-sc-nama").value = prefill.nama || "";
    b.querySelectorAll(".of-f-sc-nilai").forEach(function(inp){
      const v = (prefill.perSize || {})[inp.dataset.size];
      if(v != null) inp.value = v;
    });
  }
}

function lpRenderSCKlien_(daftar){
  const w = document.getElementById("lp-sc-daftar");
  if(!w) return;
  w.innerHTML = "";
  (daftar || []).forEach(function(x){ lpTambahBarisSCKlien_(x); });
}

function lpBacaSCKlien_(){
  const w = document.getElementById("lp-sc-daftar");
  if(!w) return [];
  return Array.prototype.slice.call(w.querySelectorAll(".of-sc-baris"))
    .map(function(b){
      const perSize = {};
      b.querySelectorAll(".of-f-sc-nilai").forEach(function(inp){
        const v = (inp.value || "").trim();
        if(v) perSize[inp.dataset.size] = v;
      });
      return { nama: (b.querySelector(".of-f-sc-nama").value || "").trim(), perSize: perSize };
    })
    .filter(function(x){ return x.nama && Object.keys(x.perSize).length; });
}

/** Daftar dokumen standar tersimpan, tiap dokumen bisa dilepas satuan. */
function lpRenderStandarDaftar_(urlGabungan){
  const wadah = document.getElementById("lp-standar-daftar");
  if(!wadah) return;
  const urls = String(urlGabungan || "").split(";").map(function(u){ return u.trim(); }).filter(Boolean);
  if(!urls.length){ wadah.innerHTML = ""; lpPerbaruiLabelStandar_(); return; }
  wadah.innerHTML = '<div class="lp-standar-lbl-simpan">Dokumen tersimpan</div>' +
    urls.map(function(u, i){
      return '<div class="lp-standar-item" data-url="' + rjdEscapeHtml_(u) + '">' +
        '<a href="' + u + '" rel="noopener" target="_blank">&#128196; Dokumen ' + (i + 1) + '</a>' +
        '<button class="lp-standar-hapus" onclick="lpHapusStandar(this)" title="Lepas dokumen ini" type="button">&#10005;</button>' +
      '</div>';
    }).join("");
  lpPerbaruiLabelStandar_();
}

/** Lepas 1 dokumen (file di Drive TIDAK dihapus -- cuma tautannya dilepas). */
function lpHapusStandar(btn){
  const item = btn.closest(".lp-standar-item");
  if(item) item.remove();
  const wadah = document.getElementById("lp-standar-daftar");
  if(wadah && !wadah.querySelectorAll(".lp-standar-item").length) wadah.innerHTML = "";
  lpPerbaruiLabelStandar_();
}

function lpPerbaruiLabelStandar_(){
  const lbl = document.getElementById("lp-standar-lbl-file");
  if(!lbl) return;
  const ada = document.querySelectorAll("#lp-standar-daftar .lp-standar-item").length;
  lbl.textContent = ada
    ? "Tambah dokumen (yang tersimpan di atas TETAP ada)"
    : "Unggah dokumen (PDF/gambar, boleh lebih dari satu)";
}

function lpTampilkanEmailSlot(nomor){
  document.getElementById("lp-profil-email" + nomor + "-wrap").classList.remove("hidden");
  document.getElementById("lp-profil-tambah-email" + nomor + "-btn").classList.add("hidden");
  if(nomor === 2){
    const btn3 = document.getElementById("lp-profil-tambah-email3-btn");
    if(btn3) btn3.classList.remove("hidden");
  }
  document.getElementById("lp-profil-email" + nomor).focus();
}

async function lpSimpanProfil(){
  const btn = document.getElementById("lp-profil-simpan-btn");
  const statusEl = document.getElementById("lp-profil-status");
  btn.disabled = true;
  statusEl.textContent = "Menyimpan...";

  // Dokumen standar dibaca jadi base64 dulu -- makanya fungsi ini async.
  // Dikirim TERPISAH dari daftar yang dipertahankan supaya klien bisa
  // menghapus 1 dokumen tanpa mengunggah ulang sisanya.
  let standarFileList = [];
  try {
    const fEl = document.getElementById("lp-standar-file");
    standarFileList = await ofBacaBanyakFileSebagaiBase64_(fEl ? fEl.files : null);
  } catch(errFile) {
    btn.disabled = false;
    statusEl.textContent = "Gagal membaca file: " + (errFile.message || errFile);
    return;
  }

  const payload = {
    alamat: document.getElementById("lp-profil-alamat").value.trim(),
    kontakPerson: document.getElementById("lp-profil-kontak").value.trim(),
    telepon: document.getElementById("lp-profil-telepon").value.trim(),
    email: document.getElementById("lp-profil-email").value.trim()
  };
  const email2El = document.getElementById("lp-profil-email2");
  if(email2El) payload.email2 = email2El.value.trim(); // cuma dikirim kalau field-nya lagi ditampilkan
  const email3El = document.getElementById("lp-profil-email3");
  if(email3El) payload.email3 = email3El.value.trim();

  const catStdEl = document.getElementById("lp-standar-catatan");
  if(catStdEl) payload.standarCatatan = catStdEl.value.trim();
  payload.standarFileList = standarFileList;
  payload.sizeChartDefault = lpBacaSCKlien_();
  payload.standarUrlDipertahankan = Array.prototype.slice
    .call(document.querySelectorAll("#lp-standar-daftar .lp-standar-item"))
    .map(function(el){ return el.dataset.url || ""; })
    .filter(Boolean)
    .join("; ");

  const body = { idToken: lpIdTokenUniversal_(), action: "updateProfilKlien", payload: payload };
  if(window.LP_ROLE === "internal" && window.LP_PROFIL_ID_KLIEN_SAAT_INI){
    body.idKlien = window.LP_PROFIL_ID_KLIEN_SAAT_INI;
  }

  fetch(lpApiUrlUniversal_(), { method: "POST", body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(data){
      btn.disabled = false;
      statusEl.textContent = data.success ? "Tersimpan." : (data.error || "Gagal menyimpan.");
      if(data.success){
        // Muat ulang profil supaya dokumen yang baru diunggah langsung muncul
        // di daftar & input file kembali kosong (kalau tidak, menekan Simpan
        // dua kali akan mengunggah file yang sama untuk kedua kalinya).
        setTimeout(function(){ statusEl.textContent = ""; }, 3000);
        lpFetchProfilDanOrderan(window.LP_PROFIL_ID_KLIEN_SAAT_INI || null);
      }
    })
    .catch(function(){
      btn.disabled = false;
      statusEl.textContent = "Gagal menghubungi server.";
    });
}

const LP_ORDERAN_STATUS_BADGE_CLASS = {
  "Pending": "lp-badge-dp",
  "Menunggu Verifikasi Klien Baru": "lp-badge-dp",
  "Disetujui": "lp-badge-lunas",
  "Ditolak": "lp-badge-belum",
  "Revisi Diminta": "lp-badge-dp"
};

/** Read-only -- riwayat Order Request klien (Form Order), TANPA aksi edit/approve/reject (itu wewenang admin lewat Dashboard). */

/* ============ BACA FILE & KUMPUL ITEM (dipakai BERSAMA) ============
   Dipindah dari cabang order ke blok global supaya modal "Ajukan Order Baru"
   di Portal Klien bisa ikut meng-upload Foto Desain. Tanpa ini, modal cuma
   bisa kirim teks -- padahal buat order BARU, foto desain itu penting.
   (Beda dengan modal Edit, di mana fotonya sudah ada di Drive dan tinggal
   dibawa maju oleh backend lewat pencocokan ID Baris.) */

/**
 * Baca 1 File jadi base64 (dipakai buat upload gambar desain & file lainnya).
 * Batas 8MB per file -- di atas itu ditolak di sisi browser (biar nggak
 * bikin payload POST kegedean / lemot upload-nya di koneksi klien).
 */
function ofBacaFileSebagaiBase64_(file){
  return new Promise(function(resolve, reject){
    if(!file){ resolve(null); return; }
    if(file.size > 8 * 1024 * 1024){
      reject(new Error("Ukuran file '" + file.name + "' terlalu besar (maks 8MB)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = function(){
      const base64 = String(reader.result).split(",")[1] || "";
      resolve({ base64: base64, namaFile: file.name, mimeType: file.type });
    };
    reader.onerror = function(){ reject(new Error("Gagal membaca file '" + file.name + "'.")); };
    reader.readAsDataURL(file);
  });
}

/**
 * Baca BANYAK file sekaligus (dari <input multiple>) jadi array base64.
 * Dipakai buat Foto Desain (per item) & File Lainnya (level pengajuan) --
 * keduanya boleh pilih lebih dari 1 file.
 */
async function ofBacaBanyakFileSebagaiBase64_(fileList){
  const hasil = [];
  if(!fileList) return hasil;
  for(let i = 0; i < fileList.length; i++){
    const data = await ofBacaFileSebagaiBase64_(fileList[i]);
    if(data) hasil.push(data);
  }
  return hasil;
}

/**
 * Cek kartu ITEM yang isinya SETENGAH JADI, SEBELUM dikirim.
 *
 * Kenapa perlu: ofKumpulkanItemsAsync membuang baris warna yang Artikel atau
 * Warna-nya kosong (`if(!artikel || !warna) continue`). Itu benar sebagai
 * aturan, TAPI dilakukan DIAM-DIAM -- pengguna mengisi ukuran untuk 1 item,
 * lupa mengisi nama warnanya, menekan Kirim, dan item itu HILANG tanpa satu
 * pun pesan. Kejadian nyata: order 2 item (Koko Lengan Panjang & Pendek) cuma
 * 1 yang tersimpan.
 *
 * Kartu yang BENAR-BENAR KOSONG (tidak ada artikel, warna, maupun qty)
 * sengaja dilewati tanpa keluhan -- itu kartu sisa yang belum diisi, wajar
 * ada dan tidak perlu memblokir pengiriman.
 *
 * @return array pesan masalah. Kosong = aman dikirim.
 */
function ofCekItemBelumLengkap_(containerId){
  const wadah = containerId ? document.getElementById(containerId) : document;
  if(!wadah) return [];
  const masalah = [];

  Array.prototype.slice.call(wadah.querySelectorAll(".of-item-card")).forEach(function(card, i){
    const artikel = (card.querySelector(".of-f-artikel").value || "").trim();
    const bloks = Array.prototype.slice.call(card.querySelectorAll(".of-warna-blok"));

    let adaWarna = false, adaQty = false;
    bloks.forEach(function(b){
      const wn = (b.querySelector(".of-f-warna").value || "").trim();
      if(wn) adaWarna = true;
      b.querySelectorAll(".of-f-size").forEach(function(inp){
        if(Number(inp.value) > 0) adaQty = true;
      });
    });

    // Kartu kosong total -> abaikan, bukan masalah.
    if(!artikel && !adaWarna && !adaQty) return;

    const label = "ITEM #" + (i + 1) + (artikel ? ' "' + artikel + '"' : "");
    if(!artikel){ masalah.push(label + ": Artikel belum diisi"); return; }
    if(!bloks.length){ masalah.push(label + ": belum ada baris warna"); return; }
    if(!adaWarna){ masalah.push(label + ": nama Warna belum diisi"); return; }
    if(!adaQty){ masalah.push(label + ": jumlah (qty) ukuran belum diisi"); return; }

    // Ada warna terisi TAPI ada juga baris warna yang kosong -> baris itu akan
    // dibuang. Diberi tahu, bukan didiamkan.
    const kosong = bloks.filter(function(b){ return !(b.querySelector(".of-f-warna").value || "").trim(); });
    if(kosong.length){
      masalah.push(label + ": ada " + kosong.length + " baris warna tanpa nama -- isi namanya atau hapus barisnya");
    }
  });

  return masalah;
}

async function ofKumpulkanItemsAsync(containerId){
  const items = [];
  // containerId opsional -- kalau kosong, ambil semua .of-item-card di halaman
  // (perilaku lama halaman /p/order.html). Kalau diisi, dibatasi ke container
  // itu saja -- dipakai modal "Ajukan Order Baru" di Portal Klien, biar nggak
  // ikut menyapu item milik modal/halaman lain yang kebetulan ada di DOM.
  const wadah = containerId ? document.getElementById(containerId) : document;
  if(!wadah) return items;
  const cards = Array.prototype.slice.call(wadah.querySelectorAll(".of-item-card"));
  for(let i = 0; i < cards.length; i++){
    const card = cards[i];
    const brand = card.querySelector(".of-f-brand").value.trim();
    const artikel = card.querySelector(".of-f-artikel").value.trim();
    const style = card.querySelector(".of-f-style").value.trim();
    // .of-f-preset kini menyimpan MODE saja ("" = huruf, "Anak 0-12" = angka).
    // Daftar ukuran aktif dibaca dari centang lewat ofSizeAktif_.
    const presetAngka = !!OF_PRESET_ANGKA[card.querySelector(".of-f-preset").value];

    // Catatan & Foto Desain sekarang milik ITEM (style), bukan per warna --
    // dibaca SEKALI di sini lalu dipakai untuk SEMUA baris warna item ini.
    // Kolom di sheet tetap per baris, jadi format kiriman ke backend TIDAK
    // berubah sama sekali (1 baris = 1 warna) -- nol perubahan skema.
    const catatanItemNilai = (function(){
      const el = card.querySelector(".of-f-catatanitem");
      return el ? el.value.trim() : "";
    })();
    const fileItem = card.querySelector(".of-f-gambar");
    const gambarListItem = await ofBacaBanyakFileSebagaiBase64_(fileItem ? fileItem.files : null);

    // Foto lama yang MASIH tersisa di layar (yang dihapus klien sudah lenyap
    // dari DOM). Backend menggabungkannya dengan hasil upload baru -- itu yang
    // bikin foto bisa ditambah & dikurangi satuan, bukan ganti-semua.
    // Komposisi kain berlaku untuk SELURUH item -- dibaca sekali, disalin ke
    // semua baris warna oleh backend.
    const komposisiItem = ofBacaKomposisi_(card);
    const aksesorisItem = ofBacaAksesoris_(card);
    const sizeChartItem = ofBacaSizeChart_(card);

    const gambarLamaDipertahankan = Array.prototype.slice
      .call(card.querySelectorAll(".of-f-fotolama .of-foto-item"))
      .map(function(el){ return el.dataset.url || ""; })
      .filter(Boolean)
      .join("; ");

    // Tiap WARNA dalam item ini jadi 1 entry (brand/artikel/style diulang) --
    // format baris yang sudah diterima backend (1 baris = 1 warna).
    const warnaBloks = Array.prototype.slice.call(card.querySelectorAll(".of-warna-blok"));
    for(let j = 0; j < warnaBloks.length; j++){
      const blok = warnaBloks[j];
      const warna = blok.querySelector(".of-f-warna").value.trim();
      if(!artikel || !warna) continue; // divalidasi terpisah di bawah
      // Kode kain per slot -> [{slot, kode}]. Yang kosong tidak dikirim.
      const bahanWarna = Array.prototype.slice.call(blok.querySelectorAll(".of-f-kain"))
        .map(function(inp){ return { slot: inp.dataset.slot || "", kode: (inp.value || "").trim() }; })
        .filter(function(b){ return b.slot && b.kode; });

      // Kumpulkan qty per size.
      const sizeQty = {};
      const angkaParts = [];
      blok.querySelectorAll(".of-f-size").forEach(function(inp){
        const val = Number(inp.value);
        if(!(val > 0)) return;
        if(presetAngka){
          // Ukuran angka (1..12) -> nggak ada kolom di sheet, serialisasi ke
          // Detail All Size: "1:5; 2:10; ...". Backend approve mecah ini otomatis.
          angkaParts.push(inp.dataset.size + ":" + val);
        } else {
          sizeQty[inp.dataset.size] = val;
        }
      });

      items.push({
        // idBaris WAJIB dibawa buat mode EDIT: backend rewriteOrderRequest_
        // memakainya untuk mengenali baris LAMA, lalu membawa maju HARGA (diisi
        // admin, nggak pernah dikirim klien) dan URL FOTO lama kalau nggak ada
        // upload baru. Kalau hilang, tiap klien edit, harga & foto ikut terhapus.
        // Untuk order BARU nilainya kosong, jadi aman dipakai bersama.
        idBaris: blok.dataset.idbaris || "",
        brand: brand,
        artikel: artikel,
        style: style,
        warna: warna,
        bahan: bahanWarna,
        komposisiKain: komposisiItem,
        aksesoris: aksesorisItem,
        sizeChart: sizeChartItem,
        sizeQty: sizeQty,
        detailAllSize: presetAngka ? angkaParts.join("; ") : "",
        catatanItem: catatanItemNilai,
        // harga cuma ada di Modal Proofing (staff). Dikirim apa adanya; backend
        // yang memutuskan menerimanya atau tidak berdasarkan status pengirim.
        harga: (function(){ var h = blok.querySelector(".of-f-harga"); return h ? h.value : undefined; })(),
        gambarDesainList: gambarListItem,
        gambarLamaDipertahankan: gambarLamaDipertahankan
      });
    }
  }
  return items;
}

/**
 * Ambil Target Tanggal Kirim dalam format ISO ("2026-08-22") buat <input type="date">.
 *
 * KENAPA ADA FALLBACK: backend ngirim DUA bentuk -- targetTanggalKirim (teks
 * Indonesia "22 Agustus 2026", buat tampilan) dan targetTanggalKirimIso (buat
 * input date). Tapi field ISO itu BARU. Kalau template ini dipasang duluan
 * sebelum backend-nya ter-deploy, field ISO undefined -> input date jadi KOSONG
 * dan tanggal yang sudah diisi klien kelihatan hilang.
 * Jadi frontend nerjemahin sendiri teks Indonesianya kalau ISO nggak ada --
 * halaman tetap benar apa pun urutan deploy-nya.
 */
var RJD_BULAN_INDO = ["januari","februari","maret","april","mei","juni","juli","agustus","september","oktober","november","desember"];
function rjdTanggalKeIso_(g){
  if(!g) return "";
  if(g.targetTanggalKirimIso) return g.targetTanggalKirimIso;

  var teks = String(g.targetTanggalKirim || "").trim();
  if(!teks) return "";

  // sudah ISO?
  var m = teks.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return m[1] + "-" + ("0"+m[2]).slice(-2) + "-" + ("0"+m[3]).slice(-2);

  // "22 Agustus 2026" / "22 Agu 2026"
  m = teks.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if(m){
    var nama = m[2].toLowerCase();
    for(var i=0;i<RJD_BULAN_INDO.length;i++){
      var b = RJD_BULAN_INDO[i];
      if(b === nama || b.slice(0,3) === nama.slice(0,3)){
        return m[3] + "-" + ("0"+(i+1)).slice(-2) + "-" + ("0"+m[1]).slice(-2);
      }
    }
  }

  // "22/08/2026" atau "22-08-2026"
  m = teks.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return m[3] + "-" + ("0"+m[2]).slice(-2) + "-" + ("0"+m[1]).slice(-2);

  return "";
}

/* ============ AUTO-GROW TEXTAREA (dipakai BERSAMA) ============
   WAJIB di blok global, BUKAN di cabang order. Fungsi ini dipanggil dari
   ofTambahItem/ofTambahWarna yang sekarang global -- kalau definisinya
   ketinggalan di cabang order, halaman tracking bakal kena
   "ReferenceError: rjdBindAutoGrowAll is not defined" pas modal Edit dibuka,
   dan render item BERHENTI di tengah jalan (forEach batal) -- gejalanya:
   cuma ITEM pertama yang muncul. Ini pernah kejadian, jangan diulang. */
/* Auto-grow textarea: tinggi kontainer mengikuti tinggi teks supaya area baca
   leluasa (nggak sempit/kecil terus). Dipasang ke:
   - textarea statis di form (di-bind saat DOMContentLoaded / setup)
   - textarea item dinamis (di-bind tiap ofTambahItem)
   Caranya: reset height ke auto lalu set ke scrollHeight tiap input. Ada
   tinggi minimum lewat CSS (min-height) biar nggak terlalu pendek pas kosong. */
function rjdAutoGrow(el){
  if(!el) return;
  el.style.height = "auto";
  el.style.height = (el.scrollHeight + 2) + "px";
}
function rjdBindAutoGrow(el){
  if(!el || el.dataset.autogrowBound) return;
  el.dataset.autogrowBound = "1";
  el.style.overflowY = "hidden";
  el.addEventListener("input", function(){ rjdAutoGrow(el); });
  // ukur sekali di awal (kalau sudah ada isinya, misal saat edit)
  requestAnimationFrame(function(){ rjdAutoGrow(el); });
}
function rjdBindAutoGrowAll(root){
  (root || document).querySelectorAll("textarea.rjd-autogrow").forEach(rjdBindAutoGrow);
}

/* ============ KOMPONEN FORM ORDER (dipakai BERSAMA) ============
   Dulu blok ini ada DI DALAM cabang <b:if> halaman order, jadi cuma bisa
   dipakai di /p/order.html. Dipindah ke blok GLOBAL supaya modal "Edit Order"
   di Portal Klien (cabang tracking) bisa pakai KOMPONEN YANG SAMA PERSIS --
   bukan tiruannya. Ini yang bikin form edit nggak akan pernah melenceng dari
   form order: satu kode, satu perilaku.
   CATATAN: class CSS-nya (.of-item-card, .of-warna-blok, dst) TETAP harus
   diduplikasi ke tiap cabang yang memakainya -- <b:if> mengisolasi CSS,
   bukan JS. */

// Preset ukuran form order. Key = label di dropdown, value = daftar size.
// "Anak 0-12" -> ukuran ANGKA anak (0..12; 0 = newborn). Angka ini TIDAK punya
// kolom di sheet (kolom baku cuma XS..5XL + All Size), jadi qty-nya diserialisasi
// ke kolom "Detail All Size" dengan format "0:qty; 1:qty; ..." (lihat
// OF_PRESET_ANGKA & ofKumpulkanItemsAsync). Backend approveOrderRequest_ sudah
// bisa mecah format itu jadi baris Detail PO otomatis -- jadi NOL perubahan backend.
// Preset = PINTASAN, bukan kurungan. Sejak ukuran bisa dicentang satu-satu,
// preset cuma mengisi centangnya -- kombinasi apa pun tetap bisa dibuat manual.
// S-L & S-2XL dihapus (jarang dipakai); S-3XL ditambahkan.
// Order LAMA yang memakai S-L/S-2XL tetap terbaca: saat diedit, centangnya
// diisi dari size yang BENAR-BENAR dipakai, bukan dari nama presetnya.
const OF_SIZE_PRESET = {
  "All Size": ["All Size"],
  "S-XL": ["S", "M", "L", "XL"],
  "S-3XL": ["S", "M", "L", "XL", "2XL", "3XL"],
  "XS-5XL": ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
  "Anak 0-12": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
};
// Ukuran huruf yang bisa dicentang satu-satu (punya kolom sendiri di sheet).
// Satuan dibatasi pilihan supaya penjumlahan lintas order tetap bisa dipercaya.
// Kalau ada satuan yang belum ada di sini, tambahkan di daftar ini saja --
// otomatis muncul di ketiga tempat (komposisi kain, aksesoris, kain dari klien).
const OF_SATUAN_KAIN = ["yds", "m", "cm", "roll", "kg", "pcs"];
const OF_SATUAN_AKSESORIS = ["pcs", "lusin", "gross", "m", "cm", "roll", "kg", "set"];

/**
 * Set nilai satuan pada <select>. Kalau nilai lamanya TIDAK ADA di daftar
 * (mis. order lama menyimpan "yard"), opsinya ditambahkan dulu -- kalau tidak,
 * setter-nya gagal diam-diam dan satuan lama berubah jadi default.
 */
function ofSetSatuan_(el, nilai){
  if(!el) return;
  const v = String(nilai || "").trim();
  if(!v) return;
  const ada = Array.prototype.slice.call(el.options).some(function(o){ return o.value === v; });
  if(!ada){
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    el.insertBefore(o, el.firstChild);
  }
  el.value = v;
}

/** Bangun <option> satuan; nilai lama yang tidak ada di daftar tetap dipertahankan. */
function ofOpsiSatuan_(terpilih, daftar){
  const list = daftar.slice();
  if(terpilih && list.indexOf(terpilih) === -1) list.unshift(terpilih);
  return list.map(function(u){
    return '<option value="' + u + '"' + (u === terpilih ? ' selected="selected"' : '') + '>' + u + '</option>';
  }).join("");
}

const OF_SIZE_CENTANG = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "All Size"];
// Preset yang size-nya ANGKA (nggak ada kolom di sheet -> lewat Detail All Size).
const OF_PRESET_ANGKA = { "Anak 0-12": true };

let OF_ITEM_COUNTER = 0;
// ---------- Item (Brand+Artikel+Style) dinamis, dengan Warna bersarang ----------
// 1 ITEM = kombinasi Brand+Artikel+Style + 1 pilihan Ukuran (dipakai bersama
// semua warna di item ini). Di dalam item ada >=1 WARNA, tiap warna punya qty
// per size + catatan + foto sendiri. Saat submit, tiap warna diratakan jadi
// 1 entry (brand/artikel/style diulang) -- persis format baris yang sudah
// diterima backend (1 baris = 1 warna).

let OF_WARNA_COUNTER = 0;

function ofTambahItem(containerId, prefill, opsi){
  OF_ITEM_COUNTER++;
  const id = "of-item-" + OF_ITEM_COUNTER;
  const wadahId = containerId || "of-items-container";
  const wrap = document.createElement("div");
  wrap.className = "of-item-card";
  wrap.id = id;
  wrap.innerHTML =
    '<div class="of-item-head"><b>ITEM #' + OF_ITEM_COUNTER + '</b>' +
      '<button class="of-item-remove" onclick="ofHapusItem(\'' + id + '\')" title="Hapus item ini" type="button">&#10005;</button></div>' +
    // Selektor artikel ditaruh PALING ATAS: alurnya pilih dulu, baru sisanya
    // terisi. Kalau di bawah Brand/Artikel, orang terlanjur mengetik manual
    // lalu autofill-nya jadi mubazir.
    '<div class="of-pilihartikel-wrap hidden">' +
      '<label style="display:block;margin:0">Isi dari artikel tersimpan (opsional)' +
        '<select class="of-f-pilihartikel" onchange="ofTerapkanArtikel(this)"></select></label>' +
      '<div class="of-pilihartikel-status"></div>' +
    '</div>' +
    '<div class="of-item-grid">' +
      '<label>Brand<input class="of-f-brand" placeholder="Nama brand" type="text"/></label>' +
      '<label>Artikel *<input class="of-f-artikel" placeholder="Nama produk/artikel" type="text"/></label>' +
      '<label>Style<input class="of-f-style" placeholder="misal: Regular Fit" type="text"/></label>' +
    '</div>' +
    '<label style="display:block;font-size:12.5px;font-weight:600;color:var(--ink-soft);margin:14px 0 6px">Ukuran *</label>' +
    // Preset jadi PINTASAN (mengisi centang), bukan satu-satunya cara memilih.
    // Keuntungan yang sering terlewat: ukuran yang aktif jadi TERLIHAT langsung,
    // tidak perlu disimpulkan dari nama presetnya.
    '<div class="of-size-pilih">' +
      '<div class="of-size-preset">' +
        Object.keys(OF_SIZE_PRESET).map(function(p){
          return '<button class="of-size-preset-btn" onclick="ofPakaiPreset(\'' + id + '\', \'' + p + '\')" type="button">' + p + '</button>';
        }).join("") +
      '</div>' +
      // Mode ANGKA (Anak 0-12) disembunyikan dari deretan centang: ukurannya
      // tidak punya kolom sendiri di sheet (lewat Detail All Size), jadi kalau
      // dicampur orang bisa mencentang "S" dan "5" sekaligus -- tidak berarti apa-apa.
      '<div class="of-size-cek of-f-sizecek-wrap">' +
        OF_SIZE_CENTANG.map(function(sz){
          return '<label class="of-size-cek-item"><input class="of-f-sizecek" onchange="ofGantiPreset(\'' + id + '\')" type="checkbox" value="' + sz + '"/><span>' + sz + '</span></label>';
        }).join("") +
      '</div>' +
      '<div class="of-size-mode-angka hidden">Mode ukuran ANAK (0-12) aktif. ' +
        '<button class="of-size-kembali" onclick="ofPakaiPreset(\'' + id + '\', \'\')" type="button">kembali ke ukuran huruf</button></div>' +
      // Menyimpan MODE saja ("" = huruf, "Anak 0-12" = angka). Ukuran huruf yang
      // aktif dibaca dari centang, bukan dari sini.
      '<input class="of-f-preset" type="hidden" value=""/>' +
    '</div>' +
    '<div class="of-komposisi-wrap">' +
      '<div class="of-komposisi-lbl">Komposisi Kain (opsional -- kain penyusun style ini &amp; konsumsi per pcs)</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-kmp-tabel">' +
        '<thead class="of-f-kmp-head"></thead>' +
        '<tbody class="of-f-komposisi"></tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="ofTambahBarisKomposisi_(\'' + id + '\')" type="button">+ Tambah Kain</button>' +
      '<div class="of-komposisi-hint">Tiap kain jadi kolom di tabel di bawah -- isi kode kainnya per warna.</div>' +
    '</div>' +
    // Tabel Warna diberi panel & label seperti Komposisi/Aksesoris/Size Chart.
    // Sebelumnya ia satu-satunya yang melayang tanpa panel -- jadi terlihat
    // lebih lebar dari tetangganya, dan satu-satunya bagian tanpa judul
    // (identitasnya cuma dari header kolom "Warna *").
    '<div class="of-aks-wrap of-warna-wrap">' +
      '<div class="of-warna-lbl-baris">' +
        '<div class="of-komposisi-lbl">Warna &amp; Jumlah Order *</div>' +
        // Tombol hanya muncul kalau item ini PUNYA kolom kain -- kalau tidak,
        // tombol "sembunyikan" untuk sesuatu yang tidak ada cuma membingungkan.
        '<button class="of-toggle-kain hidden" onclick="ofToggleKolomKain(\'' + id + '\')" type="button"></button>' +
      '</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-f-warnawrap">' +
        '<thead><tr class="of-f-matrixhead"></tr></thead>' +
      '</table></div>' +
      '<button class="of-add-warna-btn" onclick="ofTambahWarna(\'' + id + '\', null, ' + (opsi && opsi.harga ? '{harga:true}' : 'null') + ')" type="button">+ Tambah Warna</button>' +
    '</div>' +
    // Catatan & Foto Desain berlaku untuk SELURUH style (ITEM ini), bukan per
    // warna. Di lapangan detail model memang milik style-nya -- warna cuma
    // membedakan kain. Menaruhnya per warna memaksa mengetik hal yang sama
    // berulang kali (order 8 warna = 8 kotak catatan identik).
    '<div class="of-aks-wrap">' +
      '<div class="of-komposisi-lbl">Aksesoris (opsional -- kancing, resleting, label, dll)</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-aks-tabel">' +
        '<thead><tr>' +
          '<th class="of-th-warna">Aksesoris</th>' +
          '<th class="of-th-kmp-kons">Qty/pcs</th>' +
          '<th class="of-th-kmp-satuan">Satuan</th>' +
          '<th class="of-th-aks-ket">Keterangan</th>' +
          '<th></th>' +
        '</tr></thead>' +
        '<tbody class="of-f-aksesoris"></tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="ofTambahBarisAksesoris_(\'' + id + '\')" type="button">+ Tambah Aksesoris</button>' +
    '</div>' +
    '<div class="of-aks-wrap">' +
      '<div class="of-komposisi-lbl">Size Chart (opsional -- kosongkan kalau memakai standar artikel/klien)</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-sc-tabel">' +
        '<thead class="of-f-sc-head"></thead>' +
        '<tbody class="of-f-sizechart"></tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="ofTambahBarisSizeChart_(\'' + id + '\')" type="button">+ Tambah Ukuran</button>' +
      '<div class="of-komposisi-hint">Isi di sini otomatis jadi standar artikel setelah order disetujui.</div>' +
    '</div>' +
    '<div class="of-item-detail">' +
      // Urutan SENGAJA: Foto dulu, baru Catatan. Alur nyatanya klien mengunggah
      // foto acuan lebih dulu, lalu menuliskan keterangan tentang foto itu.
      '<div class="of-f-fotolama-wrap"></div>' +
      '<label style="display:block"><span class="of-f-gambar-lbl">Foto Desain (opsional, bisa pilih beberapa, maks 8MB/file)</span><input accept="image/*" class="of-f-gambar" multiple="multiple" type="file"/></label>' +
      '<label style="display:block;margin-top:12px">Catatan (opsional)<textarea class="of-f-catatanitem rjd-autogrow" placeholder="Detail model style ini -- jenis kain, ukuran non-standar, detail desain (kancing, resleting), dll" rows="2"></textarea></label>' +
    '</div>';
  document.getElementById(wadahId).appendChild(wrap);
  // Flag harga disimpan di dataset supaya ofRenderSizeRowUntukItem_ tahu perlu
  // membuat kolom Harga di header WALAU belum ada satu pun baris warna.
  if(opsi && opsi.harga) wrap.dataset.harga = "1";
  const selArtikel = wrap.querySelector(".of-f-pilihartikel");
  if(selArtikel) ofIsiPilihanArtikel_(selArtikel);
  // Total per warna dihitung ulang lewat DELEGASI (1 listener per ITEM), bukan
  // dipasang per input -- input size dibuat ulang tiap ganti preset, jadi
  // listener per input akan hilang/menumpuk.
  wrap.querySelector(".of-f-warnawrap").addEventListener("input", function(e){
    if(e.target && e.target.classList && e.target.classList.contains("of-f-size")){
      const b = e.target.closest(".of-warna-blok");
      if(b) ofHitungTotalWarna_(b);
    }
  });
  // Mode & centang ukuran: dari prefill kalau ada, kalau tidak biarkan kosong
  // sampai pengguna memilih.
  if(prefill && prefill.preset && OF_PRESET_ANGKA[prefill.preset]){
    ofPakaiPreset(id, prefill.preset);
  } else if(prefill && prefill.sizeDipakai && prefill.sizeDipakai.length){
    wrap.querySelectorAll(".of-f-sizecek").forEach(function(cb){
      cb.checked = prefill.sizeDipakai.indexOf(cb.value) !== -1;
    });
    ofTandaiPresetAktif_(wrap);
  }
  if(prefill){
    wrap.querySelector(".of-f-brand").value = prefill.brand || "";
    wrap.querySelector(".of-f-artikel").value = prefill.artikel || "";
    wrap.querySelector(".of-f-style").value = prefill.style || "";
    // Catatan & foto DULU tersimpan per warna -> digabung ke tingkat ITEM.
    // ofGabungCatatanWarna_ menjaga catatan yang berbeda antar warna supaya
    // tidak ada yang hilang saat order lama dibuka & disimpan ulang.
    wrap.querySelector(".of-f-catatanitem").value = ofGabungCatatanWarna_(prefill.warnaList);
    ofIsiFotoLama_(wrap, ofGabungFotoWarna_(prefill.warnaList));
    // Komposisi diisi DULU -- kolom kain di tabel matriks dibangun dari sini,
    // jadi harus ada sebelum baris warna dibuat.
    ofRenderKomposisi_(wrap, prefill.komposisiKain);
    ofRenderAksesoris_(wrap, prefill.aksesoris);
    ofRenderSizeChart_(wrap, prefill.sizeChart);
    (prefill.warnaList || [{}]).forEach(function(w){ ofTambahWarna(id, w, opsi); });
  } else {
    ofTambahWarna(id, null, opsi); // tiap item baru mulai dengan 1 warna
  }
  rjdBindAutoGrowAll(wrap);
  return id;
}

function ofHapusItem(id){
  const el = document.getElementById(id);
  if(el) el.remove();
}

// Tambah 1 blok Warna ke dalam item. Kotak size-nya ngikut Ukuran item (kalau
// belum dipilih, kosong -- muncul begitu Ukuran dipilih via ofGantiPreset).
function ofTambahWarna(itemId, prefill, opsi){
  OF_WARNA_COUNTER++;
  const wId = "of-warna-" + OF_WARNA_COUNTER;
  const card = document.getElementById(itemId);
  const wrap = card.querySelector(".of-f-warnawrap");
  // <tbody> (BUKAN div) supaya tiap warna jadi 1 baris tabel matriks TAPI
  // kontrak kelasnya (.of-warna-blok + .of-f-*) tetap SAMA PERSIS -- itu yang
  // bikin fungsi pengumpul data (ofKumpulkanItems) NGGAK PERLU DIUBAH sama
  // sekali. 1 <tbody> boleh berisi >1 <tr>, jadi baris detail (catatan & foto)
  // tetap berada DI DALAM blok warna yang sama.
  const blok = document.createElement("tbody");
  blok.className = "of-warna-blok of-f-warnablok";
  blok.id = wId;
  blok.innerHTML =
    '<tr class="of-wr-main">' +
      '<td class="of-td-warna"><input class="of-f-warna" placeholder="misal: Hitam" type="text"/></td>' +
      // kolom size disisipkan ofRenderSizeRowUntukItem_, mengikuti preset Ukuran
      '<td class="of-td-total of-f-totalwarna">0</td>' +
      // Harga HANYA muncul kalau diminta (opsi.harga) -- dipakai Modal Proofing
      // di Dashboard. Klien nggak pernah lihat/isi harga; itu wewenang admin,
      // dan backend juga cuma menghormati harga kalau pengirimnya staff.
      (opsi && opsi.harga
        ? '<td class="of-td-harga"><input class="of-f-harga" min="0" placeholder="0" type="number"/></td>'
        : '') +
      '<td class="of-td-aksi">' +
        '<button class="of-warna-remove" onclick="ofHapusWarna(\'' + wId + '\')" title="Hapus warna ini" type="button">&#10005;</button>' +
      '</td>' +
    '</tr>';
  wrap.appendChild(blok);
  if(prefill){
    // idBaris disimpan di dataset -- dipakai backend rewriteOrderRequest_ buat
    // ngenalin baris LAMA (biar Harga & Foto-nya dibawa maju). Warna BARU
    // hasil "+ Tambah Warna" nggak punya ini -> dianggap baris baru.
    if(prefill.idBaris) blok.dataset.idbaris = prefill.idBaris;
    blok.querySelector(".of-f-warna").value = prefill.warna || "";
    // Kode kain diisi SETELAH kolom dibuat ofRenderSizeRowUntukItem_ di bawah,
    // karena kolomnya bergantung pada komposisi item.
    blok.dataset.bahanprefill = JSON.stringify(prefill.bahan || []);
    var inpHarga = blok.querySelector(".of-f-harga");
    if(inpHarga) inpHarga.value = (prefill.harga != null ? prefill.harga : "");
  }
  ofRenderSizeRowUntukItem_(card); // isi kolom size warna sesuai ukuran item
  if(prefill && prefill.sizeQty){
    blok.querySelectorAll(".of-f-size").forEach(function(inp){
      const v = prefill.sizeQty[inp.dataset.size];
      if(v != null && v !== "") inp.value = v;
    });
    // WAJIB hitung ulang di sini: ofRenderSizeRowUntukItem_ di atas sudah
    // menghitung total SEBELUM nilai size diisi, jadi hasilnya 0. Baris warna
    // 1..n-1 kebetulan terkoreksi karena penambahan warna BERIKUTNYA memicu
    // render ulang seluruh kartu -- tapi warna TERAKHIR tidak pernah kebagian,
    // jadi totalnya nyangkut di 0 (kejadian nyata: 8 warna, cuma "Black" 0).
    ofHitungTotalWarna_(blok);
  }
  rjdBindAutoGrowAll(blok);
  return blok;
}

function ofHapusWarna(wId){
  const el = document.getElementById(wId);
  if(!el) return;
  const wrap = el.parentNode;
  el.remove();
  // Jangan biarkan item tanpa warna sama sekali -- minimal 1.
  if(wrap && wrap.querySelectorAll(".of-warna-blok").length === 0){
    const itemCard = wrap.closest(".of-item-card");
    if(itemCard) ofTambahWarna(itemCard.id);
  }
}

// Render ulang kotak size SEMUA warna dalam 1 item sesuai Ukuran yang dipilih.
// Nilai qty yang sudah diketik dipertahankan (biar ganti ukuran nggak ngosongin
// yang kebetulan size-nya masih sama).
/**
 * Gabungkan catatan yang DULU tersimpan per warna jadi 1 catatan per STYLE.
 *
 * Kolom "Catatan Item" di SD Order Request tetap per BARIS (per warna) -- yang
 * berubah cuma cara form mengisinya: 1 nilai dipakai untuk semua warna dalam
 * ITEM yang sama. Jadi TIDAK ada perubahan skema & data lama tetap terbaca.
 *
 * PENGAMAN DATA LAMA: kalau order lama ternyata punya catatan BERBEDA antar
 * warna, semuanya digabung dengan label warnanya -- BUKAN diambil salah satu.
 * Kalau cuma diambil yang pertama, catatan warna lain akan terhapus diam-diam
 * begitu order itu disimpan ulang.
 */
function ofGabungCatatanWarna_(warnaList){
  const unik = [];
  (warnaList || []).forEach(function(w){
    const t = (w.catatanItem || "").trim();
    if(!t) return;
    const f = unik.filter(function(u){ return u.teks === t; })[0];
    if(f) f.warna.push(w.warna || "-");
    else unik.push({ teks: t, warna: [w.warna || "-"] });
  });
  if(!unik.length) return "";
  if(unik.length === 1) return unik[0].teks;
  return unik.map(function(u){ return "[" + u.warna.join(", ") + "] " + u.teks; }).join("\n");
}

/** Kumpulkan URL foto dari semua warna jadi 1 daftar (dedup, format "a; b"). */
function ofGabungFotoWarna_(warnaList){
  const urls = [];
  (warnaList || []).forEach(function(w){
    String(w.urlGambarDesain || "").split(";").forEach(function(u){
      const t = u.trim();
      if(t && urls.indexOf(t) === -1) urls.push(t);
    });
  });
  return urls.join("; ");
}

/**
 * Tampilkan foto yang SUDAH tersimpan sebagai kartu yang bisa dihapus satuan.
 *
 * Sebelumnya foto lama cuma ditampilkan sebagai thumbnail, dan mengunggah file
 * baru MENGGANTI seluruhnya -- jadi menghapus 1 foto dari 3 berarti harus
 * mengunggah ulang 2 yang lain. Sekarang tiap foto punya tombol hapus sendiri,
 * dan upload baru DITAMBAHKAN, bukan mengganti.
 *
 * Yang dikirim ke backend: daftar URL yang MASIH tersisa di layar
 * (`gambarLamaDipertahankan`) + file yang baru diunggah. Foto yang dihapus
 * cukup tidak ikut terkirim.
 *
 * CATATAN: menghapus di sini TIDAK menghapus file dari Google Drive -- cuma
 * melepas tautannya dari order. File aslinya tetap ada di Drive, jadi salah
 * hapus masih bisa dipulihkan manual.
 */
function ofIsiFotoLama_(card, urlGabungan){
  const wadah = card.querySelector(".of-f-fotolama-wrap");
  if(!wadah) return;
  const urls = String(urlGabungan || "").split(";").map(function(u){ return u.trim(); }).filter(Boolean);
  if(!urls.length){ wadah.innerHTML = ""; ofPerbaruiLabelFoto_(card); return; }

  wadah.innerHTML = '<div class="of-foto-lama">' +
      '<div class="of-foto-lama-lbl">Foto tersimpan</div>' +
      '<div class="of-foto-grid of-f-fotolama">' +
        urls.map(function(u){
          const id = rjdDriveFileId_(u);
          const isi = id
            ? '<img alt="Foto Desain" loading="lazy" src="https://drive.google.com/thumbnail?id=' + id + '&amp;sz=w200"/>'
            : '<span class="of-foto-nolink">file</span>';
          return '<div class="of-foto-item" data-url="' + rjdEscapeHtml_(u) + '">' +
            '<a href="' + u + '" rel="noopener" target="_blank" title="Buka foto">' + isi + '</a>' +
            '<button class="of-foto-hapus" onclick="ofHapusFotoLama(this)" title="Lepas foto ini dari order" type="button">&#10005;</button>' +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>';
  ofPerbaruiLabelFoto_(card);
}

/** Lepas 1 foto lama dari order (tidak menghapus file di Drive). */
function ofHapusFotoLama(btn){
  const item = btn.closest(".of-foto-item");
  if(!item) return;
  const kartu = btn.closest(".of-item-card");
  const grid = item.parentNode;
  item.remove();
  // Kalau foto tersimpan habis semua, hilangkan seluruh kotaknya.
  if(grid && !grid.querySelectorAll(".of-foto-item").length){
    const kotak = grid.closest(".of-foto-lama");
    if(kotak) kotak.remove();
  }
  if(kartu) ofPerbaruiLabelFoto_(kartu);
}

/** Label input file menyesuaikan: "Tambah foto" kalau sudah ada foto tersimpan. */
function ofPerbaruiLabelFoto_(card){
  const lbl = card.querySelector(".of-f-gambar-lbl");
  if(!lbl) return;
  const masihAda = card.querySelectorAll(".of-f-fotolama .of-foto-item").length;
  lbl.textContent = masihAda
    ? "Tambah foto (opsional -- foto tersimpan di atas TETAP ada)"
    : "Foto Desain (opsional, bisa pilih beberapa, maks 8MB/file)";
}

/**
 * ============ JADWAL KIRIM BERTAHAP (komponen bersama) ============
 * Dipakai 4 tempat: halaman Form Order, Modal Order Baru, Modal Edit, Modal
 * Proofing. Satu salinan di blok global -- <b:if> mengisolasi CSS, bukan JS.
 *
 * Kenapa ada: dari worksheet klien, 1 order sering dikirim bertahap (Part 1
 * 15 Agustus 120 pcs, Part 2 20 Agustus 100 pcs, deadline akhir 24 Agustus).
 * Sebelumnya sistem cuma menyimpan SATU tanggal, jadi tahapannya cuma hidup di
 * chat dan penjadwalan produksi meleset.
 *
 * "Target Tanggal Kirim" TIDAK diganti -- dia tetap deadline AKHIR & acuan
 * semua fungsi lama. Ini tambahan, jadi order sederhana boleh mengosongkannya.
 */
function ofTambahBarisJadwal_(containerId, prefill){
  const wadah = document.getElementById(containerId);
  if(!wadah) return;
  const baris = document.createElement("div");
  baris.className = "of-jadwal-baris";
  baris.innerHTML =
    '<input class="of-f-jadwal-tgl" type="date"/>' +
    '<input class="of-f-jadwal-qty" min="0" placeholder="qty" type="number"/>' +
    '<input class="of-f-jadwal-ket" placeholder="keterangan (mis. Part 1)" type="text"/>' +
    '<button class="of-jadwal-hapus" onclick="ofHapusBarisJadwal(this)" title="Hapus tahap ini" type="button">&#10005;</button>';
  wadah.appendChild(baris);
  if(prefill){
    baris.querySelector(".of-f-jadwal-tgl").value = prefill.tanggal || "";
    baris.querySelector(".of-f-jadwal-qty").value = (prefill.qty ? prefill.qty : "");
    baris.querySelector(".of-f-jadwal-ket").value = prefill.keterangan || "";
  }
}

function ofHapusBarisJadwal(btn){
  const b = btn.closest(".of-jadwal-baris");
  if(b) b.remove();
}

/** Isi ulang daftar tahap dari data backend (array {tanggal,qty,keterangan}). */
function ofRenderJadwalKirim_(containerId, daftar){
  const wadah = document.getElementById(containerId);
  if(!wadah) return;
  wadah.innerHTML = "";
  (daftar || []).forEach(function(j){ ofTambahBarisJadwal_(containerId, j); });
}

/**
 * Baca tahap-tahap yang terisi. Baris yang KOSONG SEMUA diabaikan diam-diam
 * (orang sering menambah baris lalu batal mengisinya). Baris yang terisi
 * SEBAGIAN tetap dikirim -- lebih baik tersimpan apa adanya daripada hilang
 * tanpa pemberitahuan.
 */
function ofKumpulkanJadwalKirim_(containerId){
  const wadah = document.getElementById(containerId);
  if(!wadah) return [];
  return Array.prototype.slice.call(wadah.querySelectorAll(".of-jadwal-baris"))
    .map(function(b){
      return {
        tanggal: (b.querySelector(".of-f-jadwal-tgl").value || "").trim(),
        qty: Number(b.querySelector(".of-f-jadwal-qty").value) || 0,
        keterangan: (b.querySelector(".of-f-jadwal-ket").value || "").trim()
      };
    })
    .filter(function(j){ return j.tanggal || j.qty || j.keterangan; });
}

/**
 * ============ KOMPOSISI KAIN (per STYLE) ============
 * Dari worksheet klien: 1 style disusun beberapa SLOT kain (Brokat, Furing,
 * Lapis, Tile) dengan konsumsi per pcs yang SAMA untuk semua warna. Yang beda
 * antar warna cuma KODE kainnya.
 *
 * Jadi konsumsi diisi SEKALI di sini (level ITEM), dan tiap slot otomatis jadi
 * KOLOM di tabel matriks -- tiap warna tinggal mengisi kode kainnya. Kalau
 * semuanya per warna, konsumsi harus diketik ulang tiap warna & rawan beda.
 *
 * Ini yang bikin datanya bisa DIHITUNG (kebutuhan kain = konsumsi x qty),
 * bukan cuma dicatat.
 */
function ofTambahBarisKomposisi_(itemId, prefill){
  const card = document.getElementById(itemId);
  if(!card) return;
  const wadah = card.querySelector(".of-f-komposisi");
  if(!wadah) return;
  // <tr> di tabel, bukan <div> bertumpuk -- supaya kolom size-nya sejajar
  // dengan tabel Warna x Size dan terbaca sebagai satu sistem yang sama.
  const baris = document.createElement("tr");
  baris.className = "of-komposisi-baris";
  baris.innerHTML =
    '<td class="of-td-kmp-nama"><input class="of-f-kmp-nama" placeholder="nama kain (mis. Brokat)" type="text"/></td>' +
    '<td class="of-td-kmp-kons"><input class="of-f-kmp-kons" min="0" placeholder="0" step="0.01" type="number"/></td>' +
    // Satuan jadi PILIHAN, bukan teks bebas: dulu "yds"/"yard"/"Yds" bisa
    // masuk sebagai tiga satuan berbeda, dan itu merusak penjumlahan kebutuhan
    // kain begitu datanya mau direkap lintas order.
    '<td class="of-td-kmp-satuan"><select class="of-f-kmp-satuan">' + ofOpsiSatuan_("yds", OF_SATUAN_KAIN) + '</select></td>' +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="ofHapusBarisKomposisi(this)" title="Hapus kain ini" type="button">&#10005;</button></td>';
  wadah.appendChild(baris);
  if(prefill){
    baris.querySelector(".of-f-kmp-nama").value = prefill.nama || "";
    baris.querySelector(".of-f-kmp-kons").value = (prefill.konsumsi ? prefill.konsumsi : "");
    ofSetSatuan_(baris.querySelector(".of-f-kmp-satuan"), prefill.satuan || "yds");
    baris.dataset.persizeprefill = JSON.stringify(prefill.perSize || {});
  }
  ofRenderKomposisiPerSize_(card);
  // Nama slot berubah -> kolom kain di tabel matriks ikut berubah.
  baris.querySelector(".of-f-kmp-nama").addEventListener("change", function(){
    ofRenderSizeRowUntukItem_(card);
  });
  ofRenderSizeRowUntukItem_(card);
}

/**
 * Kotak konsumsi PER SIZE di tiap baris komposisi, mengikuti preset Ukuran.
 * OPSIONAL -- konsumsi kain memang beda per size (XL lebih boros dari S), tapi
 * banyak order cukup memakai rata-rata. Kalau diisi, kebutuhan dihitung per
 * size; kalau kosong, rata-rata yang dipakai.
 */
function ofRenderKomposisiPerSize_(card){
  if(!card) return;
  const sizes = ofSizeAktif_(card);

  // Header tabel komposisi -- kolom size disisipkan antara Satuan dan Aksi.
  const head = card.querySelector(".of-f-kmp-head");
  if(head){
    head.innerHTML = '<th class="of-th-warna">Kain</th>' +
      '<th class="of-th-kmp-kons">Konsumsi/pcs</th>' +
      '<th class="of-th-kmp-satuan">Satuan</th>' +
      sizes.map(function(sz){ return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th></th>';
  }

  card.querySelectorAll(".of-komposisi-baris").forEach(function(b){
    // Nilai lama dipertahankan by NAMA SIZE, bukan posisi -- menghapus satu
    // size tidak boleh menggeser angka ke kolom yang salah.
    const lama = {};
    b.querySelectorAll(".of-f-kmp-sz").forEach(function(inp){
      if(inp.value) lama[inp.dataset.size] = inp.value;
    });
    let pf = {};
    if(b.dataset.persizeprefill){
      try { pf = JSON.parse(b.dataset.persizeprefill) || {}; } catch(e) { pf = {}; }
    }
    b.querySelectorAll(".of-td-kmp-sz").forEach(function(td){ td.remove(); });
    const anchor = b.querySelector(".of-td-aksi");
    sizes.forEach(function(sz){
      const v = lama[sz] != null ? lama[sz] : (pf[sz] != null ? pf[sz] : "");
      const td = document.createElement("td");
      td.className = "of-td-kmp-sz";
      td.innerHTML = '<input class="of-f-kmp-sz" data-size="' + rjdEscapeHtml_(sz) + '" min="0" placeholder="-" step="0.01" type="number" value="' + rjdEscapeHtml_(String(v)) + '"/>';
      b.insertBefore(td, anchor);
    });
  });
}

function ofHapusBarisKomposisi(btn){
  const card = btn.closest(".of-item-card");
  const b = btn.closest(".of-komposisi-baris");
  if(b) b.remove();
  if(card) ofRenderSizeRowUntukItem_(card);
}

/** Baca komposisi 1 ITEM -> [{nama, konsumsi, satuan}]. Baris tanpa nama diabaikan. */
function ofBacaKomposisi_(card){
  if(!card) return [];
  return Array.prototype.slice.call(card.querySelectorAll(".of-komposisi-baris"))
    .map(function(b){
      return {
        nama: (b.querySelector(".of-f-kmp-nama").value || "").trim(),
        konsumsi: Number(b.querySelector(".of-f-kmp-kons").value) || 0,
        satuan: (b.querySelector(".of-f-kmp-satuan").value || "yds").trim(),
        perSize: (function(){
          const o = {};
          b.querySelectorAll(".of-f-kmp-sz").forEach(function(inp){
            const v = Number(inp.value);
            if(v > 0) o[inp.dataset.size] = v;
          });
          return o;
        })()
      };
    })
    .filter(function(k){ return k.nama; });
}

function ofRenderKomposisi_(card, daftar){
  if(!card) return;
  const wadah = card.querySelector(".of-f-komposisi");
  if(!wadah) return;
  wadah.innerHTML = "";
  (daftar || []).forEach(function(k){ ofTambahBarisKomposisi_(card.id, k); });
}

/**
 * ============ AKSESORIS (per ITEM) & KAIN DARI KLIEN (per pengajuan) ============
 * Dua daftar berulang, pola sama dengan Jadwal Kirim & Komposisi Kain.
 *
 * Kain Dari Klien penting khusus untuk CMT/maklon: selama ini berapa kain yang
 * benar-benar dikirim klien cuma ada di chat & surat jalan mereka. Lantai
 * produksi tidak punya rujukan resmi, jadi selisih antara kain diterima vs
 * kebutuhan baru ketahuan saat kainnya kurang di tengah produksi.
 */
function ofTambahBarisAksesoris_(itemId, prefill){
  const card = document.getElementById(itemId);
  if(!card) return;
  const wadah = card.querySelector(".of-f-aksesoris");
  if(!wadah) return;
  // <tr>, sebahasa dengan Komposisi & Size Chart. Placeholder dipendekkan
  // karena kolomnya sudah punya header -- "nama aksesoris (mis. Kancing)"
  // jadi mubazir kalau judul kolomnya sudah "Aksesoris".
  const b = document.createElement("tr");
  b.className = "of-aks-baris";
  b.innerHTML =
    '<td class="of-td-kmp-nama"><input class="of-f-aks-nama" placeholder="mis. Kancing" type="text"/></td>' +
    '<td class="of-td-kmp-kons"><input class="of-f-aks-qty" min="0" placeholder="0" step="0.01" type="number"/></td>' +
    '<td class="of-td-kmp-satuan"><select class="of-f-aks-satuan">' + ofOpsiSatuan_("pcs", OF_SATUAN_AKSESORIS) + '</select></td>' +
    '<td class="of-td-aks-ket"><input class="of-f-aks-ket" placeholder="opsional" type="text"/></td>' +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="ofHapusBarisAksesoris(this)" title="Hapus" type="button">&#10005;</button></td>';
  wadah.appendChild(b);
  if(prefill){
    b.querySelector(".of-f-aks-nama").value = prefill.nama || "";
    b.querySelector(".of-f-aks-qty").value = (prefill.qtyPerPcs ? prefill.qtyPerPcs : "");
    ofSetSatuan_(b.querySelector(".of-f-aks-satuan"), prefill.satuan || "pcs");
    b.querySelector(".of-f-aks-ket").value = prefill.keterangan || "";
  }
}

function ofHapusBarisAksesoris(btn){
  const b = btn.closest(".of-aks-baris");
  if(b) b.remove();
}

function ofBacaAksesoris_(card){
  if(!card) return [];
  return Array.prototype.slice.call(card.querySelectorAll(".of-aks-baris"))
    .map(function(b){
      return {
        nama: (b.querySelector(".of-f-aks-nama").value || "").trim(),
        qtyPerPcs: Number(b.querySelector(".of-f-aks-qty").value) || 0,
        satuan: (b.querySelector(".of-f-aks-satuan").value || "pcs").trim(),
        keterangan: (b.querySelector(".of-f-aks-ket").value || "").trim()
      };
    })
    .filter(function(a){ return a.nama; });
}

function ofRenderAksesoris_(card, daftar){
  if(!card) return;
  const w = card.querySelector(".of-f-aksesoris");
  if(!w) return;
  w.innerHTML = "";
  (daftar || []).forEach(function(a){ ofTambahBarisAksesoris_(card.id, a); });
}

/** ---- Kain Dari Klien (level pengajuan, bukan per item) ---- */
function ofTambahBarisKainKlien_(containerId, prefill){
  const wadah = document.getElementById(containerId);
  if(!wadah) return;
  const b = document.createElement("div");
  b.className = "of-kaink-baris";
  b.innerHTML =
    '<input class="of-f-kk-nama" placeholder="nama/kode kain" type="text"/>' +
    '<input class="of-f-kk-jml" min="0" placeholder="jumlah" step="0.01" type="number"/>' +
    '<select class="of-f-kk-satuan">' + ofOpsiSatuan_("yds", OF_SATUAN_KAIN) + '</select>' +
    '<input class="of-f-kk-tgl" title="tanggal terima" type="date"/>' +
    '<input class="of-f-kk-ket" placeholder="keterangan (opsional)" type="text"/>' +
    '<button class="of-jadwal-hapus" onclick="ofHapusBarisKainKlien(this)" title="Hapus" type="button">&#10005;</button>';
  wadah.appendChild(b);
  if(prefill){
    b.querySelector(".of-f-kk-nama").value = prefill.nama || "";
    b.querySelector(".of-f-kk-jml").value = (prefill.jumlah ? prefill.jumlah : "");
    ofSetSatuan_(b.querySelector(".of-f-kk-satuan"), prefill.satuan || "yds");
    b.querySelector(".of-f-kk-tgl").value = prefill.tanggal || "";
    b.querySelector(".of-f-kk-ket").value = prefill.keterangan || "";
  }
}

function ofHapusBarisKainKlien(btn){
  const b = btn.closest(".of-kaink-baris");
  if(b) b.remove();
}

function ofKumpulkanKainKlien_(containerId){
  const w = document.getElementById(containerId);
  if(!w) return [];
  return Array.prototype.slice.call(w.querySelectorAll(".of-kaink-baris"))
    .map(function(b){
      return {
        nama: (b.querySelector(".of-f-kk-nama").value || "").trim(),
        jumlah: Number(b.querySelector(".of-f-kk-jml").value) || 0,
        satuan: (b.querySelector(".of-f-kk-satuan").value || "yds").trim(),
        tanggal: (b.querySelector(".of-f-kk-tgl").value || "").trim(),
        keterangan: (b.querySelector(".of-f-kk-ket").value || "").trim()
      };
    })
    .filter(function(k){ return k.nama; });
}

function ofRenderKainKlien_(containerId, daftar){
  const w = document.getElementById(containerId);
  if(!w) return;
  w.innerHTML = "";
  (daftar || []).forEach(function(k){ ofTambahBarisKainKlien_(containerId, k); });
}

/**
 * ============ AUTOFILL DARI MASTER ARTIKEL ============
 * Saat klien restock artikel yang pernah dipesan, komposisi kain, aksesoris,
 * dan catatan produksinya terisi sendiri -- dia cukup mengisi qty & deadline.
 * Worksheet 12 halaman menyusut jadi tabel qty.
 *
 * Daftarnya dimuat SEKALI per sesi form (window.RJD_MASTER_ARTIKEL), bukan tiap
 * ITEM ditambah -- kalau tidak, menambah 3 item = 3 kali panggil server.
 */
function ofMuatMasterArtikel_(idKlien){
  const token = lpIdTokenUniversal_();
  const url = lpApiUrlUniversal_();
  // Belum login / cabang tanpa token -> jangan panggil server sama sekali.
  if(!token || !url){ window.RJD_MASTER_ARTIKEL = []; return Promise.resolve([]); }
  const body = { idToken: token, action: "getMasterArtikel" };
  if(idKlien) body.idKlien = idKlien;
  return fetch(url, { method: "POST", body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      window.RJD_MASTER_ARTIKEL = (d && d.success && d.daftar) ? d.daftar : [];
      window.RJD_MASTER_ARTIKEL_DIMUAT = true;
      // Jejak di konsol -- kalau selektornya kosong, ini yang membedakan
      // "server menolak", "klien salah", dan "klien ini memang belum punya artikel".
      if(d && !d.success) console.warn("Master Artikel ditolak server:", d.error || "(tanpa pesan)");
      console.log("Master Artikel dimuat:", (window.RJD_MASTER_ARTIKEL || []).length,
        "artikel | idKlien diminta:", idKlien || "(dari email login)");
      // Kartu ITEM yang sudah terlanjur dibuat sebelum daftar tiba ikut diisi.
      document.querySelectorAll(".of-f-pilihartikel").forEach(function(sel){
        ofIsiPilihanArtikel_(sel);
      });
      return window.RJD_MASTER_ARTIKEL;
    })
    .catch(function(err){
      window.RJD_MASTER_ARTIKEL = [];
      window.RJD_MASTER_ARTIKEL_DIMUAT = true;
      console.warn("Master Artikel gagal dimuat:", err && err.message ? err.message : err);
      document.querySelectorAll(".of-f-pilihartikel").forEach(function(sel){ ofIsiPilihanArtikel_(sel); });
      return [];
    });
}

function ofIsiPilihanArtikel_(sel){
  const wrap = sel.closest(".of-pilihartikel-wrap");
  const info = wrap ? wrap.querySelector(".of-pilihartikel-status") : null;
  const daftar = window.RJD_MASTER_ARTIKEL || [];

  if(!daftar.length){
    // BEDAKAN dua keadaan. Versi sebelumnya menyembunyikan keduanya, jadi
    // "belum termuat" dan "klien ini memang belum punya artikel" terlihat sama
    // persis -- tidak ada cara tahu mana yang sedang terjadi.
    if(window.RJD_MASTER_ARTIKEL_DIMUAT === true){
      wrap.classList.remove("hidden");
      sel.innerHTML = '<option value="">-- belum ada artikel tersimpan --</option>';
      sel.disabled = true;
      if(info) info.textContent = "Artikel tersimpan otomatis setelah order klien ini disetujui.";
    } else {
      wrap.classList.add("hidden"); // masih memuat -- jangan berkedip
    }
    return;
  }

  sel.disabled = false;
  if(info) info.textContent = "";
  wrap.classList.remove("hidden");
  sel.innerHTML = '<option value="">-- pilih artikel tersimpan --</option>' +
    daftar.map(function(a, i){
      const label = [a.brand, a.artikel, a.style].filter(Boolean).join(" \u00B7 ");
      return '<option value="' + i + '">' + rjdEscapeHtml_(label) +
        (a.jumlahOrder ? " (" + a.jumlahOrder + "x)" : "") + '</option>';
    }).join("");
}

/**
 * Terapkan spesifikasi artikel tersimpan ke 1 kartu ITEM.
 * Field yang SUDAH DIISI pengguna TIDAK ditimpa -- autofill itu bantuan,
 * bukan perintah; menimpa ketikan orang di tengah pengisian bikin frustrasi
 * dan mudah tidak disadari.
 */
function ofTerapkanArtikel(sel){
  const card = sel.closest(".of-item-card");
  if(!card) return;
  const daftar = window.RJD_MASTER_ARTIKEL || [];
  const a = daftar[Number(sel.value)];
  if(!a) return;

  // ATURAN PENGISIAN: timpa kalau kolomnya KOSONG, atau kalau isinya berasal
  // dari autofill sebelumnya (ditandai data-autofill). Ketikan MANUAL pengguna
  // tidak pernah ditimpa.
  //
  // Kenapa perlu: sejak selektor pindah ke paling atas, berganti pilihan
  // artikel jadi hal yang wajar. Kalau aturannya cuma "isi bila kosong",
  // pilihan KEDUA tidak berpengaruh apa-apa karena kolomnya sudah terisi
  // pilihan pertama -- terlihat seperti tombolnya rusak.
  const isiOtomatis = function(kelas, nilai){
    const el = card.querySelector(kelas);
    if(!el) return;
    const bolehTimpa = !el.value.trim() || el.dataset.autofill === "1";
    if(!bolehTimpa) return;
    el.value = nilai || "";
    el.dataset.autofill = "1";
    if(!el.dataset.pantau){
      // Begitu pengguna mengetik sendiri, tandanya dilepas -> jadi milik dia.
      el.dataset.pantau = "1";
      el.addEventListener("input", function(){ delete el.dataset.autofill; });
    }
  };
  isiOtomatis(".of-f-brand", a.brand);
  isiOtomatis(".of-f-artikel", a.artikel);
  isiOtomatis(".of-f-style", a.style);
  isiOtomatis(".of-f-catatanitem", a.catatanProduksi);

  // Komposisi & aksesoris: diganti kalau masih kosong ATAU hasil autofill lama.
  // Barisan yang diisi/diubah sendiri oleh pengguna dibiarkan.
  const kmpWrap = card.querySelector(".of-f-komposisi");
  if(kmpWrap && (!card.querySelectorAll(".of-komposisi-baris").length || kmpWrap.dataset.autofill === "1")){
    ofRenderKomposisi_(card, a.komposisiKain || []);
    kmpWrap.dataset.autofill = "1";
  }
  const aksWrap = card.querySelector(".of-f-aksesoris");
  if(aksWrap && (!card.querySelectorAll(".of-aks-baris").length || aksWrap.dataset.autofill === "1")){
    ofRenderAksesoris_(card, a.aksesoris || []);
    aksWrap.dataset.autofill = "1";
  }

  const st = card.querySelector(".of-pilihartikel-status");
  if(st) st.textContent = "Terisi dari artikel tersimpan. Silakan periksa & sesuaikan.";
}

/**
 * ============ EDITOR SIZE CHART (per ITEM) ============
 * Baris = nama ukuran (Lingkar Dada, Lebar Bahu, ...), kolom = size yang AKTIF
 * di item ini. Polanya sama dengan Komposisi Kain per-size.
 *
 * Kenapa ada di form, bukan cuma di spreadsheet: mengetik format
 * "Lingkar Dada|S:94,M:98" manual itu rawan salah dan melelahkan untuk artikel
 * baru. Isi di sini otomatis naik jadi standar artikel saat order disetujui.
 *
 * Kosong = pakai standar artikel, lalu standar klien (lihat resolveSizeChart_).
 * Jadi klien yang ukurannya sama untuk semua artikel cukup mengisi sekali di
 * tab Profil, dan bagian ini boleh dibiarkan kosong terus.
 */
function ofTambahBarisSizeChart_(itemId, prefill){
  const card = document.getElementById(itemId);
  if(!card) return;
  const wadah = card.querySelector(".of-f-sizechart");
  if(!wadah) return;
  const b = document.createElement("tr");
  b.className = "of-sc-baris";
  b.innerHTML =
    '<td class="of-td-sc-nama"><input class="of-f-sc-nama" placeholder="nama ukuran (mis. Lingkar Dada)" type="text"/></td>' +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="ofHapusBarisSizeChart(this)" title="Hapus" type="button">&#10005;</button></td>';
  wadah.appendChild(b);
  if(prefill){
    b.querySelector(".of-f-sc-nama").value = prefill.nama || "";
    b.dataset.scprefill = JSON.stringify(prefill.perSize || {});
  }
  ofRenderSizeChartKolom_(card);
}

function ofHapusBarisSizeChart(btn){
  const b = btn.closest(".of-sc-baris");
  if(b) b.remove();
}

/** Bangun ulang kotak per-size di tiap baris size chart, mengikuti size aktif. */
function ofRenderSizeChartKolom_(card){
  if(!card) return;
  const sizes = ofSizeAktif_(card);

  const head = card.querySelector(".of-f-sc-head");
  if(head){
    head.innerHTML = '<th class="of-th-warna">Ukuran</th>' +
      sizes.map(function(sz){ return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th></th>';
  }

  card.querySelectorAll(".of-sc-baris").forEach(function(b){
    // Nilai lama dipertahankan by NAMA SIZE, bukan posisi.
    const lama = {};
    b.querySelectorAll(".of-f-sc-nilai").forEach(function(inp){
      if(inp.value) lama[inp.dataset.size] = inp.value;
    });
    let pf = {};
    if(b.dataset.scprefill){
      try { pf = JSON.parse(b.dataset.scprefill) || {}; } catch(e) { pf = {}; }
    }
    b.querySelectorAll(".of-td-sc-nilai").forEach(function(td){ td.remove(); });
    const anchor = b.querySelector(".of-td-aksi");
    sizes.forEach(function(sz){
      const v = lama[sz] != null ? lama[sz] : (pf[sz] != null ? pf[sz] : "");
      const td = document.createElement("td");
      td.className = "of-td-sc-nilai";
      td.innerHTML = '<input class="of-f-sc-nilai" data-size="' + rjdEscapeHtml_(sz) + '" placeholder="-" type="text" value="' + rjdEscapeHtml_(String(v)) + '"/>';
      b.insertBefore(td, anchor);
    });
  });
}

/** Baca size chart 1 ITEM -> [{nama, perSize}]. Baris tanpa nama diabaikan. */
function ofBacaSizeChart_(card){
  if(!card) return [];
  return Array.prototype.slice.call(card.querySelectorAll(".of-sc-baris"))
    .map(function(b){
      const perSize = {};
      b.querySelectorAll(".of-f-sc-nilai").forEach(function(inp){
        const v = (inp.value || "").trim();
        if(v) perSize[inp.dataset.size] = v;
      });
      return { nama: (b.querySelector(".of-f-sc-nama").value || "").trim(), perSize: perSize };
    })
    .filter(function(x){ return x.nama && Object.keys(x.perSize).length; });
}

function ofRenderSizeChart_(card, daftar){
  if(!card) return;
  const w = card.querySelector(".of-f-sizechart");
  if(!w) return;
  w.innerHTML = "";
  (daftar || []).forEach(function(x){ ofTambahBarisSizeChart_(card.id, x); });
}

/**
 * Sembunyikan/tampilkan kolom KODE KAIN di tabel Warna x Size.
 *
 * Order dengan 4 slot kain (mis. Inara: Brokat, Furing, Lapis, Tile) membuat
 * tabelnya melebar sampai kolom size harus digeser. Padahal kode kain biasanya
 * diisi SEKALI di awal, lalu yang sering disunting cuma qty-nya.
 *
 * Disembunyikan lewat CSS, BUKAN dihapus dari DOM -- nilainya tetap terbaca
 * pengumpul data. Menyembunyikan kolom tidak boleh berarti kehilangan isinya.
 */
function ofToggleKolomKain(itemId){
  const card = document.getElementById(itemId);
  if(!card) return;
  const tabel = card.querySelector(".of-f-warnawrap");
  if(!tabel) return;
  tabel.classList.toggle("of-sembunyi-kain");
  ofPerbaruiTombolKain_(card);
}

/** Tampilkan tombol hanya kalau ada kolom kain, dan sesuaikan labelnya. */
function ofPerbaruiTombolKain_(card){
  if(!card) return;
  const btn = card.querySelector(".of-toggle-kain");
  const tabel = card.querySelector(".of-f-warnawrap");
  if(!btn || !tabel) return;
  const jumlahKain = card.querySelectorAll(".of-f-matrixhead .of-th-kain").length;
  if(!jumlahKain){
    btn.classList.add("hidden");
    tabel.classList.remove("of-sembunyi-kain");
    return;
  }
  btn.classList.remove("hidden");
  const tersembunyi = tabel.classList.contains("of-sembunyi-kain");
  btn.textContent = tersembunyi
    ? ("Tampilkan kolom kain (" + jumlahKain + ")")
    : ("Sembunyikan kolom kain (" + jumlahKain + ")");
}

/** Total pcs 1 warna (dijumlah dari kolom size di barisnya). */
function ofHitungTotalWarna_(blok){
  let t = 0;
  blok.querySelectorAll(".of-f-size").forEach(function(inp){
    const v = Number(inp.value);
    if(v > 0) t += v;
  });
  const el = blok.querySelector(".of-f-totalwarna");
  if(el) el.textContent = t;
}

/**
 * Bangun ulang kolom size tabel matriks -- header DAN sel di tiap baris warna,
 * mengikuti preset Ukuran yang dipilih. Dipanggil tiap kali preset berubah atau
 * ada warna baru ditambahkan.
 *
 * Nilai yang SUDAH DIKETIK dipertahankan selama size-nya masih ada di preset
 * baru (mis. S-L -> S-XL: angka S & L tetap). Kalau size-nya hilang dari preset,
 * angkanya memang ikut hilang -- itu konsekuensi wajar mengganti preset.
 */
function ofRenderSizeRowUntukItem_(card){
  const sizes = ofSizeAktif_(card);
  const adaHarga = card.dataset.harga === "1" || !!card.querySelector(".of-f-harga");

  // Tiap slot di Komposisi Kain jadi 1 kolom -- tiap warna mengisi KODE kainnya.
  // DIDEKLARASIKAN DI SINI (level fungsi), BUKAN di dalam if(head) -- loop baris
  // warna di bawah juga memakainya. Versi sebelumnya menaruhnya di dalam if,
  // jadi loop itu melempar ReferenceError dan sel size tidak pernah dibuat:
  // header tampil lengkap, barisnya kosong. node --check TIDAK bisa menangkap
  // ini (sintaksnya sah, salahnya scope saat runtime).
  const slotKain = ofBacaKomposisi_(card).map(function(k){ return k.nama; });

  const head = card.querySelector(".of-f-matrixhead");
  if(head){
    head.innerHTML = '<th class="of-th-warna">Warna *</th>' +
      slotKain.map(function(n){ return '<th class="of-th-kain">' + n + '</th>'; }).join("") +
      sizes.map(function(s){ return '<th class="of-th-size">' + s + '</th>'; }).join("") +
      '<th class="of-th-total">Total</th>' +
      (adaHarga ? '<th class="of-th-harga">Harga/pcs</th>' : '') +
      '<th class="of-th-aksi"></th>';
  }

  ofRenderKomposisiPerSize_(card); // kotak konsumsi per size ikut preset
  ofRenderSizeChartKolom_(card);   // kolom size chart juga ikut
  ofPerbaruiTombolKain_(card);     // tombol sembunyi kain ikut jumlah slot

  card.querySelectorAll(".of-warna-blok").forEach(function(blok){
    const baris = blok.querySelector(".of-wr-main");
    if(!baris) return;
    const lama = {};
    baris.querySelectorAll(".of-f-size").forEach(function(inp){
      if(inp.value) lama[inp.dataset.size] = inp.value;
    });
    baris.querySelectorAll(".of-td-size").forEach(function(td){ td.remove(); });

    // Kode kain per slot -- dipertahankan berdasarkan NAMA SLOT, bukan posisi,
    // supaya mengubah urutan/menghapus slot tidak menggeser kode ke slot salah.
    const kainLama = {};
    baris.querySelectorAll(".of-f-kain").forEach(function(inp){
      if(inp.value) kainLama[inp.dataset.slot] = inp.value;
    });
    baris.querySelectorAll(".of-td-kain").forEach(function(td){ td.remove(); });
    const anchorKain = baris.querySelector(".of-td-total");
    slotKain.forEach(function(nama){
      const td = document.createElement("td");
      td.className = "of-td-kain";
      const v = kainLama[nama] != null ? kainLama[nama] : "";
      td.innerHTML = '<input class="of-f-kain" data-slot="' + rjdEscapeHtml_(nama) + '" placeholder="kode kain" type="text" value="' + rjdEscapeHtml_(v) + '"/>';
      baris.insertBefore(td, anchorKain);
    });
    // Terapkan prefill kode kain (disimpan ofTambahWarna sebelum kolom ada).
    if(blok.dataset.bahanprefill){
      let pf = [];
      try { pf = JSON.parse(blok.dataset.bahanprefill) || []; } catch(e) { pf = []; }
      pf.forEach(function(b){
        const inp = baris.querySelector('.of-f-kain[data-slot="' + (b.slot || "").replace(/"/g, "") + '"]');
        if(inp && !inp.value) inp.value = b.kode || "";
      });
    }

    const anchor = baris.querySelector(".of-td-total");
    sizes.forEach(function(s){
      const td = document.createElement("td");
      td.className = "of-td-size";
      const v = lama[s] != null ? lama[s] : "";
      td.innerHTML = '<input class="of-f-size" data-size="' + s + '" min="0" type="number" value="' + v + '"/>';
      baris.insertBefore(td, anchor);
    });
    ofHitungTotalWarna_(blok);
  });
}

/**
 * SUMBER KEBENARAN ukuran aktif 1 ITEM.
 * - Mode ANGKA (Anak 0-12): daftarnya tetap dari preset (0..12).
 * - Mode HURUF: dibaca dari kotak yang DICENTANG, bukan dari nama preset.
 *   Ini yang bikin kombinasi bebas (mis. hanya XL & 2XL) jadi mungkin, dan
 *   bikin order lama tetap terbaca walau nama presetnya sudah dihapus.
 */
function ofSizeAktif_(card){
  if(!card) return [];
  const modeEl = card.querySelector(".of-f-preset");
  const mode = modeEl ? modeEl.value : "";
  if(OF_PRESET_ANGKA[mode]) return OF_SIZE_PRESET[mode] || [];
  // Urutan mengikuti OF_SIZE_CENTANG, bukan urutan klik -- supaya kolom tabel
  // selalu urut XS->5XL apa pun urutan mencentangnya.
  return OF_SIZE_CENTANG.filter(function(sz){
    const el = card.querySelector('.of-f-sizecek[value="' + sz + '"]');
    return el && el.checked;
  });
}

/** Terapkan preset (mengisi centang), atau masuk/keluar mode ANGKA. */
function ofPakaiPreset(id, nama){
  const card = document.getElementById(id);
  if(!card) return;
  const modeEl = card.querySelector(".of-f-preset");
  const wrapCek = card.querySelector(".of-f-sizecek-wrap");
  const infoAngka = card.querySelector(".of-size-mode-angka");

  if(OF_PRESET_ANGKA[nama]){
    modeEl.value = nama;
    if(wrapCek) wrapCek.classList.add("hidden");
    if(infoAngka) infoAngka.classList.remove("hidden");
  } else {
    modeEl.value = "";
    if(wrapCek) wrapCek.classList.remove("hidden");
    if(infoAngka) infoAngka.classList.add("hidden");
    const daftar = OF_SIZE_PRESET[nama] || [];
    card.querySelectorAll(".of-f-sizecek").forEach(function(cb){
      cb.checked = daftar.indexOf(cb.value) !== -1;
    });
  }
  ofTandaiPresetAktif_(card);
  ofRenderSizeRowUntukItem_(card);
}

/** Sorot tombol preset yang PERSIS sama dengan centang sekarang (kalau ada). */
function ofTandaiPresetAktif_(card){
  const aktif = ofSizeAktif_(card);
  const modeEl = card.querySelector(".of-f-preset");
  const mode = modeEl ? modeEl.value : "";
  card.querySelectorAll(".of-size-preset-btn").forEach(function(btn){
    const nama = btn.textContent.trim();
    const daftar = OF_SIZE_PRESET[nama] || [];
    const sama = OF_PRESET_ANGKA[nama]
      ? (mode === nama)
      : (!OF_PRESET_ANGKA[mode] && daftar.length === aktif.length &&
         daftar.every(function(sz){ return aktif.indexOf(sz) !== -1; }));
    btn.className = "of-size-preset-btn" + (sama ? " aktif" : "");
  });
}

function ofGantiPreset(id){
  const card = document.getElementById(id);
  if(!card) return;
  ofTandaiPresetAktif_(card);
  ofRenderSizeRowUntukItem_(card);
}

/**
 * Isi container form order dari data order request yang SUDAH ADA.
 * items = daftar RATA dari backend (1 entry = 1 Warna) -> dikelompokkan dulu
 * jadi ITEM (Brand+Artikel+Style) pakai helper yang sama dengan tampilan lain.
 *
 * Preset ukuran ditebak dari size mana saja yang kepakai: dicari preset PALING
 * PAS yang menampung semua size terisi. Kalau nggak ada yang cocok (misal data
 * lama campur aduk), jatuh ke "XS-5XL" yang paling luas -- biar qty-nya tetap
 * kelihatan & bisa diedit, bukan hilang diam-diam.
 */
function rjdIsiFormDariOrder_(containerId, items, opsi){
  const wadah = document.getElementById(containerId);
  if(!wadah) return;
  wadah.innerHTML = "";
  rjdGroupOrderItems_(items).forEach(function(grup){
    const sizeKepakai = {};
    grup.warnaList.forEach(function(w){
      Object.keys(w.sizeQty || {}).forEach(function(sz){
        if(Number(w.sizeQty[sz]) > 0) sizeKepakai[sz] = true;
      });
    });
    const dipakai = Object.keys(sizeKepakai);
    // Mode ANGKA kalau ukurannya angka semua (preset Anak 0-12); selain itu
    // mode huruf, dan centangnya diisi dari ukuran yang BENAR-BENAR dipakai --
    // bukan dicocokkan ke nama preset. Jadi order lama yang dulu memakai
    // preset S-L / S-2XL (sudah dihapus) tetap terbaca apa adanya, dan tidak
    // ada kolom kosong ikut terbawa.
    const semuaAngka = dipakai.length > 0 && dipakai.every(function(sz){ return !isNaN(Number(sz)); });
    const presetTerpilih = semuaAngka ? "Anak 0-12" : "";
    // Komposisi kain & aksesoris disimpan SAMA di tiap baris warna item ini
    // (lihat submitOrderRequest_), jadi baris pertama sudah mewakili. Tanpa
    // ini, membuka Edit Order menampilkan komposisi KOSONG padahal datanya ada
    // di sheet -- lalu menyimpan ulang akan menghapusnya.
    const w0 = (grup.warnaList && grup.warnaList[0]) ? grup.warnaList[0] : {};
    ofTambahItem(containerId, {
      brand: grup.brand, artikel: grup.artikel, style: grup.style,
      preset: presetTerpilih, sizeDipakai: dipakai, warnaList: grup.warnaList,
      komposisiKain: w0.komposisiKain || [],
      aksesoris: w0.aksesoris || [],
      sizeChart: w0.sizeChart || []
    }, opsi);
  });
  if(!wadah.children.length) ofTambahItem(containerId, null, opsi);
}

/* CATATAN: fungsi rjdKumpulkanItemsForm_ (pengumpul versi SINKRON) SUDAH DIHAPUS.
   Dia dipakai modal Edit waktu fungsi pembaca file masih terkurung di cabang
   order -- konsekuensinya upload Foto Desain di modal Edit NGGAK BERFUNGSI.
   Sejak ofKumpulkanItemsAsync dipindah ke global & bisa dibatasi per container,
   SEMUA form (halaman order, modal order baru, modal edit) pakai pengumpul
   ASYNC yang sama. Dihapus biar nggak ada dua pengumpul dengan perilaku beda --
   yang satu diam-diam nggak baca file. */

/**
 * ============ PENGELOMPOKAN ITEM ORDER (dipakai BERSAMA) ============
 * Backend nyimpen order request dalam bentuk RATA: 1 baris = 1 Warna, dengan
 * Brand/Artikel/Style DIULANG di tiap baris. Itu benar buat penyimpanan, TAPI
 * kalau ditampilkan apa adanya, 1 artikel dengan 3 warna kelihatan kayak 3
 * barang beda -- persis yang bikin bingung sebelum ini.
 *
 * Fungsi ini ngelompokin balik jadi struktur yang sama dengan FORM ORDER:
 *   ITEM (Brand+Artikel+Style) -> daftar Warna
 * Dipakai SEMUA tampilan (Portal kartu, Portal edit, Dashboard proofing) biar
 * urutan & tata letaknya seragam di mana-mana.
 *
 * Urutan ITEM & urutan Warna di dalamnya MENGIKUTI URUTAN ASLI dari backend --
 * jangan disortir, biar cocok sama urutan baris di sheet (dan sama dengan
 * urutan nomor di ID Baris).
 *
 * Ditaruh di blok global (bukan di dalam <b:if>) supaya cabang tracking DAN
 * dashboard sama-sama bisa pakai -- ini satu-satunya cara berbagi kode JS
 * antar cabang, karena tiap <b:if> CSS/markup-nya terisolasi.
 */
function rjdGroupOrderItems_(items){
  const peta = {};
  const urutan = [];
  (items || []).forEach(function(it){
    const key = (it.brand || "") + "|" + (it.artikel || "") + "|" + (it.style || "");
    if(!peta[key]){
      peta[key] = { brand: it.brand || "", artikel: it.artikel || "", style: it.style || "", warnaList: [] };
      urutan.push(key);
    }
    peta[key].warnaList.push(it);
  });
  return urutan.map(function(k){ return peta[k]; });
}

/** Total pcs 1 baris warna (jumlahkan semua size). */
function rjdTotalQtyWarna_(it){
  let total = 0;
  const sq = it.sizeQty || {};
  Object.keys(sq).forEach(function(s){ total += Number(sq[s]) || 0; });
  return total;
}

/** Ringkas "S:1, M:3, L:5" dari sizeQty. Fallback ke detailAllSize. */
function rjdRingkasSize_(it){
  const sq = it.sizeQty || {};
  const bagian = Object.keys(sq).filter(function(s){ return Number(sq[s]) > 0; })
    .map(function(s){ return s + ":" + sq[s]; });
  if(bagian.length) return bagian.join(", ");
  return it.detailAllSize || "-";
}

function renderOrderanList(daftar, filter){
  const listEl = document.getElementById("lp-orderan-list");
  const filtered = (filter === "semua") ? daftar : daftar.filter(function(g){ return g.status === filter; });

  if(!filtered.length){
    listEl.innerHTML = '<p style="color:var(--ink-soft);font-size:14px">Belum ada order request untuk filter ini.</p>';
    return;
  }

  window.LP_ORDERAN_MAP = {};
  listEl.innerHTML = filtered.map(function(g){
    window.LP_ORDERAN_MAP[g.idOrderRequest] = g;
    const badgeClass = LP_ORDERAN_STATUS_BADGE_CLASS[g.status] || "lp-badge-dp";
    const totalQty = g.items.reduce(function(sum, it){
      return sum + Object.keys(it.sizeQty || {}).reduce(function(s, size){ return s + (it.sizeQty[size] || 0); }, 0);
    }, 0);

    // Dikelompokkan jadi ITEM (Brand+Artikel+Style) -> Warna, sama persis
    // dengan struktur Form Order. Sebelumnya tiap Warna tampil sebagai kartu
    // terpisah, jadi 1 artikel 3 warna kelihatan kayak 3 barang beda.
    // RINGKASAN saja: Artikel + Brand/Style + qty + harga. Rincian per warna,
    // ukuran, catatan & foto SENGAJA tidak ditampilkan di sini -- untuk order
    // 8 warna, semuanya terulang 8 kali dan kartunya jadi sepanjang layar.
    // Rinciannya dilihat lewat klik kartu (modal preview dokumen) atau tombol
    // Cetak Konfirmasi Order.
    const itemsHtml = rjdGroupOrderItems_(g.items).map(function(grup, gi){
      const qtyItem = grup.warnaList.reduce(function(sum, it){ return sum + rjdTotalQtyWarna_(it); }, 0);

      // Harga bisa beda antar warna dalam 1 item -> tampilkan rentang, jangan
      // ambil salah satu (menyesatkan). Kalau belum diisi admin, katakan apa
      // adanya daripada menampilkan Rp 0.
      const hargaUnik = [];
      grup.warnaList.forEach(function(it){
        const h = Number(it.harga);
        if(h > 0 && hargaUnik.indexOf(h) === -1) hargaUnik.push(h);
      });
      hargaUnik.sort(function(a, b){ return a - b; });
      let hargaTeks;
      if(!hargaUnik.length) hargaTeks = '<span class="lp-oi-harga-kosong">harga belum diisi</span>';
      else if(hargaUnik.length === 1) hargaTeks = formatRupiah(hargaUnik[0]) + '/pcs';
      else hargaTeks = formatRupiah(hargaUnik[0]) + ' - ' + formatRupiah(hargaUnik[hargaUnik.length - 1]) + '/pcs';

      const subJudul = [grup.brand, grup.style].filter(Boolean).join(" &#183; ");
      return '<div class="lp-orderan-item">' +
        '<div class="lp-oi-head">' +
          '<div>' +
            '<div class="lp-oi-nomor">ITEM #' + (gi + 1) + '</div>' +
            '<b class="lp-oi-artikel">' + (grup.artikel || "-") + '</b>' +
            (subJudul ? '<div class="lp-oi-sub">' + subJudul + '</div>' : '') +
          '</div>' +
          '<span class="lp-oi-jml-warna">' + grup.warnaList.length + ' warna</span>' +
        '</div>' +
        '<div class="lp-oi-ringkas">' +
          '<span class="lp-oi-qty">' + qtyItem + ' pcs</span>' +
          '<span class="lp-oi-harga">' + hargaTeks + '</span>' +
        '</div>' +
      '</div>';
    }).join("");

    // Kartu bisa diklik -> modal preview dokumen Konfirmasi Order. Tombol Edit &
    // link Cetak di dalamnya dilindungi stopPropagation supaya tidak ikut
    // membuka modal preview.
    return '<div class="lp-orderan-card lp-orderan-klik" onclick="lpBukaPreviewOrder(\'' + g.idOrderRequest + '\')" title="Klik untuk lihat rincian lengkap">' +
      '<div class="lp-order-head">' +
        '<div><div class="lp-order-code">' + g.idOrderRequest + '</div>' +
        '<div class="lp-order-produk">' + totalQty + ' pcs &#183; Target kirim: ' + (g.targetTanggalKirim || "-") + '</div></div>' +
        '<span class="lp-badge ' + badgeClass + '">' + g.status + '</span>' +
      '</div>' +
      (g.status === "Disetujui" && g.idPurchaseOrderHasil ? '<p class="lp-orderan-note lp-orderan-note-ok">&#10003; Sudah jadi PO: <b>' + g.idPurchaseOrderHasil + '</b></p>' : '') +
      (g.status === "Ditolak" && g.catatanAdmin ? '<p class="lp-orderan-note lp-orderan-note-tolak">Alasan ditolak: ' + g.catatanAdmin + '</p>' : '') +
      '<div class="lp-orderan-items">' + itemsHtml + '</div>' +
      '<div style="margin-top:10px" onclick="event.stopPropagation()">' +
        '<a class="lp-cetak-link" href="/p/cetak.html?jenis=konfirmasiorder&id=' + encodeURIComponent(g.idOrderRequest) + '" target="_blank">&#128424; Cetak Konfirmasi Order</a>' +
        '<span class="lp-orderan-hint-klik">&#183; klik kartu untuk lihat rincian</span>' +
      '</div>' +
      (g.status === "Pending" ? '<div class="lp-orderan-actions" onclick="event.stopPropagation()"><button class="lp-edit-btn" onclick="lpBukaEditOrder(\'' + g.idOrderRequest + '\')" type="button">&#9998; Edit Order</button><span class="lp-edit-hint">Bisa diedit selama masih Pending</span></div>' : '') +
    '</div>';
  }).join("");
}
/* ============ PREVIEW KONFIRMASI ORDER (modal) ============
   Isinya memuat halaman cetak.html?jenis=konfirmasiorder di dalam IFRAME --
   BUKAN menyalin ulang komponen dokumen ke cabang ini.

   Alasannya: dokumen itu dirender ckRenderKonfirmasiOrder + ckBuildItemGroupsHtml_
   yang berada di cabang cetak, dan <b:if> mengisolasi CSS -- menyalinnya ke sini
   berarti menduplikasi fungsi DAN belasan kelas CSS, lalu keduanya harus terus
   disamakan tiap ada perbaikan. Dengan iframe, tampilannya dijamin PERSIS sama
   karena memang halaman yang sama, dan perbaikan di dokumen cetak otomatis ikut.

   Otentikasi tetap jalan: iframe satu origin, jadi token sesi di localStorage
   terbaca ckCobaAutoLogin_ seperti saat halaman itu dibuka di tab sendiri.
   Backend tetap memverifikasi token & hak akses -- ini bukan bypass. */
function lpBukaPreviewOrder(idOrderRequest){
  lpTutupPreviewOrder();
  const src = "/p/cetak.html?jenis=konfirmasiorder&id=" + encodeURIComponent(idOrderRequest);
  const overlay = document.createElement("div");
  overlay.className = "lp-edit-overlay";
  overlay.id = "lp-preview-overlay";
  overlay.innerHTML =
    '<div class="lp-edit-modal lp-preview-modal">' +
      '<div class="lp-edit-modal-head">' +
        '<div><div class="lp-edit-modal-title">Rincian Order</div>' +
        '<div class="lp-edit-modal-sub">' + rjdEscapeHtml_(idOrderRequest) + '</div></div>' +
        '<button class="lp-edit-close" onclick="lpTutupPreviewOrder()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="lp-preview-body">' +
        '<iframe class="lp-preview-frame" src="' + src + '" title="Konfirmasi Order"></iframe>' +
      '</div>' +
      '<div class="lp-preview-kaki">' +
        '<a class="lp-cetak-link" href="' + src + '" target="_blank">&#128424; Buka di tab baru / Cetak</a>' +
      '</div>' +
    '</div>';
  // Klik area gelap di luar modal = tutup, pola sama dengan modal lain.
  overlay.addEventListener("click", function(e){
    if(e.target === overlay) lpTutupPreviewOrder();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
}

function lpTutupPreviewOrder(){
  const ov = document.getElementById("lp-preview-overlay");
  if(ov) ov.remove();
  // Jangan buka kunci scroll kalau modal Edit sedang terbuka di belakangnya.
  if(!document.getElementById("lp-edit-overlay")) document.body.style.overflow = "";
}

/* ============ EDIT ORDER PENDING (klien) ============
   Cuma order berstatus "Pending" yang bisa diedit klien. Izin sebenarnya
   ditegakkan di BACKEND (editOrderRequestDariPortal_ -> cekIzinEditOrderRequest_):
   frontend ini cuma kenyamanan UI. Kalau order sudah Disetujui/Ditolak, backend
   tetap nolak walau tombol somehow muncul. Klien TIDAK bisa ubah harga & warna
   (dibatasi backend + nggak disediakan di form ini). */

/* ============ MODAL "AJUKAN ORDER BARU" (Portal Klien) ============
   Memakai KOMPONEN FORM ORDER yang sama dengan /p/order.html dan modal Edit.
   Bedanya: langkah "pilih jalur (klien terdaftar / baru)" dan login Google
   DILEWATI, karena klien di portal sudah pasti terdaftar & sudah login --
   identitasnya diambil dari sesi portal (idToken), sama seperti fitur lain.
   Halaman /p/order.html TETAP ADA & tidak berubah: dia melayani calon klien
   BARU (belum punya akun, belum bisa masuk portal) dan mode staff. */
function lpBukaFormOrderBaru(ev){
  if(ev && ev.preventDefault) ev.preventDefault();

  // STAFF (mode internal) mengajukan ATAS NAMA klien yang sedang dibuka di
  // portal. Kalau belum ada klien yang dipilih, dihentikan di sini -- lebih
  // baik ditolak jelas daripada order masuk atas nama yang salah.
  var staffMode = (window.LP_ROLE === "internal");
  var idKlienStaff = window.LP_PROFIL_ID_KLIEN_SAAT_INI || "";
  if(staffMode && !idKlienStaff){
    alert("Pilih dulu klien yang diwakili di pemilih klien atas, baru ajukan order.");
    return false;
  }
  var bannerStaff = staffMode
    ? '<div class="lp-order-staff-banner">MODE STAFF &#183; order diajukan atas nama <b>' + idKlienStaff + '</b></div>'
    : '';

  var overlay = document.createElement("div");
  overlay.className = "lp-edit-overlay";
  overlay.id = "lp-order-overlay";
  overlay.innerHTML =
    '<div class="lp-edit-modal">' +
      '<div class="lp-edit-modal-head">' +
        '<div><div class="lp-edit-modal-title">Ajukan Order Baru</div>' +
        '<div class="lp-edit-modal-sub">Isi rencana produksi Anda</div></div>' +
        '<button class="lp-edit-close" onclick="lpTutupFormOrderBaru()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="lp-edit-modal-body">' +
        bannerStaff +
        '<div id="lp-order-items"></div>' +
        '<button class="of-add-item-btn" onclick="ofTambahItem(\'lp-order-items\')" type="button">+ ITEM</button>' +
        '<div class="of-form-section" style="margin-top:4px">' +
          '<h4>Detail Pengiriman</h4>' +
          '<label style="display:block">Target Tanggal Kirim <span class="of-hint-akhir">(deadline akhir)</span><input type="date" id="lp-order-target"/></label>' +
          '<div class="of-jadwal-wrap">' +'<div class="of-jadwal-lbl">Jadwal Kirim Bertahap (opsional -- isi kalau pengiriman dipecah)</div>' +'<div class="of-jadwal" id="lp-order-jadwal"></div>' +'<button class="of-jadwal-add" onclick="ofTambahBarisJadwal_(\'lp-order-jadwal\')" type="button">+ Tambah Tahap</button>' +'</div>' +
          '<div class="of-jadwal-wrap">' +'<div class="of-jadwal-lbl">Kain Dari Klien (opsional -- kain yang Anda kirim ke RJD)</div>' +'<div id="lp-order-kaink"></div>' +'<button class="of-jadwal-add" onclick="ofTambahBarisKainKlien_(\'lp-order-kaink\')" type="button">+ Tambah Kain</button>' +'</div>' +
          '<label style="display:block;margin-top:14px">Catatan Tambahan' +
            '<textarea id="lp-order-catatan" class="rjd-autogrow" rows="2" placeholder="Contoh: desain menyusul, warna bisa disesuaikan stok kain, dll"></textarea></label>' +
          '<label style="display:block;margin-top:14px">File Lainnya (opsional, misal size pack, foto referensi umum)' +
            '<input type="file" id="lp-order-file-lainnya" multiple="multiple"/></label>' +
        '</div>' +
        '<div class="hidden lp-order-error" id="lp-order-error"></div>' +
      '</div>' +
      '<div class="lp-edit-modal-foot">' +
        '<button class="lp-edit-cancel" onclick="lpTutupFormOrderBaru()" type="button">Batal</button>' +
        '<button class="lp-edit-save" id="lp-order-submit-btn" onclick="lpKirimOrderBaru()" type="button">Kirim Order</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  ofTambahItem("lp-order-items"); // mulai dengan 1 ITEM kosong
  rjdBindAutoGrowAll(overlay);
  // Muat daftar artikel tersimpan klien ini buat autofill kartu ITEM.
  // HARUS sebelum `return false` -- pernah keliru ditaruh sesudahnya, jadi
  // kode mati yang tidak pernah jalan & selektornya tidak pernah muncul.
  ofMuatMasterArtikel_(window.LP_PROFIL_ID_KLIEN_SAAT_INI || null);
  return false;
}

function lpTutupFormOrderBaru(){
  var ov = document.getElementById("lp-order-overlay");
  if(ov) ov.remove();
  document.body.style.overflow = "";
}

function lpOrderBaruError_(pesan){
  var el = document.getElementById("lp-order-error");
  if(!el) return;
  el.textContent = pesan;
  el.classList.remove("hidden");
}

async function lpKirimOrderBaru(){
  var btn = document.getElementById("lp-order-submit-btn");
  var errEl = document.getElementById("lp-order-error");
  if(errEl) errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  var items;
  try{
    // Pakai versi ASYNC (bukan rjdKumpulkanItemsForm_) karena order BARU perlu
    // membaca file foto desain jadi base64. Dibatasi ke container modal.
    const mslh = ofCekItemBelumLengkap_("lp-order-items");
    if(mslh.length){
      lpOrderBaruError_("Ada item yang belum lengkap dan TIDAK akan tersimpan:\n\n- " + mslh.join("\n- "));
      btn.disabled = false; btn.textContent = "Kirim Order";
      return;
    }
    items = await ofKumpulkanItemsAsync("lp-order-items");
  }catch(errBaca){
    lpOrderBaruError_(errBaca.message || "Gagal membaca file.");
    btn.disabled = false; btn.textContent = "Kirim Order";
    return;
  }

  if(!items.length){
    lpOrderBaruError_("Isi minimal 1 item (Artikel & Warna wajib diisi) dengan minimal 1 ukuran.");
    btn.disabled = false; btn.textContent = "Kirim Order";
    return;
  }
  var adaQty = items.some(function(it){
    return Object.keys(it.sizeQty).length > 0 || (it.detailAllSize && it.detailAllSize.trim() !== "");
  });
  if(!adaQty){
    lpOrderBaruError_("Isi jumlah (qty) minimal untuk 1 ukuran di salah satu item.");
    btn.disabled = false; btn.textContent = "Kirim Order";
    return;
  }

  var fileLainnyaList = [];
  try{
    var inp = document.getElementById("lp-order-file-lainnya");
    fileLainnyaList = await ofBacaBanyakFileSebagaiBase64_(inp ? inp.files : null);
  }catch(e2){
    lpOrderBaruError_(e2.message || "Gagal membaca file.");
    btn.disabled = false; btn.textContent = "Kirim Order";
    return;
  }

  // tipeKlien "Existing" & idKlien diambil backend dari sesi login (idToken) --
  // frontend TIDAK mengirim idKlien, biar nggak bisa dipakai menyamar jadi
  // klien lain (gerbangnya sama dengan submit dari halaman order).
  var payload = {
    tipeKlien: "Existing",
    targetTanggalKirim: (document.getElementById("lp-order-target").value || "").trim(),
    jadwalKirim: ofKumpulkanJadwalKirim_("lp-order-jadwal"),
    kainDariKlien: ofKumpulkanKainKlien_("lp-order-kaink"),
    catatanKlien: (document.getElementById("lp-order-catatan").value || "").trim(),
    items: items,
    fileLainnyaList: fileLainnyaList
  };

  // Staff: kirim idKlienDipilih supaya order tercatat atas nama klien yang
  // sedang dibuka. Backend cuma menghormati field ini kalau pengirimnya
  // TERVERIFIKASI staff -- klien biasa nggak bisa menyamar (gerbangnya di
  // doPost submitOrderRequest, sama dengan mode staff di /p/order.html).
  var bodyKirim = { idToken: lpIdTokenUniversal_(), action: "submitOrderRequest", payload: payload };
  if(window.LP_ROLE === "internal" && window.LP_PROFIL_ID_KLIEN_SAAT_INI){
    bodyKirim.idKlienDipilih = window.LP_PROFIL_ID_KLIEN_SAAT_INI;
  }

  fetch(lpApiUrlUniversal_(), {
    method: "POST",
    body: JSON.stringify(bodyKirim)
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){
      lpTutupFormOrderBaru();
      alert("Order berhasil dikirim.\nNomor pengajuan: " + data.idOrderRequest +
        "\n\nTim kami akan meninjau pengajuan ini dan menghubungi Anda lewat WhatsApp.");
      if(typeof lpFetchProfilDanOrderan === "function"){
        lpFetchProfilDanOrderan(window.LP_PROFIL_ID_KLIEN_SAAT_INI || null);
      }
    } else {
      lpOrderBaruError_(data.error || "Gagal mengirim order.");
      btn.disabled = false; btn.textContent = "Kirim Order";
    }
  })
  .catch(function(){
    lpOrderBaruError_("Gagal menghubungi server. Coba lagi.");
    btn.disabled = false; btn.textContent = "Kirim Order";
  });
}

function lpBukaEditOrder(idOrderRequest){
  const g = (window.LP_ORDERAN_MAP || {})[idOrderRequest];
  if(!g){ alert("Data order tidak ditemukan, coba refresh."); return; }

  // Isi modal pakai KOMPONEN FORM ORDER YANG ASLI (ofTambahItem/ofTambahWarna
  // dari blok global) -- bukan tiruan. Jadi tata letak, urutan field, preset
  // ukuran, tombol "+ Tambah Warna"/"+ ITEM" semuanya identik dengan
  // /p/order.html, dan otomatis ikut kalau form order diperbarui.
  // File Lainnya yang sudah ada ditampilkan biar klien tahu lampirannya masih
  // tersimpan (pola sama dengan "Foto tersimpan" di tiap Warna).
  var thumbsFile = rjdBuildThumbHtml_(g.urlFileLainnya, "\uD83D\uDCCE", "File");
  var fileLamaHtml = thumbsFile
    ? '<div class="of-foto-lama" style="margin-top:14px"><div class="of-foto-lama-lbl">File tersimpan</div>' +
      '<div class="rjd-thumb-row">' + thumbsFile + '</div></div>'
    : '';

  const overlay = document.createElement("div");
  overlay.className = "lp-edit-overlay";
  overlay.id = "lp-edit-overlay";
  overlay.innerHTML =
    '<div class="lp-edit-modal">' +
      '<div class="lp-edit-modal-head">' +
        '<div><div class="lp-edit-modal-title">Edit Order</div>' +
        '<div class="lp-edit-modal-sub">' + g.idOrderRequest + '</div></div>' +
        '<button class="lp-edit-close" onclick="lpTutupEditOrder()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="lp-edit-modal-body">' +
        '<div id="lp-edit-items"></div>' +
        '<button class="of-add-item-btn" onclick="ofTambahItem(\'lp-edit-items\')" type="button">+ ITEM</button>' +
        '<div class="of-form-section" style="margin-top:4px">' +
          '<h4>Detail Pengiriman</h4>' +
          '<label style="display:block">Target Tanggal Kirim' +
            // WAJIB input type="date" (bukan teks). g.targetTanggalKirim itu sudah
            // diformat buat tampilan ("22 Agustus 2026") -- kalau dipakai di input
            // teks lalu disimpan balik, kolom tanggal di sheet keisi TEKS dan
            // Deadline Pengiriman di SD Purchase Order jadi "tidak valid".
            // Pakai versi ISO dari backend (targetTanggalKirimIso).
            '<input type="date" id="lp-edit-target" value="' + rjdTanggalKeIso_(g) + '"/></label>' +
          '<div class="of-jadwal-wrap">' +
            '<div class="of-jadwal-lbl">Jadwal Kirim Bertahap (opsional -- isi kalau pengiriman dipecah)</div>' +
            '<div class="of-jadwal" id="lp-edit-jadwal"></div>' +
            '<button class="of-jadwal-add" onclick="ofTambahBarisJadwal_(\'lp-edit-jadwal\')" type="button">+ Tambah Tahap</button>' +
          '</div>' +
            '<div class="of-jadwal-wrap">' +'<div class="of-jadwal-lbl">Kain Dari Klien (opsional -- kain yang Anda kirim ke RJD)</div>' +'<div id="lp-edit-kaink"></div>' +'<button class="of-jadwal-add" onclick="ofTambahBarisKainKlien_(\'lp-edit-kaink\')" type="button">+ Tambah Kain</button>' +'</div>' +
          '<label style="display:block;margin-top:14px">Catatan Tambahan' +
            '<textarea id="lp-edit-catatan-klien" class="rjd-autogrow" rows="2">' + (g.catatanKlien || "") + '</textarea></label>' +
          fileLamaHtml +
          '<label style="display:block;margin-top:14px"><span id="lp-edit-file-lbl">File Lainnya (opsional, misal size pack, foto referensi umum)</span>' +
            '<input type="file" id="lp-edit-file-lainnya" multiple="multiple"/></label>' +
        '</div>' +
        '<div class="lp-edit-note-info">Harga ditentukan admin saat proofing &#8212; tidak bisa diubah dari sini. Foto desain yang sudah ada tetap tersimpan.</div>' +
      '</div>' +
      '<div class="lp-edit-modal-foot">' +
        '<button class="lp-edit-cancel" onclick="lpTutupEditOrder()" type="button">Batal</button>' +
        '<button class="lp-edit-save" id="lp-edit-save-btn" onclick="lpSimpanEditOrder(\'' + g.idOrderRequest + '\')" type="button">Simpan Perubahan</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  rjdIsiFormDariOrder_("lp-edit-items", g.items);
  ofMuatMasterArtikel_(g.idKlien || null);
  ofRenderJadwalKirim_("lp-edit-jadwal", g.jadwalKirim);
  ofRenderKainKlien_("lp-edit-kaink", g.kainDariKlien);
  if(thumbsFile){
    var lblFile = document.getElementById("lp-edit-file-lbl");
    if(lblFile) lblFile.textContent = "Ganti File Lainnya (opsional -- kalau diisi, file tersimpan di atas akan DIGANTI)";
  }
  rjdBindAutoGrowAll(overlay);
}

function lpTutupEditOrder(){
  const ov = document.getElementById("lp-edit-overlay");
  if(ov) ov.remove();
  document.body.style.overflow = "";
}

async function lpSimpanEditOrder(idOrderRequest){
  const btn = document.getElementById("lp-edit-save-btn");
  if(btn){ btn.disabled = true; btn.textContent = "Menyimpan..."; }

  // Pakai pengumpul ASYNC (sama dengan form order & modal order baru) supaya
  // upload Foto Desain ikut terbaca. Versi sinkron yang lama nggak baca file --
  // itu sebabnya upload di modal edit sebelumnya nggak berfungsi.
  let items;
  try{
    const mslh = ofCekItemBelumLengkap_("lp-edit-items");
    if(mslh.length){
      alert("Ada item yang belum lengkap dan TIDAK akan tersimpan:\n\n- " + mslh.join("\n- "));
      if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
      return;
    }
    items = await ofKumpulkanItemsAsync("lp-edit-items");
  }catch(errBaca){
    alert(errBaca.message || "Gagal membaca file.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }

  if(!items.length){
    alert("Isi minimal 1 item (Artikel & Warna wajib) dengan minimal 1 ukuran.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }
  const adaQty = items.some(function(it){
    return Object.keys(it.sizeQty).length > 0 || (it.detailAllSize && it.detailAllSize.trim() !== "");
  });
  if(!adaQty){
    alert("Isi jumlah (qty) minimal untuk 1 ukuran.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }

  let fileLainnyaList = [];
  try{
    const inpFile = document.getElementById("lp-edit-file-lainnya");
    fileLainnyaList = await ofBacaBanyakFileSebagaiBase64_(inpFile ? inpFile.files : null);
  }catch(e2){
    alert(e2.message || "Gagal membaca file.");
    if(btn){ btn.disabled = false; btn.textContent = "Simpan Perubahan"; }
    return;
  }

  fetch(lpApiUrlUniversal_(), {
    method: "POST",
    body: JSON.stringify({
      idToken: lpIdTokenUniversal_(),
      action: "rewriteOrderRequest",
      idOrderRequest: idOrderRequest,
      payload: {
        targetTanggalKirim: (document.getElementById("lp-edit-target").value || "").trim(),
        jadwalKirim: ofKumpulkanJadwalKirim_("lp-edit-jadwal"),
        kainDariKlien: ofKumpulkanKainKlien_("lp-edit-kaink"),
        catatanKlien: (document.getElementById("lp-edit-catatan-klien").value || "").trim(),
        items: items,
        fileLainnyaList: fileLainnyaList
      }
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.success){
      lpTutupEditOrder();
      if(typeof lpFetchProfilDanOrderan === "function"){
        lpFetchProfilDanOrderan(window.LP_PROFIL_ID_KLIEN_SAAT_INI || null);
      }
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

// Size yang ditampilkan di editor -- sama daftar dengan ORDER_REQUEST_SIZE_KOLOM
// backend (tanpa "All Size" yang jarang & bikin baris kepanjangan; kalau perlu
// All Size / ukuran non-standar, klien tulis di "Catatan item ini").
var LP_ORDER_EDIT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

/* ============================================================
 * PENYESUAIAN MENU MENURUT PERAN
 * ============================================================
 * Menyembunyikan item menu yang memang akan ditolak server, supaya staff
 * produksi tidak mengklik Invoice lalu bertemu pesan "tidak punya akses" --
 * pengalaman yang bukan cuma mengganggu, tapi terasa seperti sistemnya rusak.
 *
 * INI MURNI KENYAMANAN, BUKAN PENGAMAN. Penolakan sebenarnya ada di
 * pastikanBoleh_() di backend (akses-role.gs). Kalau skrip ini gagal jalan,
 * tidak ada data yang bocor -- menu cuma tampil lalu halamannya menolak,
 * persis seperti sebelum penyesuaian ini ada.
 *
 * Menyembunyikan menu TIDAK PERNAH boleh dijadikan satu-satunya pembatas:
 * siapa pun yang pernah melihat URL-nya tetap bisa mengetiknya langsung.
 * ============================================================ */

/** Item menu yang disembunyikan per area yang TIDAK dimiliki. */
var RJD_MENU_PER_AREA = {
  keuangan: ["/p/invoice.html"],
  pajak: ["/p/laporan-omset.html"]
  // Catatan: /p/order-list.html SENGAJA tidak disembunyikan untuk peran
  // produksi. Daftar order itu sendiri boleh dilihat (area "produksi") --
  // yang ditolak cuma tab Edit PO di dalamnya, karena di situ ada harga.
};

function rjdSesuaikanMenuPeran_(peran) {
  if (!peran || !peran.staff) return;
  var punya = peran.area || [];
  Object.keys(RJD_MENU_PER_AREA).forEach(function (area) {
    if (punya.indexOf(area) !== -1) return;   // punya aksesnya -> biarkan
    RJD_MENU_PER_AREA[area].forEach(function (href) {
      document.querySelectorAll(".rjd-menu-panel a[href='" + href + "']").forEach(function (a) {
        a.style.display = "none";
      });
    });
  });
  // Ditandai di <body> supaya CSS halaman bisa ikut menyesuaikan kalau perlu,
  // tanpa harus memanggil rute ini lagi.
  document.body.setAttribute("data-peran", peran.peran || "");
}

/**
 * Panggil sekali setelah token tersedia. Aman dipanggil berkali-kali --
 * hasilnya disimpan supaya tidak menembak server tiap ganti tab.
 */
function rjdMuatPeran(apiUrl, idToken) {
  if (!apiUrl || !idToken) return;
  if (window.RJD_PERAN) { rjdSesuaikanMenuPeran_(window.RJD_PERAN); return; }
  fetch(apiUrl, {
    method: "POST",
    body: JSON.stringify({ idToken: idToken, action: "getPeranSaya" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) return;   // gagal -> menu tampil apa adanya, tidak fatal
    window.RJD_PERAN = d;
    rjdSesuaikanMenuPeran_(d);
  })
  .catch(function () { /* diamkan -- ini kenyamanan, bukan fondasi */ });
}

/**
 * Deteksi otomatis: begitu ada sesi tersimpan, sesuaikan menunya.
 *
 * SENGAJA di sini, bukan disisipkan ke tiap halaman. Tiap halaman punya pola
 * login yang berbeda (login manual, auto-login dari cache, sesi bersama), dan
 * menempelkan panggilan di tiap jalur berarti cepat atau lambat ada jalur yang
 * terlewat -- lalu menunya tidak tersesuaikan tanpa ada yang sadar.
 *
 * "db_session" dipakai bersama Dashboard, Orderan, Pengiriman, Invoice, QC,
 * dan Produksi. Portal Klien memakai "lp_session" dan memang tidak perlu
 * penyesuaian ini (menunya sudah versi ringkas untuk klien).
 *
 * Dijalankan berulang sebentar di awal karena sebagian halaman baru menulis
 * sesinya setelah tombol Google diklik -- lebih andal daripada menebak kapan
 * tiap halaman selesai login. Berhenti begitu dapat, atau setelah 30 detik.
 */
(function rjdPantauSesiUntukMenu_() {
  var API = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";
  var percobaan = 0;

  function coba() {
    percobaan++;
    if (window.RJD_PERAN) return;              // sudah dapat -> berhenti
    if (percobaan > 15) return;                // ~30 detik -> menyerah diam-diam
    var token = null;
    try {
      var raw = localStorage.getItem("db_session");
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.token && data.exp && data.exp * 1000 > Date.now()) token = data.token;
      }
    } catch (e) { /* localStorage diblokir -> lewati, menu tampil apa adanya */ }

    if (token) { rjdMuatPeran(API, token); return; }
    setTimeout(coba, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(coba, 300); });
  } else {
    setTimeout(coba, 300);
  }
})();

/* ============================================================
 * PERAN -> MENU (kenyamanan, BUKAN keamanan)
 * ============================================================
 * Menyembunyikan tautan menu yang memang akan ditolak server. Penolakan
 * sesungguhnya tetap di backend (pastikanBoleh_ di akses-role.gs) -- fungsi di
 * sini murni supaya orang tidak mengklik sesuatu yang pasti gagal.
 *
 * JANGAN PERNAH memindahkan pembatasan akses ke sini. Apa pun yang cuma
 * disembunyikan di layar tetap bisa dibuka lewat URL langsung, dan datanya
 * tetap keluar kalau backend-nya tidak menolak.
 *
 * Dijalankan OTOMATIS saat halaman dimuat, memakai token sesi staff yang
 * dipakai bersama (localStorage "db_session"). Kalau tidak ada token (belum
 * login / halaman klien), fungsi ini diam saja -- menu tetap apa adanya.
 * ============================================================ */

/** Halaman -> area yang dibutuhkan. Halaman tanpa entri = boleh semua. */
var RJD_AREA_HALAMAN = {
  "/p/invoice.html":       "keuangan",
  "/p/laporan-omset.html": "pajak",
  // Dashboard Operasional memang tertutup penuh untuk peran Produksi -- itu
  // penjaga LAMA di doPost (bukan dari sistem peran ini), dan masuk akal:
  // isinya omset, aging piutang, konsentrasi risiko. Tautannya ikut
  // disembunyikan supaya mereka tidak mengklik sesuatu yang pasti berakhir
  // di layar error.
  "/p/dashboard.html":     "keuangan",
  // Portal Klien (mode internal) membuka daftar SELURUH klien beserta order,
  // pengiriman & profil mereka. Form Order mode staff = mengajukan order ATAS
  // NAMA klien. Dua-duanya pekerjaan CS/admin, bukan lantai produksi.
  //
  // CATATAN: ini cuma menyembunyikan tautannya. Penolakan sesungguhnya ada di
  // backend -- blok internal Portal Klien di doPost, dan cekStaffFormOrder yang
  // masuk area "order".
  //
  // KLIEN tidak terkena: rjdTerapkanPeranKeMenu berhenti kalau peran kosong
  // (bukan staff), jadi menu ringkas di dua halaman itu tetap utuh buat mereka.
  "/p/tracking.html":      "order",
  "/p/order.html":         "order"
  // Dashboard, Orderan, Produksi, QC, Pengiriman SENGAJA tidak didaftarkan:
  // halaman-halaman itu tetap berguna untuk peran Produksi, yang tertutup cuma
  // sebagian tab di dalamnya (Order Masuk, Edit PO) -- dan itu ditangani JS
  // halaman masing-masing, bukan dari sini.
};

/**
 * API URL untuk keperluan menu. SENGAJA tidak memakai lpApiUrlUniversal_():
 * helper itu cuma mengenal DB_/LP_/OF_ (tiga cabang yang ada saat ia dibuat),
 * sedangkan menu ada di SEMUA halaman staff -- Produksi pakai SP_, Pengiriman
 * KR_, Invoice IV_, Daftar Order OL_, QC QC_, Laporan Omset LO_.
 *
 * Akibat kelalaian ini pada versi pertama: di halaman-halaman itu fungsi
 * penerap peran berhenti diam-diam sebelum sempat memanggil server, sehingga
 * menu tetap tampil utuh untuk semua peran.
 *
 * lpApiUrlUniversal_ sendiri TIDAK diubah -- dia dipakai fungsi lain yang
 * memang cuma jalan di tiga cabang itu, dan memperluasnya menambah risiko
 * tanpa manfaat di sini.
 */
function rjdApiUrlMenu_() {
  if (typeof DB_API_URL !== "undefined") return DB_API_URL;
  if (typeof SP_API_URL !== "undefined") return SP_API_URL;
  if (typeof KR_API_URL !== "undefined") return KR_API_URL;
  if (typeof IV_API_URL !== "undefined") return IV_API_URL;
  if (typeof OL_API_URL !== "undefined") return OL_API_URL;
  if (typeof QC_API_URL !== "undefined") return QC_API_URL;
  if (typeof LO_API_URL !== "undefined") return LO_API_URL;
  if (typeof LP_API_URL !== "undefined") return LP_API_URL;
  if (typeof OF_API_URL !== "undefined") return OF_API_URL;
  return null;
}

function rjdBacaTokenStaff_() {
  try {
    var raw = localStorage.getItem("db_session");
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !d.token) return null;
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}

/**
 * Ambil peran pemanggil, lalu sembunyikan tautan menu yang tidak berhak.
 * Gagal diam-diam kalau apa pun bermasalah -- menu yang tampil berlebih jauh
 * lebih ringan akibatnya daripada menu yang hilang seluruhnya karena satu
 * permintaan gagal.
 */
function rjdTerapkanPeranKeMenu() {
  var api = rjdApiUrlMenu_();
  var token = rjdBacaTokenStaff_();
  if (!api || !token) return;

  fetch(api, {
    method: "POST",
    body: JSON.stringify({ idToken: token, action: "getPeranSaya" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) return;
    var area = d.area || [];
    // Bukan staff (klien biasa) -> jangan sentuh apa pun. Menu mereka memang
    // tidak punya tautan staff, dan menyembunyikan berdasarkan area kosong
    // justru akan menghapus menu yang sah.
    if (!d.peran) return;

    Object.keys(RJD_AREA_HALAMAN).forEach(function (href) {
      if (area.indexOf(RJD_AREA_HALAMAN[href]) !== -1) return;
      document.querySelectorAll(".rjd-menu-panel a[href='" + href + "']")
        .forEach(function (a) { a.style.display = "none"; });
    });
    // Ditandai di <body> supaya CSS/JS halaman bisa ikut menyesuaikan tanpa
    // memanggil server lagi (mis. menyembunyikan tab Order Masuk di Dashboard).
    document.body.setAttribute("data-peran", d.peran);
    document.body.setAttribute("data-area", area.join(" "));
  })
  .catch(function () { /* gagal diam-diam -- lihat catatan di atas */ });
}

document.addEventListener("DOMContentLoaded", function () {
  // Ditunda sebentar: sebagian halaman baru menyisipkan headernya setelah
  // login sukses, jadi menjalankan ini terlalu awal tidak menemukan apa pun.
  setTimeout(rjdTerapkanPeranKeMenu, 1200);
});
