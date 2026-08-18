/**
 * ============================================================
 * SIMPRO -- simpro-cetak
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : cetak.html
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const CK_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const CK_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

/**
 * ============================================================
 * REKENING PEMBAYARAN
 * ============================================================
 * Ditaruh sebagai SATU konstanta bernama, bukan disebar sebagai teks di dalam
 * fungsi render. Kalau nanti ganti bank atau tambah rekening kedua, yang
 * diubah cuma satu tempat yang jelas -- bukan berburu string di tengah HTML
 * dokumen tagihan, tempat salah ketik paling mahal akibatnya.
 *
 * JALUR NAIK KELAS kalau nanti perlu: dikirim backend bersama data dokumen
 * (cetak-dokumen.gs), supaya ganti rekening tidak perlu unggah ulang berkas
 * ini + tag baru + pasang template. Untuk satu rekening yang jarang berubah,
 * konstanta di sini sudah proporsional.
 * ============================================================
 */
const CK_REKENING = {
  bank: "BCA",
  nomor: "8465068988",
  atasNama: "Femri Noviawan"
};

/**
 * Blok rekening pembayaran, ditaruh di ruang kosong KIRI kotak ringkasan.
 *
 * Urutan bacanya disengaja: mata turun ke angka tagihan di kanan, lalu
 * bergeser ke kiri dan menemukan ke mana uangnya dikirim. Ditaruh di footer
 * dekat tanda tangan, orang harus mencarinya.
 *
 * SENGAJA TIDAK MENYEBUT NOMINAL. Invoice bisa punya "Sisa Tagihan" DAN
 * "Nilai Transfer" (Total Tagihan dikurangi PPh) yang nilainya berbeda.
 * Mengulang salah satunya di sini berarti suatu saat dokumen ini akan
 * menyebut dua angka berbeda untuk hal yang sama, dan yang membaca tidak
 * tahu mana yang benar. Angka tetap satu sumber: kotak ringkasan.
 */
function ckRekeningHtml_(){
  return '<div class="ck-rekening">' +
      '<div class="ck-rekening-lbl">Pembayaran Transfer</div>' +
      '<div class="ck-rekening-bank">' + rjdEscapeHtml_(CK_REKENING.bank) + '</div>' +
      '<div class="ck-rekening-no">' + rjdEscapeHtml_(CK_REKENING.nomor) + '</div>' +
      '<div class="ck-rekening-an">a.n. ' + rjdEscapeHtml_(CK_REKENING.atasNama) + '</div>' +
      '<div class="ck-rekening-nb">Rekening resmi RJD Apparel. ' +
        'Mohon konfirmasi bukti transfer ke WA 0856-292-1464.</div>' +
    '</div>';
}


function ckGetQueryParam(nama){
  const params = new URLSearchParams(window.location.search);
  return params.get(nama);
}
const CK_JENIS = ckGetQueryParam("jenis"); // "invoice" | "proforma" | "suratjalan" | "konfirmasiorder" | "spk"
// Khusus SPK: ?item=N (0-based) -> cetak CUMA ITEM ke-N. Tanpa parameter ini
// SPK memuat semua item dalam 1 dokumen. Pemilihannya juga bisa diganti lewat
// tombol di layar (ckSPKPilihItem) tanpa reload.
let CK_SPK_ITEM_AKTIF = (function(){
  const v = ckGetQueryParam("item");
  if(v === null || v === "") return "semua";
  const n = parseInt(v, 10);
  return isNaN(n) ? "semua" : n;
})();
let CK_SPK_DATA = null; // disimpan biar ganti pilihan item nggak perlu fetch ulang
const CK_ID = ckGetQueryParam("id");
// Khusus SPK: ?line={ID Line} -> qty disaring jadi JATAH LINE ITU SAJA, dibaca
// dari SD Distribusi Potongan. Tanpa parameter ini, dokumennya SPK PO penuh
// seperti sebelumnya -- tautan cetak lama tidak berubah perilakunya.
const CK_LINE = ckGetQueryParam("line");
let CK_ID_TOKEN = null;
let CK_AUTO_LOGIN = false; // true kalau token dipakai berasal dari sesi tersimpan, bukan login barusan

function ckShow(id){
  ["ck-login-box","ck-loading","ck-error","ck-isi"].forEach(function(x){
    document.getElementById(x).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

function ckTampilkanError(pesan){
  document.getElementById("ck-error-message").textContent = pesan;
  ckShow("ck-error");
}

/**
 * Dipakai buat kegagalan SAAT MUAT DOKUMEN. Kalau tokennya barusan dari login manual ->
 * tampilkan error apa adanya. Tapi kalau tokennya dari sesi tersimpan (auto-login) dan
 * ditolak -- misal sesi udah basi di sisi server, atau user ini memang nggak berhak lihat
 * dokumen ini -- JANGAN kasih layar error buntu tanpa jalan keluar. Balikin ke layar login
 * biar user bisa masuk pakai akun yang benar. Ini yang bikin auto-login nggak pernah
 * bikin keadaan lebih buruk dari sebelumnya.
 */
function ckGagalMuat_(pesan){
  if(CK_AUTO_LOGIN){
    CK_AUTO_LOGIN = false;
    CK_ID_TOKEN = null;
    ckShow("ck-login-box");
    return;
  }
  ckTampilkanError(pesan);
}

function ckHandleLogin(response){
  CK_ID_TOKEN = response.credential;
  CK_AUTO_LOGIN = false; // login manual -> kalau gagal, tampilkan error apa adanya (jangan loop balik ke login)
  ckShow("ck-loading");
  ckFetchData();
}

function ckFetchData(){
  const jenisValid = ["invoice", "proforma", "suratjalan", "konfirmasiorder", "spk", "rekapline"];
  // "rekapline" identitasnya di ?line=, BUKAN ?id= -- dokumennya milik LINE,
  // bukan milik satu order. Jadi syarat CK_ID sengaja dilonggarkan khusus dia.
  const punyaIdentitas = CK_JENIS === "rekapline" ? !!CK_LINE : !!CK_ID;
  if(!CK_JENIS || !punyaIdentitas || jenisValid.indexOf(CK_JENIS) === -1){
    ckTampilkanError("Link tidak lengkap/valid -- buka halaman ini lewat tombol Cetak di Portal Klien atau Dashboard, bukan diketik manual.");
    return;
  }
  const CK_ACTION_MAP = { invoice: "getInvoiceCetak", proforma: "getProformaCetak", suratjalan: "getSuratJalanCetak", konfirmasiorder: "getKonfirmasiOrderCetak", spk: "getSPKCetak", rekapline: "getRekapLineCetak" };
  const action = CK_ACTION_MAP[CK_JENIS];
  fetch(CK_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: CK_ID_TOKEN, action: action, id: CK_ID, line: CK_LINE || "" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(!data.success){
      ckGagalMuat_(data.error || "Gagal memuat dokumen.");
      return;
    }
    // RENDER dibungkus try/catch SENDIRI, terpisah dari catch jaringan di bawah.
    // Sebelumnya keduanya jatuh ke .catch() yang sama, jadi error saat MENGGAMBAR
    // dokumen (mis. menulis ke elemen yang tidak ada) muncul sebagai "Gagal
    // menghubungi server" -- padahal servernya sudah menjawab dengan benar.
    // Pesan yang menyesatkan itu bikin bug rekapline lama tidak ketemu:
    // pencarian terus mengarah ke backend & deployment, bukan ke frontend.
    try{
      if(CK_JENIS === "invoice") ckRenderInvoice(data.data);
      else if(CK_JENIS === "proforma") ckRenderProforma(data.data);
      else if(CK_JENIS === "suratjalan") ckRenderSuratJalan(data.data);
      else if(CK_JENIS === "konfirmasiorder") ckRenderKonfirmasiOrder(data.data);
      else if(CK_JENIS === "rekapline") ckRenderRekapLine(data.data);
      else { CK_SPK_DATA = data.data; ckRenderSPK(); }
    }catch(errRender){
      console.error("Gagal menggambar dokumen:", errRender);
      ckGagalMuat_("Data dokumen berhasil diambil, tapi gagal ditampilkan: " +
        (errRender && errRender.message ? errRender.message : errRender) +
        " -- buka Console (F12) untuk rinciannya.");
      return;
    }
    document.getElementById("ck-print-btn").classList.remove("hidden");
    ckShow("ck-isi");
  })
  .catch(function(errJaringan){
    console.error("Gagal menghubungi server:", errJaringan);
    ckGagalMuat_("Gagal menghubungi server. Coba beberapa saat lagi.");
  });
}

function ckHeaderHtml(judul, nomor, tanggal){
  return '<div class="ck-dok-header">' +
    '<div>' +
      '<div class="ck-dok-brand">RJD<span>.</span>APPAREL</div>' +
      '<div class="ck-dok-brand-info">Piyungan, Bantul, D.I. Yogyakarta<br/>WA 0856-292-1464 &#183; order@rjdapparel.id</div>' +
    '</div>' +
    '<div class="ck-dok-title">' +
      '<h1>' + judul + '</h1>' +
      '<div class="no">' + nomor + '</div>' +
      '<div class="tgl">' + tanggal + '</div>' +
    '</div>' +
  '</div>';
}

function ckPihakHtml(d, labelKananJudul, labelKananIsi){
  return '<div class="ck-dok-pihak">' +
    '<div>' +
      '<div class="lbl">Kepada</div>' +
      '<div class="nama">' + d.klien.nama + '</div>' +
      '<div class="detail">' +
        (d.klien.alamat ? d.klien.alamat + '<br/>' : '') +
        (d.klien.kontakPerson ? 'PIC: ' + d.klien.kontakPerson + '<br/>' : '') +
        (d.klien.telepon ? d.klien.telepon : '') +
      '</div>' +
    '</div>' +
    '<div>' +
      '<div class="lbl">' + labelKananJudul + '</div>' +
      '<div class="detail">' + labelKananIsi + '</div>' +
    '</div>' +
  '</div>';
}

/**
 * Susun item invoice jadi MATRIKS warna x size, dikelompokkan per
 * (produk, HARGA SATUAN).
 *
 * Harga ikut jadi kunci, bukan diabaikan. Satu warna+size bisa punya beberapa
 * harga -- mis. Col A Rose S: 14 pcs @39.000 dan 1 pcs @50.000 (ukuran khusus,
 * tambahan bahan). Menggabungkannya jadi satu sel akan menyembunyikan selisih
 * harga yang justru perlu diperiksa bagian keuangan klien.
 *
 * Baris NON-PRODUK (Ongkir, potongan) tidak punya warna/size. Dipisah jadi
 * baris biasa, bukan dipaksa masuk matriks -- kolom size untuk ongkir tidak
 * berarti apa-apa.
 *
 * Subtotal per warna dijumlah dari subtotal ASLI tiap item, bukan dihitung
 * ulang qty x harga: kalau backend punya pembulatan atau potongan sendiri,
 * menghitung ulang di sini akan menghasilkan angka yang berbeda dari total
 * invoice -- dan itu jenis selisih yang paling sulit dijelaskan.
 *
 * FUNGSI MURNI -- bisa diuji tanpa DOM.
 */
function ckMatriksInvoice_(items){
  const urutSize = ["XS","S","M","L","XL","2XL","3XL","4XL","5XL","All Size"];
  const grup = {};
  const urut = [];
  const lain = [];

  (items || []).forEach(function(it){
    const w = String(it.warna || "").trim();
    const sz = String(it.size || "").trim();
    // Tanpa warna DAN size = bukan baris produk.
    if((!w || w === "-") && (!sz || sz === "-")){ lain.push(it); return; }

    const nama = String(it.deskripsi || "").trim() || "-";
    const harga = Number(it.hargaSatuan) || 0;
    const kunci = nama + "||" + harga;
    if(!grup[kunci]){
      grup[kunci] = { nama: nama, harga: harga, sel: {}, sub: {},
                      warna: [], size: {}, totalQty: 0, totalSub: 0 };
      urut.push(kunci);
    }
    const g = grup[kunci];
    const kw = w || "-", ks = sz || "-";
    if(g.warna.indexOf(kw) === -1) g.warna.push(kw);
    g.size[ks] = true;
    const kk = kw + "||" + ks;
    g.sel[kk] = (g.sel[kk] || 0) + (Number(it.jumlah) || 0);
    g.sub[kw] = (g.sub[kw] || 0) + (Number(it.subtotal) || 0);
    g.totalQty += Number(it.jumlah) || 0;
    g.totalSub += Number(it.subtotal) || 0;
  });

  const blok = urut.map(function(k){
    const g = grup[k];
    const adaSize = Object.keys(g.size);
    g.sizeUrut = urutSize.filter(function(x){ return g.size[x]; })
      .concat(adaSize.filter(function(x){ return urutSize.indexOf(x) === -1; }));
    g.warna.sort();
    return g;
  });

  return { blok: blok, lain: lain };
}

function ckRenderInvoice(d){
  const statusClass = d.status === "Lunas" ? "lp-badge-lunas" : (d.status === "DP Diterima" ? "lp-badge-dp" : "lp-badge-belum");

  const m = ckMatriksInvoice_(d.items);

  const blokItem = m.blok.map(function(g){
    const kepala = '<tr><th class="ck-sj-warna">Warna</th>' +
      g.sizeUrut.map(function(sz){ return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="num ck-sj-total">Qty</th><th class="num ck-inv-sub">Subtotal</th></tr>';

    const baris = g.warna.map(function(w){
      let qw = 0;
      const sel = g.sizeUrut.map(function(sz){
        const q = g.sel[w + "||" + sz] || 0;
        qw += q;
        return '<td class="num">' + (q ? q : '<span class="ck-sj-nol">&#8212;</span>') + '</td>';
      }).join("");
      return '<tr><td class="ck-sj-warna">' + rjdEscapeHtml_(w) + '</td>' + sel +
        '<td class="num ck-sj-total">' + qw + '</td>' +
        '<td class="num ck-inv-sub">' + formatRupiah(g.sub[w] || 0) + '</td></tr>';
    }).join("");

    const kaki = '<tr class="ck-sj-kaki"><td class="ck-sj-warna">Total</td>' +
      g.sizeUrut.map(function(sz){
        let t = 0;
        g.warna.forEach(function(w){ t += g.sel[w + "||" + sz] || 0; });
        return '<td class="num">' + t + '</td>';
      }).join("") +
      '<td class="num ck-sj-total">' + g.totalQty + '</td>' +
      '<td class="num ck-inv-sub">' + formatRupiah(g.totalSub) + '</td></tr>';

    return '<div class="ck-sj-blok">' +
      '<div class="ck-sj-judul">' + rjdEscapeHtml_(g.nama) +
        '<span>' + formatRupiah(g.harga) + ' / pcs</span></div>' +
      '<table class="ck-dok-tabel ck-sj-matriks">' +
        '<thead>' + kepala + '</thead><tbody>' + baris + kaki + '</tbody></table>' +
    '</div>';
  }).join("");

  // Baris non-produk (ongkir, potongan) tetap sebagai tabel biasa.
  const blokLain = m.lain.length
    ? '<table class="ck-dok-tabel"><thead><tr><th>Deskripsi</th>' +
        '<th class="num">Qty</th><th class="num">Harga Satuan</th><th class="num">Subtotal</th>' +
      '</tr></thead><tbody>' +
      m.lain.map(function(it){
        return '<tr><td>' + it.deskripsi + '</td>' +
          '<td class="num">' + it.jumlah + '</td>' +
          '<td class="num">' + formatRupiah(it.hargaSatuan) + '</td>' +
          '<td class="num">' + formatRupiah(it.subtotal) + '</td></tr>';
      }).join("") +
      '</tbody></table>'
    : '';

  const barisItem = blokItem + blokLain;

  // Urutan baris ringkasan SENGAJA: Subtotal -> Total Tagihan -> Pembayaran -> Sisa Tagihan.
  //
  // Sebelumnya baris pembayaran ditaruh DI ANTARA Subtotal & Total Tagihan, jadi kebacanya
  // seolah "Total Tagihan = Subtotal - pembayaran" -- padahal totalAkhir dari backend itu
  // NILAI YANG DITAGIHKAN (nggak dikurangi pembayaran). Akibatnya di invoice yang udah Lunas
  // kelihatan janggal: 7.266.000 - 7.266.000 tapi Total Tagihan tetap 7.266.000.
  // Prinsip akuntansi yang benar: Total Tagihan itu nilai barang/jasa yang ditagih & TIDAK
  // berubah karena pembayaran. Yang berkurang itu SISA tagihannya.
  //
  // Label pembayaran adaptif: kalau masih ada sisa -> memang "DP" (uang muka). Kalau sisanya
  // 0 -> itu pelunasan penuh, bukan DP, jadi disebut "Pembayaran Diterima". Ini yang bikin
  // nilai dari SD Pelunasan nggak lagi salah label sebagai "DP Diterima".
  //
  // Sisa Tagihan pakai d.outstanding DARI BACKEND, sengaja TIDAK dihitung ulang di frontend
  // (totalAkhir - dp) -- biar nggak ada kemungkinan angka di invoice beda sama angka di
  // Portal/Dashboard kalau backend punya logika potongan/pembulatan sendiri.
  // Label pembayaran pakai aturan BERSAMA (labelPembayaranDiterima_ di blok global) --
  // aturan yang sama persis dipakai kartu invoice di Portal/Detail Klien, biar dokumen
  // cetak & tampilan portal nggak pernah beda istilah. Huruf depannya dibesarkan karena
  // di sini posisinya sebagai label baris ringkasan.
  const adaPembayaran = d.dp > 0;
  const lunas = !(d.outstanding > 0);
  const labelDasar = labelPembayaranDiterima_(d.outstanding);
  const labelBayar = labelDasar.charAt(0).toUpperCase() + labelDasar.slice(1).replace(" diterima", " Diterima");

  // Backend (cetak-dokumen.gs) sekarang ngirim field baru: subtotal, totalTagihan,
  // potonganPajak, nilaiTransfer. Field lama (totalKotor/totalAkhir) masih dikirim
  // sebagai alias biar nggak putus, tapi di sini dipakai cuma sebagai cadangan.
  const nilaiSubtotal = (d.subtotal !== undefined) ? d.subtotal : d.totalKotor;
  const nilaiTotalTagihan = (d.totalTagihan !== undefined) ? d.totalTagihan : d.totalAkhir;
  const nilaiPPh = Number(d.potonganPajak) || 0;
  const nilaiTransfer = (d.nilaiTransfer !== undefined) ? d.nilaiTransfer : (nilaiTotalTagihan - nilaiPPh);

  const ringkasanBaris = [];
  ringkasanBaris.push('<div class="ck-dok-ringkasan-row"><span>Subtotal</span><span>' + formatRupiah(nilaiSubtotal) + '</span></div>');

  // Rincian komponen antara Subtotal & Total Tagihan. Cuma yang nilainya ADA yang
  // ditampilkan, jadi invoice sederhana tetap ringkas. Ini WAJIB buat dokumen tagihan:
  // tanpa rincian ini, klien lihat angka loncat (mis. subtotal 3.120.000 -> tagihan
  // 3.320.000) tanpa tau itu biaya kirim 200.000 -- gampang jadi pertanyaan/sengketa.
  [
    { nilai: d.biayaTambahan,    label: "Biaya Tambahan",     tanda: "+" },
    { nilai: d.biayaKirim,       label: "Biaya Kirim",        tanda: "+" },
    { nilai: d.biayaLainLain,    label: "Biaya Lain-lain",    tanda: "+" },
    { nilai: d.potonganLainLain, label: "Potongan Lain-lain", tanda: "-" }
  ].forEach(function(k){
    const v = Number(k.nilai) || 0;
    if (v > 0) {
      ringkasanBaris.push('<div class="ck-dok-ringkasan-row"><span>' + k.label + '</span><span>' +
        (k.tanda === "-" ? "-" : "") + formatRupiah(v) + '</span></div>');
    }
  });

  ringkasanBaris.push('<div class="ck-dok-ringkasan-row total"><span>Total Tagihan</span><span>' + formatRupiah(nilaiTotalTagihan) + '</span></div>');

  // PPh cuma ditampilkan kalau memang ada -- invoice tanpa potongan pajak tetap
  // ringkas kayak sebelumnya. "Nilai Transfer" nyusul biar klien jelas berapa yang
  // harus ditransfer (Total Tagihan dikurangi PPh yang mereka setor sendiri).
  if (nilaiPPh > 0) {
    ringkasanBaris.push('<div class="ck-dok-ringkasan-row"><span>Potongan Pajak (PPh)</span><span>-' + formatRupiah(nilaiPPh) + '</span></div>');
    ringkasanBaris.push('<div class="ck-dok-ringkasan-row"><span>Nilai Transfer</span><span>' + formatRupiah(nilaiTransfer) + '</span></div>');
  }
  if(adaPembayaran){
    ringkasanBaris.push('<div class="ck-dok-ringkasan-row"><span>' + labelBayar + '</span><span>-' + formatRupiah(d.dp) + '</span></div>');
  }
  // Baris penutup: ditampilkan kalau ada pembayaran (biar hitungannya nutup sampai nol) ATAU
  // masih ada sisa tagihan. Invoice tanpa pembayaran & tanpa sisa nggak perlu baris ini.
  if(adaPembayaran || d.outstanding > 0){
    const kelasSisa = lunas ? "ck-dok-ringkasan-row lunas" : "ck-dok-ringkasan-row outstanding";
    ringkasanBaris.push('<div class="' + kelasSisa + '"><span>Sisa Tagihan</span><span>' + formatRupiah(d.outstanding || 0) + '</span></div>');
  }

  const html =
    '<div class="ck-dok">' +
      ckHeaderHtml("INVOICE", d.idInvoice, d.tanggal) +
      ckPihakHtml(d, "Referensi Order", "Kode Order: " + d.kodeOrder + '<br/>Produk: ' + d.namaProduk +
        '<br/>Status: <span class="ck-badge-status ' + statusClass + '">' + d.status + '</span>') +
      // barisItem SUDAH berisi tabel lengkap (satu per kelompok harga), jadi
      // tidak dibungkus <table> lagi -- membungkusnya menghasilkan tabel
      // bersarang yang rusak di sebagian browser dan berantakan saat dicetak.
      barisItem +
      '<div class="ck-dok-ringkasan">' +
        // Rekening HANYA muncul kalau masih ada yang harus dibayar.
        //
        // Invoice yang sudah Lunas tapi tetap memajang "silakan transfer ke
        // rekening ini" mengundang PEMBAYARAN DOBEL -- dokumen tagihan sering
        // disimpan lalu dibuka lagi berbulan-bulan kemudian, kadang oleh staf
        // keuangan klien yang berbeda dari yang membayar pertama kali. Waktu
        // itu terjadi, yang repot bukan cuma klien: RJD harus mengembalikan
        // uang dan menjelaskan.
        //
        // `lunas` di atas didefinisikan sebagai !(d.outstanding > 0), jadi
        // invoice DP Diterima yang masih bersisa TETAP menampilkannya.
        (lunas ? '' : ckRekeningHtml_()) +
        '<div class="ck-dok-ringkasan-box">' + ringkasanBaris.join("") + '</div>' +
      '</div>' +
      '<div class="ck-dok-ttd">' +
        '<div class="kolom">Hormat kami,<div class="garis"></div><div class="nama-ttd">RJD Apparel</div></div>' +
        '<div class="kolom">Diterima oleh,<div class="garis"></div><div class="nama-ttd">' + d.klien.nama + '</div></div>' +
      '</div>' +
    '</div>';

  document.getElementById("ck-isi").innerHTML = html;
  document.title = "Invoice " + d.idInvoice + " -- RJD Apparel";
}

/**
 * Susun item pengiriman jadi MATRIKS warna x size, dikelompokkan per produk.
 *
 * Bentuk lama satu baris per (produk, warna, size) menghasilkan 14 baris untuk
 * satu artikel 4 warna x 4 size -- dan nama produknya diulang 14 kali. Petugas
 * gudang yang mencocokkan barang harus menyusuri seluruh halaman untuk
 * menjawab satu pertanyaan: "Beige L berapa?"
 *
 * Matriks menjawab itu dalam satu pandangan, dan muat di satu halaman.
 *
 * FUNGSI MURNI -- bisa diuji tanpa DOM.
 */
function ckMatriksPengiriman_(items){
  const urutSize = ["XS","S","M","L","XL","2XL","3XL","4XL","5XL","All Size"];
  const perProduk = {};
  const urutProduk = [];

  (items || []).forEach(function(it){
    const nama = String(it.deskripsi || "").trim() || "-";
    if(!perProduk[nama]){
      perProduk[nama] = { nama: nama, sel: {}, warna: [], size: {}, total: 0, catatan: [] };
      urutProduk.push(nama);
    }
    const p = perProduk[nama];
    const w = String(it.warna || "").trim() || "-";
    const sz = String(it.size || "").trim() || "-";
    if(p.warna.indexOf(w) === -1) p.warna.push(w);
    p.size[sz] = true;
    p.sel[w + "||" + sz] = (p.sel[w + "||" + sz] || 0) + (Number(it.jumlah) || 0);
    p.total += Number(it.jumlah) || 0;
    if(it.catatan && p.catatan.indexOf(it.catatan) === -1) p.catatan.push(it.catatan);
  });

  return urutProduk.map(function(nama){
    const p = perProduk[nama];
    // Size diurutkan mengikuti urutan baku, sisanya (ukuran custom seperti
    // "115*115") ditaruh di belakang menurut kemunculan -- bukan dibuang.
    const adaSize = Object.keys(p.size);
    const size = urutSize.filter(function(x){ return p.size[x]; })
      .concat(adaSize.filter(function(x){ return urutSize.indexOf(x) === -1; }));
    p.warna.sort();
    return { nama: nama, warna: p.warna, size: size, sel: p.sel,
             total: p.total, catatan: p.catatan };
  });
}

function ckRenderSuratJalan(d){
  const blokProduk = ckMatriksPengiriman_(d.items).map(function(p){
    const kepala = '<tr><th class="ck-sj-warna">Warna</th>' +
      p.size.map(function(sz){ return '<th class="num">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="num ck-sj-total">Total</th></tr>';

    const baris = p.warna.map(function(w){
      let totalW = 0;
      const sel = p.size.map(function(sz){
        const q = p.sel[w + "||" + sz] || 0;
        totalW += q;
        // Sel kosong diberi tanda strip, bukan angka 0: petugas gudang perlu
        // membedakan "tidak dikirim" dari "dikirim nol" saat mencocokkan.
        return '<td class="num">' + (q ? q : '<span class="ck-sj-nol">&#8212;</span>') + '</td>';
      }).join("");
      return '<tr><td class="ck-sj-warna">' + rjdEscapeHtml_(w) + '</td>' + sel +
        '<td class="num ck-sj-total">' + totalW + '</td></tr>';
    }).join("");

    // Baris total per size di kaki tabel -- itu yang dipakai saat menghitung
    // barang per ukuran sebelum dimasukkan ke kardus.
    const kaki = '<tr class="ck-sj-kaki"><td class="ck-sj-warna">Total</td>' +
      p.size.map(function(sz){
        let t = 0;
        p.warna.forEach(function(w){ t += p.sel[w + "||" + sz] || 0; });
        return '<td class="num">' + t + '</td>';
      }).join("") +
      '<td class="num ck-sj-total">' + p.total + '</td></tr>';

    return '<div class="ck-sj-blok">' +
      '<div class="ck-sj-judul">' + rjdEscapeHtml_(p.nama) +
        '<span>' + p.total + ' pcs</span></div>' +
      '<table class="ck-dok-tabel ck-sj-matriks">' +
        '<thead>' + kepala + '</thead><tbody>' + baris + kaki + '</tbody></table>' +
      (p.catatan.length
        ? '<div class="ck-sj-catatan">' + p.catatan.map(rjdEscapeHtml_).join(" &#183; ") + '</div>'
        : '') +
    '</div>';
  }).join("");

  const html =
    '<div class="ck-dok">' +
      ckHeaderHtml("SURAT JALAN", d.idPengiriman, d.tanggal) +
      ckPihakHtml(d, "Detail Pengiriman", "Kode Order: " + d.kodeOrder + '<br/>Produk: ' + d.namaProduk +
        '<br/>Jenis: ' + d.jenisPengiriman + '<br/>Metode: ' + d.metode +
        (d.noResi ? '<br/>No. Resi: ' + d.noResi : '')) +
      blokProduk +
      '<div style="text-align:right;font-weight:700;font-size:14px;margin-bottom:20px">Total Dikirim: ' + d.jumlah + ' pcs</div>' +
      (d.catatan ? '<div class="ck-dok-catatan"><b>Catatan:</b> ' + d.catatan + '</div>' : '') +
      '<div class="ck-dok-ttd">' +
        '<div class="kolom">Dikirim oleh,<div class="garis"></div><div class="nama-ttd">RJD Apparel</div></div>' +
        '<div class="kolom">Diterima oleh,<div class="garis"></div><div class="nama-ttd">' + d.klien.nama + '</div></div>' +
      '</div>' +
    '</div>';

  document.getElementById("ck-isi").innerHTML = html;
  document.title = "Surat Jalan " + d.idPengiriman + " -- RJD Apparel";
}

/**
 * Dokumen Konfirmasi Order -- dari SD Order Request (backend:
 * cetak-konfirmasi-order.gs). Beda dari Invoice/Surat Jalan: bisa dicetak DI
 * STATUS APA PUN (bahkan sebelum admin proofing/isi harga), jadi kolom
 * harga & subtotal per item BISA "belum diisi" -- ditandai jelas, dan Grand
 * Total diberi label "(sementara)" kalau ada item yang harganya belum final,
 * biar nggak disalahartikan sebagai angka pasti.
 */
function ckRenderKonfirmasiOrder(d){
  // Warna badge status disusun LOKAL (inline style, bukan gantung ke kelas
  // lp-badge-* dari cabang lain) -- <b:if> mengisolasi CSS per cabang, dan
  // kelas warna lp-badge-lunas/dp/belum yang dipakai ckRenderInvoice TERNYATA
  // nggak ikut disalin ke cabang cetak (celah lama, di luar cakupan
  // perubahan ini) -- supaya nggak menambah kasus serupa, badge ini sengaja
  // dibikin nggak bergantung sama sekali ke kelas warna cabang lain.
  const CK_STATUS_WARNA = {
    "Pending": "#8A5D1F", "Menunggu Verifikasi Klien Baru": "#1F3A66",
    "Disetujui": "#2C6B3F", "Ditolak": "#8A2A2A", "Revisi Diminta": "#8A5D1F"
  };
  const warnaStatus = CK_STATUS_WARNA[d.status] || "#555555";
  const statusBadgeHtml = '<span class="ck-badge-status" style="background:' + warnaStatus + '1A;color:' + warnaStatus + '">' + d.status + '</span>';

  // Kartu ITEM -> Warna: KOMPONEN BERSAMA dengan SPK (ckBuildItemGroupsHtml_).
  // Bedanya cuma tampilHarga -- SPK false, dokumen klien ini true.
  const itemsHtml = ckBuildItemGroupsHtml_(d.itemGroups || [], { tampilHarga: true });

  const catatanHtml = [
    d.catatanKlien ? '<div class="ck-dok-catatan"><b>Catatan Klien:</b><div class="isi">' + rjdEscapeHtml_(d.catatanKlien) + '</div></div>' : '',
    d.catatanAdmin ? '<div class="ck-dok-catatan"><b>Catatan Admin:</b><div class="isi">' + rjdEscapeHtml_(d.catatanAdmin) + '</div></div>' : '',
    d.adaHargaKosong ? '<div class="ck-dok-catatan" style="border-color:#EBCFA0;background:#FCF3E3"><b>Catatan:</b> Sebagian/semua harga item belum diisi admin -- Grand Total di bawah ini SEMENTARA, belum final.</div>' : '',
    d.urlFileLainnya ? '<div class="ck-dok-catatan"><b>Lampiran:</b> <a href="' + d.urlFileLainnya.split(";")[0].trim() + '" rel="noopener" target="_blank">Lihat file</a> (size chart / referensi)</div>' : ''
  ].filter(Boolean).join("");

  const html =
    '<div class="ck-dok">' +
      ckHeaderHtml("KONFIRMASI ORDER", d.idOrderRequest, d.tanggal) +
      ckPihakHtml(d, "Detail Pesanan", "Status: " + statusBadgeHtml + '<br/>Target Kirim: ' + (d.targetTanggalKirim || "-")) +
      itemsHtml +
      ckKainKlienHtml_(d.kainDariKlien) +
      ckJadwalKirimHtml_(d.jadwalKirim) +
      '<div class="ck-dok-ringkasan">' +
        // Di Konfirmasi Order rekening SELALU tampil -- beda dari invoice.
        // Dokumen ini belum punya konsep "lunas": justru di titik inilah DP
        // diminta, dan klien butuh nomor rekening tepat saat membacanya.
        //
        // Tetap tampil juga waktu d.adaHargaKosong (Grand Total masih
        // sementara), karena blok ini tidak menyebut nominal sama sekali --
        // cuma ke mana uangnya dikirim. Nominalnya urusan kotak di kanan.
        ckRekeningHtml_() +
        '<div class="ck-dok-ringkasan-box">' +
        '<div class="ck-dok-ringkasan-row"><span>Total Qty</span><span>' + d.totalQtyKeseluruhan + ' pcs</span></div>' +
        '<div class="ck-dok-ringkasan-row total"><span>Grand Total' + (d.adaHargaKosong ? ' (sementara)' : '') + '</span><span>' + formatRupiah(d.grandTotal) + '</span></div>' +
      '</div></div>' +
      catatanHtml +
      '<div class="ck-dok-ttd">' +
        '<div class="kolom">Dikonfirmasi oleh,<div class="garis"></div><div class="nama-ttd">RJD Apparel</div></div>' +
        '<div class="kolom">Disetujui oleh,<div class="garis"></div><div class="nama-ttd">' + d.klien.nama + '</div></div>' +
      '</div>' +
    '</div>';

  document.getElementById("ck-isi").innerHTML = html;
  document.title = "Konfirmasi Order " + d.idOrderRequest + " -- RJD Apparel";
}

/**
 * ============ SPK (Surat Perintah Kerja) ============
 * Dokumen INTERNAL lantai produksi. Backend: cetak-spk.gs (STAFF ONLY, dan
 * payload-nya memang NOL data harga -- bukan disembunyikan di sini).
 *
 * Dua hal yang membedakan dari dokumen cetak lain:
 * 1. GAMBAR DESAIN ikut tercetak. Thumbnail Drive dipakai dengan sz=w400
 *    (bukan w200 seperti rjdBuildThumbHtml_ di tampilan layar) supaya detail
 *    model masih terbaca di kertas, dan loading="eager" -- gambar lazy-load
 *    yang belum ke-scroll TIDAK IKUT TERCETAK sama sekali, itu jebakan yang
 *    gampang kelewat.
 * 2. WATERMARK DRAFT kalau order belum berstatus "Disetujui" -- supaya SPK
 *    yang terlanjur beredar di lantai produksi nggak dikira perintah final.
 */
/**
 * Kebutuhan kain PER WARNA. Baris = warna, kolom = kain, ditutup baris TOTAL.
 *
 * Kenapa per warna, bukan cuma total: kode kain BEDA tiap warna (Brown pakai
 * BRW, Cream pakai CRM). Angka total 640 yds tidak bisa dipakai membeli --
 * bagian pembelian butuh tahu berapa yard untuk MASING-MASING kode kain.
 *
 * Konsumsi per pcs ditaruh di header kolom supaya dasar hitungnya kelihatan
 * tanpa perlu tabel kedua.
 */
function ckKomposisiHtml_(daftar, warnaList, qtyDi){
  if(!daftar || !daftar.length) return "";
  const adaDasar = daftar.some(function(k){
    return Number(k.konsumsi) > 0 || Object.keys(k.perSize || {}).length > 0;
  });
  if(!adaDasar) return "";

  // Kebutuhan 1 kain untuk 1 warna. Kalau konsumsi PER SIZE diisi, dihitung
  // size demi size (XL memang lebih boros dari S); kalau tidak, pakai rata-rata.
  function butuh(k, w){
    const ps = k.perSize || {};
    const kons = Number(k.konsumsi) || 0;
    let t = 0;
    if(Object.keys(ps).length && typeof qtyDi === "function"){
      Object.keys(w.sizeQty || {}).forEach(function(sz){
        t += (Number(ps[sz]) || kons) * (Number(w.sizeQty[sz]) || 0);
      });
      (w.detailAllSizeParsed || []).forEach(function(d){
        t += (Number(ps[d.label]) || kons) * (Number(d.qty) || 0);
      });
    } else {
      t = kons * (Number(w.totalQtyWarna) || 0);
    }
    return Math.round(t * 100) / 100;
  }

  const kepala = '<thead><tr><th class="warna">Warna</th><th class="num">Qty</th>' +
    daftar.map(function(k){
      const kons = Number(k.konsumsi) > 0
        ? (k.konsumsi + " " + rjdEscapeHtml_(k.satuan || "yds") + "/pcs")
        : (Object.keys(k.perSize || {}).length ? "per size" : "-");
      return '<th class="num">' + rjdEscapeHtml_(k.nama) +
        '<div class="ck-kons-kecil">' + kons + '</div></th>';
    }).join("") +
  '</tr></thead>';

  const badan = '<tbody>' + (warnaList || []).map(function(w){
    return '<tr><th class="warna">' + rjdEscapeHtml_(w.warna || "-") + '</th>' +
      '<td class="num">' + (w.totalQtyWarna || 0) + '</td>' +
      daftar.map(function(k){
        const v = butuh(k, w);
        // KODE kain warna ini untuk slot ini -- dipindah ke sini dari matriks
        // size. Kode & kebutuhan bersebelahan justru yang dibutuhkan bagian
        // pembelian: "Butter butuh Col 2 sebanyak 560 yds".
        const b = (w.bahan || []).filter(function(x){ return x.slot === k.nama; })[0];
        const kode = (b && b.kode) ? rjdEscapeHtml_(b.kode) : "";
        const jml = v > 0 ? (v + " " + rjdEscapeHtml_(k.satuan || "yds")) : "";
        if(!kode && !jml) return '<td class="num">-</td>';
        return '<td class="num">' +
          (kode ? '<span class="ck-kode-kain">' + kode + '</span>' : '') +
          (kode && jml ? '<span class="ck-kain-pisah">&#183;</span>' : '') +
          (jml ? jml : '') +
        '</td>';
      }).join("") +
    '</tr>';
  }).join("") + '</tbody>';

  const totalQty = (warnaList || []).reduce(function(sum, w){ return sum + (Number(w.totalQtyWarna) || 0); }, 0);
  const kaki = '<tfoot><tr><th class="warna">TOTAL</th>' +
    '<td class="num">' + totalQty + '</td>' +
    daftar.map(function(k){
      let t = 0;
      (warnaList || []).forEach(function(w){ t += butuh(k, w); });
      t = Math.round(t * 100) / 100;
      return '<td class="num">' + (t > 0 ? t + " " + rjdEscapeHtml_(k.satuan || "yds") : "-") + '</td>';
    }).join("") +
  '</tr></tfoot>';

  return '<div class="ck-jadwal">' +
    '<div class="ck-jadwal-lbl">Kebutuhan Kain per Warna</div>' +
    '<table class="ck-spk-matrix">' + kepala + badan + kaki + '</table>' +
  '</div>';
}

/**
 * Standar produksi klien di SPK. Kosong -> tidak menampilkan apa pun, jadi
 * klien yang tidak punya dokumen standar SPK-nya tetap bersih.
 *
 * Ditaruh DI ATAS daftar ITEM, bukan di bawah: ini aturan yang harus dibaca
 * SEBELUM kain dipotong, bukan catatan kaki.
 */
function ckStandarKlienHtml_(std, namaKlien){
  if(!std) return "";
  const url = String(std.url || "").trim();
  const catatan = String(std.catatan || "").trim();
  if(!url && !catatan) return "";

  const tautan = url.split(";").map(function(u){ return u.trim(); }).filter(Boolean)
    .map(function(u, i, arr){
      const label = arr.length > 1 ? ("Dokumen " + (i + 1)) : "Buka dokumen standar";
      return '<a href="' + u + '" rel="noopener" target="_blank">' + label + '</a>';
    }).join(" &#183; ");

  return '<div class="ck-standar">' +
    '<div class="ck-standar-lbl">Standar Produksi &#183; ' + rjdEscapeHtml_(namaKlien || "Klien") + '</div>' +
    (catatan ? '<div class="ck-standar-isi">' + rjdEscapeHtml_(catatan) + '</div>' : '') +
    (tautan ? '<div class="ck-standar-link">' + tautan + '</div>' : '') +
  '</div>';
}

/**
 * Size chart per artikel (dari SD Master Artikel). Baris = nama ukuran,
 * kolom = size. Kosong -> tidak tampil.
 *
 * Ini sumber sengketa nomor satu di CMT: salah ukur = barang ditolak. Sebelum
 * ini ukurannya cuma ada di worksheet klien yang harus dibuka terpisah.
 */
function ckSizeChartHtml_(daftar, kolomSize, sumber){
  if(!daftar || !daftar.length) return "";
  // Kolom diambil dari size yang BENAR-BENAR dipesan (kolomSize), lalu
  // ditambah size lain yang ada di chart tapi tidak dipesan -- supaya tidak
  // ada angka yang hilang, tapi urutannya tetap mengikuti order.
  const kol = (kolomSize || []).slice();
  daftar.forEach(function(b){
    Object.keys(b.perSize || {}).forEach(function(sz){
      if(kol.indexOf(sz) === -1) kol.push(sz);
    });
  });
  if(!kol.length) return "";

  const baris = daftar.map(function(b){
    return '<tr><th class="warna">' + rjdEscapeHtml_(b.nama) + '</th>' +
      kol.map(function(sz){
        const v = (b.perSize || {})[sz];
        return '<td>' + (v ? rjdEscapeHtml_(String(v)) : '-') + '</td>';
      }).join("") +
    '</tr>';
  }).join("");

  return '<div class="ck-jadwal">' +
    '<div class="ck-jadwal-lbl">Size Chart' +
      // Asal chart disebutkan supaya jelas ini ukuran khusus order ini atau
      // standar yang berlaku umum -- tanpa itu orang tidak bisa membedakannya.
      (sumber ? ' <span class="ck-kons-kecil" style="display:inline;text-transform:none;letter-spacing:0">(' + rjdEscapeHtml_(sumber) + ')</span>' : '') +
    '</div>' +
    '<table class="ck-spk-matrix"><thead><tr><th class="warna">Ukuran</th>' +
      kol.map(function(sz){ return '<th>' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
    '</tr></thead><tbody>' + baris + '</tbody></table>' +
  '</div>';
}

/**
 * Kain dari klien (CMT). Kosong -> tidak tampil.
 *
 * Judulnya SENGAJA netral ("Kain Dari Klien"), bukan "Kain Diterima" -- versi
 * sebelumnya menyatakan kainnya SUDAH diterima padahal kolom tanggal terima
 * kosong dan keterangannya bisa saja "data kain perkiraan". Dokumen yang
 * menyatakan sesuatu sudah masuk padahal belum itu berbahaya kalau dijadikan
 * rujukan saat kain kurang.
 *
 * Kolom Status menyimpulkan sendiri dari ada/tidaknya tanggal terima, dan baris
 * TOTAL memisahkan yang sudah diterima dari yang baru rencana -- jadi terlihat
 * berapa yang benar-benar sudah ada di tangan.
 */
function ckKainKlienHtml_(daftar){
  if(!daftar || !daftar.length) return "";
  let adaTanggal = false;
  daftar.forEach(function(k){ if((k.tanggal || "").trim()) adaTanggal = true; });

  const baris = daftar.map(function(k){
    const diterima = (k.tanggal || "").trim() !== "";
    return '<tr>' +
      '<td>' + rjdEscapeHtml_(k.nama) + '</td>' +
      '<td class="num">' + (k.jumlah ? k.jumlah + ' ' + rjdEscapeHtml_(k.satuan || "yds") : '-') + '</td>' +
      '<td>' + (diterima ? rjdEscapeHtml_(k.tanggal) : '-') + '</td>' +
      '<td><span class="ck-status-kain' + (diterima ? ' ok' : '') + '">' +
        (diterima ? 'Diterima' : 'Belum diterima') + '</span></td>' +
      '<td>' + rjdEscapeHtml_(k.keterangan || "") + '</td>' +
    '</tr>';
  }).join("");

  // Total dipisah supaya angka "sudah di tangan" tidak tercampur dengan rencana.
  const rekap = {};
  daftar.forEach(function(k){
    const sat = k.satuan || "yds";
    if(!rekap[sat]) rekap[sat] = { diterima: 0, belum: 0 };
    const j = Number(k.jumlah) || 0;
    if((k.tanggal || "").trim()) rekap[sat].diterima += j;
    else rekap[sat].belum += j;
  });
  const ringkas = Object.keys(rekap).map(function(sat){
    const r = rekap[sat];
    const bagian = [];
    if(r.diterima) bagian.push('diterima ' + (Math.round(r.diterima * 100) / 100) + ' ' + sat);
    if(r.belum) bagian.push('belum diterima ' + (Math.round(r.belum * 100) / 100) + ' ' + sat);
    return bagian.join(' &#183; ');
  }).filter(Boolean).join(' &#183; ');

  return '<div class="ck-jadwal">' +
    '<div class="ck-jadwal-lbl">Kain Dari Klien</div>' +
    '<table class="ck-jadwal-tabel"><thead><tr>' +
      '<th>Kain</th><th class="num">Jumlah</th><th>Tgl Terima</th><th>Status</th><th>Keterangan</th>' +
    '</tr></thead><tbody>' + baris + '</tbody></table>' +
    (ringkas ? '<div class="ck-kain-rekap">' + ringkas + '</div>' : '') +
    (!adaTanggal ? '<div class="ck-kain-rekap">Belum ada tanggal terima yang dicatat -- angka di atas masih rencana/perkiraan.</div>' : '') +
  '</div>';
}

/** Aksesoris 1 ITEM + perkiraan kebutuhan (qty/pcs x total pcs item). */
function ckAksesorisHtml_(daftar, totalQty){
  if(!daftar || !daftar.length) return "";
  const baris = daftar.map(function(a){
    const q = Number(a.qtyPerPcs) || 0;
    const butuh = q > 0 ? Math.round(q * (Number(totalQty) || 0) * 100) / 100 : null;
    return '<tr>' +
      '<td>' + rjdEscapeHtml_(a.nama) + '</td>' +
      '<td class="num">' + (q > 0 ? q + ' ' + rjdEscapeHtml_(a.satuan || "pcs") : '-') + '</td>' +
      '<td class="num">' + (butuh !== null ? butuh + ' ' + rjdEscapeHtml_(a.satuan || "pcs") : '-') + '</td>' +
      '<td>' + rjdEscapeHtml_(a.keterangan || "") + '</td>' +
    '</tr>';
  }).join("");
  return '<div class="ck-jadwal">' +
    '<div class="ck-jadwal-lbl">Aksesoris</div>' +
    '<table class="ck-jadwal-tabel"><thead><tr>' +
      '<th>Aksesoris</th><th class="num">Per pcs</th><th class="num">Perkiraan kebutuhan</th><th>Keterangan</th>' +
    '</tr></thead><tbody>' + baris + '</tbody></table>' +
  '</div>';
}

/**
 * Checklist QC -- kotak kosong untuk dicentang petugas. Dicetak di setiap SPK.
 * Sebelum ini QC tidak punya jejak tertulis sama sekali: hasil periksa cuma
 * diingat, jadi perbaikan kualitas tidak punya dasar.
 */
function ckChecklistQCHtml_(daftar){
  if(!daftar || !daftar.length) return "";
  const isi = daftar.map(function(g){
    return '<div class="ck-qc-grup">' +
      '<div class="ck-qc-judul">' + rjdEscapeHtml_(g.grup) + '</div>' +
      g.poin.map(function(p){
        return '<div class="ck-qc-poin"><span class="kotak"></span>' + rjdEscapeHtml_(p) + '</div>';
      }).join("") +
    '</div>';
  }).join("");
  return '<div class="ck-qc">' +
    '<div class="ck-jadwal-lbl">Checklist Quality Control</div>' +
    '<div class="ck-qc-isi">' + isi + '</div>' +
    '<div class="ck-qc-ttd">Diperiksa oleh: ______________________ &#183; Tanggal: ____________ &#183; Jumlah reject: ________</div>' +
  '</div>';
}

/**
 * Bandingkan dua teks catatan tanpa peduli spasi/kapital. Dipakai untuk
 * menghindari menampilkan "Standar produksi artikel" yang isinya sama persis
 * dengan "Detail model" -- redundansi yang muncul karena catatan order naik
 * jadi standar artikel saat order disetujui.
 */
function ckTeksSama_(a, b){
  const rapikan = function(x){
    return String(x || "").replace(/\s+/g, " ").trim().toLowerCase();
  };
  const ra = rapikan(a), rb = rapikan(b);
  return !!ra && ra === rb;
}

/** Gabungan catatan item dari semua warna (biasanya identik -> 1 nilai). */
function ckCatatanItemGabung_(warnaList){
  const unik = [];
  (warnaList || []).forEach(function(w){
    const c = String(w.catatanItem || "").trim();
    if(c && unik.indexOf(c) === -1) unik.push(c);
  });
  return unik.join("\n");
}

/** Tabel jadwal kirim bertahap di dokumen. Kosong -> tidak menampilkan apa pun. */
function ckJadwalKirimHtml_(daftar){
  if(!daftar || !daftar.length) return "";
  const baris = daftar.map(function(j){
    return '<tr>' +
      '<td>' + rjdEscapeHtml_(j.tanggal || "-") + '</td>' +
      '<td class="num">' + (j.qty ? j.qty + ' pcs' : '-') + '</td>' +
      '<td>' + rjdEscapeHtml_(j.keterangan || "") + '</td>' +
    '</tr>';
  }).join("");
  return '<div class="ck-jadwal">' +
    '<div class="ck-jadwal-lbl">Jadwal Kirim Bertahap</div>' +
    '<table class="ck-jadwal-tabel"><thead><tr><th>Tanggal</th><th class="num">Qty</th><th>Keterangan</th></tr></thead>' +
    '<tbody>' + baris + '</tbody></table>' +
  '</div>';
}

/** 1 sel gambar di galeri. Dipakai ckBuildItemGroupsHtml_. */
function ckGambarSelHtml_(url, label){
  const id = rjdDriveFileId_(url); // helper global -- 1 salinan, dipakai bareng
  const cap = rjdEscapeHtml_(label);
  if(!id){
    return '<div class="sel"><div class="cap"><a href="' + url + '" rel="noopener" target="_blank">' + cap + '</a></div></div>';
  }
  // loading="eager" WAJIB: gambar lazy-load yang belum ke-scroll TIDAK IKUT
  // TERCETAK sama sekali. sz=w400 (bukan w200 seperti tampilan layar) supaya
  // detail model masih terbaca di kertas.
  return '<div class="sel">' +
    '<img alt="' + cap + '" loading="eager" src="https://drive.google.com/thumbnail?id=' + id + '&amp;sz=w400"' +
      ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'"/>' +
    '<div class="cap" style="display:none">(gambar gagal dimuat)</div>' +
    '<div class="cap">' + cap + '</div>' +
  '</div>';
}

/**
 * ============ KARTU ITEM -> WARNA: KOMPONEN BERSAMA ============
 * Dipakai DUA dokumen: SPK (ckRenderSPK) & Konfirmasi Order
 * (ckRenderKonfirmasiOrder). SENGAJA 1 salinan -- kalau tampilan diperbaiki,
 * kedua dokumen ikut membaik bersamaan & nggak mungkin beda bentuk.
 *
 * BENTUK: 1 ITEM (Brand+Artikel+Style) = 1 TABEL MATRIKS. Warna jadi BARIS,
 * size jadi KOLOM, ditutup baris TOTAL. Sebelumnya tiap warna dapat blok +
 * tabel sendiri -- order 8 warna menghasilkan 8 blok berulang yang isinya
 * nyaris sama & sulit dibandingkan. Kolom size-nya GABUNGAN semua warna
 * (dihitung backend, field `sizeColumns`) supaya warna dengan set size berbeda
 * tetap sejajar di kolom yang benar.
 *
 * Gambar desain & catatan model TETAP per-warna di data, tapi ditampilkan
 * SETELAH tabel: gambar sebagai galeri berlabel warna, catatan digabung kalau
 * isinya sama untuk semua warna (kasus paling umum) atau dirinci per warna
 * kalau memang beda -- supaya nggak ada informasi yang hilang.
 *
 * @param opsi.tampilHarga  true = tambah kolom Harga & Subtotal. SPK memakai
 *   FALSE (backend-nya pun nggak mengirim data harga sama sekali).
 * @param opsi.semuaItem    daftar lengkap item -- buat penomoran ITEM yang
 *   konsisten saat SPK dicetak per-item ("ITEM 3" tetap "ITEM 3").
 */
function ckBuildItemGroupsHtml_(daftarItem, opsi){
  const tampilHarga = !!(opsi && opsi.tampilHarga);
  const semuaItem = (opsi && opsi.semuaItem) ? opsi.semuaItem : daftarItem;

  return daftarItem.map(function(it, i){
    const posisi = semuaItem.indexOf(it);
    const nomor = (posisi === -1 ? i : posisi) + 1;
    const sub = [it.brand, it.style].filter(Boolean).map(rjdEscapeHtml_).join(" &#183; ");
    const warnaList = it.warnaList || [];
    const kolom = it.sizeColumns || [];

    // qty 1 warna pada 1 size -- size standar ada di sizeQty, size custom
    // (preset "Anak 0-12" dsb) ada di detailAllSizeParsed. Dicek dua-duanya.
    function qtyDi(w, size){
      if(w.sizeQty && w.sizeQty[size] !== undefined && w.sizeQty[size] !== null) return Number(w.sizeQty[size]) || 0;
      const c = (w.detailAllSizeParsed || []).filter(function(d){ return d.label === size; })[0];
      return c ? (Number(c.qty) || 0) : 0;
    }

    // Kolom Bahan hanya muncul kalau ADA warna yang mengisinya -- order tanpa
    // data bahan tidak perlu kolom kosong yang menyempitkan kolom size.
    // KODE KAIN TIDAK LAGI DI MATRIKS SIZE. Satu tabel dipaksa memuat dua hal
    // yang sama-sama butuh lebar (jumlah order per size + peta kain per warna);
    // di kertas A4 yang kalah justru angka qty -- sampai menumpuk vertikal.
    // Kode kain dipindah ke tabel "Kebutuhan Kain per Warna" yang bentuknya
    // memang sudah warna x kain, dan di sana kode berdampingan dengan jumlah
    // kebutuhannya -- justru lebih berguna buat bagian pembelian.
    const kepala = '<thead><tr><th class="warna">Warna</th>' +
      kolom.map(function(s){ return '<th>' + rjdEscapeHtml_(s) + '</th>'; }).join("") +
      '<th class="tot">TOTAL</th>' +
      (tampilHarga ? '<th>Harga</th><th>Subtotal</th>' : '') +
    '</tr></thead>';

    const badan = '<tbody>' + warnaList.map(function(w){
      const selSize = kolom.map(function(s){
        const q = qtyDi(w, s);
        return q > 0 ? '<td>' + q + '</td>' : '<td class="nol">-</td>';
      }).join("");
      let selHarga = "";
      if(tampilHarga){
        selHarga = w.hargaKosong
          ? '<td class="num belum">belum diisi</td><td class="num belum">-</td>'
          : '<td class="num">' + formatRupiah(w.harga) + '</td><td class="num">' + formatRupiah(w.subtotal) + '</td>';
      }
      return '<tr><th class="warna">' + rjdEscapeHtml_(w.warna || "-") + '</th>' +
        selSize + '<td class="tot">' + w.totalQtyWarna + '</td>' + selHarga + '</tr>';
    }).join("") + '</tbody>';

    const totalSize = kolom.map(function(s){
      let t = 0;
      warnaList.forEach(function(w){ t += qtyDi(w, s); });
      return '<td>' + t + '</td>';
    }).join("");
    const kaki = '<tfoot><tr><th class="warna">TOTAL</th>' +
      totalSize +
      '<td>' + it.totalQtyItem + '</td>' +
      (tampilHarga ? '<td></td><td class="num">' + formatRupiah(it.subtotalItem || 0) + '</td>' : '') +
    '</tr></tfoot>';

    // ---- catatan model: gabung kalau sama untuk semua warna ----
    const catatanUnik = [];
    warnaList.forEach(function(w){
      const t = (w.catatanItem || "").trim();
      if(!t) return;
      const found = catatanUnik.filter(function(c){ return c.teks === t; })[0];
      if(found) found.warna.push(w.warna || "-");
      else catatanUnik.push({ teks: t, warna: [w.warna || "-"] });
    });
    const semuaPunyaCatatan = warnaList.length > 0 &&
      warnaList.every(function(w){ return (w.catatanItem || "").trim() !== ""; });
    const catatanHtml = catatanUnik.map(function(c){
      // Label warna disembunyikan kalau catatannya memang berlaku untuk SEMUA
      // warna -- menuliskan daftar 8 warna di situ cuma jadi kebisingan.
      const seragam = (catatanUnik.length === 1 && semuaPunyaCatatan);
      const label = seragam ? "Detail model:" : "Detail model (" + rjdEscapeHtml_(c.warna.join(", ")) + "):";
      return '<div class="ck-spk-catatan"><b>' + label + '</b><div class="isi">' + rjdEscapeHtml_(c.teks) + '</div></div>';
    }).join("");

    // ---- galeri gambar: kumpulkan dari semua warna, diberi label warna ----
    // Foto desain sekarang milik STYLE, bukan per warna -- backend menyimpannya
    // sama di tiap baris warna. Tanpa dedup, order 8 warna menampilkan 8 gambar
    // IDENTIK berlabel nama warna, seolah tiap warna punya desain sendiri.
    const urlUnik = [];
    warnaList.forEach(function(w){
      String(w.urlGambarDesain || "").split(";").forEach(function(u){
        const t = u.trim();
        if(t && urlUnik.indexOf(t) === -1) urlUnik.push(t);
      });
    });
    const selGambar = urlUnik.map(function(u, i){
      return ckGambarSelHtml_(u, urlUnik.length > 1 ? ("Desain " + (i + 1)) : "Desain");
    });
    const galeriHtml = selGambar.length
      ? '<div class="ck-spk-galeri">' + selGambar.join("") + '</div>'
      : '<div class="ck-spk-galeri"><div class="kosong">Tidak ada gambar desain untuk item ini</div></div>';

    const subtotalItemHtml = (tampilHarga && it.subtotalItem !== undefined)
      ? '<div class="subtotal">' + formatRupiah(it.subtotalItem) + '</div>' : '';

    return '<div class="ck-spk-item">' +
      '<div class="ck-spk-item-head">' +
        '<div>' +
          '<div class="judul">ITEM ' + nomor + ': ' + rjdEscapeHtml_(it.artikel || "-") + '</div>' +
          (sub ? '<div class="sub">' + sub + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="qty">' + it.totalQtyItem + ' pcs</div>' +
          subtotalItemHtml +
        '</div>' +
      '</div>' +
      '<div class="ck-spk-body">' +
        '<table class="ck-spk-matrix">' + kepala + badan + kaki + '</table>' +
        // Gambar DULU, catatan di bawahnya -- sama dengan urutan di form order:
        // klien mengunggah foto acuan lebih dulu, keterangannya menyusul.
        // Kebutuhan kain per warna DILEWATI di SPK per line: yang memotong kain
        // adalah cutting, dan potongan sudah jadi saat SPK ini sampai ke tim
        // sewing. Menampilkannya cuma menambah halaman yang tidak dipakai.
        (CK_SPK_DATA && CK_SPK_DATA.line ? "" : ckKomposisiHtml_(it.komposisiKain, warnaList, qtyDi)) +
        ckAksesorisHtml_(it.aksesoris, it.totalQtyItem) +
        galeriHtml +
        // Size chart ditaruh SETELAH gambar desain: keduanya sama-sama
        // menjawab "seperti apa hasilnya" -- gambar untuk bentuknya, size
        // chart untuk ukurannya. Sebelumnya size chart membuka kartu ITEM,
        // padahal yang dicari pertama biasanya qty & bahan.
        ckSizeChartHtml_(it.sizeChart, kolom, it.sizeChartSumber) +
        catatanHtml +
        // Standar artikel HANYA ditampilkan kalau ISINYA BEDA dari catatan
        // order. Catatan order naik jadi standar artikel saat approve, jadi
        // keduanya sering identik -- menampilkan dua kali bikin dokumen
        // panjang tanpa menambah informasi apa pun.
        ((it.catatanProduksiBaku && !ckTeksSama_(it.catatanProduksiBaku, ckCatatanItemGabung_(warnaList)))
          ? '<div class="ck-spk-catatan"><b>Standar produksi artikel ini:</b><div class="isi">' +
            rjdEscapeHtml_(it.catatanProduksiBaku) + '</div></div>'
          : '') +
        (it.urlLampiranArtikel
          ? '<div class="ck-dok-catatan" style="margin-top:10px"><b>Lampiran artikel:</b> ' +
            '<a href="' + String(it.urlLampiranArtikel).split(";")[0].trim() + '" rel="noopener" target="_blank">Buka dokumen</a></div>'
          : '') +
      '</div>' +
    '</div>';
  }).join("");
}

function ckSPKPilihItem(nilai){
  CK_SPK_ITEM_AKTIF = (nilai === "semua") ? "semua" : parseInt(nilai, 10);
  ckRenderSPK();
}

/**
 * Panel identitas LINE di SPK per line. WAJIB tercetak: tanpa ini penjahit
 * mengira PO ini memang cuma sebanyak jatahnya, dan tidak tahu dia mengerjakan
 * sebagian dari order yang lebih besar. Pembagian ke line lain ikut ditampilkan
 * supaya kepala line tahu sisanya di siapa.
 */
function ckSPKLineHtml_(line, ringkasan){
  if(!line) return "";
  const lain = (ringkasan || []).filter(function(r){ return !r.ini; });
  return '<div class="ck-spk-line">' +
    '<div class="ck-spk-line-head">' +
      '<div>' +
        '<div class="ck-spk-line-lbl">Surat Perintah Kerja untuk</div>' +
        '<div class="ck-spk-line-nama">' + rjdEscapeHtml_(line.namaLine) +
          (line.lokasi ? ' <span class="lok">' + rjdEscapeHtml_(line.lokasi) + '</span>' : '') + '</div>' +
        (line.kepalaLine ? '<div class="ck-spk-line-sub">Kepala line: ' + rjdEscapeHtml_(line.kepalaLine) + '</div>' : '') +
      '</div>' +
      '<div class="ck-spk-line-qty">' +
        '<div class="angka">' + line.totalQtyLine + '</div>' +
        '<div class="ket">pcs jatah line ini</div>' +
      '</div>' +
    '</div>' +
    '<div class="ck-spk-line-bagi">' +
      'Jatah ini <b>' + line.persenDariPO + '%</b> dari total PO ' + line.totalQtyPO + ' pcs' +
      (line.serahTerakhir ? ' &#183; serah terakhir ' + rjdEscapeHtml_(line.serahTerakhir) : '') +
      (lain.length
        ? '. Sisanya di ' + lain.map(function(r){
            return rjdEscapeHtml_(r.namaLine) + ' (' + r.qty + ')';
          }).join(", ")
        : '') +
    '</div>' +
  '</div>';
}

/**
 * ============ REKAP KERJA LINE ============
 * Papan PANTAU kepala line: semua PO yang sedang dipegang line ini, deadline
 * terdekat di atas.
 *
 * SENGAJA TIDAK memuat spesifikasi (size chart, komposisi kain, checklist QC)
 * -- itu wilayah SPK per order. Dokumen ini menjawab pertanyaan lain:
 * "hari ini kita pegang apa saja, mana yang paling mepet." Kalau keduanya
 * digabung, dua-duanya jadi sulit dipakai.
 *
 * Nol data harga, sama seperti SPK -- dokumen lantai produksi.
 */
function ckRenderRekapLine(d){
  const line = d.line || {};

  const kartu =
    '<div class="ck-rl-ringkas">' +
      '<div class="ck-rl-kartu"><div class="ck-rl-angka">' + d.jumlahPO + '</div>' +
        '<div class="ck-rl-lbl">order berjalan</div></div>' +
      '<div class="ck-rl-kartu"><div class="ck-rl-angka">' + d.totalQty + '</div>' +
        '<div class="ck-rl-lbl">pcs dipegang</div></div>' +
      '<div class="ck-rl-kartu' + (d.jumlahTerlambat ? ' bahaya' : '') + '">' +
        '<div class="ck-rl-angka">' + d.jumlahTerlambat + '</div>' +
        '<div class="ck-rl-lbl">lewat deadline</div></div>' +
    '</div>';

  let isi;
  if(!d.daftar.length){
    isi = '<p class="ck-rl-kosong">Line ini belum memegang order apa pun.</p>';
  } else {
    isi = '<table class="ck-rl-tabel"><thead><tr>' +
        '<th>Purchase Order</th><th>Artikel &#183; Warna</th>' +
        '<th class="num">Jatah</th><th>Deadline</th>' +
      '</tr></thead><tbody>' +
      d.daftar.map(function(p){
        // Sisa hari dihitung backend; ditampilkan sebagai kata karena "H-3"
        // langsung terbaca, sedangkan tanggal saja masih perlu dihitung sendiri.
        let ket = "", kelas = "";
        if(p.sisaHari !== null && p.sisaHari !== undefined){
          if(p.sisaHari < 0){ ket = "telat " + Math.abs(p.sisaHari) + " hari"; kelas = "telat"; }
          else if(p.sisaHari === 0){ ket = "HARI INI"; kelas = "telat"; }
          else if(p.sisaHari <= 3){ ket = "H-" + p.sisaHari; kelas = "mepet"; }
          else ket = "H-" + p.sisaHari;
        }
        return '<tr class="' + kelas + '">' +
          '<td><b class="ck-rl-po">' + rjdEscapeHtml_(p.idPurchaseOrder) + '</b>' +
            '<div class="ck-rl-sub">' + rjdEscapeHtml_(p.namaKlien) +
              (p.status ? ' &#183; ' + rjdEscapeHtml_(p.status) : '') + '</div></td>' +
          '<td>' + p.item.map(function(it){
              return '<div class="ck-rl-item">' + rjdEscapeHtml_(it.label) +
                (it.warna ? ' <span class="wr">' + rjdEscapeHtml_(it.warna) + '</span>' : '') +
                ' <b>' + it.qty + '</b></div>';
            }).join("") + '</td>' +
          '<td class="num"><b>' + p.qtyLine + '</b>' +
            (p.qtyPO ? '<div class="ck-rl-sub">dari ' + p.qtyPO + ' pcs PO</div>' : '') + '</td>' +
          '<td>' + rjdEscapeHtml_(p.deadline || "-") +
            (ket ? '<div class="ck-rl-ket ' + kelas + '">' + ket + '</div>' : '') + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table>';
  }

  document.getElementById("ck-isi").innerHTML =
    ckHeaderHtml("REKAP KERJA LINE", rjdEscapeHtml_(line.namaLine || line.idLine || "-"), d.tanggalCetak) +
    '<div class="ck-rl-line">' +
      '<div>' +
        '<div class="ck-rl-line-nama">' + rjdEscapeHtml_(line.namaLine || "-") + '</div>' +
        '<div class="ck-rl-sub">' +
          (line.lokasi ? rjdEscapeHtml_(line.lokasi) : "") +
          (line.kepalaLine ? ' &#183; kepala line: ' + rjdEscapeHtml_(line.kepalaLine) : "") +
          (line.jumlahOperator ? ' &#183; ' + line.jumlahOperator + ' operator' : "") +
        '</div>' +
      '</div>' +
    '</div>' +
    kartu + isi +
    '<div class="ck-rl-catatan">Dokumen pantau, bukan perintah kerja. Spesifikasi lengkap tiap order ada di SPK masing-masing. Dicetak oleh ' +
      rjdEscapeHtml_(d.dicetakOleh || "-") + '.</div>';

  document.title = "Rekap Kerja " + (line.namaLine || "") + " -- RJD Apparel";
}

function ckRenderSPK(){
  const d = CK_SPK_DATA;
  if(!d) return;

  const semuaItem = d.itemGroups || [];
  const pilihSemua = (CK_SPK_ITEM_AKTIF === "semua");
  // Indeks di luar jangkauan (mis. ?item=9 padahal cuma 3 item) -> jatuh balik
  // ke "semua" daripada menampilkan dokumen kosong tanpa penjelasan.
  const idxAktif = pilihSemua ? -1 : CK_SPK_ITEM_AKTIF;
  const itemDitampilkan = (!pilihSemua && semuaItem[idxAktif]) ? [semuaItem[idxAktif]] : semuaItem;
  const modePerItem = itemDitampilkan.length === 1 && semuaItem.length > 1 && !pilihSemua;

  // ---- kontrol pemilih item (TIDAK ikut tercetak: .ck-no-print) ----
  let pilihHtml = "";
  if(semuaItem.length > 1){
    pilihHtml = '<div class="ck-spk-pilih ck-no-print"><span class="lbl">Cetak</span>' +
      '<button type="button" class="' + (pilihSemua ? "aktif" : "") + '" onclick="ckSPKPilihItem(\'semua\')">Semua item (' + semuaItem.length + ')</button>' +
      semuaItem.map(function(it, i){
        const nama = it.artikel || ("Item " + (i + 1));
        return '<button type="button" class="' + (idxAktif === i ? "aktif" : "") + '" onclick="ckSPKPilihItem(' + i + ')">' + (i + 1) + '. ' + nama + '</button>';
      }).join("") +
    '</div>';
  }

  const totalDitampilkan = itemDitampilkan.reduce(function(s, it){ return s + (it.totalQtyItem || 0); }, 0);

  // Kartu ITEM -> Warna: KOMPONEN BERSAMA dengan Konfirmasi Order.
  // tampilHarga FALSE -- lapis kedua pengaman; backend SPK sendiri memang
  // nggak pernah mengirim data harga (lihat cetak-spk.gs).
  // semuaItem dikirim supaya penomoran tetap konsisten waktu cetak per-item:
  // item ke-3 tetap tertulis "ITEM 3", bukan "ITEM 1".
  const itemsHtml = ckBuildItemGroupsHtml_(itemDitampilkan, { tampilHarga: false, semuaItem: semuaItem });

  const catatanHtml = [
    d.catatanKlien ? '<div class="ck-dok-catatan"><b>Catatan Klien:</b><div class="isi">' + rjdEscapeHtml_(d.catatanKlien) + '</div></div>' : '',
    d.catatanAdmin ? '<div class="ck-dok-catatan"><b>Catatan Admin:</b><div class="isi">' + rjdEscapeHtml_(d.catatanAdmin) + '</div></div>' : '',
    d.urlFileLainnya ? '<div class="ck-dok-catatan"><b>Lampiran tambahan:</b> <a href="' + d.urlFileLainnya.split(";")[0].trim() + '" rel="noopener" target="_blank">Lihat file</a> (size chart / referensi)</div>' : ''
  ].filter(Boolean).join("");

  const nomorSPK = d.idPurchaseOrderHasil || d.idOrderRequest;

  const html = pilihHtml +
    '<div class="ck-dok">' +
      (d.isDraft ? '<div class="ck-spk-wm">DRAFT</div>' : '') +
      ckHeaderHtml(d.line ? ("SPK " + String(d.line.namaLine).toUpperCase()) : "SURAT PERINTAH KERJA", nomorSPK, d.tanggalDiajukan) +
      (d.isDraft ? '<div class="ck-dok-catatan" style="background:#FCF3E3;border-left:3px solid #EBCFA0">' +
        '<b>DRAFT &#183; status "' + d.status + '".</b> Order ini BELUM disetujui jadi PO. Jangan dijadikan dasar memulai produksi atau memotong kain.</div>' : '') +
      (d.itemTanpaKain && d.itemTanpaKain.length ?
        '<div class="ck-dok-catatan" style="background:#FBE9E7;border-left:3px solid #D98177">' +
        '<b>&#9888; KAIN BELUM TERDEFINISI</b> untuk: <b>' +
        d.itemTanpaKain.map(function (x) { return rjdEscapeHtml_(x); }).join("</b>, <b>") +
        '</b>. Belum ada Komposisi Kain di artikelnya dan tidak ada catatan Kain Dari Klien. ' +
        'Isi lewat Edit Order (panel ARTIKEL) sebelum PO ini digelar &#8212; tanpa itu, nama kain ' +
        'akan lahir dari ketikan bebas di lantai potong dan rekap kainnya pecah.</div>' : '') +
      ckSPKLineHtml_(d.line, d.ringkasanLine) +
      ckStandarKlienHtml_(d.standarKlien, d.namaKlien) +
      '<div class="ck-spk-meta">' +
        '<div class="sel"><div class="lbl">Klien</div><div class="val">' + rjdEscapeHtml_(d.namaKlien) + '</div></div>' +
        // MODE PER LINE: yang berlaku di lantai adalah target INTERNAL line,
        // bukan deadline kirim ke klien (backend memang tidak mengirimnya --
        // lihat getSPKPerLine_). Kalau belum ditentukan, ditulis terang-terangan
        // supaya jadi dorongan mengisinya, bukan diisi deadline klien diam-diam.
        (d.line
          ? '<div class="sel"><div class="lbl">Target Selesai</div><div class="val">' +
              (d.line.targetSelesai
                ? rjdEscapeHtml_(d.line.targetSelesai)
                : '<span style="color:#8A5D1F">belum ditentukan</span>') + '</div></div>'
          : '<div class="sel"><div class="lbl">Target Kirim</div><div class="val">' + (d.targetTanggalKirim || "-") + '</div></div>') +
        '<div class="sel"><div class="lbl">' + (modePerItem ? "Qty Item Ini" : "Total Qty") + '</div><div class="val">' + totalDitampilkan + ' pcs</div></div>' +
        '<div class="sel"><div class="lbl">No. SO</div><div class="val">' + (d.noSOHasil || "-") + '</div></div>' +
      '</div>' +
      itemsHtml +
      // SPK dari PO: sebagian bagian bisa kosong karena artikelnya belum
      // terdaftar di Master Artikel. Diberitahukan terang-terangan -- bukan
      // dibiarkan seolah artikel itu memang tidak punya spesifikasi.
      ((d.artikelBelumDiMaster && d.artikelBelumDiMaster.length)
        ? '<div class="ck-standar" style="border-color:#EBCFA0">' +
            '<div class="ck-standar-lbl">Spesifikasi belum lengkap</div>' +
            '<div class="ck-standar-isi">Artikel berikut belum terdaftar di Master Artikel, ' +
            'jadi komposisi kain, aksesoris, dan size chart-nya belum bisa ditampilkan: ' +
            rjdEscapeHtml_(d.artikelBelumDiMaster.join("; ")) + '.</div>' +
          '</div>'
        : '') +
      ckKainKlienHtml_(d.kainDariKlien) +
      ckJadwalKirimHtml_(d.jadwalKirim) +
      catatanHtml +
      ckChecklistQCHtml_(d.checklistQC) +
      '<div class="ck-dok-ttd">' +
        '<div class="kolom">Dibuat oleh,<div class="garis"></div><div class="nama-ttd">' + d.dicetakOleh + '</div></div>' +
        '<div class="kolom">Diterima Produksi,<div class="garis"></div><div class="nama-ttd">(&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;&#183;)</div></div>' +
      '</div>' +
    '</div>';

  document.getElementById("ck-isi").innerHTML = html;
  document.title = "SPK " + nomorSPK + (d.line ? " - " + d.line.namaLine : "") +
    (modePerItem ? " - Item " + (idxAktif + 1) : "") + " -- RJD Apparel";
}

/**
 * Baca token sesi yang udah ada di browser -- halaman cetak dipakai DUA jenis user:
 * staff (dari Dashboard, key "db_session") & klien (dari Portal Klien, key "lp_session").
 * Semua halaman se-origin www.rjdapparel.id, jadi localStorage-nya dibagi. Token TIDAK
 * dilempar lewat URL (token di query string bocor ke log/history/referrer) -- cukup baca
 * dari localStorage.
 *
 * Urutan cek: db_session DULU, baru lp_session. Alasannya kalau 1 browser kebetulan punya
 * dua-duanya (misal owner login dashboard sekaligus pernah tes portal), token staff yang
 * dipakai -- aksesnya lebih luas, jadi nggak salah kena "tidak punya akses" pas staff buka
 * dokumen milik klien lain.
 *
 * Return null kalau nggak ada / udah expired -> jatuh ke layar login biasa. Buffer 60 detik
 * biar token nggak mati pas di tengah request.
 */
function ckBacaTokenSesi_(){
  const keys = ["db_session", "lp_session"];
  for(let i = 0; i < keys.length; i++){
    try{
      const raw = localStorage.getItem(keys[i]);
      if(!raw) continue;
      const data = JSON.parse(raw);
      if(!data || !data.token) continue;
      if(!data.exp || (data.exp * 1000) <= (Date.now() + 60000)) continue;
      return data.token;
    }catch(e){ /* localStorage rusak -> lanjut ke key berikutnya */ }
  }
  return null;
}

/**
 * Fast-path: kalau user udah punya sesi aktif (staff dari Dashboard / klien dari Portal),
 * langsung muat dokumennya -- lewati layar login. Yang buka link mentah dari URL tanpa
 * sesi (sesuai permintaan) tetap kena layar login seperti biasa.
 *
 * MURNI pintasan UX, bukan bypass keamanan: backend tetap verifikasi idToken DAN ngecek
 * hak akses dokumennya (getInvoiceCetak/getSuratJalanCetak). Token expired/palsu, atau
 * klien yang nyoba buka dokumen milik klien lain, tetap ditolak server.
 */
function ckCobaAutoLogin_(){
  const token = ckBacaTokenSesi_();
  if(!token) return false;
  CK_ID_TOKEN = token;
  CK_AUTO_LOGIN = true;
  ckShow("ck-loading");
  ckFetchData();
  return true;
}

window.onload = function(){
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.initialize({
      client_id: CK_OAUTH_CLIENT_ID,
      callback: ckHandleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("ck-google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }
  // Dijalankan SETELAH tombol Google disiapin, biar tombolnya tetap siap dipakai kalau
  // auto-login gagal / tokennya ditolak server.
  ckCobaAutoLogin_();
};

/**
 * ============================================================
 * PROFORMA INVOICE
 * ============================================================
 * Dokumen TAGIHAN SEMENTARA, terbit saat order jadi PO -- jauh sebelum ada
 * barang yang dikirim. Klien memakainya untuk mencairkan DP atau membuat PO
 * internal. Backend: cetak-proforma.gs.
 *
 * ============================================================
 * KENAPA PUNYA RENDERER SENDIRI, BUKAN MEMAKAI ULANG ckRenderInvoice
 * ============================================================
 * Rencana awal memang memecah ckRenderInvoice jadi satu fungsi bersama.
 * Setelah dibaca ulang, seam-nya ternyata bukan di situ: yang benar-benar
 * sama cuma header, blok pihak, tabel item, rekening, dan tanda tangan --
 * dan kelimanya SUDAH berupa fungsi terpisah yang dipakai ulang di bawah.
 *
 * Yang berbeda justru bagian terpentingnya: kotak ringkasan invoice bercerita
 * tentang PEMBAYARAN YANG SUDAH MASUK (dp, outstanding, status lunas),
 * sementara proforma bercerita tentang PEMBAYARAN YANG DIMINTA (termin, DP,
 * jatuh tempo). Memaksa keduanya ke satu fungsi berarti fungsi itu penuh
 * percabangan `if (proforma)` -- dan fungsi semacam itu selalu berakhir
 * dengan salah satu dokumen rusak diam-diam saat yang lain diperbaiki.
 *
 * BEDA TEGAS DARI INVOICE, dan semuanya disengaja:
 *   - TIDAK ada badge status pembayaran (belum ada apa pun untuk dibayar)
 *   - TIDAK ada baris "Sisa Tagihan" (itu milik invoice)
 *   - ADA masa berlaku, termin, dan DP yang diminta
 *   - ADA watermark + kalimat penyangkal: ini BUKAN invoice final
 */
function ckRenderProforma(d){
  const t = d.termin || {};

  const barisItem = d.items.map(function(it){
    // Rincian size ditaruh sebagai baris kecil di bawah deskripsi, BUKAN kolom
    // sendiri. Bagian keuangan klien membaca dokumen ini untuk menyetujui
    // nominal, bukan memeriksa kurva ukuran -- tapi menghilangkannya sama
    // sekali membuat qty tidak bisa diverifikasi.
    // BUG yang diperbaiki: sebelumnya "&#183;" disisipkan DULU lalu seluruh
    // gabungannya di-escape -- "&" berubah jadi "&amp;" dan entitasnya tampil
    // mentah di dokumen: "Sand &#183; S 28". Escape harus per BAGIAN, lalu
    // digabung dengan entitasnya.
    //
    // Warna dipisahkan dari rincian size, bukan disambung sejajar. Format lama
    // "Sand · S 28 · M 81" membuat warna terbaca setara dengan size -- dan
    // begitu warnanya lebih dari satu, tidak jelas angka mana milik warna mana.
    const warnaTeks = (it.warna && it.warna !== "-") ? rjdEscapeHtml_(it.warna) : "";
    const sizeTeks = (it.rincianSize && it.rincianSize !== "-")
      ? rjdEscapeHtml_(it.rincianSize) : "";
    const sub = warnaTeks
      ? ('<b>' + warnaTeks + '</b>' + (sizeTeks ? ' &#8212; ' + sizeTeks : ''))
      : sizeTeks;
    return '<tr>' +
      '<td>' + rjdEscapeHtml_(it.deskripsi) +
        (sub ? '<div class="ck-pro-rincian">' + sub + '</div>' : '') + '</td>' +
      '<td class="num">' + it.jumlah + '</td>' +
      '<td class="num">' + formatRupiah(it.hargaSatuan) + '</td>' +
      '<td class="num">' + formatRupiah(it.subtotal) + '</td>' +
    '</tr>';
  }).join("");

  // ---------- Kotak ringkasan ----------
  const ringkasan = [];
  ringkasan.push('<div class="ck-dok-ringkasan-row"><span>Total Qty</span><span>' + d.jumlah + ' pcs</span></div>');
  ringkasan.push('<div class="ck-dok-ringkasan-row"><span>Subtotal</span><span>' + formatRupiah(d.subtotal) + '</span></div>');
  ringkasan.push('<div class="ck-dok-ringkasan-row total"><span>Nilai Order</span><span>' + formatRupiah(d.totalTagihan) + '</span></div>');
  if(t.nilaiDP > 0){
    ringkasan.push('<div class="ck-dok-ringkasan-row dp"><span>DP Dibayar Sekarang' +
      (t.persenDPTampil ? ' (' + t.persenDPTampil + '%)' : '') +
      '</span><span>' + formatRupiah(t.nilaiDP) + '</span></div>');
    ringkasan.push('<div class="ck-dok-ringkasan-row"><span>Sisa (dibayar kemudian)</span><span>' +
      formatRupiah(t.sisaSetelahDP) + '</span></div>');
  }

  // ---------- Blok termin ----------
  // Ditaruh MENONJOL, bukan di catatan kaki: inilah alasan dokumen ini ada.
  // Klien membukanya untuk menjawab satu pertanyaan -- "berapa yang harus
  // saya transfer, dan kapan".
  const jatuhTempo = t.jatuhTempoDP ? ckTanggalPendek_(t.jatuhTempoDP) : "";
  const terminHtml =
    '<div class="ck-pro-termin">' +
      '<div class="ck-pro-termin-lbl">Syarat Pembayaran</div>' +
      '<div class="ck-pro-termin-nama">' + rjdEscapeHtml_(t.nama || "-") + '</div>' +
      (t.teks ? '<div class="ck-pro-termin-teks">' + rjdEscapeHtml_(t.teks) + '</div>' : '') +
      '<div class="ck-pro-termin-grid">' +
        (t.nilaiDP > 0
          ? '<div><span>DP yang diminta</span><b>' + formatRupiah(t.nilaiDP) + '</b></div>'
          : '') +
        (jatuhTempo
          ? '<div><span>Jatuh tempo DP</span><b>' + rjdEscapeHtml_(jatuhTempo) + '</b></div>'
          : '') +
        (d.estimasiKirim
          ? '<div><span>Estimasi kirim</span><b>' + rjdEscapeHtml_(d.estimasiKirim) + '</b></div>'
          : '') +
      '</div>' +
    '</div>';

  // ---------- Peringatan ----------
  // Tiga keadaan yang HARUS terlihat, bukan didiamkan. Ketiganya memakai gaya
  // yang sama supaya mata menangkapnya sebagai satu jenis informasi: "ada yang
  // perlu Anda ketahui sebelum membayar".
  const peringatan = [];
  if(d.nilaiBerubah){
    peringatan.push('<div class="ck-pro-warn"><b>Nilai order berubah sejak proforma ini diterbitkan.</b> ' +
      'Saat terbit: ' + formatRupiah(d.nilaiSaatTerbit) + ' &#183; sekarang: ' + formatRupiah(d.nilaiSekarang) + '. ' +
      'Mohon konfirmasi ke RJD Apparel sebelum melakukan pembayaran.</div>');
  }
  if(d.kedaluwarsa){
    peringatan.push('<div class="ck-pro-warn"><b>Masa berlaku proforma ini sudah lewat</b> (' +
      rjdEscapeHtml_(d.berlakuSampai) + '). Harga perlu dikonfirmasi ulang sebelum order diproses.</div>');
  }
  if(d.catatan){
    peringatan.push('<div class="ck-dok-catatan"><b>Catatan:</b><div class="isi">' +
      rjdEscapeHtml_(d.catatan) + '</div></div>');
  }

  const html =
    '<div class="ck-dok ck-pro">' +
      '<div class="ck-pro-wm">PROFORMA</div>' +
      ckHeaderHtml("PROFORMA INVOICE", rjdEscapeHtml_(d.idProforma) +
        (d.versi > 1 ? ' <span class="ck-pro-versi">revisi ' + d.versi + '</span>' : ''), d.tanggal) +
      ckPihakHtml(d, "Referensi Order",
        "Kode Order: " + rjdEscapeHtml_(d.kodeOrder) +
        '<br/>Produk: ' + rjdEscapeHtml_(d.namaProduk || "-") +
        '<br/>Berlaku sampai: <b>' + rjdEscapeHtml_(d.berlakuSampai || "-") + '</b>') +
      '<table class="ck-dok-tabel"><thead><tr>' +
        '<th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga Satuan</th><th class="num">Subtotal</th>' +
      '</tr></thead><tbody>' + barisItem + '</tbody></table>' +
      '<div class="ck-dok-ringkasan">' +
        // Rekening SELALU tampil di proforma -- sama seperti Konfirmasi Order,
        // beda dari invoice. Dokumen ini justru diterbitkan UNTUK meminta DP;
        // klien butuh nomor rekening tepat saat membacanya.
        ckRekeningHtml_() +
        '<div class="ck-dok-ringkasan-box">' + ringkasan.join("") + '</div>' +
      '</div>' +
      terminHtml +
      peringatan.join("") +
      // Penyangkal WAJIB, dan sengaja tidak dibuat samar. Tanpa kalimat ini
      // sebuah dokumen bernomor & bernilai bisa diperlakukan sebagai faktur
      // final oleh bagian keuangan klien -- lalu dibukukan dua kali ketika
      // invoice yang sesungguhnya menyusul saat pengiriman.
      '<div class="ck-pro-disclaimer">' +
        'Dokumen ini adalah <b>proforma invoice</b> dan <b>bukan</b> invoice/faktur final. ' +
        'Invoice resmi diterbitkan bersamaan dengan pengiriman barang, dan nilainya ' +
        'menyesuaikan jumlah yang benar-benar dikirim. Potongan pajak (PPh), bila ada, ' +
        'diperhitungkan pada invoice final.' +
      '</div>' +
      '<div class="ck-dok-ttd">' +
        '<div class="kolom">Hormat kami,<div class="garis"></div><div class="nama-ttd">RJD Apparel</div></div>' +
        // "Disetujui oleh", BUKAN "Diterima oleh": belum ada barang yang
        // diterima. Yang diminta di titik ini adalah persetujuan atas nilai
        // dan syarat pembayarannya.
        '<div class="kolom">Disetujui oleh,<div class="garis"></div><div class="nama-ttd">' +
          rjdEscapeHtml_(d.klien.nama) + '</div></div>' +
      '</div>' +
    '</div>';

  document.getElementById("ck-isi").innerHTML = html;
  document.title = "Proforma " + d.idProforma + " -- RJD Apparel";
}

/**
 * Tanggal dari backend jadi "12 Agu 2026".
 *
 * Backend mengirim jatuh tempo sebagai nilai tanggal mentah (bukan hasil
 * formatTanggal), karena angka itu juga dipakai untuk perbandingan di sisi
 * server. Kalau nilainya ternyata sudah berupa teks -- misalnya dari baris
 * lama yang tersimpan sebagai string -- dikembalikan apa adanya, bukan
 * dipaksa jadi "Invalid Date".
 */
function ckTanggalPendek_(nilai){
  if(!nilai) return "";
  const d = new Date(nilai);
  if(isNaN(d.getTime())) return String(nilai);
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();
}
