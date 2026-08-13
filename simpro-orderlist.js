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

function dbMuatDaftarPO(){
  if(window.OL_DAFTAR_PO) { dbRenderDaftarPO(); return; }
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
    // WAJIB: olShow("ol-loading") menyembunyikan #ol-isi, dan #db-po-isi ada
    // DI DALAMNYA. Tanpa baris ini datanya termuat ke elemen tersembunyi --
    // halaman terlihat menggantung di "Memuat..." padahal sudah selesai.
    olShow("ol-isi");
    // Pilihan status diisi dari data NYATA, bukan daftar tetap -- supaya
    // status apa pun yang dipakai di AppSheet ikut muncul tanpa perlu
    // menyunting kode setiap kali ada status baru.
    const statusUnik = [];
    window.OL_DAFTAR_PO.forEach(function(p){
      if(p.status && statusUnik.indexOf(p.status) === -1) statusUnik.push(p.status);
    });
    const sel = document.getElementById("db-po-status");
    if(sel) sel.innerHTML = '<option value="">Semua status</option>' +
      statusUnik.sort().map(function(st){
        return '<option value="' + rjdEscapeHtml_(st) + '">' + rjdEscapeHtml_(st) + '</option>';
      }).join("");
    dbRenderDaftarPO();
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
      '<th>Deadline</th><th>Status</th><th>Asal</th><th>Proforma</th><th>Cetak</th>' +
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
        proforma = '<a href="#" class="db-po-terbit" onclick="olTerbitkanProforma(\'' +
          rjdEscapeHtml_(p.idPurchaseOrder).replace(/'/g, "") + '\', false); return false;">Terbitkan</a>';
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
          ' &#183; <a href="#" class="db-po-terbit" onclick="olTerbitkanProforma(\'' +
            rjdEscapeHtml_(p.idPurchaseOrder).replace(/'/g, "") + '\', true); return false;">Revisi</a>';
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
        '<td class="db-po-cetak">' + proforma + '</td>' +
        '<td class="db-po-cetak">' + cetak +
          (p.siapCetakSPK
            ? ' &#183; <a href="#" onclick="dbBukaEditPO(\'' + rjdEscapeHtml_(p.idPurchaseOrder).replace(/'/g, "") + '\'); return false;">Edit</a>'
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
function dbBukaEditPO(idPO){
  const lama = document.getElementById("db-editpo-overlay");
  if(lama) lama.remove();

  // Kelas modal memakai komponen BERSAMA .rjd-modal-* yang didefinisikan di
  // simpro-global.css -- satu-satunya berkas CSS yang dimuat di SEMUA halaman.
  //
  // Sebelumnya dipakai .lp-edit-* dan .om-btn, mengikuti modal proofing di
  // Portal Klien. Kelasnya benar ada, tapi cuma di simpro-tracking.css dan
  // simpro-omset.css -- dua berkas yang TIDAK dimuat di order-list.html.
  // Cabang <b:if> Blogger terisolasi penuh secara CSS, jadi meminjam nama
  // kelas dari halaman lain berarti meminjam sesuatu yang tidak ada di sini.
  //
  // Akibatnya modal ini tetap dibuat dan ditempel ke <body>, tapi tanpa
  // position:fixed -- mendarat di bawah ratusan baris tabel, sementara
  // body.style.overflow = "hidden" di bawah bikin halamannya membeku. Dari
  // sisi pemakai: tombol Edit terlihat mati. Tidak ada error, tidak ada
  // gejala, jadi tidak ada yang melaporkannya sampai 6 Agustus 2026.
  const overlay = document.createElement("div");
  overlay.className = "rjd-modal-overlay";
  overlay.id = "db-editpo-overlay";
  overlay.innerHTML =
    '<div class="rjd-modal">' +
      '<div class="rjd-modal-head">' +
        '<div><div class="rjd-modal-title">Edit Order</div>' +
        '<div class="rjd-modal-sub">' + rjdEscapeHtml_(idPO) + '</div></div>' +
        '<button class="rjd-modal-close" onclick="dbTutupEditPO()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="rjd-modal-body" id="db-editpo-body">' +
        '<p style="font-size:12.5px;color:var(--ink-soft)">Memuat...</p>' +
      '</div>' +
      '<div class="rjd-modal-foot">' +
        '<button class="rjd-btn" onclick="dbTutupEditPO()" type="button">Tutup</button>' +
        '<button class="rjd-btn rjd-btn-primary" id="db-editpo-simpan" onclick="dbSimpanEditPO()" type="button">Simpan Perubahan</button>' +
        '<span id="db-editpo-status" style="margin-left:10px;font-size:12.5px;color:var(--ink-soft)"></span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  window.OL_EDITPO_ID = idPO;

  fetch(OL_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: OL_ID_TOKEN, action: "getPOUntukEdit", idPurchaseOrder: idPO })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      document.getElementById("db-editpo-body").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat data PO.") + '</p>';
      return;
    }
    window.OL_EDITPO_DATA = d;
    dbRenderEditPO(d);
  })
  .catch(function(){
    document.getElementById("db-editpo-body").innerHTML =
      '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
  });
  return false;
}

function dbTutupEditPO(){
  const ov = document.getElementById("db-editpo-overlay");
  if(ov) ov.remove();
  document.body.style.overflow = "";
}

/**
 * Panel data yang berlaku UNTUK ORDER INI SAJA.
 * Rumahnya SD Rincian Sales Order, per baris warna. Diisi per ITEM lalu
 * ditulis ke semua baris warna item itu -- di lapangan catatan model & size
 * chart memang milik style, bukan milik warna.
 */
function dbPanelOrderHtml_(it, n){
  var w0 = (it.warnaList || [])[0] || {};
  var sizes = it.sizeColumns || [];
  var thSize = sizes.map(function(sz){
    return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>';
  }).join("");
  var scBaris = (w0.sizeChart || []).map(function(x){ return dbBarisSizeChartHtml_(x, sizes); }).join("");
  return '<div class="of-form-section dbep-panel dbep-panel-order" data-item="' + n + '">' +
    '<h4>Berlaku untuk ORDER INI saja</h4>' +
    '<label style="display:block">Catatan Item / Detail Model' +
      '<textarea class="rjd-autogrow dbep-catatan-item" rows="2" placeholder="misal: kerah tegak, saku bobok, jahitan rantai">' +
        rjdEscapeHtml_(w0.catatanItem || "") + '</textarea></label>' +
    '<div class="of-komposisi-wrap" style="margin-top:14px">' +
      '<div class="of-komposisi-lbl">Size Chart Custom</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-sc-tabel">' +
        '<thead><tr><th class="of-th-kmp-nama">Ukuran</th>' + thSize + '<th></th></tr></thead>' +
        '<tbody class="dbep-sc-order">' + scBaris + '</tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="dbTambahSizeChartOrder(this)" type="button">+ Tambah Ukuran</button>' +
      '<div class="of-komposisi-hint">Kosongkan kalau memakai standar artikel.</div>' +
    '</div>' +
    '<div class="of-komposisi-hint">Kode kain per warna diisi di tabel Warna di atas &#8212; itu juga milik order ini.</div>' +
  '</div>';
}

/** Baca tabel size chart -> [{nama, perSize:{S:"100",...}}] */
function dbBacaSizeChart_(panel, selektorTbody){
  const tb = panel.querySelector(selektorTbody);
  if(!tb) return [];
  return Array.prototype.slice.call(tb.querySelectorAll(".dbep-sc-baris"))
    .map(function(tr){
      const perSize = {};
      tr.querySelectorAll(".dbep-sc-nilai").forEach(function(inp){
        const v = (inp.value || "").trim();
        if(v) perSize[inp.dataset.size] = v;
      });
      return { nama: (tr.querySelector(".dbep-sc-nama").value || "").trim(), perSize: perSize };
    })
    .filter(function(x){ return x.nama; });
}

function dbTambahSizeChartOrder(btn){
  var wrap = btn.closest(".of-komposisi-wrap");
  var tb = wrap.querySelector(".dbep-sc-order");
  if(!tb) return;
  var sizes = Array.prototype.slice.call(wrap.querySelectorAll("thead th.of-th-size"))
    .map(function(th){ return th.textContent.trim(); });
  tb.insertAdjacentHTML("beforeend", dbBarisSizeChartHtml_({}, sizes));
}

/**
 * Panel data yang berlaku untuk ARTIKEL -- LINTAS ORDER.
 *
 * Dipisah secara visual dari panel di atasnya karena akibatnya berbeda:
 * mengubah aksesoris di sini ikut ke semua order yang memakai artikel yang
 * sama. Tanpa pemisahan, orang akan menyunting satu order dan tanpa sadar
 * mengubah artikel yang dipakai order lain.
 *
 * Peringatan HANYA muncul kalau artikel dipakai lebih dari satu order.
 * Mayoritas artikel cuma dipakai sekali -- memperingatkan di situ hanya
 * melatih orang mengabaikan peringatan.
 */
function dbPanelArtikelHtml_(it, n){
  var a = it.artikelData || {};
  var dipakai = Number(it.jumlahOrderPakaiArtikel) || 1;

  var peringatan = dipakai > 1
    ? '<div class="dbep-warn">Artikel ini dipakai <b>' + dipakai + ' order</b>. ' +
      'Perubahan di panel ini ikut ke semuanya, termasuk order yang sudah selesai.</div>'
    : '';

  var belumTerdaftar = !a.adaMaster
    ? '<div class="of-komposisi-hint">Artikel ini belum terdaftar di Master Artikel, ' +
      'jadi isian di sini belum bisa disimpan. Setujui order lewat Form Order untuk mendaftarkannya.</div>'
    : '';

  // Kolom size mengikuti size yang DIPAKAI item ini -- sama dengan tabel Warna
  // di atasnya, supaya keduanya terbaca sebagai satu sistem.
  var sizes = it.sizeColumns || [];
  var thSize = sizes.map(function(sz){
    return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>';
  }).join("");

  var kmpBaris = (a.komposisiKain || []).map(function(k){ return dbBarisKomposisiHtml_(k, sizes); }).join("");
  var aksBaris = (a.aksesoris || []).map(function(x){ return dbBarisAksesorisHtml_(x); }).join("");
  var scBaris = (a.sizeChart || []).map(function(x){ return dbBarisSizeChartHtml_(x, sizes); }).join("");

  return '<div class="of-form-section dbep-panel dbep-panel-artikel" data-item="' + n + '" ' +
      'data-idartikel="' + rjdEscapeHtml_(it.idArtikel || "") + '">' +
    '<h4>Berlaku untuk ARTIKEL &#183; semua order</h4>' +
    peringatan + belumTerdaftar +
    '<div class="of-komposisi-wrap">' +
      '<div class="of-komposisi-lbl">Komposisi Kain</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-kmp-tabel">' +
        '<thead><tr><th class="of-th-kmp-nama">Kain</th><th class="of-th-kmp-kons">Konsumsi/pcs</th>' +
          '<th class="of-th-kmp-satuan">Satuan</th>' + thSize + '<th></th></tr></thead>' +
        '<tbody class="dbep-kmp">' + kmpBaris + '</tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="dbTambahKomposisi(this)" type="button">+ Tambah Kain</button>' +
      '<div class="of-komposisi-hint">Kolom per ukuran opsional &#8212; isi kalau konsumsi kainnya ' +
        'beda tiap size. Kalau kosong, angka Konsumsi/pcs yang dipakai. ' +
        'Nama kain di sini jadi kolom kode kain di tabel Warna setelah modal dibuka ulang.</div>' +
    '</div>' +
    '<div class="of-aks-wrap" style="margin-top:14px">' +
      '<div class="of-komposisi-lbl">Aksesoris</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix">' +
        '<thead><tr><th class="of-th-kmp-nama">Nama</th><th class="of-th-kmp-kons">Qty/pcs</th>' +
          '<th class="of-th-kmp-satuan">Satuan</th><th class="of-th-kmp-nama">Keterangan</th><th></th></tr></thead>' +
        '<tbody class="dbep-aks">' + aksBaris + '</tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="dbTambahAksesoris(this)" type="button">+ Tambah Aksesoris</button>' +
    '</div>' +
    '<div class="of-komposisi-wrap" style="margin-top:14px">' +
      '<div class="of-komposisi-lbl">Size Chart</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix of-sc-tabel">' +
        '<thead><tr><th class="of-th-kmp-nama">Ukuran</th>' + thSize + '<th></th></tr></thead>' +
        '<tbody class="dbep-sc">' + scBaris + '</tbody>' +
      '</table></div>' +
      '<button class="of-jadwal-add" onclick="dbTambahSizeChart(this)" type="button">+ Tambah Ukuran</button>' +
      '<div class="of-komposisi-hint">Ukuran jadi standar artikel ini. Kalau order ini butuh ukuran ' +
        'berbeda dari standar, isi di panel ORDER INI di atas.</div>' +
    '</div>' +
    '<label style="display:block;margin-top:14px">Catatan Produksi' +
      '<textarea class="rjd-autogrow dbep-catatan-produksi" rows="2" placeholder="instruksi tetap untuk artikel ini">' +
        rjdEscapeHtml_(a.catatanProduksi || "") + '</textarea></label>' +
    '<div class="of-jadwal-wrap" style="margin-top:14px">' +
      '<div class="of-jadwal-lbl">Gambar Desain</div>' +
      (a.urlGambarDesain
        ? '<div class="dbep-desain-grid">' +
            (String(a.urlGambarDesain).split(";").map(function(u){
              u = u.trim();
              if(!u) return "";
              return dbThumbDesainHtml_(u);
            }).filter(function(x){ return x; }).join("")) +
          '</div>'
        : '<div class="of-komposisi-hint">Belum ada gambar desain.</div>') +
      '<input accept="image/*" class="dbep-desain-file" multiple="multiple" type="file" style="margin-top:8px"/>' +
      '<div class="of-komposisi-hint">Pilih gambar untuk DITAMBAHKAN. Gambar lama tidak terhapus. ' +
        'Maksimal 8MB per file.</div>' +
      '<label style="display:block;margin-top:10px">atau tempel tautan' +
        '<input class="dbep-url-desain" placeholder="https://..." type="text" value="' +
          rjdEscapeHtml_(a.urlGambarDesain || "") + '"/></label>' +
    '</div>' +
  '</div>';
}

/** Satuan jadi PILIHAN, bukan teks bebas -- "yds"/"yard"/"Yds" pernah masuk
 *  sebagai tiga satuan berbeda dan merusak penjumlahan kebutuhan kain begitu
 *  direkap lintas order. Daftar diambil dari form order supaya sama persis. */
const DBEP_SATUAN_KAIN = ["yds", "m", "kg", "roll", "pcs"];
const DBEP_SATUAN_AKS = ["pcs", "set", "m", "yds", "gr", "pack"];

function dbOpsiSatuan_(terpilih, daftar){
  return daftar.map(function(x){
    return '<option' + (String(terpilih || "").toLowerCase() === x ? ' selected="selected"' : '') +
      ' value="' + x + '">' + x + '</option>';
  }).join("");
}

/**
 * Thumbnail 1 gambar desain.
 *
 * Tautan Drive biasa (".../file/d/ID/view") TIDAK bisa dipakai langsung di
 * <img> -- yang keluar halaman HTML, bukan gambar. Perlu bentuk thumbnail:
 * https://drive.google.com/thumbnail?id=ID&sz=w400
 *
 * Kalau URL-nya bukan Drive (mis. tautan gambar biasa), dipakai apa adanya.
 * Kalau gambarnya gagal dimuat -- file dihapus, atau izin berubah jadi
 * terbatas -- onerror menggantinya dengan tautan teks, bukan ikon rusak.
 */
function dbThumbDesainHtml_(url){
  var idDrive = "";
  var m = String(url).match(/\/file\/d\/([^/]+)/) || String(url).match(/[?&]id=([^&]+)/);
  if(m) idDrive = m[1];
  var src = idDrive
    ? ("https://drive.google.com/thumbnail?id=" + encodeURIComponent(idDrive) + "&sz=w400")
    : url;
  return '<a class="dbep-thumb" href="' + rjdEscapeHtml_(url) + '" rel="noopener" target="_blank" ' +
      'title="Buka gambar di tab baru">' +
    '<img alt="desain" loading="lazy" onerror="dbThumbGagal_(this)" src="' + rjdEscapeHtml_(src) + '"/>' +
  '</a>';
}

/** Gambar tidak bisa dimuat -> ganti jadi tautan teks supaya tetap bisa dibuka. */
function dbThumbGagal_(img){
  var a = img.closest(".dbep-thumb");
  if(!a) return;
  a.classList.add("dbep-thumb-gagal");
  a.innerHTML = '<span>Gambar tidak bisa ditampilkan &#183; buka tautan</span>';
}

function dbBarisKomposisiHtml_(k, sizes){
  k = k || {};
  sizes = sizes || [];
  // Konsumsi PER SIZE: kain memang beda per size (XL jelas lebih boros dari S).
  // Kalau diisi, kebutuhan kain dihitung per size, bukan qty total x rata-rata.
  // Kolom "Konsumsi/pcs" tetap ada sebagai rata-rata untuk yang tidak merinci.
  const selPerSize = sizes.map(function(sz){
    const v = (k.perSize || {})[sz];
    return '<td class="of-td-kmp-sz"><input class="dbep-kmp-sz" data-size="' + rjdEscapeHtml_(sz) +
      '" min="0" placeholder="-" step="0.01" type="number" value="' + (v ? v : "") + '"/></td>';
  }).join("");

  return '<tr class="dbep-kmp-baris">' +
    '<td class="of-td-kmp-nama"><input class="dbep-kmp-nama" placeholder="mis. Brokat" type="text" value="' +
      rjdEscapeHtml_(k.nama || "") + '"/></td>' +
    '<td class="of-td-kmp-kons"><input class="dbep-kmp-kons" min="0" placeholder="0" step="0.01" type="number" value="' +
      (k.konsumsi ? k.konsumsi : "") + '"/></td>' +
    '<td class="of-td-kmp-satuan"><select class="dbep-kmp-satuan">' +
      dbOpsiSatuan_(k.satuan || "yds", DBEP_SATUAN_KAIN) + '</select></td>' +
    selPerSize +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="dbHapusBarisPanel(this)" type="button">&#10005;</button></td>' +
  '</tr>';
}

/**
 * Baris Size Chart: nama ukuran x nilai per size.
 * Strukturnya {nama, perSize} -- sama dengan serialisasiSizeChart_ di backend.
 * Versi sebelumnya memakai textarea "M = LD 100" yang bentuknya TIDAK cocok
 * dengan struktur itu, jadi datanya tidak akan pernah terbaca kembali dengan
 * benar.
 */
function dbBarisSizeChartHtml_(sc, sizes){
  sc = sc || {};
  sizes = sizes || [];
  const sel = sizes.map(function(sz){
    const v = (sc.perSize || {})[sz];
    return '<td class="of-td-sc-nilai"><input class="dbep-sc-nilai" data-size="' + rjdEscapeHtml_(sz) +
      '" placeholder="-" type="text" value="' + rjdEscapeHtml_(v || "") + '"/></td>';
  }).join("");
  return '<tr class="dbep-sc-baris">' +
    '<td class="of-td-sc-nama"><input class="dbep-sc-nama" placeholder="nama ukuran (mis. Lingkar Dada)" type="text" value="' +
      rjdEscapeHtml_(sc.nama || "") + '"/></td>' +
    sel +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="dbHapusBarisPanel(this)" type="button">&#10005;</button></td>' +
  '</tr>';
}

function dbBarisAksesorisHtml_(a){
  a = a || {};
  return '<tr class="dbep-aks-baris">' +
    '<td class="of-td-kmp-nama"><input class="dbep-aks-nama" placeholder="mis. Kancing" type="text" value="' +
      rjdEscapeHtml_(a.nama || "") + '"/></td>' +
    '<td class="of-td-kmp-kons"><input class="dbep-aks-qty" min="0" placeholder="0" step="0.01" type="number" value="' +
      (a.qtyPerPcs ? a.qtyPerPcs : "") + '"/></td>' +
    '<td class="of-td-kmp-satuan"><select class="dbep-aks-satuan">' +
      dbOpsiSatuan_(a.satuan || "pcs", DBEP_SATUAN_AKS) + '</select></td>' +
    '<td class="of-td-kmp-nama"><input class="dbep-aks-ket" placeholder="opsional" type="text" value="' +
      rjdEscapeHtml_(a.keterangan || "") + '"/></td>' +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="dbHapusBarisPanel(this)" type="button">&#10005;</button></td>' +
  '</tr>';
}

/**
 * Centang ukuran diubah -> tambah/hapus kolom size di tabel Warna item ini.
 *
 * Kolom ditambah dengan qty KOSONG, bukan langsung diisi: menambah ukuran
 * berarti "ukuran ini ada di order", bukan "ukuran ini sudah dipesan sekian".
 * Admin yang mengisi angkanya.
 *
 * Melepas centang MENGHAPUS kolomnya dari tabel -- qty-nya otomatis terkirim 0,
 * dan backend memeriksa keterikatan sebelum benar-benar menghapusnya.
 */
function dbUbahSize(cb){
  const kartu = cb.closest(".of-item-card");
  if(!kartu) return;
  const size = cb.dataset.size;
  const tabel = kartu.querySelector(".of-matrix");
  if(!tabel) return;

  if(cb.checked){
    // Sisipkan kolom BARU tepat sebelum kolom Total, mengikuti urutan
    // DBEP_SIZE_TERSEDIA supaya S/M/L/XL tetap berurutan.
    const urut = window.DBEP_SIZE_TERSEDIA || [];
    const posBaru = urut.indexOf(size);
    const thAda = Array.prototype.slice.call(
      tabel.querySelectorAll("thead th.of-th-size:not(.dbep-th-total)"));
    let sesudah = null;
    for(let i = 0; i < thAda.length; i++){
      if(urut.indexOf(thAda[i].textContent.trim()) > posBaru){ sesudah = thAda[i]; break; }
    }
    const th = document.createElement("th");
    th.className = "of-th-size";
    th.textContent = size;
    if(sesudah) sesudah.parentNode.insertBefore(th, sesudah);
    else {
      const thTotal = tabel.querySelector("thead th.dbep-th-total");
      if(thTotal) thTotal.parentNode.insertBefore(th, thTotal);
      else tabel.querySelector("thead tr").appendChild(th);
    }
    const idxKolom = Array.prototype.slice.call(tabel.querySelectorAll("thead th")).indexOf(th);
    tabel.querySelectorAll("tbody tr.dbep-baris").forEach(function(tr){
      const td = document.createElement("td");
      td.className = "of-td-size";
      td.innerHTML = '<input class="dbep-qty" data-size="' + size +
        '" min="0" oninput="dbHitungTotalBarisPO(this)" placeholder="0" type="number"/>';
      const anak = tr.children;
      if(idxKolom < anak.length) tr.insertBefore(td, anak[idxKolom]);
      else tr.appendChild(td);
    });
  } else {
    const thAda = Array.prototype.slice.call(tabel.querySelectorAll("thead th"));
    let idxKolom = -1;
    thAda.forEach(function(th, i){
      if(th.classList.contains("of-th-size") && !th.classList.contains("dbep-th-total") &&
         th.textContent.trim() === size) idxKolom = i;
    });
    if(idxKolom === -1) return;
    thAda[idxKolom].remove();
    tabel.querySelectorAll("tbody tr.dbep-baris").forEach(function(tr){
      if(tr.children[idxKolom]) tr.children[idxKolom].remove();
      const sisa = tr.querySelector(".dbep-qty");
      if(sisa) dbHitungTotalBarisPO(sisa);
    });
  }
}

function dbTambahKomposisi(btn){
  var wrap = btn.closest(".of-komposisi-wrap");
  var tb = wrap.querySelector(".dbep-kmp");
  if(!tb) return;
  var sizes = Array.prototype.slice.call(wrap.querySelectorAll("thead th.of-th-size"))
    .map(function(th){ return th.textContent.trim(); });
  tb.insertAdjacentHTML("beforeend", dbBarisKomposisiHtml_({}, sizes));
}

function dbTambahAksesoris(btn){
  var tb = btn.closest(".of-aks-wrap").querySelector(".dbep-aks");
  if(tb) tb.insertAdjacentHTML("beforeend", dbBarisAksesorisHtml_({}));
}

function dbTambahSizeChart(btn){
  var wrap = btn.closest(".of-komposisi-wrap");
  var tb = wrap.querySelector(".dbep-sc");
  if(!tb) return;
  // Kolom size dibaca dari header tabel supaya baris baru sejajar dengan
  // baris yang sudah ada -- jumlah kolomnya harus sama persis.
  var sizes = Array.prototype.slice.call(wrap.querySelectorAll("thead th.of-th-size"))
    .map(function(th){ return th.textContent.trim(); });
  tb.insertAdjacentHTML("beforeend", dbBarisSizeChartHtml_({}, sizes));
}

function dbHapusBarisPanel(btn){
  var tr = btn.closest("tr");
  if(tr) tr.remove();
}

/**
 * Daftar ukuran yang boleh dipilih. Diambil dari backend (RINCIAN_SO_SIZE_KOLOM)
 * supaya persis sama dengan kolom yang benar-benar ada di SD Rincian Sales
 * Order -- mengarang daftar sendiri di frontend akan menghasilkan ukuran yang
 * tidak punya kolom untuk ditulis.
 */
function dbRenderEditPO(d){
  window.DBEP_SIZE_TERSEDIA = d.sizeTersedia || [];
  const itemHtml = (d.itemGroups || []).map(function(it, n){
    const slot = it.slotKain || [];
    const sizeCols = it.sizeColumns || [];
    const kepala = '<tr><th class="of-th-warna">Warna</th>' +
      slot.map(function(sz){ return '<th class="of-th-kain">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      sizeCols.map(function(sz){ return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      // Kelas dbep-th-total dipakai dbUbahSize untuk MEMBEDAKAN kolom Total dari
      // kolom ukuran -- keduanya memakai of-th-size, dan tanpa penanda ini
      // kolom Total ikut terhitung sebagai ukuran lalu tersisipi/terhapus.
      '<th class="of-th-size dbep-th-total">Total</th>' +
      '<th class="of-th-kmp-kons">Harga/pcs</th><th></th></tr>';
    const badan = (it.warnaList || []).map(function(w){
      const kain = slot.map(function(namaSlot){
        const b = (w.bahan || []).filter(function(x){ return x.slot === namaSlot; })[0];
        return '<td class="of-td-kain"><input class="dbep-kain" data-slot="' + rjdEscapeHtml_(namaSlot) +
          '" placeholder="kode kain" type="text" value="' + rjdEscapeHtml_(b && b.kode ? b.kode : "") + '"/></td>';
      }).join("");
      // Qty per size KINI BISA DIEDIT. Perubahannya memicu regenerasi Detail PO
      // yang TERSCOPE ke PO ini saja -- lihat catatan di edit-po.gs.
      const selSize = sizeCols.map(function(sz){
        const v = (w.sizeQty || {})[sz] || "";
        return '<td class="of-td-size"><input class="dbep-qty" data-size="' + rjdEscapeHtml_(sz) +
          '" min="0" oninput="dbHitungTotalBarisPO(this)" type="number" value="' + v + '"/></td>';
      }).join("");
      return '<tr class="dbep-baris" data-baris="' + w.nomorBaris + '">' +
        '<th class="of-th-warna" style="text-align:left;font-weight:600">' + rjdEscapeHtml_(w.warna) + '</th>' +
        kain + selSize +
        '<td class="of-td-total dbep-total">' + (w.qty || 0) + '</td>' +
        '<td class="of-td-kmp-kons"><input class="dbep-harga" min="0" type="number" value="' + (w.harga || "") + '"/></td>' +
        // Tombol hapus DIKUNCI kalau warna itu sudah punya catatan progres
        // produksi -- menghapusnya membuat laporan produksi menunjuk data yang
        // tidak ada lagi. Alasannya ditulis di tooltip, bukan cuma disembunyikan.
        // Tombol hapus DIKUNCI sampai progres produksi selesai dibaca (rute
        // terpisah). Terkunci adalah keadaan AWAL yang aman -- kalau progres
        // gagal dimuat, tombolnya TETAP terkunci, bukan terbuka.
        '<td class="of-td-aksi dbep-aksi" data-warna="' + rjdEscapeHtml_(w.warna) + '">' +
          '<span class="dbep-kunci" title="Menunggu data progres produksi...">&#8987;</span>' +
        '</td>' +
      '</tr>';
    }).join("");
    // ---- Kartu ITEM: struktur SAMA PERSIS dengan ofTambahItem ----
    // Kelas of-item-card / of-item-head / of-item-grid / of-warna-wrap /
    // of-add-warna-btn semuanya sudah ada di simpro-global.css, jadi tersedia
    // di halaman ini tanpa menambah CSS. (Cabang <b:if> Blogger terisolasi
    // penuh secara CSS -- meminjam kelas dari file CSS halaman lain berarti
    // meminjam sesuatu yang tidak ada di sini. simpro-global.css aman karena
    // dimuat di semua cabang.)
    //
    // Brand/Artikel/Style BISA DIEDIT (sejak v31).
    //
    // Dulu dikunci karena dikira mengubahnya memutus tautan ID Detail Order.
    // Ternyata tidak: ID Detail Order = No SO + "-" + Size (lihat
    // generateDetailPurchaseOrderDariRincian_) -- tidak mengandung brand,
    // artikel, maupun style sama sekali. Detail PO punya kolom Brand/Artikel/
    // Style tersendiri yang tinggal diperbarui di baris yang sama, dan invoice
    // maupun surat jalan tetap menemukan barisnya.
    //
    // Yang MASIH dikunci: daftar ukuran. Menghapus size berarti menyatakan
    // barang yang mungkin sudah dijahit, ditagih, atau dikirim itu tidak pernah
    // dipesan -- dan itu perlu pengaman berlapis yang belum ada.
    // Ukuran: yang SUDAH dipakai bisa dilepas centangnya (= qty jadi 0), dan
    // ukuran lain bisa ditambahkan. Penguncian per (warna, size) menyusul lewat
    // dbMuatProgresWarna_ -- sampai datanya tiba, semua centang DIKUNCI. Aman
    // sebagai keadaan awal: lebih baik menolak perubahan yang sah daripada
    // mengizinkan yang berbahaya.
    const sizeAktifHtml =
      '<div class="of-size-cek dbep-size-cek" data-item="' + n + '">' +
        (window.DBEP_SIZE_TERSEDIA || []).map(function(sz){
          const dipakai = sizeCols.indexOf(sz) !== -1;
          return '<label class="of-size-cek-item"><input class="dbep-size-cb" ' +
            'data-size="' + rjdEscapeHtml_(sz) + '"' + (dipakai ? ' checked="checked"' : '') +
            ' disabled="disabled" onchange="dbUbahSize(this)" type="checkbox"/><span>' +
            rjdEscapeHtml_(sz) + '</span></label>';
        }).join("") +
      '</div>';

    return '<div class="of-item-card" style="margin-top:14px">' +
      '<div class="of-item-head"><b>ITEM #' + (n + 1) + '</b></div>' +
      '<div class="of-item-grid dbep-identitas" data-item="' + n + '" ' +
          'data-brand-awal="' + rjdEscapeHtml_(it.brand || "") + '" ' +
          'data-artikel-awal="' + rjdEscapeHtml_(it.artikel || "") + '" ' +
          'data-style-awal="' + rjdEscapeHtml_(it.style || "") + '">' +
        '<label>Brand<input class="dbep-brand" type="text" value="' + rjdEscapeHtml_(it.brand || "") + '"/></label>' +
        '<label>Artikel<input class="dbep-artikel" type="text" value="' + rjdEscapeHtml_(it.artikel || "") + '"/></label>' +
        '<label>Style<input class="dbep-style" type="text" value="' + rjdEscapeHtml_(it.style || "") + '"/></label>' +
      '</div>' +
      '<div class="of-komposisi-hint">Mengubah Brand/Artikel/Style memperbarui semua baris item ini, ' +
        'termasuk Detail PO. Nomor tagihan &amp; surat jalan tidak terpengaruh.</div>' +
      '<label style="display:block;font-size:12.5px;font-weight:600;color:var(--ink-soft);margin:14px 0 6px">Ukuran</label>' +
      sizeAktifHtml +
      '<div class="of-komposisi-hint dbep-size-hint">Memeriksa keterikatan ukuran...</div>' +
      '<div class="of-aks-wrap of-warna-wrap">' +
        '<div class="of-warna-lbl-baris">' +
          '<div class="of-komposisi-lbl">Warna &amp; Jumlah Order</div>' +
        '</div>' +
        '<div class="of-matrix-wrap"><table class="of-matrix"><thead>' + kepala + '</thead><tbody>' + badan + '</tbody></table></div>' +
        '<button class="of-add-warna-btn" onclick="dbTambahWarnaPO(this, ' + n + ')" type="button">+ Tambah Warna</button>' +
      '</div>' +
      (slot.length ? '' : '<div class="of-komposisi-hint">Artikel ini belum punya komposisi kain di Master Artikel, jadi kolom kode kain tidak muncul.</div>') +
      dbPanelOrderHtml_(it, n) +
      dbPanelArtikelHtml_(it, n) +
    '</div>';
  }).join("");

  // URUTAN DISAMAKAN dengan modal Edit Order Request & Proofing: ITEM dulu,
  // Detail Pengiriman di bawahnya. Sebelumnya terbalik -- dan itu satu-satunya
  // form di sistem yang urutannya berbeda, jadi orang yang terbiasa dengan Form
  // Order harus menyesuaikan diri tiap kali membuka modal ini.
  //
  // Label & teks bantuan juga disamakan kata per kata ("Jadwal Kirim Bertahap
  // (opsional -- ...)", "Kain Dari Klien (opsional -- ...)") supaya tidak
  // terbaca sebagai form yang berbeda.
  document.getElementById("db-editpo-body").innerHTML =
    itemHtml +
    '<div class="of-form-section" style="margin-top:4px">' +
      '<h4>Detail Pengiriman</h4>' +
      '<label style="display:block">Target Tanggal Kirim' +
        '<input id="db-editpo-deadline" type="date" value="' + rjdEscapeHtml_(d.deadlineIso || "") + '"/></label>' +
      '<div class="of-jadwal-wrap">' +
        '<div class="of-jadwal-lbl">Jadwal Kirim Bertahap (opsional -- isi kalau pengiriman dipecah)</div>' +
        '<div class="of-jadwal" id="db-editpo-jadwal"></div>' +
        '<button class="of-jadwal-add" onclick="ofTambahBarisJadwal_(\'db-editpo-jadwal\')" type="button">+ Tambah Tahap</button>' +
      '</div>' +
      '<div class="of-jadwal-wrap">' +
        '<div class="of-jadwal-lbl">Kain Dari Klien (opsional -- kain yang klien kirim ke RJD)</div>' +
        '<div id="db-editpo-kaink"></div>' +
        '<button class="of-jadwal-add" onclick="ofTambahBarisKainKlien_(\'db-editpo-kaink\')" type="button">+ Tambah Kain</button>' +
      '</div>' +
      '<label style="display:block;margin-top:14px">Catatan Tambahan' +
        '<textarea class="rjd-autogrow" id="db-editpo-catatan" rows="2">' + rjdEscapeHtml_(d.catatanKlien || "") + '</textarea></label>' +
    '</div>' +
    '<p style="font-size:11.5px;color:var(--ink-soft);margin-top:14px">' +
      'Mengubah qty otomatis memperbarui Detail PO untuk order ini saja -- order lain tidak tersentuh. ' +
      'Daftar ukuran belum bisa diubah dari sini &#8212; menghapus ukuran perlu pemeriksaan ' +
      'invoice &amp; surat jalan yang belum tersedia.' +
    '</p>';

  ofRenderJadwalKirim_("db-editpo-jadwal", d.jadwalKirim);
  ofRenderKainKlien_("db-editpo-kaink", d.kainDariKlien);
  dbMuatProgresWarna_(d.idPurchaseOrder);
  if(typeof rjdBindAutoGrowAll === "function") rjdBindAutoGrowAll(document.getElementById("db-editpo-body"));
}

/**
 * Muat progres produksi per warna, lalu buka kunci tombol hapus untuk warna
 * yang BELUM dikerjakan.
 *
 * Dipisah dari pemuatan form karena Archive_DailyReport besar (~150.000 baris)
 * -- menunggunya membuat seluruh form menggantung, padahal sebagian besar
 * suntingan (harga, deadline, kode kain) tidak membutuhkan data ini.
 */
function dbMuatProgresWarna_(idPO){
  const kunciSemua = function(pesan){
    document.querySelectorAll(".dbep-aksi").forEach(function(td){
      td.innerHTML = '<span class="dbep-kunci" title="' + pesan + '">&#128274;</span>';
    });
  };
  fetch(OL_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: OL_ID_TOKEN, action: "getProgresWarnaPO", idPurchaseOrder: idPO })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d || !d.success){
      kunciSemua("Progres produksi tidak bisa dipastikan, jadi warna tidak boleh dihapus.");
      return;
    }
    const progres = d.progres || {};
    const ikat = d.keterikatanSize || {};
    const rapikan = function(x){ return String(x || "").trim().toLowerCase().replace(/\s+/g, " "); };

    // ---- Buka kunci centang ukuran, per (warna, size) ----
    // Sebuah ukuran boleh dilepas hanya kalau TIDAK ADA satu warna pun yang
    // sudah terikat pada ukuran itu. Cukup satu warna terikat, ukurannya
    // dikunci -- melepasnya akan menghapus baris Detail PO untuk warna itu juga.
    if (ikat.__gagalBaca) {
      document.querySelectorAll(".dbep-size-hint").forEach(function(el){
        el.textContent = "Keterikatan ukuran tidak bisa dipastikan, jadi ukuran dikunci.";
      });
    } else {
      document.querySelectorAll(".dbep-size-cek").forEach(function(grup){
        const kartu = grup.closest(".of-item-card");
        const warnaItem = kartu
          ? Array.prototype.slice.call(kartu.querySelectorAll(".dbep-aksi"))
              .map(function(td){ return rapikan(td.dataset.warna || ""); })
              .filter(function(x){ return x; })
          : [];
        grup.querySelectorAll(".dbep-size-cb").forEach(function(cb){
          const sz = rapikan(cb.dataset.size);
          const alasan = [];
          warnaItem.forEach(function(w){
            const r = ikat[w + "|" + sz];
            if (r && r.terkunci) alasan.push(w + ": " + r.alasan);
          });
          if (cb.checked && alasan.length) {
            // Tetap disabled, tapi diberi tahu KENAPA -- "tidak bisa diklik"
            // tanpa alasan adalah cara tercepat membuat orang menduga sistemnya
            // rusak lalu mencari jalan pintas di spreadsheet.
            cb.title = "Tidak bisa dilepas: " + alasan.join("; ");
            cb.closest(".of-size-cek-item").classList.add("dbep-size-terkunci");
          } else {
            cb.disabled = false;
          }
        });
        const hint = kartu ? kartu.querySelector(".dbep-size-hint") : null;
        if (hint) {
          hint.textContent = "Centang untuk menambah ukuran, lepas untuk menghapusnya. " +
            "Ukuran yang sudah diproduksi, ditagih, atau dikirim tidak bisa dilepas.";
        }
      });
    }
    document.querySelectorAll(".dbep-aksi").forEach(function(td){
      if(td.dataset.warna === undefined) return; // baris baru -> lewati
      const p = progres[rapikan(td.dataset.warna)] || 0;
      td.innerHTML = (p > 0)
        ? '<span class="dbep-kunci" title="Tidak bisa dihapus: ' + p + ' pcs sudah dikerjakan produksi.">&#128274;</span>'
        : '<button class="of-warna-remove" onclick="dbHapusBarisPO(this)" title="Hapus warna ini" type="button">&#10005;</button>';
    });
  })
  .catch(function(){
    kunciSemua("Gagal memuat progres produksi -- warna tidak boleh dihapus.");
  });
}

/**
 * Tandai baris warna untuk DIHAPUS. Barisnya tidak langsung dibuang dari DOM
 * supaya keputusan ini bisa dibatalkan sebelum Simpan -- penghapusan data
 * produksi sebaiknya tidak terasa seperti klik biasa.
 */
function dbHapusBarisPO(btn){
  const tr = btn.closest(".dbep-baris");
  if(!tr) return;
  if(tr.dataset.baru === "1"){ tr.remove(); return; } // baris baru: buang saja
  const dihapus = tr.classList.toggle("dbep-dihapus");
  btn.innerHTML = dihapus ? "&#8634;" : "&#10005;";
  btn.title = dihapus ? "Batalkan penghapusan" : "Hapus warna ini";
  tr.querySelectorAll("input").forEach(function(i){ i.disabled = dihapus; });
}

/** Tambah baris warna BARU ke sebuah ITEM. */
function dbTambahWarnaPO(btn, idxItem){
  const wrap = btn.closest(".of-aks-wrap");
  const tbody = wrap.querySelector("tbody");
  const it = (window.OL_EDITPO_DATA.itemGroups || [])[idxItem];
  if(!it || !tbody) return;
  // Baris contoh dipakai backend untuk menyalin identitas ITEM (No SO, Brand,
  // Artikel, Style, ID Artikel) -- supaya warna baru masuk ke item yang SAMA,
  // bukan bikin item baru gara-gara beda satu huruf.
  const contoh = (it.warnaList && it.warnaList[0]) ? it.warnaList[0].nomorBaris : 0;
  if(!contoh){ alert("Tidak bisa menambah warna: item ini belum punya baris acuan."); return; }

  const slot = it.slotKain || [];
  const sizeCols = it.sizeColumns || [];
  const tr = document.createElement("tr");
  tr.className = "dbep-baris dbep-baru";
  tr.dataset.baru = "1";
  tr.dataset.contoh = contoh;
  tr.innerHTML =
    '<th class="of-th-warna" style="text-align:left"><input class="dbep-warna" placeholder="nama warna" type="text"/></th>' +
    slot.map(function(nm){
      return '<td class="of-td-kain"><input class="dbep-kain" data-slot="' + rjdEscapeHtml_(nm) + '" placeholder="kode kain" type="text"/></td>';
    }).join("") +
    sizeCols.map(function(sz){
      return '<td class="of-td-size"><input class="dbep-qty" data-size="' + rjdEscapeHtml_(sz) + '" min="0" oninput="dbHitungTotalBarisPO(this)" type="number"/></td>';
    }).join("") +
    '<td class="of-td-total dbep-total">0</td>' +
    '<td class="of-td-kmp-kons"><input class="dbep-harga" min="0" type="number"/></td>' +
    '<td class="of-td-aksi"><button class="of-warna-remove" onclick="dbHapusBarisPO(this)" title="Batal" type="button">&#10005;</button></td>';
  tbody.appendChild(tr);
}

/** Total qty 1 baris warna di form edit PO. */
function dbHitungTotalBarisPO(inp){
  const tr = inp.closest(".dbep-baris");
  if(!tr) return;
  let t = 0;
  tr.querySelectorAll(".dbep-qty").forEach(function(x){ t += Number(x.value) || 0; });
  const sel = tr.querySelector(".dbep-total");
  if(sel) sel.textContent = t;
}

async function dbSimpanEditPO(){
  if (identitas.length) {
    const rincian = identitas.map(function(x){
      return "  " + (x.artikelLama || "-") + " / " + (x.styleLama || "-") +
        "\n  menjadi: " + x.artikel + " / " + (x.style || "-");
    }).join("\n\n");
    if (!confirm("Identitas item akan diubah:\n\n" + rincian +
        "\n\nSemua baris item ini ikut berubah, termasuk Detail PO. Lanjutkan?")) {
      return;
    }
  }

  const btn = document.getElementById("db-editpo-simpan");
  const statusEl = document.getElementById("db-editpo-status");
  btn.disabled = true;
  statusEl.textContent = "Menyimpan...";

  const bacaSize = function(tr){
    // SEMUA ukuran yang tersedia dikirim, bukan cuma kolom yang tampil.
    // Ukuran yang centangnya dilepas dikirim EKSPLISIT sebagai 0 supaya
    // maksudnya jelas: "ukuran ini dihapus", bukan "ukuran ini kebetulan tidak
    // terbaca". Kalau hanya kolom yang tampil yang dikirim, satu bug render
    // saja sudah cukup untuk menghapus ukuran tanpa ada yang menyadari.
    const o = {};
    (window.DBEP_SIZE_TERSEDIA || []).forEach(function(sz){ o[sz] = 0; });
    tr.querySelectorAll(".dbep-qty").forEach(function(inp){
      o[inp.dataset.size] = Number(inp.value) || 0;
    });
    return o;
  };
  const bacaKain = function(tr){
    return Array.prototype.slice.call(tr.querySelectorAll(".dbep-kain"))
      .map(function(inp){ return { slot: inp.dataset.slot || "", kode: (inp.value || "").trim() }; })
      .filter(function(b){ return b.slot && b.kode; });
  };

  // ---- Data panel per ITEM ----
  // Catatan Item & Size Chart diisi sekali per item, lalu ditempelkan ke SEMUA
  // baris warna item itu -- di sheet rumahnya memang per baris, tapi di
  // lapangan isinya milik style, bukan milik warna.
  const panelOrder = {};
  document.querySelectorAll(".dbep-panel-order").forEach(function(p){
    panelOrder[p.dataset.item] = {
      catatanItem: (p.querySelector(".dbep-catatan-item") || {}).value || "",
      sizeChart: dbBacaSizeChart_(p, ".dbep-sc-order")
    };
  });

  // ---- Identitas item (Brand/Artikel/Style) ----
  // Hanya dikirim kalau BERUBAH. Kalau semua item dikirim apa adanya, backend
  // akan menulis ulang ratusan sel dengan nilai yang sama persis -- lambat, dan
  // membuat "Diedit Oleh" tercatat padahal tidak ada yang berubah.
  const identitas = [];
  document.querySelectorAll(".dbep-identitas").forEach(function(g){
    const brand = (g.querySelector(".dbep-brand").value || "").trim();
    const artikel = (g.querySelector(".dbep-artikel").value || "").trim();
    const style = (g.querySelector(".dbep-style").value || "").trim();
    if(brand === (g.dataset.brandAwal || "") &&
       artikel === (g.dataset.artikelAwal || "") &&
       style === (g.dataset.styleAwal || "")) return;
    identitas.push({
      item: g.dataset.item,
      brandLama: g.dataset.brandAwal || "", artikelLama: g.dataset.artikelAwal || "",
      styleLama: g.dataset.styleAwal || "",
      brand: brand, artikel: artikel, style: style
    });
  });

  // Artikel kosong = baris kehilangan identitasnya. Ditolak di sini supaya
  // isian yang sudah diketik tidak hilang gara-gara ditolak server.
  for (let i = 0; i < identitas.length; i++) {
    if (!identitas[i].artikel) {
      alert("Artikel tidak boleh kosong.");
      return;
    }
  }

  // ---- Data ARTIKEL (lintas order) ----
  // Hanya dikirim untuk artikel yang SUDAH terdaftar di Master Artikel.
  // Backend memperlakukan field yang tidak dikirim sebagai "jangan disentuh".
  const artikel = [];
  document.querySelectorAll(".dbep-panel-artikel").forEach(function(p){
    const idArtikel = p.dataset.idartikel || "";
    if(!idArtikel) return;
    artikel.push({
      idArtikel: idArtikel,
      komposisiKain: Array.prototype.slice.call(p.querySelectorAll(".dbep-kmp-baris"))
        .map(function(tr){
          return {
            nama: (tr.querySelector(".dbep-kmp-nama").value || "").trim(),
            konsumsi: Number(tr.querySelector(".dbep-kmp-kons").value) || 0,
            satuan: (tr.querySelector(".dbep-kmp-satuan").value || "yds").trim(),
            perSize: (function(){
              const o = {};
              tr.querySelectorAll(".dbep-kmp-sz").forEach(function(inp){
                const v = Number(inp.value);
                if(v > 0) o[inp.dataset.size] = v;
              });
              return o;
            })()
          };
        })
        .filter(function(k){ return k.nama; }),
      sizeChart: dbBacaSizeChart_(p, ".dbep-sc"),
      aksesoris: Array.prototype.slice.call(p.querySelectorAll(".dbep-aks-baris"))
        .map(function(tr){
          return {
            nama: (tr.querySelector(".dbep-aks-nama").value || "").trim(),
            qtyPerPcs: Number(tr.querySelector(".dbep-aks-qty").value) || 0,
            satuan: (tr.querySelector(".dbep-aks-satuan").value || "pcs").trim(),
            keterangan: (tr.querySelector(".dbep-aks-ket").value || "").trim()
          };
        })
        .filter(function(a){ return a.nama; }),
      catatanProduksi: (p.querySelector(".dbep-catatan-produksi") || {}).value || "",
      urlGambarDesain: (p.querySelector(".dbep-url-desain") || {}).value || "",
      // Diisi setelah upload -- lihat blok di bawah.
      fileDesainBaru: []
    });
  });

  // ---- Upload gambar desain ----
  // Dibaca jadi base64 di browser lalu dikirim bersama payload, memakai jalur
  // yang SAMA dengan Form Order (ofBacaBanyakFileSebagaiBase64_ ->
  // simpanBanyakFileKeDrive_). Tidak membangun jalur upload baru: satu jalur
  // yang sudah terbukti lebih baik daripada dua yang mirip.
  //
  // Gagal baca file TIDAK boleh membatalkan penyimpanan -- data teks jauh
  // lebih penting daripada lampiran. Dilaporkan, lalu lanjut.
  try {
    const panelArtikel = Array.prototype.slice.call(document.querySelectorAll(".dbep-panel-artikel"));
    for (let i = 0; i < panelArtikel.length; i++) {
      const inp = panelArtikel[i].querySelector(".dbep-desain-file");
      if (!inp || !inp.files || !inp.files.length) continue;
      const idArtikel = panelArtikel[i].dataset.idartikel || "";
      const target = artikel.filter(function(a){ return a.idArtikel === idArtikel; })[0];
      if (!target) continue;
      target.fileDesainBaru = await ofBacaBanyakFileSebagaiBase64_(inp.files);
    }
  } catch (errUp) {
    alert("Gambar gagal dibaca: " + (errUp.message || errUp) + "\n\nData teks tetap akan disimpan.");
  }

  const semua = Array.prototype.slice.call(document.querySelectorAll(".dbep-baris"));
  // Baris yang DITANDAI hapus tidak ikut dikirim sebagai perubahan biasa --
  // kalau ikut, backend akan menulis nilainya dulu lalu menghapus barisnya.
  const baris = semua
    .filter(function(tr){ return tr.dataset.baru !== "1" && !tr.classList.contains("dbep-dihapus"); })
    .map(function(tr){
      // Panel item dicari dari kartu ITEM tempat baris ini berada.
      const kartu = tr.closest(".of-item-card");
      const pan = kartu ? panelOrder[(kartu.querySelector(".dbep-panel-order") || {}).dataset ?
        kartu.querySelector(".dbep-panel-order").dataset.item : ""] : null;
      // Identitas ditempelkan ke tiap baris warna item ini -- di sheet,
      // Brand/Artikel/Style memang tersimpan per baris.
      const gid = kartu ? (kartu.querySelector(".dbep-identitas") || {}).dataset : null;
      const idn = gid ? identitas.filter(function(x){ return x.item === gid.item; })[0] : null;
      return {
        nomorBaris: Number(tr.dataset.baris) || 0,
        brand: idn ? idn.brand : undefined,
        artikel: idn ? idn.artikel : undefined,
        style: idn ? idn.style : undefined,
        harga: Number(tr.querySelector(".dbep-harga").value) || 0,
        sizeQty: bacaSize(tr),
        bahan: bacaKain(tr),
        catatanItem: pan ? pan.catatanItem : undefined,
        sizeChart: pan ? pan.sizeChart : undefined
      };
    });
  const hapusBaris = semua
    .filter(function(tr){ return tr.classList.contains("dbep-dihapus") && tr.dataset.baru !== "1"; })
    .map(function(tr){ return Number(tr.dataset.baris) || 0; });
  const warnaBaru = semua
    .filter(function(tr){ return tr.dataset.baru === "1"; })
    .map(function(tr){
      return {
        warna: (tr.querySelector(".dbep-warna").value || "").trim(),
        contohBaris: Number(tr.dataset.contoh) || 0,
        harga: Number(tr.querySelector(".dbep-harga").value) || 0,
        sizeQty: bacaSize(tr),
        bahan: bacaKain(tr)
      };
    })
    .filter(function(b){ return b.warna; });

  if(hapusBaris.length && !confirm(
      "Hapus " + hapusBaris.length + " warna dari order ini?\n\n" +
      "Baris yang dihapus tidak bisa dikembalikan dari sini.")){
    btn.disabled = false; statusEl.textContent = ""; return;
  }

  fetch(OL_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: OL_ID_TOKEN,
      action: "simpanEditPO",
      payload: {
        idPurchaseOrder: window.OL_EDITPO_ID,
        deadline: (document.getElementById("db-editpo-deadline").value || "").trim(),
        catatanKlien: document.getElementById("db-editpo-catatan").value,
        kainDariKlien: ofKumpulkanKainKlien_("db-editpo-kaink"),
        jadwalKirim: ofKumpulkanJadwalKirim_("db-editpo-jadwal"),
        baris: baris,
        hapusBaris: hapusBaris,
        warnaBaru: warnaBaru,
        artikel: artikel
      }
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    btn.disabled = false;
    if(d && d.success){
      statusEl.textContent = "Tersimpan.";
      // Daftar PO dimuat ulang supaya angka & deadline di tabel ikut segar.
      window.OL_DAFTAR_PO = null;
      dbMuatDaftarPO();
      setTimeout(dbTutupEditPO, 700);
    } else {
      statusEl.textContent = (d && d.error) || "Gagal menyimpan.";
    }
  })
  .catch(function(){
    btn.disabled = false;
    statusEl.textContent = "Gagal menghubungi server.";
  });
}


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
