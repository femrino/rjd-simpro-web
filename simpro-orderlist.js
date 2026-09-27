/**
 * ============================================================
 * SIMPRO -- simpro-orderlist
 * ============================================================
 * Halaman DAFTAR ORDER (order-list.html).
 *
 * Sebelumnya ini tab di dalam Dashboard, berbagi ruang dengan delapan tab lain
 * -- tabelnya sempit dan modal editnya terasa berdesakan. Dipindah ke halaman
 * sendiri supaya punya lebar penuh untuk kolom, filter, dan form edit.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan Dashboard (localStorage "db_session"):
 * login sekali di salah satunya, halaman lain langsung masuk. Kalau dibuat
 * kunci sendiri, staff harus login dua kali tanpa alasan yang jelas.
 *
 * DIMUAT DI : order-list.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const OL_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const OL_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let OL_ID_TOKEN = null;

function olShow(id){
  ["ol-login-box", "ol-loading", "ol-error", "ol-isi"].forEach(function(x){
    const el = document.getElementById(x);
    if(el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if(t) t.classList.remove("hidden");
}

/** Sesi dibaca dari kunci yang SAMA dengan Dashboard -- lihat catatan di atas. */
function olBacaSesi_(){
  try{
    const raw = localStorage.getItem("db_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  }catch(e){ return null; }
}

function olSimpanSesi_(token){
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  }catch(e){}
}

function olHandleGoogleLogin(response){
  OL_ID_TOKEN = response.credential;
  olSimpanSesi_(response.credential);
  olMulai();
}

function olLogout(){
  OL_ID_TOKEN = null;
  try{ localStorage.removeItem("db_session"); }catch(e){}
  if(typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  ["ol-nav-logout", "ol-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.add("hidden");
  });
  olShow("ol-login-box");
}

/** Muat daftar setelah token tersedia. */
function olMulai() {
  // ---------- SATPAM HALAMAN (Lapis 2, 6 Agustus 2026) ----------
  // Isi lama fungsi ini dipindah UTUH ke olMulaiIsi_ di bawah; yang berubah cuma
  // ada gerbang di depannya. Login Google berhasil untuk email siapa pun --
  // itu bukti kepemilikan email, bukan bukti hak masuk. Tanpa gerbang ini,
  // klien yang tahu URL halaman ini melihat seluruh kerangkanya.
  //
  // Dibungkus `typeof`: kalau simpro-global.js gagal dimuat (jsDelivr mati),
  // halaman WAJIB tetap jalan. Kehilangan satpam jauh lebih ringan daripada
  // seluruh halaman staff mati serentak -- dan backend (pastikanBoleh_ di
  // akses-role.gs) tetap menolak datanya, jadi tidak ada yang bocor.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(OL_ID_TOKEN, OL_API_URL, olMulaiIsi_);
  } else {
    olMulaiIsi_();
  }
}

function olMulaiIsi_() {
  olShow("ol-loading");
  ["ol-nav-logout", "ol-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.remove("hidden");
  });
  // Paksa muat ulang -- halaman ini memang khusus daftar order.
  window.OL_DAFTAR_PO = null;
  dbMuatDaftarPO();
}

/** Muat ulang daftar dari server, dengan ikon berputar selama menunggu. */
function olRefresh(){
  const ikon = document.getElementById("ol-refresh-icon");
  if(ikon) ikon.classList.add("spinning");
  window.OL_DAFTAR_PO = null;
  olShow("ol-loading");
  dbMuatDaftarPO();
  // Ikon dihentikan setelah jeda pendek -- dbMuatDaftarPO tidak mengembalikan
  // promise, dan menambah callback ke sana berarti menyunting fungsi yang
  // dipakai bersama hanya demi animasi.
  setTimeout(function(){ if(ikon) ikon.classList.remove("spinning"); }, 1200);
}

function olSetupTombolGoogle(){
  if(typeof google === "undefined" || !google.accounts) return;
  google.accounts.id.initialize({
    client_id: OL_OAUTH_CLIENT_ID,
    callback: olHandleGoogleLogin
  });
  const wadah = document.getElementById("ol-google-btn");
  if(wadah) google.accounts.id.renderButton(wadah, { theme: "outline", size: "large", width: 260 });
}

// v383: modal Edit Order kini komponen BERSAMA di simpro-global.js (dipakai juga tab Orderan Berjalan di
// halaman produksi). Halaman ini cuma memasang sambungannya: API & token miliknya, dan apa yang dimuat
// ulang sesudah Simpan. idToken dibaca lewat FUNGSI karena OL_ID_TOKEN `let` yang terisi belakangan.
if (typeof rjdEditPOPasang === "function") rjdEditPOPasang({
  apiUrl: OL_API_URL, idToken: function () { return OL_ID_TOKEN; },
  sesudahSimpan: function () { window.OL_DAFTAR_PO = null; dbMuatDaftarPO(); }
});

window.onload = function(){
  olSetupTombolGoogle();
  const token = olBacaSesi_();
  if(token){
    OL_ID_TOKEN = token;
    olMulai();
  } else {
    olShow("ol-login-box");
  }
};

/* v228 -- SNAPSHOT LOKAL (Tipe B)
   Data terakhir yang berhasil dimuat digambar lebih dulu supaya halaman
   terpakai dalam < 1 detik, lalu diganti diam-diam oleh jawaban server.
   BENDERA di bawah adalah inti keamanannya: snapshot HANYA boleh tampil
   sebelum halaman ini pernah sekali pun menerima data segar. Sesudah itu --
   tombol Refresh, atau muat ulang sesudah menyimpan sesuatu -- menampilkan
   snapshot berarti memperlihatkan keadaan SEBELUM perubahan yang baru saja
   dibuat orang. Itu bukan lambat, itu salah. */
var OL_SUDAH_SEGAR = false;

function olIsiStatusPO_(){
  const statusUnik = [];
  (window.OL_DAFTAR_PO || []).forEach(function(p){
    if(p.status && statusUnik.indexOf(p.status) === -1) statusUnik.push(p.status);
  });
  const sel = document.getElementById("db-po-status");
  if(!sel) return;
  const lama = sel.value;
  sel.innerHTML = '<option value="">Semua status</option>' +
    statusUnik.sort().map(function(st){
      return '<option value="' + rjdEscapeHtml_(st) + '">' + rjdEscapeHtml_(st) + '</option>';
    }).join("");
  if(lama && statusUnik.indexOf(lama) !== -1) sel.value = lama;
}

function dbMuatDaftarPO(){
  if(window.OL_DAFTAR_PO && OL_SUDAH_SEGAR) { dbRenderDaftarPO(); return; }
  if(!OL_SUDAH_SEGAR && typeof rjdSnapshotBaca_ === "function"){
    const snap = rjdSnapshotBaca_("orderlist_po", 3 * 24 * 60);
    if(snap && Array.isArray(snap.data)){
      window.OL_DAFTAR_PO = snap.data;
      olShow("ol-isi");
      olIsiStatusPO_();
      dbRenderDaftarPO();
      if(typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("db-po-isi", snap.waktu);
    }
  }
  fetch(OL_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: OL_ID_TOKEN, action: "getDaftarPO" })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      olShow("ol-isi");
      document.getElementById("db-po-isi").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat daftar PO.") + '</p>';
      return;
    }
    window.OL_DAFTAR_PO = d.daftar || [];
    OL_SUDAH_SEGAR = true;
    if(typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("orderlist_po", window.OL_DAFTAR_PO);
    // WAJIB: olShow("ol-loading") menyembunyikan #ol-isi, dan #db-po-isi ada
    // DI DALAMNYA. Tanpa baris ini datanya termuat ke elemen tersembunyi --
    // halaman terlihat menggantung di "Memuat..." padahal sudah selesai.
    olShow("ol-isi");
    // Pilihan status diisi dari data NYATA, bukan daftar tetap -- supaya
    // status apa pun yang dipakai di AppSheet ikut muncul tanpa perlu
    // menyunting kode setiap kali ada status baru.
    olIsiStatusPO_();
    dbRenderDaftarPO();
    if(typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("db-po-isi");
  })
  .catch(function(){
    olShow("ol-isi");
    document.getElementById("db-po-isi").innerHTML =
      '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
  });
}

function dbRenderDaftarPO(){
  const wadah = document.getElementById("db-po-isi");
  if(!wadah) return;
  const semua = window.OL_DAFTAR_PO || [];
  const cari = (document.getElementById("db-po-cari").value || "").trim().toLowerCase();
  const fStatus = document.getElementById("db-po-status").value || "";
  const fSumber = document.getElementById("db-po-sumber").value || "";

  const hasil = semua.filter(function(p){
    if(fStatus && p.status !== fStatus) return false;
    if(fSumber && p.sumber !== fSumber) return false;
    if(!cari) return true;
    const teks = [p.idPurchaseOrder, p.idPesanan, p.noSO, p.namaKlien, (p.artikel || []).join(" ")]
      .join(" ").toLowerCase();
    return teks.indexOf(cari) !== -1;
  });

  if(!hasil.length){
    wadah.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft)">' +
      (semua.length ? "Tidak ada PO yang cocok dengan filter." : "Belum ada Purchase Order.") + '</p>';
    return;
  }

  wadah.innerHTML =
    '<div class="db-po-jumlah">' + hasil.length + ' dari ' + semua.length + ' PO</div>' +
    '<div class="db-po-tabelwrap"><table class="db-po-tabel"><thead><tr>' +
      '<th>PO</th><th>Klien</th><th>Artikel</th><th class="num">Qty</th>' +
      // v174: dua kolom terakhir DISEMBUNYIKAN SEKOLOM untuk peran tanpa area
      // "keuangan" -- header DAN selnya, supaya tabel tidak bergeser.
      //
      // v173 baru menyembunyikan tautannya, dan itu justru lebih buruk:
      // kolomnya tinggal separuh isi dengan titik pemisah menggantung, dan
      // pembacanya harus menebak apakah barisnya rusak atau memang begitu.
      // Kolom yang kosong untuk semua orang lebih baik tidak ada sama sekali.
      //
      // Kolom Cetak ikut disembunyikan walau SPK sebenarnya boleh dicetak staf
      // produksi (area "produksi"): halaman Orderan bagi mereka adalah tempat
      // MELIHAT, bukan bertindak, dan SPK tetap tersedia di dua tempat yang
      // memang tempat kerjanya -- Detail Order dan tab SPK & Rekap.
      '<th>Deadline</th><th>Status</th><th>Asal</th>' +
      '<th class="rjd-kolom-keuangan">Proforma</th>' +
      '<th class="rjd-kolom-keuangan">Cetak</th>' +
    '</tr></thead><tbody>' +
    hasil.map(function(p){
      const artikel = (p.artikel || []).length
        ? rjdEscapeHtml_(p.artikel.join(", "))
        : '<span class="db-po-kosong">belum ada rincian</span>';
      // SPK dicetak dari Rincian SO. Kalau PO belum punya barisnya, tautannya
      // dinonaktifkan -- lebih jujur daripada memberi tautan yang pasti gagal.
      const cetak = p.siapCetakSPK
        ? '<a href="/p/cetak.html?jenis=spk&amp;id=' + encodeURIComponent(p.idPurchaseOrder) + '" rel="noopener" target="_blank">SPK</a>' +
          (p.idOrderRequest
            ? ' &#183; <a href="/p/cetak.html?jenis=konfirmasiorder&amp;id=' + encodeURIComponent(p.idOrderRequest) + '" rel="noopener" target="_blank">Konfirmasi</a>'
            : '')
        : '<span class="db-po-kosong" title="PO ini belum punya baris di SD Rincian Sales Order">-</span>';

      // ---- Proforma ----
      // TIGA keadaan, dan ketiganya menampilkan hal yang berbeda. Tanpa
      // pembedaan ini, staf akan mengklik tautan cetak untuk PO yang belum
      // punya proforma dan melihat pesan galat -- jenis kegagalan yang
      // seharusnya tidak pernah sampai ke pengguna karena datanya sudah
      // diketahui sejak di daftar.
      //
      //   belum siap  -> tanda hubung (Rincian SO masih kosong)
      //   belum terbit-> tombol Terbitkan
      //   sudah terbit-> tautan cetak + nomornya
      let proforma;
      if (!p.siapCetakProforma) {
        proforma = '<span class="db-po-kosong" title="Isi dulu rincian warna &amp; size di SD Rincian Sales Order">-</span>';
      } else if (!p.idProforma) {
        proforma = '<a href="#" class="db-po-terbit rjd-aksi-keuangan" onclick="olTerbitkanProforma(\'' +
          rjdAttrJs_(p.idPurchaseOrder) + '\', false); return false;">Terbitkan</a>';
      } else {
        // TIDAK menampilkan indikator "nilai berubah" di sini, walau datanya
        // menggoda untuk ditambahkan. Perbandingannya butuh nilai order
        // SEKARANG, dan menghitungnya di daftar berarti aturan "berapa nilai
        // sebuah PO" hidup di dua tempat -- di sini dan di
        // bacaItemProformaDariRincianSO_. Dua tempat berarti suatu saat dua
        // jawaban. Peringatannya tetap ada, di dokumennya sendiri, tempat
        // angkanya memang dihitung.
        proforma = '<a href="/p/cetak.html?jenis=proforma&amp;id=' +
            encodeURIComponent(p.idProforma) + '" rel="noopener" target="_blank">Proforma</a>' +
          '<div class="db-po-sub"' +
            (p.kodeTerminProforma ? ' title="Termin ' + rjdEscapeHtml_(p.kodeTerminProforma) + '"' : '') + '>' +
            rjdEscapeHtml_(p.idProforma) +
            (p.versiProforma > 1 ? ' v' + p.versiProforma : '') +
          '</div>' +
          ' &#183; <a href="#" class="db-po-terbit rjd-aksi-keuangan" onclick="olTerbitkanProforma(\'' +
            rjdAttrJs_(p.idPurchaseOrder) + '\', true); return false;">Revisi</a>';
      }
      return '<tr>' +
        // ID PO sering berbentuk "260731/Pashmina Oval Bandana" -- nomor lalu
        // nama pesanan. Ditampilkan utuh dalam satu baris, kolomnya jadi sempit
        // dan teksnya membungkus per kata sampai berbaris ke bawah.
        // Dipecah di "/" PERTAMA: nomor tebal di atas, nama kecil di bawah.
        '<td>' + (function(){
          const teks = String(p.idPurchaseOrder || "");
          const garis = teks.indexOf("/");
          const nomor = garis === -1 ? teks : teks.slice(0, garis);
          const nama = garis === -1 ? "" : teks.slice(garis + 1).trim();
          return '<b class="db-po-nomor">' + rjdEscapeHtml_(nomor) + '</b>' +
            (nama ? '<div class="db-po-nama">' + rjdEscapeHtml_(nama) + '</div>' : '');
        })() +
          (p.noSO ? '<div class="db-po-sub">SO ' + rjdEscapeHtml_(p.noSO) + '</div>' : '') + '</td>' +
        '<td>' + rjdEscapeHtml_(p.namaKlien) + '</td>' +
        '<td>' + artikel + '</td>' +
        '<td class="num">' + (p.jumlah || 0) + '</td>' +
        '<td>' + rjdEscapeHtml_(p.deadline || "-") + '</td>' +
        '<td>' + rjdEscapeHtml_(p.status || "-") + '</td>' +
        '<td><span class="db-po-asal ' + (p.sumber === "form" ? "form" : "") + '">' +
          (p.sumber === "form" ? "Form Order" : "Langsung") + '</span></td>' +
        '<td class="db-po-cetak rjd-kolom-keuangan">' + proforma + '</td>' +
        '<td class="db-po-cetak rjd-kolom-keuangan">' + cetak +
          (p.siapCetakSPK
            // Kelas rjd-aksi-keuangan DIPERTAHANKAN walau kolomnya sudah
            // disembunyikan: dua lapis yang saling menopang, dan kalau kelak
            // kolom Cetak dibuka lagi untuk staf produksi (supaya bisa cetak
            // SPK dari sini), tautan Edit-nya tetap tertutup tanpa perlu
            // diingat lagi.
            ? ' &#183; <a class="rjd-aksi-keuangan" href="#" onclick="dbBukaEditPO(\'' + rjdAttrJs_(p.idPurchaseOrder) + '\'); return false;">Edit</a>'
            : '') + '</td>' +
      '</tr>';
    }).join("") +
    '</tbody></table></div>';
}

/**
 * ============ EDIT PO & RINCIAN SO DARI WEB (Tahap 1) ============
 * Supaya perubahan rutin tidak perlu membuka AppSheet.
 *
 * Yang bisa diubah SENGAJA dibatasi ke field yang TIDAK mengubah struktur
 * Detail PO: deadline, catatan klien, kain dari klien, jadwal bertahap, harga
 * per warna, dan kode kain per warna. Qty & tambah/hapus warna belum dibuka --
 * keduanya butuh regenerasi Detail PO dan pemeriksaan progres produksi dulu.
 */
/* NISAN v383 (27 Sep 2026): dbBukaEditPO .. dbSimpanEditPO (+ DBEP_SATUAN_*) PINDAH ke simpro-global.js
   supaya tab Orderan Berjalan di halaman produksi membuka modal yang SAMA. Halaman ini tinggal memasang
   sambungannya (rjdEditPOPasang di atas, dekat window.onload). Gerbang deklarasi kembar rilis-web.sh
   menolak salinan ganda lintas berkas, jadi blok lamanya dihapus, bukan dibiarkan. */

/**
 * ============================================================
 * TERBITKAN / REVISI PROFORMA
 * ============================================================
 * Satu-satunya tempat di frontend yang MEMBUAT nomor dokumen. Karena itu
 * dua hal ditegakkan di sini:
 *
 * 1. KONFIRMASI DULU. Nomor proforma tidak bisa ditarik kembali begitu
 *    dokumennya dikirim ke klien -- berbeda dari tombol lain di halaman ini
 *    yang efeknya bisa diperbaiki dengan mengedit ulang.
 *
 * 2. REVISI diberi peringatan yang BERBEDA & lebih tegas: dia menonaktifkan
 *    proforma lama. Kalau klien sudah memakai nomor lama untuk pencairan
 *    internal, itu perlu dikabari -- dan yang menekan tombol harus tahu itu
 *    sebelum menekannya, bukan sesudah.
 *
 * Backend (terbitkanProforma_) tetap punya penjaganya sendiri: staff-only,
 * LockService, dan penolakan kalau masih ada harga kosong. Konfirmasi di sini
 * murni supaya orang tidak menerbitkan karena salah klik.
 */
function olTerbitkanProforma(idPO, revisi){
  if(!idPO) return;

  const pesan = revisi
    ? "Terbitkan REVISI proforma untuk PO " + idPO + "?\n\n" +
      "Proforma yang lama akan ditandai \"Digantikan\" dan tidak bisa dicetak lagi.\n" +
      "Kalau klien sudah memakai nomor lama untuk pencairan, beri tahu mereka nomor barunya."
    : "Terbitkan proforma untuk PO " + idPO + "?\n\n" +
      "Nomor dokumen akan dibuat dan tidak bisa dibatalkan.";
  if(!window.confirm(pesan)) return;

  fetch(OL_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: OL_ID_TOKEN,
      action: "terbitkanProforma",
      idPurchaseOrder: idPO,
      revisi: !!revisi
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      // Pesan galat backend ditampilkan APA ADANYA, tidak diganti kalimat
      // umum. Penyebab tersering -- "sebagian item belum punya harga" --
      // justru sudah menyebutkan langkah perbaikannya; menggantinya dengan
      // "Gagal menerbitkan" akan membuang satu-satunya petunjuk yang berguna.
      window.alert((d && d.error) || "Gagal menerbitkan proforma.");
      return;
    }
    const hasil = d.data || {};
    if(hasil.baru === false){
      window.alert("PO ini sudah punya proforma " + hasil.idProforma +
        ".\nPakai tautan Proforma untuk mencetaknya, atau Revisi kalau nilainya berubah.");
    }
    // Daftar dimuat ulang supaya kolom Proforma langsung menampilkan nomornya.
    window.OL_DAFTAR_PO = null;
    dbMuatDaftarPO();
  })
  .catch(function(){
    window.alert("Gagal menghubungi server.");
  });
}
