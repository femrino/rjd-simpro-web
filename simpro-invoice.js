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
      return '<div class="iv-kartu iv-bucket' + (bahaya ? ' bahaya' : '') + '" onclick="ivFilterBucket(' + JSON.stringify(b) + ')">' +
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
      return '<tr>' +
        '<td><b class="iv-nomor">' + rjdEscapeHtml_(p.idInvoice) + '</b>' +
          (p.artikel ? '<div class="iv-sub">' + rjdEscapeHtml_(p.artikel) + '</div>' : '') + '</td>' +
        '<td>' + rjdEscapeHtml_(p.namaKlien) + '</td>' +
        '<td class="iv-sub">' + rjdEscapeHtml_(p.idPurchaseOrder || "-") + '</td>' +
        '<td class="num">' + ivFormatRupiah_(p.total) + '</td>' +
        '<td class="num">' + ivFormatRupiah_(p.dibayar) + '</td>' +
        '<td class="num ' + (p.sisa > 0 ? "kurang" : "") + '">' + (p.sisa > 0 ? ivFormatRupiah_(p.sisa) : "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(p.tanggalInvoice || "-") + '</td>' +
        '<td>' + (p.lunas ? '-' : (p.umurHari + ' hari')) + '</td>' +
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
  if (tab === "buat" && !window.IV_PENGIRIMAN) ivMuatPengiriman();
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
          '<input type="checkbox"' + (dipilih ? ' checked="checked"' : '') +
            ' onchange="ivTogglePilih(' + JSON.stringify(p.idPengiriman) + ')"/>' +
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
