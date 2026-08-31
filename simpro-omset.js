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

/* v228 -- SNAPSHOT LOKAL (Tipe B). Laporan tahunan, isinya berubah lambat;
   7 hari cukup aman dan membuat halaman terbuka seketika. */
var LO_SUDAH_SEGAR = false;

function loFetchDataIsi_() {
  if (!LO_SUDAH_SEGAR && typeof rjdSnapshotBaca_ === "function") {
    const snap = rjdSnapshotBaca_("omset_laporan", 7 * 24 * 60);
    if (snap && snap.data) {
      LO_DATA_MENTAH = snap.data;
      loSetupTahunSelector();
      loRenderLaporan();
      loShow("lo-isi");
      if (typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("lo-isi", snap.waktu);
    }
  }
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
    LO_SUDAH_SEGAR = true;
    if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("omset_laporan", LO_DATA_MENTAH);
    loSetupTahunSelector();
    loRenderLaporan();
    if (typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("lo-isi");
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
  const isKalk = (tab === "kalk");
  document.getElementById("lo-tab-spt").classList.toggle("aktif", tab === "spt");
  document.getElementById("lo-tab-hpp").classList.toggle("aktif", isHpp);
  document.getElementById("lo-tab-kalk").classList.toggle("aktif", isKalk);
  document.getElementById("lo-panel-spt").classList.toggle("hidden", tab !== "spt");
  document.getElementById("lo-panel-hpp").classList.toggle("hidden", !isHpp);
  document.getElementById("lo-panel-kalk").classList.toggle("hidden", !isKalk);

  // Cetak & export milik laporan SPT. Membiarkannya terlihat di tab HPP akan
  // menghasilkan CSV omset padahal yang di layar HPP -- salah satu cara paling
  // halus membuat orang tidak percaya lagi pada tombol.
  ["lo-print-btn", "lo-export-btn"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", tab !== "spt");
  });

  // Diambil sekali saja, dan hanya kalau tabnya dibuka. Halaman SPT tidak
  // boleh jadi lebih lambat gara-gara fitur yang mungkin tidak dipakai.
  //
  // Kalkulator memakai data yang SAMA -- kalau tab HPP belum pernah dibuka,
  // datanya diambil di sini. Kalkulator tidak boleh menuntut orang membuka
  // tab lain lebih dulu; itu urusan dalam yang tidak perlu diketahui pemakai.
  if ((isHpp || isKalk) && !LO_HPP_DATA && !LO_HPP_SEDANG_AMBIL) loAmbilHPP();
  else if (isKalk && LO_HPP_DATA) loRenderKalkulator();
}

function loAmbilHPP() {
  LO_HPP_SEDANG_AMBIL = true;
  // Spinner ditaruh di panel yang SEDANG DILIHAT. Kalau selalu ke panel HPP,
  // orang yang membuka kalkulator melihat layar kosong tanpa tanda apa pun --
  // dan menyangka fiturnya rusak.
  const tabKalkAktif = (document.getElementById("lo-tab-kalk") || {}).classList &&
    document.getElementById("lo-tab-kalk").classList.contains("aktif");
  const wadah = document.getElementById(tabKalkAktif ? "lo-panel-kalk" : "lo-panel-hpp");
  wadah.innerHTML = '<div class="lo-hpp-memuat"><div class="lo-spinner"></div>' +
    '<div class="lo-loading-text">Memuat data</div></div>';

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
    // Kalau yang dibuka tab kalkulator, isi juga -- data ini dipakai keduanya.
    const tabKalk = document.getElementById("lo-tab-kalk");
    if (tabKalk && tabKalk.classList.contains("aktif")) loRenderKalkulator();
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
    (r["Tarif Upah per Menit"] !== undefined
      ? ["Tarif per menit",
          loRp(Number(r["Tarif Upah per Menit"]) + Number(r["Tarif OH per Menit Min"])) + " - " +
            loRp(Number(r["Tarif Upah per Menit"]) + Number(r["Tarif OH per Menit Max"])).replace("Rp ", ""),
          "upah + overhead per menit SMV &#183; tarif tertimbang volume dari arsipmu sendiri"]
      : ["Biaya per proses",
          loRp(r["Tarif Upah Per Proses Pcs"] + r["Tarif Overhead Min Per Proses Pcs"]) + " - " +
            loRp(r["Tarif Upah Per Proses Pcs"] + r["Tarif Overhead Max Per Proses Pcs"]).replace("Rp ", ""),
          "upah + overhead, dasar harga minimum"])
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
      'Semua angka memakai asumsi yang tercantum di kartu &amp; SD Kalibrasi HPP (upah borongan, biaya tetap, kapasitas menit, efisiensi dua-dunia). Angka berubah? Ubah barisnya di SD Kalibrasi HPP lalu jalankan updateCacheHPP &#8212; tanpa menyentuh kode. Baris berbasis &quot;proses&quot; adalah artikel yang resepnya belum layak (cakupan di bawah 50%) &#8212; melengkapi resep otomatis memindahkannya ke basis SMV.' +
    '</div>' +
    '<div class="lo-hpp-blok" id="lo-kal-form">' +
      '<div class="lo-hpp-blok-judul">Koreksi asumsi</div>' +
      '<div class="lo-hpp-blok-sub">Angka kemarin masih perkiraan? Ketik yang benar &#8212; tersimpan ke SD Kalibrasi HPP, lalu seluruh laporan dihitung ulang di latar (&#177;4 menit).</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
        [["Upah Borongan Bulanan","lo-kal-upah"],["Biaya Tetap Bulanan Min","lo-kal-tmin"],
         ["Biaya Tetap Bulanan Max","lo-kal-tmax"],["Margin Target Persen","lo-kal-margin"]]
        .map(function(f){
          const nilaiKini = r[f[0]] !== undefined ? r[f[0]] : "";
          return '<label style="font-size:12.5px;color:var(--ink-soft)">' + f[0] +
            '<input id="' + f[1] + '" inputmode="numeric" style="width:100%;margin-top:4px" ' +
              'type="text" value="' + nilaiKini + '"/></label>';
        }).join("") +
      '</div>' +
      '<div style="margin-top:12px">' +
        '<button class="lo-btn" id="lo-kal-btn" onclick="loSimpanKalibrasi_()" type="button">Simpan &amp; hitung ulang</button>' +
        '<span id="lo-kal-status" style="margin-left:10px;font-size:12.5px;color:var(--ink-soft)"></span>' +
      '</div>' +
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
      '<td class="lo-hpp-num">' + ((a["Basis"] === "SMV" || (a["SMV Menit"] !== "" && a["SMV Menit"] !== undefined))
        ? a["SMV Menit"] + ' <span class="lo-hpp-basis">mnt &#183; ' + loEsc(a["Cakupan Resep"] || "") + '</span>'
        : a["Proses Per Pcs"] + ' <span class="lo-hpp-basis">proses</span>') + '</td>' +
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
    '<thead><tr><th>Artikel</th><th class="lo-hpp-num">SMV / Proses</th>' +
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

  // v135: baris "order" = induk (10 teratas dihitung dari induk saja);
  // baris "item" menempel di bawah induknya -- menunjuk item MANA yang
  // menggerus, dengan harga jual yang BENAR-BENAR disepakati per item.
  const induk = rugi.filter(function (o) { return (o["Level"] || "order") !== "item"; });
  const tampilInduk = LO_HPP_TAMPIL_SEMUA.order ? induk : induk.slice(0, 10);
  const bolehId = {};
  tampilInduk.forEach(function (o) { bolehId[o["ID Purchase Order"]] = true; });
  const tampil = rugi.filter(function (o) { return bolehId[o["ID Purchase Order"]]; });

  const baris = tampil.map(function (o) {
    const item = (o["Level"] || "order") === "item";
    const adaLaba = o["Laba Min"] !== "" && o["Laba Min"] !== undefined;
    const totalMin = adaLaba ? Number(o["Laba Min"]) * Number(o["Qty"]) : null;
    const sel1 = item
      ? '<td class="lo-hpp-item-sel">&#8627; ' + loEsc(o["Item"] || "-") + '</td>'
      : '<td><b>' + loEsc(o["ID Purchase Order"]) + '</b>' +
        (o["ID Klien"] ? '<div class="lo-hpp-sub">' + loEsc(o["ID Klien"]) + '</div>' : '') + '</td>';
    return '<tr class="' + (item ? 'lo-hpp-tr-item' : 'lo-hpp-tr-order') + '">' + sel1 +
      '<td class="lo-hpp-num">' + Number(o["Qty"]).toLocaleString("id-ID") + '</td>' +
      '<td class="lo-hpp-num">' + loRp(o["Jual Per Pcs"]) + '</td>' +
      '<td class="lo-hpp-num">' + (adaLaba ? loRp(o["Upah Per Pcs"]) : '<span title="artikel belum punya jejak proses">?</span>') + '</td>' +
      '<td class="lo-hpp-num lo-hpp-berat">' + (adaLaba
        ? loRp(o["Laba Min"]) + '<span class="lo-hpp-rentang"> .. ' + loRp(o["Laba Max"]).replace("Rp ", "") + '</span>'
        : '-') + '</td>' +
      '<td class="lo-hpp-num lo-hpp-berat">' + (totalMin === null ? '-' : loRp(totalMin)) + '</td></tr>';
  }).join("");

  return '<div class="lo-hpp-blok">' +
    '<div class="lo-hpp-blok-judul">Order yang merugi &#8212; ' + induk.length + ' order</div>' +
    '<div class="lo-hpp-blok-sub">Rugi pada kedua ujung rentang, jadi tidak tergantung ' +
      'ketepatan angka perkiraan. Ini bukan order yang omsetnya kecil &#8212; ini order ' +
      'yang harganya di bawah biayanya.</div>' +
    '<div class="lo-hpp-tabelwrap"><table class="lo-hpp-tabel">' +
    '<thead><tr><th>Order</th><th class="lo-hpp-num">Qty</th>' +
    '<th class="lo-hpp-num">Jual/pcs</th><th class="lo-hpp-num">Upah/pcs</th>' +
    '<th class="lo-hpp-num">Laba/pcs</th><th class="lo-hpp-num">Total</th></tr></thead>' +
    '<tbody>' + baris + '</tbody></table></div>' +
    (induk.length > 10
      ? '<a class="lo-hpp-lainnya" href="#" onclick="LO_HPP_TAMPIL_SEMUA.order=!LO_HPP_TAMPIL_SEMUA.order;loRenderHPP();return false;">' +
        (LO_HPP_TAMPIL_SEMUA.order ? 'Tampilkan 10 teratas saja' : 'Tampilkan ' + (induk.length - 10) + ' order lainnya') + '</a>'
      : '') +
    '</div>';
}

/* ============================================================
 * TAB KALKULATOR HARGA
 * ============================================================
 * Dipakai SAAT menetapkan harga, bukan sesudahnya. Semua tab lain menilai
 * order yang sudah jalan -- berguna untuk belajar, tapi kerugiannya sudah
 * terjadi saat angkanya muncul.
 *
 * Tidak ada rute backend baru: seluruh perhitungan memakai data yang sudah
 * diambil tab HPP. Kalkulator yang menunggu server tidak akan dipakai saat
 * klien sedang menelepon.
 */

function loSimpanKalibrasi_(){
  const v = function(id){ return (document.getElementById(id).value || "").trim(); };
  const btn = document.getElementById("lo-kal-btn");
  const st = document.getElementById("lo-kal-status");
  const nilai = { "Upah Borongan Bulanan": v("lo-kal-upah"),
    "Biaya Tetap Bulanan Min": v("lo-kal-tmin"),
    "Biaya Tetap Bulanan Max": v("lo-kal-tmax"),
    "Margin Persen": v("lo-kal-margin") };
  btn.disabled = true; st.textContent = "Menyimpan...";
  fetch(LO_API_URL, { method: "POST", body: JSON.stringify({
    idToken: LO_ID_TOKEN, action: "simpanKalibrasiHPP", nilai: nilai }) })
  .then(function(r2){ return r2.json(); })
  .then(function(d2){
    btn.disabled = false;
    st.textContent = d2 && d2.success ? d2.pesan
      : ((d2 && d2.error) || "Gagal menyimpan.");
  })
  .catch(function(){ btn.disabled = false; st.textContent = "Gagal menghubungi server."; });
}

let LO_KALK = {
  artikel: "",        // kunci "artikel|style" dari cache, "" = artikel baru
  proses: 0,
  qty: 0,
  margin: 20,
  jenis: "cmt",
  kainPerPcs: 0,
  // ---- panel "sesuaikan" ----
  // null = pakai angka tersimpan. Angka = ditimpa SEMENTARA, tidak disimpan.
  //
  // Yang disesuaikan ASUMSINYA, bukan tarifnya langsung. "Kalau biaya tetap
  // ternyata Rp 50 juta, harganya jadi berapa?" adalah pertanyaan yang bisa
  // dijawab pemilik; "kalau tarif per proses Rp 620" bukan.
  buka: false,
  upahBulanan: null,
  tetapMin: null,
  tetapMax: null,
  prosesBulan: null
};

/** Angka dasar yang sedang berlaku: dari cache, ditimpa penyesuaian sementara. */
function loKalkDasar_() {
  const r = (LO_HPP_DATA && LO_HPP_DATA.ringkasan) || {};
  const asli = {
    upahBulanan: Number(r["Upah Borongan Bulanan"]) || 0,
    tetapMin: Number(r["Biaya Tetap Bulanan Min"]) || 0,
    tetapMax: Number(r["Biaya Tetap Bulanan Max"]) || 0,
    prosesBulan: Number(r["Proses Pcs Per Bulan"]) || 0
  };
  const pakai = {
    upahBulanan: LO_KALK.upahBulanan !== null ? LO_KALK.upahBulanan : asli.upahBulanan,
    tetapMin: LO_KALK.tetapMin !== null ? LO_KALK.tetapMin : asli.tetapMin,
    tetapMax: LO_KALK.tetapMax !== null ? LO_KALK.tetapMax : asli.tetapMax,
    prosesBulan: LO_KALK.prosesBulan !== null ? LO_KALK.prosesBulan : asli.prosesBulan
  };
  const p = pakai.prosesBulan;
  return {
    asli: asli, pakai: pakai,
    tarifUpah: p > 0 ? pakai.upahBulanan / p : 0,
    ohMin: p > 0 ? pakai.tetapMin / p : 0,
    ohMax: p > 0 ? pakai.tetapMax / p : 0,
    // Disesuaikan kalau ADA SATU SAJA yang ditimpa. Dipakai memberi tanda di
    // hasil -- penawaran tidak boleh diambil dari angka andai-andai tanpa
    // pemakainya sadar.
    disesuaikan: ["upahBulanan", "tetapMin", "tetapMax", "prosesBulan"]
      .some(function (k) { return LO_KALK[k] !== null && LO_KALK[k] !== asli[k]; })
  };
}

function loKalkSesuaikan(field, nilai) {
  const t = String(nilai === null || nilai === undefined ? "" : nilai).trim();
  LO_KALK[field] = (t === "") ? null : (Number(t) || 0);
  loRenderKalkulator();
}

function loKalkReset() {
  LO_KALK.upahBulanan = null;
  LO_KALK.tetapMin = null;
  LO_KALK.tetapMax = null;
  LO_KALK.prosesBulan = null;
  loRenderKalkulator();
}

function loKalkToggle() {
  LO_KALK.buka = !LO_KALK.buka;
  loRenderKalkulator();
}

/* loBukaKalkulator() DIHAPUS 16 Agustus 2026.
 *
 * Ditulis untuk membuka kalkulator, lalu ternyata loGantiTab() sudah
 * menanganinya sendiri. Fungsi yang tidak pernah dipanggil akan dibaca
 * orang berikutnya sebagai jalur yang mungkin dipakai -- dan waktu yang
 * dihabiskan memahaminya tidak menghasilkan apa pun. */

function loKalkSet(field, nilai) {
  if (field === "artikel") {
    LO_KALK.artikel = nilai;
    // Proses ikut terisi dari artikel yang dipilih, tapi TETAP BISA DIUBAH.
    // Model baru selalu sedikit berbeda dari model lama, dan yang paling tahu
    // bedanya adalah orang yang memegang sampelnya -- bukan rata-rata.
    const a = (LO_HPP_DATA.artikel || []).filter(function (x) {
      return (x["Artikel"] + "|" + x["Style"]) === nilai;
    })[0];
    if (a) LO_KALK.proses = Number(a["Proses Per Pcs"]) || 0;
  } else if (field === "proses" || field === "qty" || field === "margin" || field === "kainPerPcs") {
    LO_KALK[field] = Number(nilai) || 0;
  } else {
    LO_KALK[field] = nilai;
  }
  loRenderKalkulator();
}

function loRenderKalkulator() {
  const D = loKalkDasar_();
  const tarifUpah = D.tarifUpah;
  const ohMin = D.ohMin;
  const ohMax = D.ohMax;

  const daftar = (LO_HPP_DATA.artikel || []).slice().sort(function (a, b) {
    return String(a["Artikel"] + a["Style"]).localeCompare(String(b["Artikel"] + b["Style"]));
  });

  const opsi = ['<option value="">— artikel baru / isi proses manual —</option>'].concat(
    daftar.map(function (a) {
      const k = a["Artikel"] + "|" + a["Style"];
      return '<option value="' + loEsc(k) + '"' +
        (LO_KALK.artikel === k ? ' selected' : '') + '>' +
        loEsc(a["Artikel"]) + (a["Style"] ? " · " + loEsc(a["Style"]) : "") +
        "  (" + a["Proses Per Pcs"] + " proses)</option>";
    })
  ).join("");

  const marginOpsi = [10, 15, 20, 25, 30].map(function (m) {
    return '<option value="' + m + '"' + (LO_KALK.margin === m ? ' selected' : '') +
      '>' + m + '%</option>';
  }).join("");

  document.getElementById("lo-panel-kalk").innerHTML =
    '<div class="lo-kalk-grid">' +
      '<div class="lo-kalk-form">' +
        '<label class="lo-kalk-label">Artikel</label>' +
        '<select class="lo-kalk-input" onchange="loKalkSet(\'artikel\',this.value)">' + opsi + '</select>' +
        '<div class="lo-kalk-bantu">Pilih artikel yang pernah dikerjakan supaya jumlah prosesnya terisi sendiri. ' +
          'Untuk model baru, pilih yang paling mirip lalu sesuaikan angkanya.</div>' +

        '<label class="lo-kalk-label">Jumlah proses per pcs</label>' +
        '<input class="lo-kalk-input" type="number" min="0" step="0.1" value="' +
          (LO_KALK.proses || "") + '" onchange="loKalkSet(\'proses\',this.value)"/>' +

        '<label class="lo-kalk-label">Qty order (pcs)</label>' +
        '<input class="lo-kalk-input" type="number" min="0" value="' +
          (LO_KALK.qty || "") + '" onchange="loKalkSet(\'qty\',this.value)"/>' +

        '<label class="lo-kalk-label">Margin target</label>' +
        '<select class="lo-kalk-input" onchange="loKalkSet(\'margin\',this.value)">' + marginOpsi + '</select>' +

        '<label class="lo-kalk-label">Jenis order</label>' +
        '<select class="lo-kalk-input" onchange="loKalkSet(\'jenis\',this.value)">' +
          '<option value="cmt"' + (LO_KALK.jenis === "cmt" ? " selected" : "") + '>CMT — kain dari klien</option>' +
          '<option value="maklon"' + (LO_KALK.jenis === "maklon" ? " selected" : "") + '>Maklon — RJD beli kain</option>' +
        '</select>' +

        (LO_KALK.jenis === "maklon"
          ? '<label class="lo-kalk-label">Biaya kain per pcs</label>' +
            '<input class="lo-kalk-input" type="number" min="0" value="' +
              (LO_KALK.kainPerPcs || "") + '" onchange="loKalkSet(\'kainPerPcs\',this.value)"/>' +
            '<div class="lo-kalk-bantu">Konsumsi kain per pcs &#215; harga kain. ' +
              'Belum dihitung otomatis — marker dan harga kain baru tersedia untuk sebagian artikel.</div>'
          : '') +
      '</div>' +
      '<div class="lo-kalk-hasil">' + loKalkHasil(tarifUpah, ohMin, ohMax, D) +
        loKalkPanelSesuaikan(D) + '</div>' +
    '</div>';
}

/**
 * Panel "sesuaikan" -- mengubah asumsi SEMENTARA untuk melihat pengaruhnya.
 *
 * Tidak disimpan ke mana pun. Untuk membuatnya permanen, isi di sheet
 * SD Kalibrasi HPP. Dipisah begitu dengan sengaja: menawar butuh coba-coba
 * cepat, dan coba-coba yang langsung tersimpan akan menggeser seluruh angka
 * perusahaan gara-gara satu percakapan telepon.
 */
function loKalkPanelSesuaikan(D) {
  const isi = function (label, field, nilai, asli, satuan) {
    const beda = LO_KALK[field] !== null && LO_KALK[field] !== asli;
    return '<div class="lo-kalk-ses-baris">' +
      '<label class="lo-kalk-ses-label">' + label +
        (beda ? ' <span class="lo-kalk-ses-tanda">diubah</span>' : '') + '</label>' +
      '<input class="lo-kalk-ses-input' + (beda ? ' lo-kalk-ses-aktif' : '') + '" type="number" min="0" ' +
        'value="' + (LO_KALK[field] !== null ? LO_KALK[field] : "") + '" ' +
        'placeholder="' + Math.round(asli).toLocaleString("id-ID") + '" ' +
        'onchange="loKalkSesuaikan(\'' + field + '\',this.value)"/>' +
      '<div class="lo-kalk-ses-asli">tersimpan: ' +
        Math.round(asli).toLocaleString("id-ID") + ' ' + satuan + '</div>' +
    '</div>';
  };

  if (!LO_KALK.buka) {
    return '<div class="lo-kalk-ses-tutup">' +
      '<a href="#" onclick="loKalkToggle();return false;">Sesuaikan asumsi &#9662;</a>' +
      (D.disesuaikan ? ' <span class="lo-kalk-ses-tanda">sedang diubah</span>' : '') +
      '</div>';
  }

  return '<div class="lo-kalk-ses">' +
    '<div class="lo-kalk-ses-judul">' +
      '<a href="#" onclick="loKalkToggle();return false;">Sesuaikan asumsi &#9652;</a>' +
      (D.disesuaikan
        ? ' <a class="lo-kalk-ses-reset" href="#" onclick="loKalkReset();return false;">kembalikan</a>'
        : '') +
    '</div>' +
    '<div class="lo-kalk-ses-ket">Andai-andai saja &#8212; tidak disimpan. ' +
      'Kosongkan untuk kembali ke angka tersimpan.</div>' +
    isi("Upah borongan / bulan", "upahBulanan", null, D.asli.upahBulanan, "Rp") +
    isi("Biaya tetap / bulan (min)", "tetapMin", null, D.asli.tetapMin, "Rp") +
    isi("Biaya tetap / bulan (max)", "tetapMax", null, D.asli.tetapMax, "Rp") +
    isi("Proses-pcs / bulan", "prosesBulan", null, D.asli.prosesBulan, "") +
    '<div class="lo-kalk-ses-hasil">' +
      'Tarif upah <b>' + loRp(D.tarifUpah) + '</b> &#183; ' +
      'overhead <b>' + loRp(D.ohMin) + ' &#8211; ' + loRp(D.ohMax).replace("Rp ", "") + '</b> per proses' +
    '</div>' +
    '<div class="lo-kalk-ses-catatan">' +
      'Menaikkan <b>proses-pcs per bulan</b> menurunkan tarif per proses, dan ' +
      'harga minimum ikut turun. Itu masuk akal kalau audit menunjukkan ' +
      'pencatatan memang kurang &#8212; bukan sekadar supaya harganya terlihat enak.' +
      '<br/><br/>Kalau penyesuaian ini benar dan mau dipakai seterusnya, isi di ' +
      'sheet <b>SD Kalibrasi HPP</b> lalu jalankan updateCacheHPP().' +
    '</div>' +
  '</div>';
}

function loKalkHasil(tarifUpah, ohMin, ohMax, D) {
  const p = LO_KALK.proses;
  if (!(p > 0)) {
    return '<div class="lo-hpp-kosong">Isi jumlah proses per pcs untuk melihat hitungannya.</div>';
  }
  if (!(tarifUpah > 0)) {
    return '<div class="lo-hpp-kosong">Tarif belum tersedia. Jalankan updateCacheHPP() di Apps Script.</div>';
  }

  const kain = LO_KALK.jenis === "maklon" ? LO_KALK.kainPerPcs : 0;
  const upah = p * tarifUpah;
  const oh1 = p * ohMin;
  const oh2 = p * ohMax;
  const biaya1 = kain + upah + oh1;
  const biaya2 = kain + upah + oh2;
  const m = LO_KALK.margin / 100;
  const harga1 = biaya1 / (1 - m);
  const harga2 = biaya2 / (1 - m);
  const qty = LO_KALK.qty;

  // Pembanding: harga yang PERNAH disepakati untuk artikel ini.
  let banding = "";
  if (LO_KALK.artikel) {
    const a = (LO_HPP_DATA.artikel || []).filter(function (x) {
      return (x["Artikel"] + "|" + x["Style"]) === LO_KALK.artikel;
    })[0];
    if (a && a["Harga Historis"]) {
      const hist = Number(a["Harga Historis"]);
      const selisih = harga1 - hist;
      banding = '<div class="lo-kalk-banding' + (selisih > 0 ? ' lo-hpp-berat' : ' lo-hpp-aman') + '">' +
        'Artikel ini pernah dijual <b>' + loRp(hist) + '</b>/pcs. ' +
        (selisih > 0
          ? 'Harga minimum di atas <b>' + loRp(selisih) + '</b> lebih tinggi (' +
            (Math.round(selisih / hist * 1000) / 10) + '%).'
          : 'Harga lama sudah menutup margin ini.') +
        '</div>';
    }
  }

  const barisBiaya = [
    ["Kain", kain, LO_KALK.jenis === "maklon"],
    ["Upah borongan", upah, true],
    ["Overhead", null, true]
  ];

  let tabel = '<table class="lo-hpp-tabel lo-kalk-tabel"><tbody>';
  barisBiaya.forEach(function (b) {
    if (!b[2]) return;
    if (b[0] === "Overhead") {
      tabel += '<tr><td>Overhead</td><td class="lo-hpp-num">' +
        loRp(oh1) + ' – ' + loRp(oh2).replace("Rp ", "") + '</td></tr>';
    } else {
      tabel += '<tr><td>' + b[0] + '</td><td class="lo-hpp-num">' + loRp(b[1]) + '</td></tr>';
    }
  });
  tabel += '<tr class="lo-kalk-total"><td>Biaya per pcs</td><td class="lo-hpp-num">' +
    loRp(biaya1) + ' – ' + loRp(biaya2).replace("Rp ", "") + '</td></tr>';
  tabel += '</tbody></table>';

  // Tanda "disesuaikan" menempel pada ANGKANYA, bukan cuma di panel bawah.
  // Kalau tandanya jauh dari angka, orang yang menyalin harga ke penawaran
  // tidak akan melihatnya.
  const tandaSesuai = (D && D.disesuaikan)
    ? '<div class="lo-kalk-tanda-sesuai">Angka dasar sedang disesuaikan &#8212; ' +
      'bukan angka tersimpan</div>'
    : '';

  return tandaSesuai +
    '<div class="lo-kalk-angka' + (D && D.disesuaikan ? ' lo-kalk-angka-sesuai' : '') + '">' +
      '<div class="lo-kalk-angka-label">Harga minimum per pcs</div>' +
      '<div class="lo-kalk-angka-nilai">' + loRp(harga1) + ' – ' +
        loRp(harga2).replace("Rp ", "") + '</div>' +
      '<div class="lo-kalk-angka-ket">pada margin ' + LO_KALK.margin + '%</div>' +
    '</div>' +
    banding +
    tabel +
    (qty > 0
      ? '<div class="lo-kalk-total-order">Nilai order ' + qty.toLocaleString("id-ID") +
        ' pcs: <b>' + loRp(harga1 * qty) + ' – ' + loRp(harga2 * qty).replace("Rp ", "") + '</b></div>'
      : '') +
    '<div class="lo-kalk-catatan">' +
      'Rentangnya berasal dari biaya tetap bulanan yang masih perkiraan. ' +
      'Untuk menawar, pakai <b>ujung atas</b> — kalau biaya tetap ternyata di ' +
      'sisi tinggi, harga di ujung bawah tidak menutupinya.' +
      (LO_KALK.artikel ? '' :
        '<br/><br/><b>Artikel baru:</b> jumlah proses masih tebakan sampai model ini ' +
        'dikerjakan sekali. Setelah itu angkanya muncul sendiri di daftar dan ' +
        'harga berikutnya berdiri di atas data, bukan perkiraan.') +
    '</div>';
}
