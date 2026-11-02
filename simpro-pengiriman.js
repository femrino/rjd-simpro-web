/**
 * ============================================================
 * SIMPRO -- simpro-pengiriman
 * ============================================================
 * Halaman PENGIRIMAN (pengiriman.html).
 *
 * Fokusnya SATU pertanyaan: order mana yang belum selesai dikirim, dan kurang
 * berapa. Itu sebabnya kolom utamanya "Sisa", bukan daftar pengiriman apa
 * adanya -- daftar mentah sudah bisa dilihat di AppSheet.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard & Daftar Order
 * (localStorage "db_session").
 *
 * DIMUAT DI : pengiriman.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const KR_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const KR_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let KR_ID_TOKEN = null;

function krShow(id){
  ["kr-login-box", "kr-loading", "kr-isi"].forEach(function(x){
    const el = document.getElementById(x);
    if(el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if(t) t.classList.remove("hidden");
}

function krBacaSesi_(){
  try{
    const raw = localStorage.getItem("db_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  }catch(e){ return null; }
}

function krSimpanSesi_(token){
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  }catch(e){}
}

function krHandleGoogleLogin(response){
  KR_ID_TOKEN = response.credential;
  krSimpanSesi_(response.credential);
  krMulai();
}

function krLogout(){
  KR_ID_TOKEN = null;
  try{ localStorage.removeItem("db_session"); }catch(e){}
  if(typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  ["kr-nav-logout", "kr-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.add("hidden");
  });
  krShow("kr-login-box");
}

function krMulai() {
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke krMulaiIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(KR_ID_TOKEN, KR_API_URL, krMulaiIsi_);
  } else {
    krMulaiIsi_();
  }
}

function krMulaiIsi_() {
  // [DIHAPUS 6 Agustus 2026] Dulu di sini ada panggilan rjdMuatPeran(). Fungsi
  // itu sudah dihapus dari simpro-global.js karena tidak pernah bekerja sekali
  // pun -- lihat tombstone lengkapnya di sana. Penyesuaian menu menurut peran
  // sudah ditangani rjdTerapkanPeranKeMenu(), yang berjalan OTOMATIS di
  // DOMContentLoaded untuk semua halaman, jadi halaman ini tidak perlu
  // memanggil apa pun. Baris lamanya dijaga `typeof ... === "function"`,
  // sehingga penghapusannya tidak mengubah perilaku apa pun -- pemeriksaan itu
  // sudah gagal diam-diam sejak file JS baru diunggah.
  krShow("kr-loading");
  ["kr-nav-logout", "kr-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.remove("hidden");
  });
  window.KR_DAFTAR = null;
  krMuat();

  // ============================================================
  // v168: JEMBATAN DARI HALAMAN PRODUKSI
  // ============================================================
  // Tab "Stok Siap Kirim" di /p/produksi.html punya tombol yang membuka
  // halaman ini dengan ?po=... -- supaya orang yang baru saja melihat stok
  // tidak perlu MENCARI PO YANG SAMA sekali lagi di sini.
  //
  // Itu keluhan yang sebenarnya: bukan "harus dua halaman", tapi harus
  // mengetik ulang nomor yang barusan dilihat. Jembatan menutup jarak itu
  // tanpa memindahkan apa pun.
  //
  // Dipilih daripada memindahkan seluruh halaman ini ke produksi karena
  // langkah yang bisa dibatalkan lebih murah daripada langkah yang benar:
  // kalau kelak dipindah beneran, tombolnya tetap berguna sebagai pintasan.
  krBukaDariTautan_();
}

/**
 * Baca ?po=... dan langsung buka tab Buat Surat Jalan dengan PO itu terpilih.
 *
 * Parameter DIBERSIHKAN dari URL sesudah dipakai (history.replaceState):
 * tanpa itu, memuat ulang halaman berjam-jam kemudian akan melompat lagi ke
 * PO lama -- padahal orangnya sudah mengerjakan hal lain.
 */
function krBukaDariTautan_() {
  let po = "";
  try {
    po = new URLSearchParams(window.location.search).get("po") || "";
  } catch (e) { return; }        // browser tua: jembatan mati, halaman tetap normal
  po = String(po).trim();
  if (!po) return;

  // v175: jembatan TIDAK BOLEH menembus gerbang bagian.
  //
  // Tab "Buat Surat Jalan" disembunyikan CSS untuk yang bukan bagian gudang,
  // tapi fungsi ini memanggil krSwitchTab langsung -- kalau tidak diperiksa,
  // tautan ?po=... dari halaman produksi akan membuka panel yang seharusnya
  // tidak terlihat. Menyembunyikan pintu tidak ada gunanya kalau ada lorong
  // yang menuju ke ruangan yang sama.
  //
  // Penandanya body[data-bagian] (v175). "lintas" = peran full/admin atau
  // kolom Bagian kosong. Kalau penandanya BELUM ADA -- jawaban peran belum
  // tiba -- jembatan tetap dijalankan: gerbang sesungguhnya ada di backend,
  // dan menahan orang yang berhak lebih merugikan daripada membuka tab yang
  // isinya tetap akan ditolak saat disimpan.
  const tanda = document.body.getAttribute("data-bagian");
  if (tanda !== null && !/\b(gudang|lintas)\b/.test(tanda)) return;

  krSwitchTab("buat");
  // Rincian PO dimuat lewat rute yang sama dengan pilihan manual, jadi tidak
  // ada jalur kedua yang bisa berbeda perilakunya.
  krPilihPO(po);

  try {
    const bersih = window.location.pathname + window.location.hash;
    window.history.replaceState({}, "", bersih);
  } catch (e) { /* tidak fatal */ }
}

/* v228 -- SNAPSHOT LOKAL (Tipe B)
   Data terakhir yang berhasil dimuat digambar lebih dulu supaya halaman
   terpakai dalam < 1 detik, lalu diganti diam-diam oleh jawaban server.
   BENDERA di bawah adalah inti keamanannya: snapshot HANYA boleh tampil
   sebelum halaman ini pernah sekali pun menerima data segar. Sesudah itu --
   tombol Refresh, atau muat ulang sesudah menyimpan sesuatu -- menampilkan
   snapshot berarti memperlihatkan keadaan SEBELUM perubahan yang baru saja
   dibuat orang. Itu bukan lambat, itu salah. */
var KR_SUDAH_SEGAR = false;
var KR_SNAP_WAKTU = null;   // v243: jam snapshot yang sedang TAMPIL; null = yang tampil data segar

function krMuat(){
  if(window.KR_DAFTAR && KR_SUDAH_SEGAR){ krRender(); return; }
  if(!KR_SUDAH_SEGAR && typeof rjdSnapshotBaca_ === "function"){
    const snap = rjdSnapshotBaca_("pengiriman_daftar", 3 * 24 * 60);
    if(snap && Array.isArray(snap.data)){
      window.KR_DAFTAR = snap.data;
      krShow("kr-isi");
      krRender();
      if(typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("kr-tabel", snap.waktu);
      KR_SNAP_WAKTU = snap.waktu;
    }
  }
  fetch(KR_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: KR_ID_TOKEN, action: "getDaftarPengiriman" })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    krShow("kr-isi");
    if(!d || !d.success){
      if(krGagalDenganSnapshot_()) return;
      document.getElementById("kr-tabel").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat data.") + '</p>';
      return;
    }
    window.KR_DAFTAR = d.daftar || [];
    KR_SUDAH_SEGAR = true;
    KR_SNAP_WAKTU = null;
    if(typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("pengiriman_daftar", window.KR_DAFTAR);
    krRender();
    if(typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("kr-tabel");
  })
  .catch(function(){
    krShow("kr-isi");
    if(krGagalDenganSnapshot_()) return;
    document.getElementById("kr-tabel").innerHTML =
      '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
  });
}

/* v243: jalur GAGAL saat yang sedang tampil adalah SNAPSHOT. Pola Dashboard
   v229: jangan timpa tabel tersimpan dengan layar galat -- itu membuang data
   yang masih berguna -- dan jangan biarkan bilah "memperbarui dari server..."
   menetap, karena itu menyiratkan sesuatu masih berjalan padahal sudah
   menyerah. Ganti bilahnya dengan versi gagal yang menyebut jam snapshot-nya.
   Bilah adalah SAUDARA #kr-tabel (v229), jadi ia bertahan walau innerHTML tabel
   ditulis ulang -- itulah kenapa dulu ia menetap dengan kalimat yang salah.
   Ditemukan jalan27 (v230), tertimbun 23 merah palsu sampai 2 Sep 2026.
   @return {boolean} true = sudah ditangani di sini, pemanggil harus berhenti. */
function krGagalDenganSnapshot_(){
  if(!KR_SNAP_WAKTU || typeof rjdSnapshotBarGagal_ !== "function") return false;
  rjdSnapshotBarGagal_("kr-tabel", KR_SNAP_WAKTU);
  return true;
}

function krRefresh(){
  const ikon = document.getElementById("kr-refresh-icon");
  if(ikon) ikon.classList.add("spinning");
  window.KR_DAFTAR = null;
  krShow("kr-loading");
  krMuat();
  setTimeout(function(){ if(ikon) ikon.classList.remove("spinning"); }, 1200);
}

/**
 * Saring + render. Default filter "Belum selesai" -- halaman ini dibuka untuk
 * mencari yang KURANG, bukan untuk melihat semuanya. Menampilkan seluruh 227
 * order sebagai tampilan awal justru mengubur yang penting.
 */
function krRender(){
  const wadah = document.getElementById("kr-tabel");
  if(!wadah) return;
  const semua = window.KR_DAFTAR || [];
  const cari = (document.getElementById("kr-cari").value || "").trim().toLowerCase();
  const fStatus = document.getElementById("kr-status").value;

  const hasil = semua.filter(function(p){
    if(fStatus === "belum" && p.statusKirim === "Selesai") return false;
    if(fStatus === "telat" && !p.telatHari) return false;
    if(fStatus && fStatus !== "belum" && fStatus !== "telat" && p.statusKirim !== fStatus) return false;
    if(!cari) return true;
    return [p.idPurchaseOrder, p.noSO, p.namaKlien].join(" ").toLowerCase().indexOf(cari) !== -1;
  });

  // Ringkasan di atas tabel -- angka yang paling sering ditanyakan.
  let totalSisa = 0, jumlahTelat = 0;
  semua.forEach(function(p){
    if(p.statusKirim !== "Selesai" && p.sisa > 0) totalSisa += p.sisa;
    if(p.telatHari) jumlahTelat++;
  });
  document.getElementById("kr-ringkas").innerHTML =
    '<div class="kr-kartu"><div class="kr-kartu-angka">' + hasil.length + '</div><div class="kr-kartu-label">order tampil</div></div>' +
    '<div class="kr-kartu"><div class="kr-kartu-angka">' + totalSisa.toLocaleString("id-ID") + '</div><div class="kr-kartu-label">pcs belum dikirim</div></div>' +
    '<div class="kr-kartu' + (jumlahTelat ? ' bahaya' : '') + '"><div class="kr-kartu-angka">' + jumlahTelat + '</div><div class="kr-kartu-label">lewat deadline</div></div>';

  if(!hasil.length){
    wadah.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft)">Tidak ada order yang cocok dengan filter.</p>';
    return;
  }

  wadah.innerHTML =
    '<div class="kr-tabelwrap"><table class="kr-tabel"><thead><tr>' +
      '<th>PO</th><th>Klien</th><th class="num">Order</th><th class="num">Terkirim</th>' +
      '<th class="num">Sisa</th><th>Progres</th><th>Deadline</th><th>Status</th><th/>' +
    '</tr></thead><tbody>' +
    hasil.map(function(p, i){
      const nomor = String(p.idPurchaseOrder || "");
      const garis = nomor.indexOf("/");
      const no = garis === -1 ? nomor : nomor.slice(0, garis);
      const nama = garis === -1 ? "" : nomor.slice(garis + 1).trim();
      const kelasStatus = p.statusKirim === "Selesai" ? "ok"
        : (p.statusKirim === "Sebagian" ? "sebagian" : "belum");
      return '<tr class="kr-baris" onclick="krToggleRincian(' + i + ')">' +
        '<td><b class="kr-nomor">' + rjdEscapeHtml_(no) + '</b>' +
          (nama ? '<div class="kr-nama">' + rjdEscapeHtml_(nama) + '</div>' : '') + '</td>' +
        '<td class="kr-klien">' + rjdEscapeHtml_(p.namaKlien) + '</td>' +
        '<td class="num">' + (p.qtyOrder || 0) + '</td>' +
        '<td class="num">' + (p.terkirim || 0) + '</td>' +
        // Sisa NEGATIF berarti terkirim melebihi qty order -- bisa jadi kelebihan
        // kirim atau qty PO belum diperbarui. Ditandai supaya tidak lewat begitu saja.
        '<td class="num ' + (p.sisa > 0 ? 'kurang' : (p.sisa < 0 ? 'lebih' : '')) + '">' +
          (p.sisa === 0 ? '-' : (p.sisa > 0 ? p.sisa : '+' + Math.abs(p.sisa))) + '</td>' +
        '<td><div class="kr-bar"><div class="kr-bar-isi ' + kelasStatus + '" style="width:' + p.persen + '%"/></div>' +
          '<div class="kr-persen">' + p.persen + '%</div></td>' +
        '<td class="kr-deadline">' + rjdEscapeHtml_(p.deadline || "-") +
          (p.telatHari ? '<div class="kr-telat">telat ' + p.telatHari + " hari" + '</div>' : '') + '</td>' +
        '<td><span class="kr-status ' + kelasStatus + '">' + rjdEscapeHtml_(p.statusKirim) + '</span></td>' +
        '<td class="kr-panah">' + (p.jumlahPengiriman ? '&#9662;' : '') + '</td>' +
      '</tr>' +
      '<tr class="kr-rincian hidden" id="kr-rincian-' + i + '"><td colspan="9">' +
        krRincianHtml_(p) +
      '</td></tr>';
    }).join("") +
    '</tbody></table></div>';
}

/** Rincian pengiriman 1 PO, muncul saat barisnya diklik. */
function krRincianHtml_(p){
  if(!p.rincian || !p.rincian.length){
    return '<div class="kr-rincian-kosong">Belum ada pengiriman untuk order ini.</div>';
  }
  // Kolom "Surat Jalan" BARU. Selain jadi tempat tombol cetak, ini menutup
  // kekurangan yang sudah lama ada: nomor surat jalannya sendiri tidak pernah
  // ditampilkan di halaman staff. Admin melihat "9 Januari 2025 - Nabella -
  // 1 pcs" tanpa tahu itu SJ nomor berapa, padahal itu nomor yang dipakai klien
  // waktu menanyakan kiriman lewat WhatsApp.
  //
  // Datanya sudah ada sejak awal -- getDaftarPengiriman_ (daftar-pengiriman.js)
  // selalu mengirim idPengiriman di tiap baris rincian, cuma tidak pernah
  // dipakai layar. Tidak ada perubahan backend untuk ini.
  //
  // Tautan cetak TIDAK perlu stopPropagation: onclick buka-tutup dipasang di
  // <tr class="kr-baris">, sedangkan tabel ini ada di <tr class="kr-rincian">
  // yang terpisah, jadi kliknya tidak menyebar ke mana-mana.
  return '<table class="kr-subtabel"><thead><tr>' +
      '<th>Surat Jalan</th><th>Tanggal</th><th>Artikel</th><th class="num">Jumlah</th>' +
      '<th>Jenis</th><th>Metode</th><th>Resi</th><th>Catatan</th>' +
    '</tr></thead><tbody>' +
    p.rincian.map(function(k){
      const idSj = String(k.idPengiriman || "").trim();
      return '<tr>' +
        '<td>' + (idSj
          ? '<b class="kr-sj-nomor">' + rjdEscapeHtml_(idSj) + '</b>' +
            '<a class="kr-cetak-link" target="_blank" rel="noopener"' +
            ' href="/p/cetak.html?jenis=suratjalan&amp;id=' + encodeURIComponent(idSj) + '">' +
            '&#128424; Cetak</a>'
          // Baris pengiriman lama bisa tidak punya ID (data warisan AppSheet).
          // Ditulis apa adanya, bukan diberi tautan yang pasti gagal dibuka.
          : '<span class="kr-buat-kosong">tanpa nomor</span>') + '</td>' +
        '<td>' + rjdEscapeHtml_(k.tanggal || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(k.artikel || "-") + '</td>' +
        '<td class="num">' + (k.jumlah || 0) + '</td>' +
        '<td>' + rjdEscapeHtml_(k.jenis || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(k.metode || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(k.resi || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(k.catatan || "") + '</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table>';
}

function krToggleRincian(i){
  const el = document.getElementById("kr-rincian-" + i);
  if(el) el.classList.toggle("hidden");
}

/* ============================================================
 * TAB "BUAT SURAT JALAN"
 * ============================================================
 * Melengkapi rantai terakhir yang masih dikerjakan di AppSheet.
 *
 * BATAS QTY BERTINGKAT (ditentukan backend, lihat buat-pengiriman.gs):
 *   - PO sudah punya catatan QC Finishing -> batas = qty LOLOS QC
 *   - belum -> batas = qty order
 * Layar menampilkan sumber batasnya terang-terangan supaya admin tahu angka
 * yang dia lihat itu berdasarkan apa.
 * ============================================================ */

function krSwitchTab(tab) {
  document.querySelectorAll(".kr-tab").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("kr-panel-daftar").classList.toggle("hidden", tab !== "daftar");
  document.getElementById("kr-panel-buat").classList.toggle("hidden", tab !== "buat");
  if (tab === "buat" && !window.KR_DAFTAR_PO) krMuatDaftarPO();
}

function krMuatDaftarPO() {
  fetch(KR_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: KR_ID_TOKEN, action: "getDaftarPO" })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) return;
    // Order yang sudah Selesai tidak perlu surat jalan baru.
    window.KR_DAFTAR_PO = (d.daftar || []).filter(function (p) {
      return String(p.status || "").toLowerCase() !== "selesai";
    });
  })
  .catch(function () { /* pencarian PO gagal -- kotak cari tetap ada */ });
}

function krCariPO() {
  const q = (document.getElementById("kr-buat-cari").value || "").trim().toLowerCase();
  const dd = document.getElementById("kr-buat-dropdown");
  if (!dd) return;
  if (!q) { dd.classList.add("hidden"); return; }

  const hasil = (window.KR_DAFTAR_PO || []).filter(function (p) {
    return [p.idPurchaseOrder, p.noSO, p.namaKlien, (p.artikel || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  }).slice(0, 25);

  dd.classList.remove("hidden");
  if (!hasil.length) {
    dd.innerHTML = '<div class="kr-po-kosong">Tidak ada PO yang cocok.</div>';
    return;
  }
  dd.innerHTML = hasil.map(function (p) {
    return '<div class="kr-po-opsi" data-id="' + rjdEscapeHtml_(p.idPurchaseOrder) +
      '" onclick="krPilihPO(this.dataset.id)">' +
      '<div class="kr-po-opsi-id">' + rjdEscapeHtml_(p.idPurchaseOrder) + '</div>' +
      '<div class="kr-po-opsi-sub">' + rjdEscapeHtml_(p.namaKlien) +
        ' &#183; ' + (p.jumlah || 0) + ' pcs' +
        (p.deadline ? ' &#183; deadline ' + rjdEscapeHtml_(p.deadline) : '') + '</div>' +
    '</div>';
  }).join("");
}

function krPilihPO(idPO, izinkanLebih) {
  document.getElementById("kr-buat-dropdown").classList.add("hidden");
  document.getElementById("kr-buat-cari").value = idPO;
  const wadah = document.getElementById("kr-buat-tabel");
  wadah.innerHTML = '<p class="kr-buat-info">Memuat rincian...</p>';

  // Diingat supaya centang "izinkan lebih" bertahan saat rincian dimuat ulang.
  window.KR_IZIN_LEBIH = !!izinkanLebih;

  fetch(KR_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: KR_ID_TOKEN, action: "getPOUntukPengiriman", idPurchaseOrder: idPO,
      izinkanLebihDariOrder: !!izinkanLebih
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      wadah.innerHTML = '<p class="kr-buat-galat">' +
        rjdEscapeHtml_((d && d.error) || "Gagal memuat rincian PO.") + '</p>';
      return;
    }
    window.KR_BUAT = d;
    krRenderFormKirim();
  })
  .catch(function () {
    wadah.innerHTML = '<p class="kr-buat-galat">Gagal menghubungi server.</p>';
  });
}

/* ============================================================
 * RANTAI KUANTITAS DI FORM SURAT JALAN
 * ============================================================
 * Batas kirim diambil dari tingkat TERENDAH di rantai yang punya angka per
 * size (lihat buat-pengiriman.gs). Angka "sisa" saja tidak cukup diberikan ke
 * admin: 89 itu sisa dari apa? Dari order, dari hasil potong, atau dari QC?
 * Tanpa itu, selisih yang muncul cuma bisa dilaporkan, tidak bisa ditelusuri.
 *
 * Jadi tiap baris size membawa rantainya sendiri di bawah angkanya:
 *
 *     S    order 103 -> potong 98 -> QC 90    ... sisa 89
 *
 * Tahap yang belum ada datanya SENGAJA ditulis "belum dicatat", bukan
 * dihilangkan atau ditulis 0. Kosong dan nol itu dua hal yang sangat berbeda
 * di sini: nol berarti tidak ada yang lolos, kosong berarti belum ada yang
 * memeriksa -- dan menampilkan 0 untuk yang kedua akan membuat admin mengira
 * barangnya bermasalah padahal cuma catatannya yang belum masuk.
 * ============================================================ */

var KR_SUMBER_BATAS_TEKS = {
  qc: 'Batas kirim mengikuti qty yang LOLOS QC Finishing.',
  cutting: 'Batas kirim mengikuti qty HASIL POTONG &#8212; PO ini belum punya ' +
    'catatan QC Finishing per size. Panel yang sudah dipotong belum tentu sudah ' +
    'dijahit, jadi pastikan barangnya memang siap sebelum surat jalan dibuat.',
  order: 'PO ini belum punya catatan potong maupun QC Finishing &#8212; ' +
    'batas kirim masih memakai qty order.'
};

/** Baris rantai kecil di bawah tiap size. Mengembalikan HTML, boleh kosong. */
function krRantaiBaris_(b) {
  var bagian = ['order <b>' + (b.qtyOrder || 0) + '</b>'];

  // null = belum ada catatan sama sekali. Angka 0 tetap ditampilkan sebagai 0.
  bagian.push(b.qtyPotong === null || b.qtyPotong === undefined
    ? 'potong <i>belum dicatat</i>'
    : 'potong <b>' + b.qtyPotong + '</b>');

  bagian.push(b.siapKirim === null || b.siapKirim === undefined
    ? 'QC <i>belum dicatat</i>'
    : 'QC <b>' + b.siapKirim + '</b>');

  // Tanda tingkat mana yang sedang membatasi baris ini -- bisa BERBEDA dari
  // tingkat PO secara keseluruhan kalau ada baris yang kena plafon order.
  var tanda = b.dibatasiOrder ? ' &#183; <span class="kr-rantai-plafon">dibatasi qty order</span>' : '';

  return '<div class="kr-rantai">' + bagian.join(' &#8594; ') + tanda + '</div>';
}

function krRenderFormKirim() {
  const d = window.KR_BUAT;
  if (!d) return;

  document.getElementById("kr-buat-ringkas").innerHTML =
    '<div class="kr-buat-klien">' + rjdEscapeHtml_(d.namaKlien) + '</div>' +
    '<div class="kr-buat-angka">' +
      '<span>order <b>' + d.totalOrder + '</b></span>' +
      '<span>terkirim <b>' + d.totalTerkirim + '</b></span>' +
      '<span>sisa <b>' + d.totalSisa + '</b></span>' +
    '</div>' +
    // Sumber batas ditampilkan terang-terangan: admin perlu tahu angka "sisa"
    // itu berdasarkan qty lolos QC, hasil potong, atau baru qty order.
    // KR_SUMBER_BATAS_TEKS memetakan tingkat rantai -> kalimatnya.
    '<div class="kr-buat-sumber' + (d.sumberBatas === "qc" ? ' ok' : '') + '">' +
      (KR_SUMBER_BATAS_TEKS[d.sumberBatas] || KR_SUMBER_BATAS_TEKS.order) +
      // Kasus khusus yang dulu MEMBLOKIR pembuatan surat jalan tanpa penjelasan:
      // PO punya sesi QC Finishing, tapi semuanya baris format lama yang belum
      // mengenal size. Angkanya masuk ke total, tidak ke rincian per size.
      // Sekarang sistem turun ke tingkat berikutnya -- dan mengatakannya, supaya
      // "kok batasnya bukan QC padahal QC sudah diisi" tidak jadi teka-teki.
      (d.adaCatatanQC && !d.qcPerSizeDipakai
        ? '<br/>PO ini punya catatan QC Finishing, tapi tanpa rincian per size ' +
          '(format lama), jadi tidak bisa dipakai sebagai batas per baris.'
        : '') +
      (d.jumlahDibatasiOrder
        ? '<br/>' + d.jumlahDibatasiOrder + ' baris dipotong ke qty order &#8212; ' +
          'hasil produksinya melebihi pesanan (cadangan).'
        : '') +
      (d.izinkanLebihDariOrder
        ? (d.batasTerbuka
            // v407 (butuh gs >= @435): PO tanpa catatan produksi per size -- izin membuka batasnya sepenuhnya.
            ? '<br/><b>Plafon qty PO DIBUKA.</b> PO ini tidak punya catatan produksi per size, jadi qty kirim tidak dibatasi. ' +
              'Kelebihan di atas PO wajib beralasan dan tercatat di surat jalan; klien ditagih sesuai yang dikirim.'
            : '<br/><b>Plafon qty order DIMATIKAN.</b> Batasnya sekarang qty hasil produksi. ' +
              'Klien akan ditagih sesuai yang dikirim.')
        : '') +
    '</div>' +
    // NISAN v407 (opsi 1 Femri, 3 Nov 2026): panel ini dulu hanya muncul kalau ada baris yang hasil produksinya MELEBIHI
    // order ("tombol yang jarang relevan rawan salah klik"). Terukur (sensusBatasKirim): 100 dari 121 PO terbuka tidak punya
    // catatan produksi per size, jadi panelnya TIDAK PERNAH muncul di sana dan satu-satunya jalan keluar yang dipakai orang
    // adalah mengubah qty PO (MANSL 288). Sekarang selalu ada; alasan & tanda surat jalan hanya diminta server kalau ada baris
    // yang BENAR-BENAR melewati qty PO, jadi centang yang tidak dipakai tidak meninggalkan jejak.
    '<div class="kr-buat-bypass">' +
      '<label><input type="checkbox" id="kr-buat-izin-lebih"' +
        (d.izinkanLebihDariOrder ? ' checked' : '') + '/> ' +
        'Izinkan kirim melebihi qty PO</label>' +
      '<div class="kr-buat-bypass-ket">Dipakai kalau klien minta kelebihan produksi ikut dikirim. ' +
        'Tagihan akan mengikuti jumlah yang dikirim, bukan qty PO. ' +
        (d.sumberBatas === "order"
          ? 'PO ini belum punya catatan produksi per size, jadi izin membuka batasnya sepenuhnya.'
          : 'Batasnya tetap qty hasil produksi.') + '</div>' +
      (d.izinkanLebihDariOrder
        ? '<input type="text" id="kr-buat-alasan-lebih" class="kr-buat-alasan" ' +
          'placeholder="Alasan (wajib kalau melebihi PO) &#8212; mis. klien minta kelebihan ikut dikirim" ' +
          'value="' + rjdEscapeHtml_(window.KR_ALASAN_LEBIH || "") + '"/>'
        : '') +
    '</div>';
  document.getElementById("kr-buat-ringkas").classList.remove("hidden");

  // Mencentang = muat ulang rincian dengan plafon dimatikan, supaya kolom Sisa
  // langsung menunjukkan batas yang sebenarnya. Kalau cuma mengubah validasi
  // saat simpan, admin akan mengetik angka yang menurut layar melanggar batas
  // -- membingungkan, dan mengundang dugaan sistemnya rusak.
  const cbIzin = document.getElementById("kr-buat-izin-lebih");
  if (cbIzin) {
    cbIzin.addEventListener("change", function () {
      const alasanEl = document.getElementById("kr-buat-alasan-lebih");
      window.KR_ALASAN_LEBIH = alasanEl ? alasanEl.value : "";
      krPilihPO(d.idPurchaseOrder, cbIzin.checked);
    });
  }
  const alasanEl2 = document.getElementById("kr-buat-alasan-lebih");
  if (alasanEl2) {
    alasanEl2.addEventListener("input", function () { window.KR_ALASAN_LEBIH = alasanEl2.value; });
  }

  // Dikelompokkan per Warna supaya sejalan dengan cara orang gudang menghitung
  // (per bundel warna), bukan daftar panjang warna-size bercampur.
  const grup = {};
  const urut = [];
  d.baris.forEach(function (b, i) {
    const k = [b.brand, b.artikel, b.style, b.warna].join("||");
    if (!grup[k]) { grup[k] = []; urut.push(k); }
    grup[k].push({ b: b, i: i });
  });

  document.getElementById("kr-buat-tabel").innerHTML =
    krSetPOPanelHtml_(d) +   // 30 Okt 2026 (set PO): panel set + peringatan; kosong untuk gs < @427
    '<div class="kr-tabelwrap"><table class="kr-tabel"><thead><tr>' +
      '<th>Warna / Size</th><th class="num">Order</th><th class="num">Terkirim</th>' +
      '<th class="num">Sisa</th><th class="num">Kirim sekarang</th>' +
    '</tr></thead><tbody>' +
    urut.map(function (k) {
      const bagian = k.split("||");
      const rows = grup[k];
      let head = '<tr class="kr-buat-grup"><td colspan="5">' +
        '<b>' + rjdEscapeHtml_(bagian[3] || "-") + '</b> &#183; ' +
        rjdEscapeHtml_([bagian[1], bagian[2]].filter(Boolean).join(" / ")) + krSetPOLencana_(d, rows[0].b) + '</td></tr>';
      return head + rows.map(function (x) {
        const b = x.b, i = x.i;
        // v407: baris BEBAS (izin + PO tanpa catatan produksi) tetap bisa diisi walau sisa terhadap PO-nya 0, tanpa max.
        const habis = b.sisa <= 0 && !b.bebas;
        return '<tr' + (habis ? ' class="kr-habis"' : '') + '>' +
          '<td class="kr-buat-size">' + rjdEscapeHtml_(b.size || "-") +
            (b.idDetailOrder ? '' : ' <span class="kr-buat-tanda" title="tanpa ID Detail Order, harga di invoice perlu diisi manual">!</span>') +
            krRantaiBaris_(b) + '</td>' +
          '<td class="num">' + b.qtyOrder + '</td>' +
          '<td class="num">' + b.terkirim + '</td>' +
          '<td class="num">' + b.sisa + '</td>' +
          '<td class="num">' + (habis ? '<span class="kr-buat-kosong">selesai</span>'
            : '<input class="kr-kirim-qty" type="number" min="0"' + (b.bebas ? ' data-bebas="1"' : ' max="' + b.sisa + '"') +
              ' data-i="' + i + '" oninput="krHitungTotalKirim()" placeholder="0"/>') + '</td>' +
        '</tr>';
      }).join("");
    }).join("") +
    '</tbody></table></div>' +
    '<p class="kr-buat-lebih-info hidden" id="kr-buat-lebih-info"></p>';   // v407: kelebihan di atas PO, per ketikan

  const t = new Date();
  const inp = document.getElementById("kr-buat-tanggal");
  if (inp && !inp.value) {
    inp.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") +
      "-" + String(t.getDate()).padStart(2, "0");
  }
  krSetPOPulihkan_(d);   // qty yang diketik sebelum set disimpan + pesan hasil simpan set
  krHitungTotalKirim();
}

/** v407: baris yang total kirimnya (terkirim + ketikan) melewati qty PO -> ["Butter S +5", ...]. Sama dengan hitungan server. */
function krLebihPO_() {
  const d = window.KR_BUAT, hasil = [];
  if (!d) return hasil;
  document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0; if (v <= 0) return;
    const b = d.baris[Number(inp.dataset.i)]; if (!b) return;
    const lebih = (b.terkirim || 0) + v - (b.qtyOrder || 0);
    if (lebih > 0) hasil.push((b.warna || "-") + " " + (b.size || "-") + " +" + lebih);
  });
  return hasil;
}

function krHitungTotalKirim() {
  let total = 0;
  document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    // v407: kotak baris bebas tidak punya max -- ia tidak pernah "melebihi sisa" (Number("") = 0 akan menandai semuanya).
    inp.classList.toggle("kr-lebih", inp.hasAttribute("max") && v > (Number(inp.max) || 0));
    total += v;
  });
  const lebih = krLebihPO_(), info = document.getElementById("kr-buat-lebih-info");
  if (info) {
    info.textContent = lebih.length ? "Melebihi qty PO: " + lebih.join(", ") + " -- alasan wajib diisi, tercatat di surat jalan." : "";
    info.classList.toggle("hidden", !lebih.length);
  }
  const el = document.getElementById("kr-buat-total");
  if (el) el.textContent = total;
  const btn = document.getElementById("kr-buat-simpan-btn");
  if (btn) btn.disabled = (total <= 0);
  krSetPOCek_();   // 30 Okt 2026 (set PO): peringatan set tidak lengkap, mengikuti tiap ketikan
}

function krSimpanPengiriman() {
  const d = window.KR_BUAT;
  if (!d) return;

  const baris = [];
  document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
    const v = Number(inp.value) || 0;
    if (v <= 0) return;
    const b = d.baris[Number(inp.dataset.i)];
    baris.push({
      idDetailOrder: b.idDetailOrder, brand: b.brand, artikel: b.artikel,
      style: b.style, warna: b.warna, size: b.size, jumlah: v
    });
  });
  if (!baris.length) { alert("Belum ada qty yang diisi."); return; }
  // 30 Okt 2026 (set PO): set yang tidak lengkap BOLEH dikirim (kiriman bertahap itu sah), tapi tidak boleh
  // terjadi tanpa sengaja -- kertasnya akan mencetak sisanya per potong, bukan per set.
  const awasSet = krSetPOCek_();
  if (awasSet && !confirm("Ada " + awasSet + " peringatan set (lihat kotak Set di atas tabel): qty anggota set tidak sama, " +
      "jadi sebagian akan tercetak per potong, bukan per set.\n\nTetap simpan surat jalan?")) return;

  // Diperiksa di sini JUGA, bukan cuma di backend -- supaya admin tidak
  // kehilangan isian yang sudah diketik gara-gara ditolak server.
  // v407: alasan hanya kalau ada baris yang BENAR-BENAR melewati qty PO (sama dengan server @435).
  const cbIzinSimpan = document.getElementById("kr-buat-izin-lebih"), lebihPO = krLebihPO_();
  if (cbIzinSimpan && cbIzinSimpan.checked && lebihPO.length) {
    const alasan = ((document.getElementById("kr-buat-alasan-lebih") || {}).value || "").trim();
    if (alasan.length < 5) {
      alert("Mengirim melebihi qty PO wajib disertai alasan (minimal 5 karakter): " + lebihPO.join(", ") + ".\n\n" +
        "Contoh: klien minta kelebihan ikut dikirim");
      return;
    }
  }

  const btn = document.getElementById("kr-buat-simpan-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  const payloadSJ = {
        idPurchaseOrder: d.idPurchaseOrder,
        tanggal: (document.getElementById("kr-buat-tanggal") || {}).value || "",
        jenisPengiriman: (document.getElementById("kr-buat-jenis") || {}).value || "Produksi",
        metodePengiriman: (document.getElementById("kr-buat-metode") || {}).value || "",
        // v141: nama kurir -- opsional, SIAPA yang mengantar (bukan CARAnya;
        // itu "Metode kirim"). Backend yang menulis ID Klien: turunan dari PO,
        // tidak dikirim dari sini supaya layar tak bisa salah menulis klien.
        kurir: (document.getElementById("kr-buat-kurir") || {}).value || "",
        noResi: (document.getElementById("kr-buat-resi") || {}).value || "",
        catatan: (document.getElementById("kr-buat-catatan") || {}).value || "",
        izinkanLebihDariOrder: !!(document.getElementById("kr-buat-izin-lebih") || {}).checked,
        alasanLebihDariOrder: (document.getElementById("kr-buat-alasan-lebih") || {}).value || "",
        baris: baris
      };
  // @P18-A (v373, butuh gs >= @397): kunci kiriman terikat isian. Dulu jawaban yang hilang + Simpan lagi =
  // SURAT JALAN KEDUA: stok siap kirim berkurang dua kali, detailnya dasar invoice ganda.
  payloadSJ.idPermintaan = rjdKunciIsian_("suratjalan", payloadSJ);
  let jawabanTiba = false;
  fetch(KR_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: KR_ID_TOKEN, action: "simpanPengiriman",
      payload: payloadSJ
    })
  })
  .then(function (r) { jawabanTiba = true; return r.json(); })
  .then(function (h) {
    rjdKunciLepas_("suratjalan");
    btn.disabled = false;
    btn.textContent = "Simpan Surat Jalan";
    if (!h || !h.success) { alert((h && h.error) || "Gagal menyimpan surat jalan."); return; }

    document.getElementById("kr-buat-sukses").innerHTML =
      '<div class="kr-sukses-isi">' +
        (h.sudahTercatat
          ? '<b>' + rjdEscapeHtml_(h.idPengiriman) + '</b> SUDAH tersimpan sebelumnya &#8212; kiriman tadi tidak membuat surat jalan kedua.'
          : '<b>' + rjdEscapeHtml_(h.idPengiriman) + '</b> tersimpan &#183; ' +
            h.totalQty + ' pcs (' + h.jumlahBaris + ' baris). Sisa kirim: <b>' + h.sisaSetelahIni + '</b>.') +
        (h.barisTanpaIdDetailOrder
          ? '<div class="kr-sukses-catat">' + h.barisTanpaIdDetailOrder +
            ' baris tidak punya ID Detail Order &#8212; harga di invoice nanti perlu diisi manual.</div>'
          : '') +
        '<a class="kr-cetak-btn" target="_blank" href="/p/cetak.html?jenis=suratjalan&amp;id=' +
          encodeURIComponent(h.idPengiriman) + '">Cetak Surat Jalan</a>' +
      '</div>';
    document.getElementById("kr-buat-sukses").classList.remove("hidden");
    // Daftar & rincian dua-duanya berubah -- dikosongkan supaya tidak
    // menampilkan sisa kirim yang sudah basi.
    window.KR_DAFTAR = null;
    krPilihPO(d.idPurchaseOrder);
  })
  .catch(function () {
    btn.disabled = false;
    btn.textContent = "Simpan Surat Jalan";
    // @P18-A: sebelum jawaban tiba keadaannya TIDAK DIKETAHUI -- permintaannya bisa sudah tercatat. Kuncinya
    // disimpan, jadi Simpan lagi dengan isian sama aman. Jawaban yang tiba tapi rusak (bukan JSON) juga belum pasti.
    alert((jawabanTiba ? "Jawaban server tidak terbaca" : "Jawaban server tidak sampai") +
      " -- surat jalan BELUM PASTI tersimpan.\n\n" +
      "Tekan Simpan lagi tanpa mengubah isian: kiriman ulang dari isian yang sama tidak membuat surat jalan kedua.");
  });
}

/* ============================================================
 * SET PO DI FORM SURAT JALAN (30 Okt 2026, butuh gs >= @427 -- set-po.js)
 * ============================================================
 * Order yang dijual per SET (261029/MCONX A33: Dress + Outer, harga per set) dicatat per potong. Panel ini:
 *   1. menampilkan & mengatur susunan set PO (rute simpanSetPO, bagian gudang -- yang membuat surat jalan);
 *   2. memperingatkan kalau qty anggota satu set tidak sama -- kertasnya akan mencetak sisanya per potong.
 * Pasangan warna memakai rjdSetPasanganWarna_ (simpro-global.js), aturan yang SAMA dengan cetakan, jadi
 * peringatan di sini dan isi kertas tidak berbeda pendapat. Payload gs lama (tanpa `set`) = panel tidak ada.
 * Susunan baru dimuat ulang dari server (satu bentuk kunci anggota: server), dan qty yang sudah diketik
 * dipulihkan -- menyimpan set tidak boleh menghapus isian surat jalan.
 */
function krSetPOCari_(d, setId){
  return (d && Array.isArray(d.set) ? d.set : []).filter(function (s) { return s.id === setId; })[0] || null;
}
function krKunciBaris_(b){ return b.idDetailOrder || [b.brand, b.artikel, b.style, b.warna, b.size].join("||"); }

/** Lencana di kepala grup baris: style ini anggota set mana. */
function krSetPOLencana_(d, b){
  const s = b && b.setId ? krSetPOCari_(d, b.setId) : null;
  return s ? ' <span class="kr-setpo-lencana">' + rjdEscapeHtml_(s.nama) + '</span>' : '';
}

/** Style unik PO ini (urutan baris form) + nama set-nya sekarang. */
function krSetPOItem_(d){
  const hasil = [], ada = {};
  (d.baris || []).forEach(function (b) {
    const k = [b.brand, b.artikel, b.style].join("||");
    if (ada[k]) return;
    ada[k] = true;
    const s = b.setId ? krSetPOCari_(d, b.setId) : null;
    hasil.push({ brand: b.brand || "", artikel: b.artikel || "", style: b.style || "", setNama: s ? s.nama : "" });
  });
  return hasil;
}

function krSetPOPanelHtml_(d){
  if (!d || !Array.isArray(d.set)) return "";   // gs < @427: fiturnya belum ada di server
  const daftar = d.set.length
    ? '<ul class="kr-setpo-daftar">' + d.set.map(function (s) {
        return '<li><b>' + rjdEscapeHtml_(s.nama) + '</b> = ' +
          rjdEscapeHtml_(s.anggota.map(function (a) { return a.style || a.deskripsi || "-"; }).join(" + ")) + '</li>';
      }).join("") + '</ul>'
    : '<p class="kr-setpo-info">Belum ada set. Kalau beberapa style di PO ini dijual sebagai satu set (mis. Dress + Outer), ' +
      'atur di sini supaya surat jalan dan invoice tercetak per set.</p>';
  return '<div class="kr-setpo" id="kr-setpo">' +
    '<div class="kr-setpo-kepala"><b>Set</b>' +
      '<button type="button" class="kr-setpo-atur" id="kr-setpo-atur" onclick="krSetPOBuka()">Atur set</button></div>' +
    daftar +
    (d.setGalat ? '<p class="kr-setpo-galat">' + rjdEscapeHtml_(d.setGalat) + '</p>' : '') +
    '<div class="kr-setpo-hasil" id="kr-setpo-hasil"></div>' +
    '<div class="hidden" id="kr-setpo-editor"></div>' +
    '<div class="kr-setpo-cek" id="kr-setpo-cek"></div>' +
  '</div>';
}

function krSetPOBuka(){
  const d = window.KR_BUAT;
  const ed = document.getElementById("kr-setpo-editor");
  if (!d || !ed) return;
  const item = krSetPOItem_(d);
  window.KR_SETPO_ITEM = item;
  ed.innerHTML =
    '<p class="kr-setpo-info">Ketik <b>nama set yang sama</b> di style-style yang dijual sebagai satu set. ' +
      'Kosongkan style yang dijual sendiri. Data tetap per potong; yang berubah hanya cetakan surat jalan dan invoice.</p>' +
    '<datalist id="kr-setpo-nama">' + (d.set || []).map(function (s) {
      return '<option value="' + rjdEscapeHtml_(s.nama) + '"></option>'; }).join("") + '</datalist>' +
    '<table class="kr-setpo-tabel"><tbody>' + item.map(function (it, i) {
      return '<tr><td class="kr-setpo-style">' + rjdEscapeHtml_([it.artikel, it.style].filter(Boolean).join(" / ") || "-") + '</td>' +
        '<td class="kr-setpo-isian"><input type="text" class="kr-setpo-input" data-i="' + i + '" list="kr-setpo-nama" maxlength="60" ' +
          'placeholder="dijual sendiri" aria-label="Nama set" value="' + rjdEscapeHtml_(it.setNama) + '"/></td></tr>';
    }).join("") + '</tbody></table>' +
    '<div class="kr-setpo-tombol">' +
      '<button type="button" class="kr-setpo-simpan" id="kr-setpo-simpan" onclick="krSetPOSimpan()">Simpan set</button>' +
      '<button type="button" class="kr-setpo-batal" onclick="krSetPOBatal()">Batal</button></div>' +
    '<div class="kr-setpo-pesan" id="kr-setpo-pesan"></div>';
  ed.classList.remove("hidden");
  const atur = document.getElementById("kr-setpo-atur");
  if (atur) atur.classList.add("hidden");
}

function krSetPOBatal(){
  const ed = document.getElementById("kr-setpo-editor");
  if (ed) { ed.classList.add("hidden"); ed.innerHTML = ""; }
  const atur = document.getElementById("kr-setpo-atur");
  if (atur) atur.classList.remove("hidden");
}

/** Susunan dari isian editor: nama yang sama (abaikan huruf besar & spasi ganda) = satu set. */
function krSetPOSusun_(){
  const item = window.KR_SETPO_ITEM || [], grup = {}, urut = [];
  document.querySelectorAll(".kr-setpo-input").forEach(function (inp) {
    const it = item[Number(inp.getAttribute("data-i"))];
    const nama = String(inp.value || "").replace(/\s+/g, " ").trim();
    if (!it || !nama) return;
    const k = nama.toLowerCase();
    if (!grup[k]) { grup[k] = { nama: nama, anggota: [] }; urut.push(k); }
    grup[k].anggota.push({ brand: it.brand, artikel: it.artikel, style: it.style });
  });
  return urut.map(function (k) { return grup[k]; });
}

function krSetPOSimpan(){
  const d = window.KR_BUAT;
  const pesan = document.getElementById("kr-setpo-pesan");
  if (!d || !pesan || window.KR_SETPO_SIBUK) return;
  const set = krSetPOSusun_();
  const kurang = set.filter(function (s) { return s.anggota.length < 2; });
  if (kurang.length) {
    pesan.className = "kr-setpo-pesan galat";
    pesan.textContent = "Set " + kurang.map(function (s) { return '"' + s.nama + '"'; }).join(", ") +
      " baru berisi 1 style. Satu set butuh minimal 2 style: ketik nama yang sama di style pasangannya, atau kosongkan.";
    return;
  }
  const payload = { idPurchaseOrder: d.idPurchaseOrder, set: set };
  // Kunci terikat ISIAN (pola surat jalan, P18-A): jawaban hilang + Simpan lagi dengan isian sama = dikenali server.
  payload.idPermintaan = rjdKunciIsian_("setpo", { idPurchaseOrder: payload.idPurchaseOrder, set: set });
  window.KR_SETPO_SIBUK = true;
  const btn = document.getElementById("kr-setpo-simpan");
  if (btn) btn.disabled = true;
  pesan.className = "kr-setpo-pesan";
  pesan.textContent = "Menyimpan...";
  let jawabanTiba = false;
  fetch(KR_API_URL, { method: "POST",
    body: JSON.stringify({ idToken: KR_ID_TOKEN, action: "simpanSetPO", payload: payload }) })
  .then(function (r) { jawabanTiba = true; return r.json(); })
  .then(function (h) {
    window.KR_SETPO_SIBUK = false;
    rjdKunciLepas_("setpo");   // server MENJAWAB (berhasil atau menolak): kunci tidak lagi dibutuhkan
    if (!h || !h.success) {
      if (btn) btn.disabled = false;
      pesan.className = "kr-setpo-pesan galat";
      pesan.textContent = (h && h.error) || "Set gagal disimpan.";
      return;
    }
    window.KR_SETPO_PESAN = h.tidakBerubah ? "Tidak ada perubahan: susunan set sama dengan yang tersimpan." :
      (h.sudahTercatat ? "Set ini SUDAH tersimpan sebelumnya; kiriman ulang tidak menyimpan dua kali." :
        (set.length ? "Set tersimpan. Surat jalan dan invoice PO ini kini tercetak per set." :
          "Semua set PO ini dihapus. Cetakan kembali per potong."));
    krSetPOMuatUlang_();
  })
  .catch(function (e) {
    window.KR_SETPO_SIBUK = false;
    if (btn) btn.disabled = false;
    pesan.className = "kr-setpo-pesan galat";
    // Sebelum jawaban tiba keadaannya TIDAK DIKETAHUI -- kuncinya sengaja disimpan, Simpan lagi itu aman.
    pesan.textContent = (jawabanTiba ? "Jawaban server tidak terbaca" : "Jawaban server tidak sampai") +
      " -- set BELUM PASTI tersimpan. Tekan Simpan set lagi tanpa mengubah isian: kiriman ulang dikenali, tidak tersimpan dua kali.";
  });
}

/** Muat ulang form dari server (setId per baris ditempel server), qty yang sudah diketik diingat. */
function krSetPOMuatUlang_(){
  const d = window.KR_BUAT;
  if (!d) return;
  const nilai = {};
  document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
    const b = d.baris[Number(inp.dataset.i)];
    if (b && inp.value !== "") nilai[krKunciBaris_(b)] = inp.value;
  });
  window.KR_QTY_SIMPAN = { po: d.idPurchaseOrder, nilai: nilai };
  krPilihPO(d.idPurchaseOrder, window.KR_IZIN_LEBIH);
}

/** Dipanggil krRenderFormKirim: pulihkan qty yang diketik sebelum set disimpan + tampilkan hasil simpan set. */
function krSetPOPulihkan_(d){
  const qs = window.KR_QTY_SIMPAN;
  window.KR_QTY_SIMPAN = null;
  if (qs && d && qs.po === d.idPurchaseOrder) {
    document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
      const b = d.baris[Number(inp.dataset.i)];
      const v = b ? qs.nilai[krKunciBaris_(b)] : undefined;
      if (v !== undefined) inp.value = v;
    });
  }
  const el = document.getElementById("kr-setpo-hasil");
  if (el && window.KR_SETPO_PESAN) el.textContent = window.KR_SETPO_PESAN;
  window.KR_SETPO_PESAN = null;
}

/**
 * Peringatan set tidak lengkap dari qty yang SEDANG diketik. Tidak memblokir: kiriman bertahap per potong itu
 * sah, tapi tidak boleh terjadi tanpa sengaja (krSimpanPengiriman meminta konfirmasi). Kembali: jumlah peringatan.
 */
function krSetPOCek_(){
  const d = window.KR_BUAT, el = document.getElementById("kr-setpo-cek");
  if (!el) return 0;
  if (!d || !Array.isArray(d.set) || !d.set.length) { el.innerHTML = ""; return 0; }
  const isi = {};
  document.querySelectorAll(".kr-kirim-qty").forEach(function (inp) {
    const b = d.baris[Number(inp.dataset.i)];
    const v = Number(inp.value) || 0;
    if (!b || !b.setId || v <= 0) return;
    const s = krSetPOCari_(d, b.setId);
    if (!s || !(b.setAnggota >= 0 && b.setAnggota < s.anggota.length)) return;
    const g = isi[s.id] || (isi[s.id] = s.anggota.map(function () { return []; }));
    g[b.setAnggota].push({ warna: String(b.warna || "").trim() || "-", size: String(b.size || "").trim() || "-", q: v });
  });
  const awas = [], ok = [];
  d.set.forEach(function (s) {
    const g = isi[s.id];
    if (!g) return;
    const nama = s.anggota.map(function (a) { return a.style || a.deskripsi || "-"; });
    const pasang = rjdSetPasanganWarna_(g.map(function (arr) { return arr.map(function (x) { return x.warna; }); }));
    if (!pasang) {
      const absen = nama.filter(function (n, i) { return !g[i].length; });
      awas.push(s.nama + ": " + (absen.length ? absen.join(", ") + " belum diisi" : "warna anggotanya tidak bisa dipasangkan") +
        ", jadi akan tercetak per potong, bukan per set.");
      return;
    }
    const sel = g.map(function () { return {}; });
    g.forEach(function (arr, i) {
      arr.forEach(function (x) {
        const baris = pasang(i, x.warna);
        if (baris === null) { awas.push(s.nama + ": " + nama[i] + " " + x.warna + " " + x.size + " " + x.q + " pcs tanpa pasangan warna."); return; }
        const kk = baris + "||" + x.size;
        sel[i][kk] = (sel[i][kk] || 0) + x.q;
      });
    });
    const semua = [];
    sel.forEach(function (m) { Object.keys(m).forEach(function (k) { if (semua.indexOf(k) === -1) semua.push(k); }); });
    let jumlahSet = 0;
    semua.forEach(function (kk) {
      const qs = sel.map(function (m) { return m[kk] || 0; });
      const q = Math.min.apply(null, qs);
      jumlahSet += q;
      if (Math.max.apply(null, qs) !== q) {
        const bagian = kk.split("||");
        awas.push(s.nama + " " + (bagian[0] !== "-" ? bagian[0] + " " : "") + bagian[1] + ": " +
          nama.map(function (n, i) { return n + " " + qs[i]; }).join(", ") + ", jadi " + q + " set dan sisanya tercetak per potong.");
      }
    });
    if (jumlahSet) ok.push(s.nama + ": " + jumlahSet + " set");
  });
  el.innerHTML =
    (ok.length ? '<div class="kr-setpo-ok">Akan tercetak per set &#8212; ' + ok.map(rjdEscapeHtml_).join(" &#183; ") + '</div>' : '') +
    (awas.length ? '<ul class="kr-setpo-awas">' + awas.map(function (t) { return '<li>' + rjdEscapeHtml_(t) + '</li>'; }).join("") + '</ul>' : '');
  return awas.length;
}

function krSetupTombolGoogle(){
  if(typeof google === "undefined" || !google.accounts) return;
  google.accounts.id.initialize({
    client_id: KR_OAUTH_CLIENT_ID,
    callback: krHandleGoogleLogin
  });
  const wadah = document.getElementById("kr-google-btn");
  if(wadah) google.accounts.id.renderButton(wadah, { theme: "outline", size: "large", width: 260 });
}

window.onload = function(){
  krSetupTombolGoogle();
  document.addEventListener("click", function (e) {
    const wrap = document.getElementById("kr-buat-field");
    const dd = document.getElementById("kr-buat-dropdown");
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.add("hidden");
  });
  const token = krBacaSesi_();
  if(token){
    KR_ID_TOKEN = token;
    krMulai();
  } else {
    krShow("kr-login-box");
  }
};
