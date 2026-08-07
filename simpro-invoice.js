/**
 * ============================================================
 * SIMPRO -- simpro-invoice
 * ============================================================
 * Halaman INVOICE & PIUTANG (invoice.html).
 *
 * Fokusnya: invoice mana yang belum lunas, sudah berapa lama menunggak, dan
 * berapa total piutang yang beredar. SD Invoice sudah punya kolom turunan
 * (Total Tagihan, Sisa Tagihan, Status Pembayaran) yang dihitung pelunasan.gs
 * -- halaman ini TIDAK menghitung ulang, hanya menyajikannya per bucket umur
 * piutang (aging), yang sebelumnya cuma terlihat gabungan di laporan omset.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard, Daftar Order, & Pengiriman
 * (localStorage "db_session").
 *
 * DIMUAT DI : invoice.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const IV_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const IV_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let IV_ID_TOKEN = null;

function ivShow(id){
  ["iv-login-box", "iv-loading", "iv-isi"].forEach(function(x){
    const el = document.getElementById(x);
    if(el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if(t) t.classList.remove("hidden");
}

function ivBacaSesi_(){
  try{
    const raw = localStorage.getItem("db_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  }catch(e){ return null; }
}

function ivSimpanSesi_(token){
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  }catch(e){}
}

function ivHandleGoogleLogin(response){
  IV_ID_TOKEN = response.credential;
  ivSimpanSesi_(response.credential);
  ivMulai();
}

function ivLogout(){
  IV_ID_TOKEN = null;
  try{ localStorage.removeItem("db_session"); }catch(e){}
  if(typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  ["iv-nav-logout", "iv-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.add("hidden");
  });
  ivShow("iv-login-box");
}

function ivMulai(){
  ivShow("iv-loading");
  ["iv-nav-logout", "iv-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.remove("hidden");
  });
  window.IV_DAFTAR = null;
  ivMuat();
}

function ivMuat(){
  if(window.IV_DAFTAR){ ivRender(); return; }
  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "getDaftarInvoice" })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    ivShow("iv-isi");
    if(!d || !d.success){
      document.getElementById("iv-tabel").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat data.") + '</p>';
      return;
    }
    window.IV_DAFTAR = d.daftar || [];
    window.IV_RINGKASAN = d.ringkasan || {};
    ivRender();
  })
  .catch(function(){
    ivShow("iv-isi");
    document.getElementById("iv-tabel").innerHTML =
      '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
  });
}

function ivRefresh(){
  const ikon = document.getElementById("iv-refresh-icon");
  if(ikon) ikon.classList.add("spinning");
  window.IV_DAFTAR = null;
  ivShow("iv-loading");
  ivMuat();
  setTimeout(function(){ if(ikon) ikon.classList.remove("spinning"); }, 1200);
}

function ivFormatRupiah_(n){
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

/**
 * Saring + render. Default filter "Belum lunas" -- halaman ini dibuka untuk
 * menagih, bukan untuk melihat riwayat semua invoice.
 */
function ivRender(){
  const wadah = document.getElementById("iv-tabel");
  if(!wadah) return;
  const semua = window.IV_DAFTAR || [];
  const r = window.IV_RINGKASAN || {};
  const cari = (document.getElementById("iv-cari").value || "").trim().toLowerCase();
  const fStatus = document.getElementById("iv-status").value;

  const hasil = semua.filter(function(p){
    if(fStatus === "belum" && p.lunas) return false;
    if(fStatus === "lunas" && !p.lunas) return false;
    if(fStatus && fStatus.indexOf("bucket:") === 0 && p.bucket !== fStatus.slice(7)) return false;
    if(!cari) return true;
    return [p.idInvoice, p.idPurchaseOrder, p.namaKlien].join(" ").toLowerCase().indexOf(cari) !== -1;
  });

  // Ringkasan aging -- angka yang paling sering ditanyakan sebelum tabelnya dibaca.
  const bucket = r.bucket || {};
  document.getElementById("iv-ringkas").innerHTML =
    '<div class="iv-kartu iv-kartu-utama"><div class="iv-kartu-angka">' + ivFormatRupiah_(r.totalPiutang || 0) + '</div>' +
      '<div class="iv-kartu-label">total piutang &#183; ' + (r.jumlahBelumLunas || 0) + ' invoice</div></div>' +
    ["0-30", "31-60", "61-90", "90+"].map(function(b){
      const bahaya = (b === "61-90" || b === "90+") && bucket[b] > 0;
      // data-bucket, bukan interpolasi ke atribut onclick -- lihat catatan di
      // ivRenderPengiriman. Pola lama di sini SUDAH RUSAK sejak awal (kutip
      // ganda dari JSON.stringify memutus atribut), jadi kartu bucket ini
      // sebenarnya tidak pernah bisa diklik. Ikut diperbaiki di sini.
      return '<div class="iv-kartu iv-bucket' + (bahaya ? ' bahaya' : '') + '"' +
        ' data-bucket="' + rjdEscapeHtml_(b) + '" onclick="ivFilterBucket(this.dataset.bucket)">' +
        '<div class="iv-kartu-angka">' + ivFormatRupiah_(bucket[b] || 0) + '</div>' +
        '<div class="iv-kartu-label">umur ' + b + ' hari</div></div>';
    }).join("");

  if(!hasil.length){
    wadah.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft)">Tidak ada invoice yang cocok dengan filter.</p>';
    return;
  }

  wadah.innerHTML =
    '<div class="iv-jumlah">' + hasil.length + ' dari ' + semua.length + ' invoice</div>' +
    '<div class="iv-tabelwrap"><table class="iv-tabel"><thead><tr>' +
      '<th>Invoice</th><th>Klien</th><th>PO</th><th class="num">Total</th>' +
      '<th class="num">Dibayar</th><th class="num">Sisa</th><th>Tanggal</th><th>Umur</th><th>Status</th>' +
    '</tr></thead><tbody>' +
    hasil.map(function(p){
      const kelas = p.lunas ? "lunas" : (p.bucket === "61-90" || p.bucket === "90+" ? "bahaya" : "belum");
      const idInv = String(p.idInvoice || "").trim();
      return '<tr>' +
        // Tautan cetak DITARUH DI DALAM sel nomor, bukan jadi kolom ke-10.
        // Tabel ini sudah kehabisan ruang: sembilan kolom, dan tujuh di
        // antaranya nowrap, sehingga kolom Klien yang jadi korban -- nama
        // panjang terpenggal di tengah kata ("PT Baha / gia / Bervi / si").
        // Menambah kolom akan memperparah persis masalah itu. Portal Klien
        // menempatkannya di dalam kartu dengan alasan yang sama.
        '<td><b class="iv-nomor">' + rjdEscapeHtml_(p.idInvoice) + '</b>' +
          (p.artikel ? '<div class="iv-sub">' + rjdEscapeHtml_(p.artikel) + '</div>' : '') +
          (idInv
            ? '<a class="iv-cetak-link" target="_blank" rel="noopener"' +
              ' href="/p/cetak.html?jenis=invoice&amp;id=' + encodeURIComponent(idInv) + '">' +
              '&#128424; Cetak</a>'
            : '') + '</td>' +
        '<td class="iv-klien">' + rjdEscapeHtml_(p.namaKlien) + '</td>' +
        '<td class="iv-sub">' + rjdEscapeHtml_(p.idPurchaseOrder || "-") + '</td>' +
        '<td class="num">' + ivFormatRupiah_(p.total) + '</td>' +
        '<td class="num">' + ivFormatRupiah_(p.dibayar) + '</td>' +
        '<td class="num ' + (p.sisa > 0 ? "kurang" : "") + '">' + (p.sisa > 0 ? ivFormatRupiah_(p.sisa) : "-") + '</td>' +
        '<td class="iv-tgl">' + rjdEscapeHtml_(p.tanggalInvoice || "-") + '</td>' +
        '<td class="iv-tgl">' + (p.lunas ? '-' : (p.umurHari + ' hari')) + '</td>' +
        '<td><span class="iv-status ' + kelas + '">' + rjdEscapeHtml_(p.status) + '</span></td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';
}

/** Klik kartu bucket aging -> saring tabel ke bucket itu. */
function ivFilterBucket(b){
  document.getElementById("iv-status").value = "bucket:" + b;
  ivRender();
}

function ivSetupTombolGoogle(){
  if(typeof google === "undefined" || !google.accounts) return;
  google.accounts.id.initialize({
    client_id: IV_OAUTH_CLIENT_ID,
    callback: ivHandleGoogleLogin
  });
  const wadah = document.getElementById("iv-google-btn");
  if(wadah) google.accounts.id.renderButton(wadah, { theme: "outline", size: "large", width: 260 });
}


/* ============================================================
 * TAB "BUAT INVOICE" -- invoice dirakit DARI PENGIRIMAN
 * ============================================================
 * MASALAH YANG DISELESAIKAN (lihat juga buat-invoice.gs):
 * Sebelum ini invoice dibuat di AppSheet dengan qty DIKETIK ULANG dari PO --
 * yaitu dari RENCANA, bukan dari yang benar-benar keluar gudang. Hasilnya
 * (audit Agustus 2026): dari 197 PO yang punya aktivitas, 87 di antaranya
 * angka kirim & tagihnya tidak cocok.
 *
 * Di sini qty TIDAK PERNAH BISA DIKETIK. Field qty sengaja read-only dan
 * nilainya diturunkan dari SD Detail Pengiriman. Yang boleh diubah admin cuma
 * HARGA (kadang ada penyesuaian saat menagih) dan biaya/potongan tingkat
 * invoice. Itu yang bikin angka tagihan tidak mungkin lagi berbeda dari surat
 * jalan -- secara struktural, bukan karena orangnya lebih teliti.
 * ============================================================ */

/** Pindah tab. Daftar pengiriman dimuat MALAS -- baru diambil saat tabnya
 *  dibuka pertama kali, bukan saat halaman dimuat (halaman ini paling sering
 *  dibuka untuk melihat piutang, bukan untuk membuat invoice). */
function ivSwitchTab(tab) {
  document.querySelectorAll(".iv-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("iv-panel-daftar").classList.toggle("hidden", tab !== "daftar");
  document.getElementById("iv-panel-buat").classList.toggle("hidden", tab !== "buat");
  document.getElementById("iv-panel-bayar").classList.toggle("hidden", tab !== "bayar");
  if (tab === "buat" && !window.IV_PENGIRIMAN) ivMuatPengiriman();
  if (tab === "bayar" && !window.IV_TUJUAN) ivMuatPembayaran();
}

function ivMuatPengiriman() {
  const wadah = document.getElementById("iv-kirim-daftar");
  if (wadah) wadah.innerHTML = '<p class="iv-buat-info">Memuat daftar pengiriman...</p>';
  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: IV_ID_TOKEN,
      action: "getPengirimanBelumDitagih",
      opsi: { hanyaBelumDitagih: true }
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="iv-buat-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar pengiriman.") + '</p>';
      return;
    }
    window.IV_PENGIRIMAN = d.daftar || [];
    window.IV_DIPILIH = {};
    ivRenderPengiriman();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="iv-buat-galat">Gagal menghubungi server.</p>';
  });
}

/**
 * Daftar pengiriman yang belum ditagih. Dikelompokkan per KLIEN karena satu
 * invoice cuma boleh untuk satu klien (ditegakkan juga di backend) -- kalau
 * ditampilkan bercampur, admin baru tahu salah setelah ditolak server.
 */
function ivRenderPengiriman() {
  const wadah = document.getElementById("iv-kirim-daftar");
  if (!wadah) return;
  const semua = window.IV_PENGIRIMAN || [];
  const cari = (document.getElementById("iv-kirim-cari").value || "").trim().toLowerCase();

  const hasil = semua.filter(function (p) {
    if (!cari) return true;
    return [p.idPengiriman, p.idPurchaseOrder, p.namaKlien].join(" ").toLowerCase().indexOf(cari) !== -1;
  });

  if (!hasil.length) {
    wadah.innerHTML = '<p class="iv-buat-info">' +
      (semua.length ? "Tidak ada yang cocok dengan pencarian."
        : "Semua pengiriman sudah ditagih. Tidak ada yang perlu dibuatkan invoice.") + '</p>';
    ivUpdateTombolLanjut();
    return;
  }

  const perKlien = {};
  const urutan = [];
  hasil.forEach(function (p) {
    const k = p.namaKlien || "(tanpa klien)";
    if (!perKlien[k]) { perKlien[k] = []; urutan.push(k); }
    perKlien[k].push(p);
  });

  wadah.innerHTML = urutan.map(function (k) {
    return '<div class="iv-kirim-grup"><div class="iv-kirim-klien">' + rjdEscapeHtml_(k) + '</div>' +
      perKlien[k].map(function (p) {
        const dipilih = !!(window.IV_DIPILIH || {})[p.idPengiriman];
        return '<label class="iv-kirim-baris' + (dipilih ? ' dipilih' : '') + '">' +
          // Nilai dinamis lewat data-id, BUKAN diinterpolasi ke dalam atribut
          // onchange. JSON.stringify menghasilkan string BERKUTIP GANDA; kalau
          // ditaruh di atribut yang juga berkutip ganda, HTML parser memutus
          // atributnya di kutip kedua dan handler-nya tidak pernah jalan --
          // gejalanya checkbox tercentang (perilaku bawaan browser) tapi tombol
          // lanjut tetap mati. Pola data-* ini kebal terhadap isi nilainya.
          '<input type="checkbox" data-id="' + rjdEscapeHtml_(p.idPengiriman) + '"' +
            (dipilih ? ' checked="checked"' : '') +
            ' onchange="ivTogglePilih(this.dataset.id)"/>' +
          '<div class="iv-kirim-isi">' +
            '<div class="iv-kirim-id">' + rjdEscapeHtml_(p.idPengiriman) + '</div>' +
            '<div class="iv-kirim-sub">' + rjdEscapeHtml_(p.tanggal || "-") +
              ' &#183; PO ' + rjdEscapeHtml_(p.idPurchaseOrder || "-") + '</div>' +
          '</div>' +
          '<div class="iv-kirim-qty">' + (p.jumlah || 0) + ' pcs</div>' +
        '</label>';
      }).join("") +
    '</div>';
  }).join("");

  ivUpdateTombolLanjut();
}

/**
 * Centang/hapus centang 1 pengiriman. Pencampuran klien DICEGAH DI SINI --
 * begitu satu klien dipilih, pengiriman klien lain tidak bisa ikut dicentang.
 * Backend tetap menolaknya juga (pengaman berlapis), tapi mencegah di layar
 * jauh lebih baik daripada memberi tahu setelah gagal.
 */
function ivTogglePilih(id) {
  if (!window.IV_DIPILIH) window.IV_DIPILIH = {};
  const semua = window.IV_PENGIRIMAN || [];
  const ini = semua.filter(function (p) { return p.idPengiriman === id; })[0];
  if (!ini) return;

  if (window.IV_DIPILIH[id]) {
    delete window.IV_DIPILIH[id];
  } else {
    const terpilih = Object.keys(window.IV_DIPILIH);
    if (terpilih.length) {
      const klienLain = semua.filter(function (p) {
        return terpilih.indexOf(p.idPengiriman) !== -1 && p.idKlien !== ini.idKlien;
      });
      if (klienLain.length) {
        alert("Satu invoice hanya boleh untuk satu klien.\n\nHapus dulu centang pengiriman klien lain kalau mau menagih " +
          (ini.namaKlien || ini.idKlien) + ".");
        ivRenderPengiriman();
        return;
      }
    }
    window.IV_DIPILIH[id] = true;
  }
  ivRenderPengiriman();
}

function ivUpdateTombolLanjut() {
  const btn = document.getElementById("iv-lanjut-btn");
  if (!btn) return;
  const n = Object.keys(window.IV_DIPILIH || {}).length;
  btn.disabled = (n === 0);
  btn.textContent = n ? ("Susun Invoice dari " + n + " pengiriman") : "Pilih pengiriman dulu";
}

/** Minta draf ke server. TIDAK menulis apa pun -- cuma menyusun angka. */
function ivLanjutSusunDraft() {
  const daftar = Object.keys(window.IV_DIPILIH || {});
  if (!daftar.length) return;

  const btn = document.getElementById("iv-lanjut-btn");
  btn.disabled = true;
  btn.textContent = "Menyusun...";

  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: IV_ID_TOKEN,
      action: "siapkanDraftInvoice",
      daftarIdPengiriman: daftar
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      alert((d && d.error) || "Gagal menyusun draf invoice.");
      ivUpdateTombolLanjut();
      return;
    }
    window.IV_DRAFT = d;
    document.getElementById("iv-langkah-pilih").classList.add("hidden");
    document.getElementById("iv-langkah-draft").classList.remove("hidden");
    ivRenderDraft();
  })
  .catch(function () {
    alert("Gagal menghubungi server.");
    ivUpdateTombolLanjut();
  });
}

function ivKembaliPilih() {
  document.getElementById("iv-langkah-draft").classList.add("hidden");
  document.getElementById("iv-langkah-pilih").classList.remove("hidden");
  ivUpdateTombolLanjut();
}

/**
 * Tabel draf. Kolom Qty SENGAJA teks biasa, bukan input -- itu inti seluruh
 * perbaikan ini. Kalau qty bisa diketik, masalah lama cuma pindah tempat.
 */
function ivRenderDraft() {
  const d = window.IV_DRAFT;
  if (!d) return;

  const hariIni = new Date();
  const tglDefault = hariIni.getFullYear() + "-" +
    String(hariIni.getMonth() + 1).padStart(2, "0") + "-" +
    String(hariIni.getDate()).padStart(2, "0");
  const inputTgl = document.getElementById("iv-draft-tanggal");
  if (inputTgl && !inputTgl.value) inputTgl.value = tglDefault;

  document.getElementById("iv-draft-kepala").innerHTML =
    '<div><span class="iv-draft-label">Klien</span>' +
      '<span class="iv-draft-nilai">' + rjdEscapeHtml_(d.idKlien || "-") + '</span></div>' +
    '<div><span class="iv-draft-label">Purchase Order</span>' +
      '<span class="iv-draft-nilai">' + rjdEscapeHtml_((d.daftarPurchaseOrder || []).join(", ") || "-") + '</span></div>' +
    '<div><span class="iv-draft-label">Pengiriman ditagih</span>' +
      '<span class="iv-draft-nilai">' + rjdEscapeHtml_((d.daftarPengiriman || []).join(", ")) + '</span></div>';

  document.getElementById("iv-draft-item").innerHTML =
    '<div class="iv-tabelwrap"><table class="iv-tabel iv-draft-tabel"><thead><tr>' +
      '<th>Artikel</th><th>Warna</th><th>Size</th><th class="num">Qty</th>' +
      '<th class="num">Harga Satuan</th><th class="num">Subtotal</th><th>Dari SJ</th>' +
    '</tr></thead><tbody>' +
    d.items.map(function (it, i) {
      return '<tr' + (it.hargaKosong ? ' class="iv-baris-perhatian"' : '') + '>' +
        '<td>' + rjdEscapeHtml_([it.brand, it.artikel, it.style].filter(Boolean).join(" / ") || it.deskripsi || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(it.warna || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(it.size || "-") + '</td>' +
        // Qty: teks, BUKAN input. Diturunkan dari surat jalan.
        '<td class="num">' + it.jumlah + '</td>' +
        '<td class="num"><input class="iv-harga-input" type="number" min="0" step="1"' +
          ' value="' + (it.hargaSatuan || 0) + '"' +
          ' oninput="ivUbahHarga(' + i + ', this.value)"/></td>' +
        '<td class="num" id="iv-sub-' + i + '">' + ivFormatRupiah_(it.subtotal) + '</td>' +
        '<td class="iv-sub">' + rjdEscapeHtml_(it.idPengiriman) + '</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>' +
    (d.adaHargaKosong
      ? '<p class="iv-buat-galat">Ada baris yang harga satuannya belum ketemu di Detail PO (ditandai). ' +
        'Isi manual dulu sebelum disimpan supaya tidak menagih Rp 0.</p>'
      : '');

  ivHitungTotal();
}

function ivUbahHarga(i, nilai) {
  const d = window.IV_DRAFT;
  if (!d || !d.items[i]) return;
  d.items[i].hargaSatuan = Number(nilai) || 0;
  d.items[i].subtotal = d.items[i].jumlah * d.items[i].hargaSatuan;
  const sel = document.getElementById("iv-sub-" + i);
  if (sel) sel.textContent = ivFormatRupiah_(d.items[i].subtotal);
  ivHitungTotal();
}

/**
 * Total dihitung ULANG di layar tiap ada perubahan. Rumusnya SAMA dengan
 * hitungNilaiInvoice_ di backend: Total Tagihan = subtotal + biaya - potongan,
 * lalu Nilai Transfer = Total Tagihan - PPh. Angka yang tersimpan tetap
 * dihitung backend dari kolom input; yang di sini murni untuk dilihat admin
 * sebelum menyimpan.
 */
function ivHitungTotal() {
  const d = window.IV_DRAFT;
  if (!d) return;

  let subtotal = 0, pcs = 0;
  d.items.forEach(function (it) {
    subtotal += (Number(it.jumlah) || 0) * (Number(it.hargaSatuan) || 0);
    pcs += Number(it.jumlah) || 0;
  });

  function ambil_(id) { return Number((document.getElementById(id) || {}).value) || 0; }
  const biayaTambahan = ambil_("iv-draft-biaya-tambahan");
  const biayaKirim = ambil_("iv-draft-biaya-kirim");
  const biayaLain = ambil_("iv-draft-biaya-lain");
  const potonganLain = ambil_("iv-draft-potongan-lain");
  const pph = ambil_("iv-draft-pph");

  const totalTagihan = subtotal + biayaTambahan + biayaKirim + biayaLain - potonganLain;
  const nilaiTransfer = totalTagihan - pph;

  document.getElementById("iv-draft-total").innerHTML =
    '<div class="iv-total-baris"><span>Subtotal (' + pcs + ' pcs)</span><span>' + ivFormatRupiah_(subtotal) + '</span></div>' +
    (biayaTambahan ? '<div class="iv-total-baris"><span>Biaya tambahan</span><span>' + ivFormatRupiah_(biayaTambahan) + '</span></div>' : '') +
    (biayaKirim ? '<div class="iv-total-baris"><span>Biaya kirim</span><span>' + ivFormatRupiah_(biayaKirim) + '</span></div>' : '') +
    (biayaLain ? '<div class="iv-total-baris"><span>Biaya lain-lain</span><span>' + ivFormatRupiah_(biayaLain) + '</span></div>' : '') +
    (potonganLain ? '<div class="iv-total-baris"><span>Potongan</span><span>-' + ivFormatRupiah_(potonganLain) + '</span></div>' : '') +
    '<div class="iv-total-baris iv-total-tebal"><span>Total Tagihan</span><span>' + ivFormatRupiah_(totalTagihan) + '</span></div>' +
    (pph ? '<div class="iv-total-baris"><span>PPh dipotong klien</span><span>-' + ivFormatRupiah_(pph) + '</span></div>' +
      '<div class="iv-total-baris iv-total-tebal"><span>Nilai Transfer</span><span>' + ivFormatRupiah_(nilaiTransfer) + '</span></div>' : '');
}

function ivSimpanInvoice() {
  const d = window.IV_DRAFT;
  if (!d) return;

  const kosong = d.items.filter(function (it) { return !(Number(it.hargaSatuan) > 0); });
  if (kosong.length) {
    alert("Masih ada " + kosong.length + " baris dengan harga satuan 0.\n\nIsi dulu harganya, atau hapus pengiriman itu dari pilihan.");
    return;
  }

  const btn = document.getElementById("iv-simpan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  const payload = {
    daftarIdPengiriman: d.daftarPengiriman,
    idKlien: d.idKlien,
    idPurchaseOrder: d.idPurchaseOrder,
    tanggalInvoice: (document.getElementById("iv-draft-tanggal") || {}).value || "",
    items: d.items,
    biayaTambahan: Number((document.getElementById("iv-draft-biaya-tambahan") || {}).value) || 0,
    biayaKirim: Number((document.getElementById("iv-draft-biaya-kirim") || {}).value) || 0,
    biayaLainLain: Number((document.getElementById("iv-draft-biaya-lain") || {}).value) || 0,
    potonganLainLain: Number((document.getElementById("iv-draft-potongan-lain") || {}).value) || 0,
    potonganPajak: Number((document.getElementById("iv-draft-pph") || {}).value) || 0
  };

  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "simpanInvoiceDariPengiriman", payload: payload })
  })
  .then(function (r) { return r.json(); })
  .then(function (h) {
    if (!h || !h.success) {
      alert((h && h.error) || "Gagal menyimpan invoice.");
      btn.disabled = false;
      btn.textContent = "Simpan Invoice";
      return;
    }
    document.getElementById("iv-langkah-draft").classList.add("hidden");
    document.getElementById("iv-langkah-sukses").classList.remove("hidden");
    document.getElementById("iv-sukses-id").textContent = h.idInvoice;
    // textContent, jadi pakai karakter titik-tengah LANGSUNG -- entity HTML
    // (&#183;) di textContent tampil mentah sebagai teks, bukan sebagai titik.
    document.getElementById("iv-sukses-rincian").textContent =
      h.jumlahBaris + " baris item \u00B7 " + h.jumlahPcs + " pcs \u00B7 " + ivFormatRupiah_(h.subtotal);
    // Daftar pengiriman & daftar invoice dua-duanya berubah setelah ini --
    // dikosongkan supaya dimuat ulang dari server, bukan menampilkan yang basi.
    window.IV_PENGIRIMAN = null;
    window.IV_DIPILIH = {};
    window.IV_DRAFT = null;
    window.IV_DAFTAR = null;
  })
  .catch(function () {
    alert("Gagal menghubungi server.");
    btn.disabled = false;
    btn.textContent = "Simpan Invoice";
  });
}

/** Selesai: kembali ke langkah pilih dengan data segar. */
function ivBuatLagi() {
  document.getElementById("iv-langkah-sukses").classList.add("hidden");
  document.getElementById("iv-langkah-pilih").classList.remove("hidden");
  const btnSimpan = document.getElementById("iv-simpan-btn");
  if (btnSimpan) { btnSimpan.disabled = false; btnSimpan.textContent = "Simpan Invoice"; }
  ["iv-draft-biaya-tambahan", "iv-draft-biaya-kirim", "iv-draft-biaya-lain",
   "iv-draft-potongan-lain", "iv-draft-pph"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ivMuatPengiriman();
}

window.onload = function(){
  ivSetupTombolGoogle();
  const token = ivBacaSesi_();
  if(token){
    IV_ID_TOKEN = token;
    ivMulai();
  } else {
    ivShow("iv-login-box");
  }
};

/* ============================================================
 * TAB PEMBAYARAN -- catat uang masuk dari klien
 * ============================================================
 * Menggantikan pencatatan lewat AppSheet. Backend: input-pembayaran.gs.
 *
 * DUA TUJUAN, satu formulir:
 *   Invoice     -> pembayaran atas tagihan yang sudah terbit (perilaku lama)
 *   Order (DP)  -> uang muka atas proforma, SEBELUM invoice ada
 *
 * Kenapa satu formulir dan bukan dua halaman: dari sudut pandang staf yang
 * memegang bukti transfer, keduanya adalah pekerjaan yang sama persis --
 * "ada uang masuk, catat". Yang berbeda cuma ke mana uang itu ditempelkan,
 * dan itu satu pilihan, bukan alur kerja terpisah.
 *
 * TIDAK ADA input "Total Dibayar" di mana pun di layar ini. Angka itu SELALU
 * hasil penjumlahan SD Pelunasan oleh backend; kalau bisa diketik, dua sumber
 * kebenaran lahir seketika dan salah satunya pasti salah.
 * ============================================================ */

function ivMuatPembayaran(){
  const wadah = document.getElementById("iv-bayar-tujuan");
  if(wadah) wadah.innerHTML = '<p class="iv-buat-info">Memuat daftar tagihan...</p>';
  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "getTujuanPembayaran" })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      if(wadah) wadah.innerHTML = '<div class="iv-buat-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar tagihan.") + '</div>';
      return;
    }
    window.IV_TUJUAN = d.data;
    // Layar split ikut digambar ulang kalau dia yang sedang terbuka -- kalau
    // tidak, sesudah menyimpan daftar tujuannya kosong sampai tab dipindah
    // bolak-balik.
    if(window.IV_MODE_BAYAR === "split") ivRenderSplit(); else ivRenderTujuan();
    ivMuatRiwayat();
  })
  .catch(function(){
    if(wadah) wadah.innerHTML = '<div class="iv-buat-galat">Gagal menghubungi server.</div>';
  });
}

/** Ganti mode tujuan. Pilihan sebelumnya SENGAJA dikosongkan -- membiarkan
 *  pilihan lama tersimpan diam-diam adalah cara paling mudah mencatat uang ke
 *  tujuan yang salah. */
function ivGantiTujuanBayar(mode){
  window.IV_MODE_BAYAR = mode;
  window.IV_PILIH_BAYAR = null;
  document.querySelectorAll(".iv-bayar-mode").forEach(function(b){
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  // Mode "split" punya bentuk formulir yang berbeda: bukan MEMILIH satu tujuan,
  // melainkan MEMBAGI satu jumlah ke banyak tujuan. Dipisah jadi dua panel
  // alih-alih dipaksa ke satu -- formulir yang separuh fieldnya berganti arti
  // tergantung mode adalah formulir yang salah diisi.
  const split = (mode === "split");
  document.getElementById("iv-bayar-tunggal").classList.toggle("hidden", split);
  document.getElementById("iv-bayar-split").classList.toggle("hidden", !split);
  if(split){
    if(!window.IV_ALOKASI) window.IV_ALOKASI = {};
    ivRenderSplit();
    return;
  }
  document.getElementById("iv-bayar-cari").value = "";
  ivRenderTujuan();
  ivHitungUlangBayar();
}

function ivRenderTujuan(){
  const wadah = document.getElementById("iv-bayar-tujuan");
  if(!wadah || !window.IV_TUJUAN) return;
  const mode = window.IV_MODE_BAYAR || "invoice";
  const cari = (document.getElementById("iv-bayar-cari").value || "").toLowerCase().trim();

  let baris;
  if(mode === "invoice"){
    const daftar = (window.IV_TUJUAN.invoice || []).filter(function(v){
      if(!cari) return true;
      return (v.id + " " + v.idPurchaseOrder + " " + v.namaKlien).toLowerCase().indexOf(cari) !== -1;
    });
    if(!daftar.length){
      wadah.innerHTML = '<p class="iv-buat-info">' +
        (cari ? "Tidak ada invoice yang cocok." : "Semua invoice sudah lunas.") + '</p>';
      return;
    }
    baris = daftar.map(function(v){
      const dipilih = window.IV_PILIH_BAYAR === v.id;
      return '<label class="iv-kirim-baris' + (dipilih ? " dipilih" : "") + '">' +
        '<input type="radio" name="iv-bayar-tujuan-r" value="' + rjdEscapeHtml_(v.id) + '"' +
          (dipilih ? " checked" : "") + ' onchange="ivPilihTujuan(this.value)"/>' +
        '<span class="iv-kirim-isi">' +
          '<span class="iv-kirim-id">' + rjdEscapeHtml_(v.id) + '</span>' +
          '<span class="iv-kirim-sub">' + rjdEscapeHtml_(v.namaKlien) + ' &#183; ' +
            rjdEscapeHtml_(v.tanggal) + '</span>' +
        '</span>' +
        '<span class="iv-kirim-qty">' + formatRupiah(v.sisa) +
          '<span class="iv-bayar-ket">sisa</span></span>' +
      '</label>';
    }).join("");
  } else {
    const daftar = (window.IV_TUJUAN.order || []).filter(function(v){
      if(!cari) return true;
      return (v.idPurchaseOrder + " " + v.idProforma + " " + v.namaKlien).toLowerCase().indexOf(cari) !== -1;
    });
    if(!daftar.length){
      wadah.innerHTML = '<p class="iv-buat-info">' +
        (cari ? "Tidak ada order yang cocok."
              : "Belum ada order dengan proforma aktif. Terbitkan proforma dulu di halaman Daftar Order.") +
        '</p>';
      return;
    }
    baris = daftar.map(function(v){
      const dipilih = window.IV_PILIH_BAYAR === v.idPurchaseOrder;
      // Yang ditonjolkan adalah KURANG DP, bukan nilai order: itu angka yang
      // sedang ditunggu masuk. Nilai order lengkap ada di dokumen proformanya.
      const kurang = v.kurangDP > 0
        ? formatRupiah(v.kurangDP) + '<span class="iv-bayar-ket">kurang DP</span>'
        : '<span class="iv-bayar-ok">DP lengkap</span>';
      return '<label class="iv-kirim-baris' + (dipilih ? " dipilih" : "") + '">' +
        '<input type="radio" name="iv-bayar-tujuan-r" value="' + rjdEscapeHtml_(v.idPurchaseOrder) + '"' +
          (dipilih ? " checked" : "") + ' onchange="ivPilihTujuan(this.value)"/>' +
        '<span class="iv-kirim-isi">' +
          '<span class="iv-kirim-id">' + rjdEscapeHtml_(v.idProforma) +
            (v.versi > 1 ? ' v' + v.versi : '') + '</span>' +
          '<span class="iv-kirim-sub">' + rjdEscapeHtml_(v.namaKlien) + ' &#183; ' +
            rjdEscapeHtml_(v.idPurchaseOrder) +
            (v.kodeTermin ? ' &#183; ' + rjdEscapeHtml_(v.kodeTermin) : '') + '</span>' +
        '</span>' +
        '<span class="iv-kirim-qty">' + kurang + '</span>' +
      '</label>';
    }).join("");
  }
  wadah.innerHTML = baris;
}

function ivPilihTujuan(nilai){
  window.IV_PILIH_BAYAR = nilai;
  ivRenderTujuan();
  ivHitungUlangBayar();
}

/** Isi otomatis jumlah dengan angka yang PALING MUNGKIN benar, lalu tampilkan
 *  konteksnya. Tetap bisa diubah -- bukti transfer selalu lebih benar daripada
 *  tebakan sistem. */
function ivHitungUlangBayar(){
  const mode = window.IV_MODE_BAYAR || "invoice";
  const pilih = window.IV_PILIH_BAYAR;
  const info = document.getElementById("iv-bayar-info");
  const input = document.getElementById("iv-bayar-jumlah");
  const btn = document.getElementById("iv-bayar-simpan");

  if(!pilih || !window.IV_TUJUAN){
    if(info) info.innerHTML = "";
    if(btn){ btn.disabled = true; btn.textContent = "Pilih tujuan pembayaran dulu"; }
    return;
  }
  if(btn){ btn.disabled = false; btn.textContent = "Catat Pembayaran"; }

  let saran = 0, teks = "";
  if(mode === "invoice"){
    const v = (window.IV_TUJUAN.invoice || []).filter(function(x){ return x.id === pilih; })[0];
    if(!v) return;
    saran = v.sisa;
    teks = '<b>' + rjdEscapeHtml_(v.id) + '</b> &#183; ' + rjdEscapeHtml_(v.namaKlien) +
      '<br/>Nilai transfer ' + formatRupiah(v.nilaiTransfer) +
      ' &#183; sudah dibayar ' + formatRupiah(v.sudahDibayar) +
      ' &#183; <b>sisa ' + formatRupiah(v.sisa) + '</b>';
  } else {
    const v = (window.IV_TUJUAN.order || []).filter(function(x){ return x.idPurchaseOrder === pilih; })[0];
    if(!v) return;
    saran = v.kurangDP;
    teks = '<b>' + rjdEscapeHtml_(v.idProforma) + '</b> &#183; ' + rjdEscapeHtml_(v.namaKlien) +
      '<br/>Nilai order ' + formatRupiah(v.nilaiProforma) +
      ' &#183; DP diminta ' + formatRupiah(v.nilaiDPDiminta) +
      ' &#183; sudah masuk ' + formatRupiah(v.uangMukaMasuk) +
      (v.kurangDP > 0 ? ' &#183; <b>kurang ' + formatRupiah(v.kurangDP) + '</b>' : '') +
      (v.jatuhTempoDP ? '<br/>Jatuh tempo DP: ' + rjdEscapeHtml_(v.jatuhTempoDP) : '');
  }
  if(info) info.innerHTML = teks;
  // Hanya diisikan kalau kolomnya masih kosong -- kalau staf sudah mengetik
  // angka dari bukti transfer, menimpanya adalah cara cepat mencatat angka
  // yang salah.
  if(input && !input.value && saran > 0) input.value = saran;
}

function ivSimpanPembayaran(){
  const mode = window.IV_MODE_BAYAR || "invoice";
  const pilih = window.IV_PILIH_BAYAR;
  const status = document.getElementById("iv-bayar-status");
  const btn = document.getElementById("iv-bayar-simpan");
  if(!pilih){ status.textContent = "Pilih tujuan pembayaran dulu."; return; }

  const jumlah = Number(document.getElementById("iv-bayar-jumlah").value) || 0;
  const tanggal = document.getElementById("iv-bayar-tanggal").value;
  if(jumlah <= 0){ status.textContent = "Jumlah dibayar harus lebih besar dari nol."; return; }
  if(!tanggal){ status.textContent = "Tanggal bayar wajib diisi."; return; }

  const payload = {
    tujuan: mode,
    jumlahDibayar: jumlah,
    tanggalBayar: tanggal,
    metodeBayar: document.getElementById("iv-bayar-metode").value || "",
    catatan: document.getElementById("iv-bayar-catatan").value || ""
  };
  if(mode === "invoice") payload.idInvoice = pilih; else payload.idPurchaseOrder = pilih;

  btn.disabled = true;
  status.textContent = "Menyimpan...";

  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "simpanPembayaran", payload: payload })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    btn.disabled = false;
    if(!d || !d.success){
      status.innerHTML = '<span class="iv-bayar-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal menyimpan pembayaran.") + '</span>';
      return;
    }
    const h = d.data || {};
    let pesan = "Tersimpan sebagai " + h.idPelunasan + ".";
    if(h.statusInvoice) pesan += " Status invoice sekarang: " + h.statusInvoice +
      " (sisa " + formatRupiah(h.sisaInvoice || 0) + ").";
    if(h.saldoUangMuka !== undefined) pesan += " Uang muka order: " + formatRupiah(h.uangMukaTotal || 0) +
      ", belum tertagih " + formatRupiah(h.saldoUangMuka || 0) + ".";
    // Peringatan backend ditampilkan UTUH, tidak diringkas: isinya justru hal
    // yang perlu diperiksa manusia (kelebihan bayar, proforma belum terbit).
    const warn = (h.peringatan || []).map(function(w){
      return '<div class="iv-bayar-warn">' + rjdEscapeHtml_(w) + '</div>';
    }).join("");
    status.innerHTML = '<span class="iv-bayar-ok">' + rjdEscapeHtml_(pesan) + '</span>' + warn;

    document.getElementById("iv-bayar-jumlah").value = "";
    document.getElementById("iv-bayar-catatan").value = "";
    window.IV_PILIH_BAYAR = null;
    // Daftar tujuan & daftar piutang sama-sama dimuat ulang: angka sisa di
    // keduanya baru saja berubah, dan daftar yang basi di layar keuangan lebih
    // berbahaya daripada layar yang berkedip sebentar.
    window.IV_TUJUAN = null;
    window.IV_DATA = null;
    ivMuatPembayaran();
    ivMuat();
  })
  .catch(function(){
    btn.disabled = false;
    status.innerHTML = '<span class="iv-bayar-galat">Gagal menghubungi server.</span>';
  });
}

function ivMuatRiwayat(){
  const wadah = document.getElementById("iv-bayar-riwayat");
  if(!wadah) return;
  wadah.innerHTML = '<p class="iv-buat-info">Memuat riwayat...</p>';
  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "getRiwayatPembayaran", batas: 30 })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      wadah.innerHTML = '<div class="iv-buat-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat riwayat.") + '</div>';
      return;
    }
    const daftar = (d.data && d.data.daftar) || [];
    if(!daftar.length){ wadah.innerHTML = '<p class="iv-buat-info">Belum ada pembayaran tercatat.</p>'; return; }
    wadah.innerHTML =
      '<div class="iv-tabelwrap"><table class="iv-tabel iv-riwayat-tabel"><thead><tr>' +
        '<th>ID</th><th>Tanggal</th><th>Tujuan</th><th class="num">Jumlah</th><th>Metode</th><th/>' +
      '</tr></thead><tbody>' +
      daftar.map(function(v){
        const tujuan = v.tujuan === "order"
          ? '<span class="iv-status bahaya">Uang Muka</span><div class="iv-sub">' + rjdEscapeHtml_(v.idPurchaseOrder) + '</div>'
          : '<span class="iv-status belum">Invoice</span><div class="iv-sub">' + rjdEscapeHtml_(v.idInvoice) + '</div>';
        return '<tr>' +
          '<td class="iv-nomor">' + rjdEscapeHtml_(v.idPelunasan || "-") + '</td>' +
          '<td class="iv-tgl">' + rjdEscapeHtml_(v.tanggal || "-") + '</td>' +
          '<td>' + tujuan + '</td>' +
          '<td class="num">' + formatRupiah(v.jumlah) + '</td>' +
          '<td>' + rjdEscapeHtml_(v.metode || "-") +
          (v.noReferensi ? '<div class="iv-sub">' + rjdEscapeHtml_(v.noReferensi) + '</div>' : '') + '</td>' +
          '<td>' + (v.bisaDihapus
            ? '<a href="#" class="iv-hapus-link" onclick="ivHapusPembayaran(\'' +
                rjdEscapeHtml_(v.idPelunasan).replace(/'/g, "") + '\'); return false;">Hapus</a>'
            : '') + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table></div>';
  })
  .catch(function(){ wadah.innerHTML = '<div class="iv-buat-galat">Gagal menghubungi server.</div>'; });
}

/** Penghapusan diberi peringatan yang menyebut AKIBATNYA, bukan sekadar
 *  "yakin?". Menghapus baris menurunkan Total Dibayar dan bisa mengembalikan
 *  invoice yang sudah Lunas jadi piutang -- itu yang perlu diketahui sebelum
 *  menekan, bukan sesudah. */
function ivHapusPembayaran(id){
  if(!id) return;
  if(!window.confirm("Hapus catatan pembayaran " + id + "?\n\n" +
    "Total Dibayar akan TURUN sebesar jumlah ini, dan status invoice terkait bisa " +
    "berubah dari Lunas kembali jadi belum lunas.\n\nLakukan hanya untuk memperbaiki salah input.")) return;

  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: IV_ID_TOKEN, action: "hapusPembayaran", idPelunasan: id })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){ window.alert((d && d.error) || "Gagal menghapus."); return; }
    window.IV_TUJUAN = null;
    window.IV_DATA = null;
    ivMuatPembayaran();
    ivMuat();
  })
  .catch(function(){ window.alert("Gagal menghubungi server."); });
}

/* ============================================================
 * MODE SPLIT -- satu transfer, banyak tujuan
 * ============================================================
 * Kasus nyata yang melahirkannya: PT Bahagia Bervisi Mulia mentransfer
 * Rp 27.600.000 sekaligus, sementara ada tujuh invoice terbuka dan kolom
 * Berita di bukti transfernya kosong. Tidak ada kombinasi invoice yang
 * berjumlah persis segitu -- artinya itu pembayaran sebagian yang nilainya
 * ditentukan klien, dan RJD yang harus memutuskan alokasinya.
 *
 * ============================================================
 * ATURAN YANG DITEGAKKAN DI LAYAR INI
 * ============================================================
 * Tombol simpan TIDAK AKTIF sampai sisa yang belum dialokasikan PERSIS NOL.
 * Bukan sekadar galak: kalau sebagian dana boleh dibiarkan menggantung, uang
 * itu ada di rekening tapi tidak ada di sistem mana pun -- dan uang yang tidak
 * bisa ditunjukkan ada di mana adalah masalah yang jauh lebih besar daripada
 * satu formulir yang rewel.
 *
 * Kalau memang ada sisa yang belum ada tagihannya, sisa itu dialokasikan
 * sebagai UANG MUKA ke ordernya -- daftar di layar ini memuat invoice DAN
 * order, justru supaya jalan keluar itu selalu tersedia.
 * ============================================================ */

/** Isi otomatis FIFO: invoice TERTUA lebih dulu, sampai dana habis.
 *  Aturan yang sama dengan alokasi uang muka di backend & dengan urutan aging
 *  piutang -- supaya "kenapa invoice ini yang dibayar duluan" selalu punya
 *  jawaban yang sama di seluruh sistem. Hasilnya tetap bisa diubah tangan. */
function ivSplitOtomatis(){
  const total = Number(document.getElementById("iv-split-total").value) || 0;
  if(total <= 0){ document.getElementById("iv-split-status").textContent =
    "Isi total transfer dulu."; return; }
  window.IV_ALOKASI = {};
  let sisa = total;
  ((window.IV_TUJUAN && window.IV_TUJUAN.invoice) || []).forEach(function(v){
    if(sisa <= 0) return;
    const pakai = Math.min(v.sisa, sisa);
    if(pakai > 0){ window.IV_ALOKASI["INV:" + v.id] = pakai; sisa -= pakai; }
  });
  ivRenderSplit();
}

function ivSplitKosongkan(){
  window.IV_ALOKASI = {};
  ivRenderSplit();
}

function ivSetAlokasi(kunci, nilai){
  const n = Number(nilai) || 0;
  if(!window.IV_ALOKASI) window.IV_ALOKASI = {};
  if(n > 0) window.IV_ALOKASI[kunci] = n; else delete window.IV_ALOKASI[kunci];
  ivHitungSisaSplit();
}

/** Hitung ulang sisa TANPA menggambar ulang daftar. Dipisah dari ivRenderSplit
 *  karena menggambar ulang saat orang sedang mengetik akan merebut fokus dari
 *  kolom yang sedang diisi -- angka jadi terpotong di tengah pengetikan. */
function ivHitungSisaSplit(){
  const total = Number(document.getElementById("iv-split-total").value) || 0;
  const alokasi = window.IV_ALOKASI || {};
  let dipakai = 0;
  Object.keys(alokasi).forEach(function(k){ dipakai += Number(alokasi[k]) || 0; });
  const sisa = total - dipakai;

  const el = document.getElementById("iv-split-sisa");
  const btn = document.getElementById("iv-split-simpan");
  const jml = Object.keys(alokasi).length;

  let kelas = "iv-split-sisa", teks;
  if(total <= 0){
    teks = "Isi total transfer, lalu bagikan ke tujuan di bawah.";
  } else if(sisa === 0 && jml > 0){
    kelas += " pas";
    teks = "Pas. " + jml + " tujuan, total " + formatRupiah(total) + ".";
  } else if(sisa > 0){
    kelas += " kurang";
    teks = "Belum teralokasi: " + formatRupiah(sisa) + " dari " + formatRupiah(total) + ".";
  } else {
    kelas += " lebih";
    teks = "Kelebihan alokasi " + formatRupiah(Math.abs(sisa)) + " dari total transfer.";
  }
  el.className = kelas;
  el.textContent = teks;

  const boleh = (total > 0 && sisa === 0 && jml > 0);
  btn.disabled = !boleh;
  btn.textContent = boleh
    ? "Catat " + jml + " Pembayaran (" + formatRupiah(total) + ")"
    : "Alokasi harus pas dulu";
}

function ivRenderSplit(){
  const wadah = document.getElementById("iv-split-daftar");
  if(!wadah) return;
  if(!window.IV_TUJUAN){ wadah.innerHTML = '<p class="iv-buat-info">Memuat...</p>'; return; }

  const alokasi = window.IV_ALOKASI || {};
  const cari = (document.getElementById("iv-split-cari").value || "").toLowerCase().trim();
  const cocok = function(teks){ return !cari || teks.toLowerCase().indexOf(cari) !== -1; };

  const barisInvoice = (window.IV_TUJUAN.invoice || [])
    .filter(function(v){ return cocok(v.id + " " + v.idPurchaseOrder + " " + v.namaKlien); })
    .map(function(v){
      const kunci = "INV:" + v.id;
      const nilai = alokasi[kunci] || "";
      return '<div class="iv-split-baris' + (nilai ? " terisi" : "") + '">' +
        '<div class="iv-split-isi">' +
          '<span class="iv-kirim-id">' + rjdEscapeHtml_(v.id) + '</span>' +
          '<span class="iv-kirim-sub">' + rjdEscapeHtml_(v.namaKlien) + ' &#183; ' +
            rjdEscapeHtml_(v.tanggal) + ' &#183; sisa ' + formatRupiah(v.sisa) + '</span>' +
        '</div>' +
        '<input class="iv-split-input" type="number" min="0" placeholder="0" value="' + nilai + '"' +
          ' oninput="ivSetAlokasi(\'' + kunci + '\', this.value)"/>' +
        '<button class="iv-split-penuh" type="button" title="Isi sebesar sisa tagihan"' +
          ' onclick="ivIsiPenuh(\'' + kunci + '\', ' + v.sisa + ')">Sisa</button>' +
      '</div>';
    }).join("");

  const barisOrder = (window.IV_TUJUAN.order || [])
    .filter(function(v){ return cocok(v.idPurchaseOrder + " " + v.idProforma + " " + v.namaKlien); })
    .map(function(v){
      const kunci = "PO:" + v.idPurchaseOrder;
      const nilai = alokasi[kunci] || "";
      return '<div class="iv-split-baris' + (nilai ? " terisi" : "") + '">' +
        '<div class="iv-split-isi">' +
          '<span class="iv-kirim-id">' + rjdEscapeHtml_(v.idProforma) + '</span>' +
          '<span class="iv-kirim-sub">' + rjdEscapeHtml_(v.namaKlien) + ' &#183; ' +
            rjdEscapeHtml_(v.idPurchaseOrder) +
            (v.kurangDP > 0 ? ' &#183; kurang DP ' + formatRupiah(v.kurangDP) : ' &#183; DP lengkap') +
          '</span>' +
        '</div>' +
        '<input class="iv-split-input" type="number" min="0" placeholder="0" value="' + nilai + '"' +
          ' oninput="ivSetAlokasi(\'' + kunci + '\', this.value)"/>' +
        '<button class="iv-split-penuh" type="button" title="Isi sebesar kekurangan DP"' +
          ' onclick="ivIsiPenuh(\'' + kunci + '\', ' + (v.kurangDP || 0) + ')">DP</button>' +
      '</div>';
    }).join("");

  wadah.innerHTML =
    (barisInvoice ? '<div class="iv-split-grup">Invoice belum lunas</div>' + barisInvoice : '') +
    (barisOrder ? '<div class="iv-split-grup">Uang muka order (proforma)</div>' + barisOrder : '') +
    ((!barisInvoice && !barisOrder) ? '<p class="iv-buat-info">Tidak ada tujuan yang cocok.</p>' : '');

  ivHitungSisaSplit();
}

function ivIsiPenuh(kunci, nilai){
  if(!nilai || nilai <= 0) return;
  if(!window.IV_ALOKASI) window.IV_ALOKASI = {};
  window.IV_ALOKASI[kunci] = nilai;
  ivRenderSplit();
}

function ivSimpanSplit(){
  const status = document.getElementById("iv-split-status");
  const btn = document.getElementById("iv-split-simpan");
  const total = Number(document.getElementById("iv-split-total").value) || 0;
  const tanggal = document.getElementById("iv-split-tanggal").value;
  const alokasi = window.IV_ALOKASI || {};

  if(!tanggal){ status.textContent = "Tanggal bayar wajib diisi."; return; }

  const daftar = Object.keys(alokasi).map(function(k){
    const isInv = k.indexOf("INV:") === 0;
    return {
      tujuan: isInv ? "invoice" : "order",
      idInvoice: isInv ? k.slice(4) : "",
      idPurchaseOrder: isInv ? "" : k.slice(3),
      jumlah: Number(alokasi[k]) || 0
    };
  });
  if(!daftar.length){ status.textContent = "Belum ada alokasi."; return; }

  btn.disabled = true;
  status.textContent = "Menyimpan " + daftar.length + " baris...";

  fetch(IV_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: IV_ID_TOKEN,
      action: "simpanPembayaranSplit",
      payload: {
        tanggalBayar: tanggal,
        metodeBayar: document.getElementById("iv-split-metode").value || "",
        noReferensi: document.getElementById("iv-split-ref").value || "",
        catatan: document.getElementById("iv-split-catatan").value || "",
        totalTransfer: total,
        alokasi: daftar
      }
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    btn.disabled = false;
    if(!d || !d.success){
      status.innerHTML = '<span class="iv-bayar-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal menyimpan pembayaran.") + '</span>';
      return;
    }
    const h = d.data || {};
    // Hasil per tujuan ditampilkan SATU-SATU, bukan diringkas jadi "tersimpan".
    // Inilah momen staf bisa memastikan alokasinya jatuh seperti yang dimaksud;
    // sesudah layar ini tertutup, memeriksanya berarti membuka SD Pelunasan.
    const rincian = (h.rincian || []).map(function(r){
      const hasil = r.tujuan === "invoice"
        ? (r.status || "-") + (r.sisa !== undefined ? ", sisa " + formatRupiah(r.sisa) : "")
        : "uang muka " + formatRupiah(r.uangMukaTotal || 0) +
          ", belum tertagih " + formatRupiah(r.saldoUangMuka || 0);
      return '<div class="iv-split-hasil"><b>' + rjdEscapeHtml_(r.id) + '</b> &#183; ' +
        formatRupiah(r.jumlah) + ' &#8594; ' + rjdEscapeHtml_(hasil) + '</div>';
    }).join("");
    const warn = (h.peringatan || []).map(function(w){
      return '<div class="iv-bayar-warn">' + rjdEscapeHtml_(w) + '</div>';
    }).join("");
    status.innerHTML = '<span class="iv-bayar-ok">' + h.jumlahBaris +
      ' baris tersimpan, total ' + formatRupiah(h.totalDicatat) +
      (h.noReferensi ? ' (ref ' + rjdEscapeHtml_(h.noReferensi) + ')' : '') + '.</span>' +
      rincian + warn;

    window.IV_ALOKASI = {};
    document.getElementById("iv-split-total").value = "";
    document.getElementById("iv-split-ref").value = "";
    document.getElementById("iv-split-catatan").value = "";
    window.IV_TUJUAN = null;
    window.IV_DATA = null;
    ivMuatPembayaran();
    ivMuat();
  })
  .catch(function(){
    btn.disabled = false;
    status.innerHTML = '<span class="iv-bayar-galat">Gagal menghubungi server.</span>';
  });
}
