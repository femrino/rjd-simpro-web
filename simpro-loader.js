/* simpro-loader.js -- pemuat versi (v292, 6 Sep 2026)
 *
 * SATU rujukan di template Blogger menggantikan 35 rujukan CDN yang dulu harus
 * dinaikkan (dan ditempel ulang) tiap rilis. Cara kerja:
 *   1. Baca VERSI.json dari cabang main repo web (jsDelivr, cache-buster per menit)
 *      secara SINKRON -- supaya CSS terpasang sebelum <body> diurai, tanpa kedip.
 *   2. Ambil tag web dari situ ("web": "vNNN") dan daftar berkas per halaman
 *      ("halaman"). Kalau gagal (offline, jsDelivr bermasalah, JSON rusak):
 *      pakai data-versi-cadangan pada tag <script> ini + HALAMAN_CADANGAN di
 *      bawah -- yaitu keadaan saat template terakhir ditempel. Halaman tetap
 *      hidup, hanya mungkin satu versi tertinggal.
 *   3. CSS (global + halaman) dipasang SEKARANG di <head>. simpro-global.js
 *      dipasang SEKARANG (async=false). JS halaman dipasang saat DOM siap
 *      (DOMContentLoaded, atau langsung kalau sudah lewat), async=false, jadi
 *      urutannya global -> sop -> spk seperti template lama, dan elemen halaman
 *      sudah ada saat kode tingkat atasnya berjalan (dashboard/tracking membaca
 *      DOM saat dimuat). Event `load` tetap menunggu semua skrip ini.
 *
 * Yang HARUS diingat kalau mengubah berkas ini: rujukannya di template dipin ke
 * tag (mis. @v292/simpro-loader.js). Mengubah loader = rilis + tempel template
 * sekali. Mengubah versi berkas lain = cukup VERSI.json (tanpa tempel).
 * Menambah HALAMAN baru = ubah VERSI.json (berlaku seketika) DAN HALAMAN_CADANGAN
 * (cadangan) -> loader berubah -> tempel sekali.
 *
 * Keadaan yang bisa dibaca dari konsol / harness: window.SIMPRO_VERSI =
 * { versi, sumber: "VERSI.json"|"cadangan", halaman, dimuat: [...], gagal: [...] }
 * dan atribut data-simpro-versi pada <html>.
 */
(function () {
  var DASAR = "https://cdn.jsdelivr.net/gh/femrino/rjd-simpro-web@";
  var HALAMAN_CADANGAN = {
    "_global": { "css": ["simpro-global.css"], "js": ["simpro-global.js"] },
    "/": { "css": ["simpro-home.css"], "js": [] },
    "/p/tracking.html": { "css": ["simpro-tracking.css"], "js": ["simpro-tracking.js"] },
    "/p/dashboard.html": { "css": ["simpro-dashboard.css"], "js": ["simpro-dashboard.js"] },
    "/p/order.html": { "css": ["simpro-order.css"], "js": ["simpro-order.js"] },
    "/p/order-list.html": { "css": ["simpro-orderlist.css"], "js": ["simpro-orderlist.js"] },
    "/p/pengiriman.html": { "css": ["simpro-pengiriman.css"], "js": ["simpro-pengiriman.js"] },
    "/p/invoice.html": { "css": ["simpro-invoice.css"], "js": ["simpro-invoice.js"] },
    "/p/cetak.html": { "css": ["simpro-cetak.css"], "js": ["simpro-cetak.js"] },
    "/p/laporan-omset.html": { "css": ["simpro-omset.css"], "js": ["simpro-omset.js"] },
    "/p/kalkulator-harga.html": { "css": ["simpro-kalkulator.css"], "js": ["simpro-kalkulator.js"] },
    "/p/sop.html": { "css": ["simpro-sop.css"], "js": ["simpro-sop.js"] },
    "/p/jadwal.html": { "css": ["simpro-jadwal.css"], "js": ["simpro-jadwal.js"] },
    "/p/kas.html": { "css": ["simpro-kas.css"], "js": ["simpro-kas.js"] },
    "/p/upah.html": { "css": ["simpro-upah.css"], "js": ["simpro-upah.js"] },
    "/p/produksi.html": { "css": ["simpro-spk.css", "simpro-qc.css", "simpro-sop.css"], "js": ["simpro-sop.js", "simpro-spk.js"] }
  };
  var me = document.currentScript;
  var cadangan = (me && me.getAttribute("data-versi-cadangan")) || "";
  var sumberVersi = (me && me.getAttribute("data-sumber-versi")) || (DASAR + "main/VERSI.json");
  var keadaan = { versi: "", sumber: "", halaman: null, dimuat: [], gagal: [] };
  window.SIMPRO_VERSI = keadaan;

  // ---- 1. versi ----
  var manifest = null;
  try {
    var t = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var menit = "" + t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + pad(t.getUTCHours()) + pad(t.getUTCMinutes());
    var x = new XMLHttpRequest();
    x.open("GET", sumberVersi + (sumberVersi.indexOf("?") === -1 ? "?" : "&") + "t=" + menit, false);   // sinkron: CSS harus ada sebelum body
    x.send(null);
    if (x.status === 200) manifest = JSON.parse(x.responseText);
  } catch (e) { manifest = null; }
  if (manifest && /^v\d+$/.test(String(manifest.web || ""))) {
    keadaan.versi = manifest.web; keadaan.sumber = "VERSI.json";
    keadaan.halaman = (manifest.halaman && typeof manifest.halaman === "object") ? manifest.halaman : HALAMAN_CADANGAN;
  } else {
    keadaan.versi = cadangan; keadaan.sumber = "cadangan"; keadaan.halaman = HALAMAN_CADANGAN;
    if (window.console && console.warn) console.warn("[simpro-loader] VERSI.json tidak terbaca; memakai versi cadangan " + cadangan);
  }
  if (!/^v\d+$/.test(keadaan.versi)) {
    if (window.console && console.error) console.error("[simpro-loader] tidak ada versi yang sah (VERSI.json gagal, data-versi-cadangan kosong). Tidak ada berkas yang dimuat.");
    return;
  }
  document.documentElement.setAttribute("data-simpro-versi", keadaan.versi);
  document.documentElement.setAttribute("data-simpro-sumber", keadaan.sumber);

  // ---- 2. daftar berkas halaman ini ----
  var jalur = (me && me.getAttribute("data-jalur")) || location.pathname || "/";
  var g = keadaan.halaman["_global"] || { css: [], js: [] };
  var h = keadaan.halaman[jalur] || { css: [], js: [] };
  var url = function (nama) { return DASAR + keadaan.versi + "/" + nama; };

  // ---- 3. CSS sekarang ----
  (g.css || []).concat(h.css || []).forEach(function (nama) {
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.type = "text/css"; l.href = url(nama);
    l.onerror = function () { keadaan.gagal.push(nama); };
    document.head.appendChild(l);
    keadaan.dimuat.push(nama);
  });

  // ---- 4. JS: global sekarang, halaman saat DOM siap; semua async=false (berurutan) ----
  // Sesudah SEMUA skrip (global + halaman) selesai (dimuat atau gagal), loader
  // memancarkan event "simpro:siap" dan menandai SIMPRO_VERSI.siap = true. Itu
  // pengganti DOMContentLoaded untuk kode yang dipasang dinamis: simpro-global.js
  // (rjdSaatDomSiap_) menunggunya untuk menerapkan peran ke menu, dsb.
  var tertunda = 0, halamanDipasang = false;
  keadaan.siap = false;
  var cekSiap = function () {
    if (keadaan.siap || tertunda > 0 || !halamanDipasang) return;
    keadaan.siap = true;
    try { document.dispatchEvent(new Event("simpro:siap")); } catch (e) { /* browser lama tanpa Event() */ }
  };
  var pasangSkrip = function (nama) {
    var s = document.createElement("script");
    s.src = url(nama); s.async = false;
    tertunda++;
    s.onload = function () { tertunda--; cekSiap(); };
    s.onerror = function () {
      keadaan.gagal.push(nama);
      if (window.console && console.error) console.error("[simpro-loader] gagal memuat " + nama + " @" + keadaan.versi);
      tertunda--; cekSiap();
    };
    document.head.appendChild(s);
    keadaan.dimuat.push(nama);
  };
  (g.js || []).forEach(pasangSkrip);
  var pasangHalaman = function () { (h.js || []).forEach(pasangSkrip); halamanDipasang = true; cekSiap(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pasangHalaman);
  else pasangHalaman();
})();
