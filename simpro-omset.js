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

function loFetchData(){
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
