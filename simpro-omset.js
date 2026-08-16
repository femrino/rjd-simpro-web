/**
 * ============================================================
 * SIMPRO -- simpro-omset
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : laporan-omset.html
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const LO_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const LO_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";
const LO_BULAN_NAMA = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

let LO_ID_TOKEN = null;
let LO_DATA_MENTAH = null;

function loShow(id){
  ["lo-login-box","lo-loading","lo-error","lo-isi"].forEach(function(x){
    document.getElementById(x).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

function loTampilkanError(pesan){
  document.getElementById("lo-error-message").textContent = pesan;
  loShow("lo-error");
}

function loHandleLogin(response){
  LO_ID_TOKEN = response.credential;
  loShow("lo-loading");
  loFetchData();
}

function loFetchData() {
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke loFetchDataIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(LO_ID_TOKEN, LO_API_URL, loFetchDataIsi_);
  } else {
    loFetchDataIsi_();
  }
}

function loFetchDataIsi_() {
  fetch(LO_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: LO_ID_TOKEN, action: "getLaporanOmsetPajak" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(!data.success){
      loTampilkanError(data.error || "Gagal memuat laporan.");
      return;
    }
    LO_DATA_MENTAH = data.data;
    loSetupTahunSelector();
    loRenderLaporan();
    document.getElementById("lo-print-btn").classList.remove("hidden");
    document.getElementById("lo-export-btn").classList.remove("hidden");
    loShow("lo-isi");
  })
  .catch(function(){
    loTampilkanError("Gagal menghubungi server. Coba beberapa saat lagi.");
  });
}

function loSetupTahunSelector(){
  const tahunSet = {};
  ["omsetOrder","omsetInvoice","omsetLunas","omsetProduksiSewing"].forEach(function(kunci){
    (LO_DATA_MENTAH[kunci] || []).forEach(function(b){ tahunSet[b.tahun] = true; });
  });
  const tahunList = Object.keys(tahunSet).map(Number).sort(function(a,b){ return b - a; });

  const sel = document.getElementById("lo-tahun-selector");
  sel.innerHTML = tahunList.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join("");
  const tahunSekarang = new Date().getFullYear();
  sel.value = tahunList.indexOf(tahunSekarang) !== -1 ? String(tahunSekarang) : String(tahunList[0] || "");
  sel.onchange = loRenderLaporan;
}

function loFormatRupiahPenuh(n){
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}

/** Susun map bulan(1-12) -> {totalOmset, jumlahInvoice} dari array tren, utk 1 tahun. */
function loMapPerBulan(arr, tahun){
  const map = {};
  for(let b = 1; b <= 12; b++) map[b] = { totalOmset: 0, jumlahInvoice: 0, jumlahTidakLengkap: 0 };
  (arr || []).forEach(function(x){
    if(String(x.tahun) !== String(tahun)) return;
    map[x.bulan] = {
      totalOmset: x.totalOmset,
      jumlahInvoice: (x.jumlahOrder !== undefined ? x.jumlahOrder : x.jumlahInvoice) || 0,
      jumlahTidakLengkap: x.jumlahBarisTidakLengkap || 0
    };
  });
  return map;
}

function loRenderLaporan(){
  const tahun = document.getElementById("lo-tahun-selector").value;
  if(!tahun){
    document.getElementById("lo-cetak-area").innerHTML = '<p style="color:var(--ink-soft);font-size:13px">Belum ada data omset.</p>';
    return;
  }

  const mapOrder = loMapPerBulan(LO_DATA_MENTAH.omsetOrder, tahun);
  const mapInvoice = loMapPerBulan(LO_DATA_MENTAH.omsetInvoice, tahun);
  const mapLunas = loMapPerBulan(LO_DATA_MENTAH.omsetLunas, tahun);
  const mapProduksi = loMapPerBulan(LO_DATA_MENTAH.omsetProduksiSewing, tahun);

  let totalOrder = 0, totalInvoice = 0, totalLunas = 0, totalProduksi = 0, totalTidakLengkap = 0;
  const baris = [];
  for(let b = 1; b <= 12; b++){
    const o = mapOrder[b].totalOmset, i = mapInvoice[b].totalOmset, l = mapLunas[b].totalOmset, p = mapProduksi[b].totalOmset;
    totalOrder += o; totalInvoice += i; totalLunas += l; totalProduksi += p;
    totalTidakLengkap += mapProduksi[b].jumlahTidakLengkap;
    baris.push('<tr>' +
      '<td>' + LO_BULAN_NAMA[b-1] + '</td>' +
      '<td>' + loFormatRupiahPenuh(o) + '</td>' +
      '<td>' + loFormatRupiahPenuh(p) + '</td>' +
      '<td>' + loFormatRupiahPenuh(i) + '</td>' +
      '<td>' + loFormatRupiahPenuh(l) + '</td>' +
    '</tr>');
  }
  baris.push('<tr class="lo-total">' +
    '<td>Total ' + tahun + '</td>' +
    '<td>' + loFormatRupiahPenuh(totalOrder) + '</td>' +
    '<td>' + loFormatRupiahPenuh(totalProduksi) + '</td>' +
    '<td>' + loFormatRupiahPenuh(totalInvoice) + '</td>' +
    '<td>' + loFormatRupiahPenuh(totalLunas) + '</td>' +
  '</tr>');

  const peringatanProduksi = totalTidakLengkap > 0
    ? '<div class="lo-catatan" style="background:#FCF3E3;color:#8A5D1F;margin-top:10px">&#9888; ' + totalTidakLengkap +
      ' baris data produksi tahun ini belum kehitung penuh ke Omset Produksi (resep produk/Harga Satuan PO belum lengkap) -- angka kolom ini kemungkinan <b>understate</b>, jangan dipakai sebagai basis pelaporan tanpa dicek manual dulu.</div>'
    : '';

  const html =
    '<div class="lo-print-header">' +
      '<div style="font-family:\'Archivo\',sans-serif;font-weight:900;font-size:18px">RJD<span style="color:var(--thread)">.</span>APPAREL</div>' +
      '<div style="font-size:12px;color:var(--ink-soft);margin-top:4px">Laporan Omset Tahun ' + tahun + ' -- Piyungan, Bantul, D.I. Yogyakarta</div>' +
    '</div>' +
    '<table class="lo-tabel"><thead><tr>' +
      '<th>Bulan</th><th>Omset Order Masuk</th><th>Omset Produksi</th><th>Omset Invoice Diterbitkan</th><th>Omset Invoice Lunas</th>' +
    '</tr></thead><tbody>' + baris.join("") + '</tbody></table>' +
    '<div class="lo-catatan">' +
      '<b>Catatan:</b> "Omset Order Masuk" = nilai order pas dibuat (akrual, dari SD Purchase Order). ' +
      '"Omset Invoice Diterbitkan" = SEMUA invoice yang terbit di bulan itu, apapun status bayarnya. ' +
      '"Omset Invoice Lunas" = cuma invoice yang sudah Lunas, dikelompokkan berdasarkan TANGGAL INVOICE terbit ' +
      '(bukan tanggal pelunasan aktual -- sistem belum mencatat itu terpisah). ' +
      '"Omset Produksi" = nilai kerja tahap perakitan/penjahitan (output &#215; bobot Cycle Time &#215; Harga Satuan PO), dipakai sebagai representasi omset produksi -- BUKAN basis resmi untuk pelaporan pajak, cuma referensi pembanding internal. ' +
      'Pilih kolom yang sesuai metode pembukuan yang didaftarkan untuk SPT Tahunan.' +
    '</div>' + peringatanProduksi;

  document.getElementById("lo-cetak-area").innerHTML = html;
  document.title = "Laporan Omset " + tahun + " -- RJD Apparel";
}

function loExportCsv(){
  const tahun = document.getElementById("lo-tahun-selector").value;
  if(!tahun) return;

  const mapOrder = loMapPerBulan(LO_DATA_MENTAH.omsetOrder, tahun);
  const mapInvoice = loMapPerBulan(LO_DATA_MENTAH.omsetInvoice, tahun);
  const mapLunas = loMapPerBulan(LO_DATA_MENTAH.omsetLunas, tahun);
  const mapProduksi = loMapPerBulan(LO_DATA_MENTAH.omsetProduksiSewing, tahun);

  const baris = [["Bulan","Omset Order Masuk","Omset Produksi","Omset Invoice Diterbitkan","Omset Invoice Lunas"]];
  let totalOrder = 0, totalInvoice = 0, totalLunas = 0, totalProduksi = 0;
  for(let b = 1; b <= 12; b++){
    const o = mapOrder[b].totalOmset, i = mapInvoice[b].totalOmset, l = mapLunas[b].totalOmset, p = mapProduksi[b].totalOmset;
    totalOrder += o; totalInvoice += i; totalLunas += l; totalProduksi += p;
    baris.push([LO_BULAN_NAMA[b-1], o, p, i, l]);
  }
  baris.push(["Total " + tahun, totalOrder, totalProduksi, totalInvoice, totalLunas]);

  const csv = baris.map(function(row){
    return row.map(function(cell){
      const s = String(cell);
      return (s.indexOf(",") !== -1 || s.indexOf('"') !== -1) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Laporan-Omset-RJD-Apparel-" + tahun + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.onload = function(){
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.initialize({
      client_id: LO_OAUTH_CLIENT_ID,
      callback: loHandleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("lo-google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }
};

/* ============================================================
 * TAB HPP
 * ============================================================
 * Ditambahkan di halaman Laporan Omset karena keduanya sama-sama angka uang
 * dan sama-sama peran full/admin. HPP TIDAK ditaruh di halaman Produksi --
 * tim cutting tidak perlu tahu margin, dan menaruhnya di sana berarti setiap
 * penyaringan akses baru harus memikirkan hal itu lagi.
 *
 * DATANYA DARI CACHE, bukan hitung langsung. Perhitungan penuh memakan ~170
 * detik karena membaca seluruh Archive_DailyReport; halaman tidak bisa
 * menunggu selama itu. Cache diperbarui trigger harian updateCacheHPP().
 */

let LO_HPP_DATA = null;
let LO_HPP_SEDANG_AMBIL = false;
let LO_HPP_TAMPIL_SEMUA = { artikel: false, order: false };

function loGantiTab(tab) {
  const isHpp = (tab === "hpp");
  document.getElementById("lo-tab-spt").classList.toggle("aktif", !isHpp);
  document.getElementById("lo-tab-hpp").classList.toggle("aktif", isHpp);
  document.getElementById("lo-panel-spt").classList.toggle("hidden", isHpp);
  document.getElementById("lo-panel-hpp").classList.toggle("hidden", !isHpp);

  // Cetak & export milik laporan SPT. Membiarkannya terlihat di tab HPP akan
  // menghasilkan CSV omset padahal yang di layar HPP -- salah satu cara paling
  // halus membuat orang tidak percaya lagi pada tombol.
  ["lo-print-btn", "lo-export-btn"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", isHpp);
  });

  // Diambil sekali saja, dan hanya kalau tabnya dibuka. Halaman SPT tidak
  // boleh jadi lebih lambat gara-gara fitur yang mungkin tidak dipakai.
  if (isHpp && !LO_HPP_DATA && !LO_HPP_SEDANG_AMBIL) loAmbilHPP();
}

function loAmbilHPP() {
  LO_HPP_SEDANG_AMBIL = true;
  const wadah = document.getElementById("lo-panel-hpp");
  wadah.innerHTML = '<div class="lo-hpp-memuat"><div class="lo-spinner"></div>' +
    '<div class="lo-loading-text">Memuat HPP</div></div>';

  fetch(LO_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: LO_ID_TOKEN, action: "getRingkasanHPP" })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    LO_HPP_SEDANG_AMBIL = false;
    if (!data.success) {
      wadah.innerHTML = '<div class="lo-hpp-kosong">' + loEsc(data.error || "Gagal memuat HPP.") + '</div>';
      return;
    }
    LO_HPP_DATA = data.data;
    loRenderHPP();
  })
  .catch(function () {
    LO_HPP_SEDANG_AMBIL = false;
    wadah.innerHTML = '<div class="lo-hpp-kosong">Gagal menghubungi server.</div>';
  });
}

function loEsc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loRp(n) {
  const x = Number(n);
  if (!isFinite(x) || x === 0) return "-";
  return (x < 0 ? "-Rp " : "Rp ") + Math.abs(Math.round(x)).toLocaleString("id-ID");
}

/** Umur cache dalam hari. Dipakai memutuskan seberapa keras memperingatkan. */
function loUmurHari(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  return Math.floor((Date.now() - t.getTime()) / 86400000);
}

function loRenderHPP() {
  const d = LO_HPP_DATA;
  const r = d.ringkasan || {};
  const umur = loUmurHari(d.diperbarui);

  // Tanggal cache ditampilkan SELALU, bukan cuma saat basi.
  //
  // Angka HPP tampak sama meyakinkannya baik dihitung tadi malam maupun tiga
  // minggu lalu. Satu-satunya yang membedakan adalah keterangan ini -- dan
  // kalau cuma muncul saat basi, orang tidak pernah belajar mencarinya.
  let jejak = "";
  if (!d.diperbarui) {
    jejak = '<div class="lo-hpp-jejak lo-hpp-jejak-buruk">Cache belum pernah dibuat. ' +
      'Jalankan updateCacheHPP() di Apps Script.</div>';
  } else {
    const tgl = new Date(d.diperbarui).toLocaleDateString("id-ID",
      { day: "numeric", month: "long", year: "numeric" });
    const kelas = (umur !== null && umur > 3) ? " lo-hpp-jejak-buruk" : "";
    const tambahan = (umur !== null && umur > 3)
      ? " &#183; sudah " + umur + " hari, trigger harian mungkin gagal"
      : "";
    jejak = '<div class="lo-hpp-jejak' + kelas + '">Angka per ' + tgl + tambahan + '</div>';
  }

  const kartu = [
    ["Margin sekarang",
      (r["Laba Per Pcs Min"] && r["Jual Per Pcs"])
        ? (Math.round(r["Laba Per Pcs Min"] / r["Jual Per Pcs"] * 1000) / 10) + "% - " +
          (Math.round(r["Laba Per Pcs Max"] / r["Jual Per Pcs"] * 1000) / 10) + "%"
        : "-",
      "per pcs, sesudah kain, upah, dan overhead"],
    ["Laba per bulan",
      loRp(r["Laba Bulanan Min"]) + " - " + loRp(r["Laba Bulanan Max"]).replace("Rp ", ""),
      "pada " + (r["Output Per Bulan"] || 0).toLocaleString("id-ID") + " pcs/bulan"],
    ["Titik impas",
      loRp(r["Titik Impas Biaya Tetap"]),
      "biaya tetap bulanan yang masih tertutup"],
    ["Biaya per proses",
      loRp(r["Tarif Upah Per Proses Pcs"] + r["Tarif Overhead Min Per Proses Pcs"]) + " - " +
        loRp(r["Tarif Upah Per Proses Pcs"] + r["Tarif Overhead Max Per Proses Pcs"]).replace("Rp ", ""),
      "upah + overhead, dasar harga minimum"]
  ].map(function (k) {
    return '<div class="lo-hpp-kartu"><div class="lo-hpp-kartu-label">' + loEsc(k[0]) +
      '</div><div class="lo-hpp-kartu-nilai">' + k[1] +
      '</div><div class="lo-hpp-kartu-ket">' + k[2] + '</div></div>';
  }).join("");

  document.getElementById("lo-panel-hpp").innerHTML =
    jejak +
    '<div class="lo-hpp-kartu-grid">' + kartu + '</div>' +
    loRenderHPPHarga() +
    loRenderHPPOrder() +
    '<div class="lo-hpp-catatan">' +
      'Semua angka bergantung pada dua perkiraan: upah borongan bulanan (' +
      loRp(r["Upah Borongan Bulanan"]) + ') dan biaya tetap bulanan (' +
      loRp(r["Biaya Tetap Bulanan Min"]) + ' - ' +
      loRp(r["Biaya Tetap Bulanan Max"]).replace("Rp ", ") ") +
      '. Yang tidak bergantung pada keduanya: URUTAN di kedua daftar ini, ' +
      'karena semuanya memakai tarif yang sama.' +
    '</div>';
}

function loRenderHPPHarga() {
  const semua = (LO_HPP_DATA.artikel || []).filter(function (a) {
    return a["Harga Historis"];
  });
  if (!semua.length) return "";

  const tertinggal = semua.filter(function (a) { return Number(a["Jarak Persen"]) > 0; });
  const tampil = LO_HPP_TAMPIL_SEMUA.artikel ? semua : semua.slice(0, 15);

  const baris = tampil.map(function (a) {
    const jarak = Number(a["Jarak Persen"]);
    const kelas = jarak > 25 ? "lo-hpp-berat" : (jarak > 0 ? "lo-hpp-sedang" : "lo-hpp-aman");
    return '<tr><td>' + loEsc(a["Artikel"]) +
        (a["Style"] ? '<div class="lo-hpp-sub">' + loEsc(a["Style"]) + '</div>' : '') + '</td>' +
      '<td class="lo-hpp-num">' + a["Proses Per Pcs"] + '</td>' +
      '<td class="lo-hpp-num">' + loRp(a["Harga Min"]) + '</td>' +
      '<td class="lo-hpp-num">' + loRp(a["Harga Historis"]) + '</td>' +
      '<td class="lo-hpp-num ' + kelas + '">' + (jarak > 0 ? "+" : "") + jarak + '%</td></tr>';
  }).join("");

  return '<div class="lo-hpp-blok">' +
    '<div class="lo-hpp-blok-judul">Harga minimum per artikel</div>' +
    '<div class="lo-hpp-blok-sub">' + tertinggal.length + ' dari ' + semua.length +
      ' artikel harganya belum menutup margin target. Jarak besar bukan berarti harga ' +
      'harus naik sebesar itu &#8212; mengurangi proses juga menutupnya.</div>' +
    '<div class="lo-hpp-tabelwrap"><table class="lo-hpp-tabel">' +
    '<thead><tr><th>Artikel</th><th class="lo-hpp-num">Proses</th>' +
    '<th class="lo-hpp-num">Harga min</th><th class="lo-hpp-num">Pernah dijual</th>' +
    '<th class="lo-hpp-num">Jarak</th></tr></thead><tbody>' + baris + '</tbody></table></div>' +
    (semua.length > 15
      ? '<a class="lo-hpp-lainnya" href="#" onclick="LO_HPP_TAMPIL_SEMUA.artikel=!LO_HPP_TAMPIL_SEMUA.artikel;loRenderHPP();return false;">' +
        (LO_HPP_TAMPIL_SEMUA.artikel ? 'Tampilkan 15 teratas saja' : 'Tampilkan ' + (semua.length - 15) + ' artikel lainnya') + '</a>'
      : '') +
    '</div>';
}

function loRenderHPPOrder() {
  const rugi = (LO_HPP_DATA.order || []).filter(function (o) { return o["Status"] === "Rugi"; });
  if (!rugi.length) {
    return '<div class="lo-hpp-blok"><div class="lo-hpp-blok-judul">Order yang merugi</div>' +
      '<div class="lo-hpp-kosong">Tidak ada order yang rugi pada kedua ujung rentang.</div></div>';
  }

  const tampil = LO_HPP_TAMPIL_SEMUA.order ? rugi : rugi.slice(0, 10);
  const baris = tampil.map(function (o) {
    const totalMin = Number(o["Laba Min"]) * Number(o["Qty"]);
    return '<tr><td>' + loEsc(o["ID Purchase Order"]) +
        (o["ID Klien"] ? '<div class="lo-hpp-sub">' + loEsc(o["ID Klien"]) + '</div>' : '') + '</td>' +
      '<td class="lo-hpp-num">' + Number(o["Qty"]).toLocaleString("id-ID") + '</td>' +
      '<td class="lo-hpp-num">' + loRp(o["Jual Per Pcs"]) + '</td>' +
      '<td class="lo-hpp-num">' + loRp(o["Upah Per Pcs"]) + '</td>' +
      '<td class="lo-hpp-num lo-hpp-berat">' + loRp(o["Laba Min"]) + ' .. ' +
        loRp(o["Laba Max"]).replace("Rp ", "").replace("-", "-") + '</td>' +
      '<td class="lo-hpp-num lo-hpp-berat">' + loRp(totalMin) + '</td></tr>';
  }).join("");

  return '<div class="lo-hpp-blok">' +
    '<div class="lo-hpp-blok-judul">Order yang merugi &#8212; ' + rugi.length + ' order</div>' +
    '<div class="lo-hpp-blok-sub">Rugi pada kedua ujung rentang, jadi tidak tergantung ' +
      'ketepatan angka perkiraan. Ini bukan order yang omsetnya kecil &#8212; ini order ' +
      'yang harganya di bawah biayanya.</div>' +
    '<div class="lo-hpp-tabelwrap"><table class="lo-hpp-tabel">' +
    '<thead><tr><th>Order</th><th class="lo-hpp-num">Qty</th>' +
    '<th class="lo-hpp-num">Jual/pcs</th><th class="lo-hpp-num">Upah/pcs</th>' +
    '<th class="lo-hpp-num">Laba/pcs</th><th class="lo-hpp-num">Total</th></tr></thead>' +
    '<tbody>' + baris + '</tbody></table></div>' +
    (rugi.length > 10
      ? '<a class="lo-hpp-lainnya" href="#" onclick="LO_HPP_TAMPIL_SEMUA.order=!LO_HPP_TAMPIL_SEMUA.order;loRenderHPP();return false;">' +
        (LO_HPP_TAMPIL_SEMUA.order ? 'Tampilkan 10 teratas saja' : 'Tampilkan ' + (rugi.length - 10) + ' order lainnya') + '</a>'
      : '') +
    '</div>';
}
