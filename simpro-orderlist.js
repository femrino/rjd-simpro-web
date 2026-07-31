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
function olMulai(){
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
      '<th>Deadline</th><th>Status</th><th>Asal</th><th>Cetak</th>' +
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

  // Kelas modal MENGIKUTI modal proofing yang sudah ada (lp-edit-overlay /
  // lp-edit-modal-head / lp-edit-modal-foot / om-btn). Sempat kupakai nama
  // karangan (lp-modal-overlay dst) yang tidak punya CSS sama sekali --
  // modalnya akan tampil tanpa gaya, melayang di tengah halaman.
  const overlay = document.createElement("div");
  overlay.className = "lp-edit-overlay";
  overlay.id = "db-editpo-overlay";
  overlay.innerHTML =
    '<div class="lp-edit-modal">' +
      '<div class="lp-edit-modal-head">' +
        '<div><div class="lp-edit-modal-title">Edit Order</div>' +
        '<div class="lp-edit-modal-sub">' + rjdEscapeHtml_(idPO) + '</div></div>' +
        '<button class="lp-edit-close" onclick="dbTutupEditPO()" type="button">&#10005;</button>' +
      '</div>' +
      '<div class="lp-edit-modal-body" id="db-editpo-body">' +
        '<p style="font-size:12.5px;color:var(--ink-soft)">Memuat...</p>' +
      '</div>' +
      '<div class="lp-edit-modal-foot">' +
        '<button class="om-btn" onclick="dbTutupEditPO()" type="button">Tutup</button>' +
        '<button class="om-btn om-btn-primary" id="db-editpo-simpan" onclick="dbSimpanEditPO()" type="button">Simpan Perubahan</button>' +
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

function dbRenderEditPO(d){
  const itemHtml = (d.itemGroups || []).map(function(it, n){
    const slot = it.slotKain || [];
    const sizeCols = it.sizeColumns || [];
    const kepala = '<tr><th class="of-th-warna">Warna</th>' +
      slot.map(function(sz){ return '<th class="of-th-kain">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      sizeCols.map(function(sz){ return '<th class="of-th-size">' + rjdEscapeHtml_(sz) + '</th>'; }).join("") +
      '<th class="of-th-size">Total</th>' +
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
    return '<div class="of-aks-wrap" style="margin-top:14px">' +
      '<div class="of-komposisi-lbl">ITEM ' + (n + 1) + ': ' + rjdEscapeHtml_(it.artikel) +
        (it.style ? ' &#183; ' + rjdEscapeHtml_(it.style) : '') + '</div>' +
      '<div class="of-matrix-wrap"><table class="of-matrix"><thead>' + kepala + '</thead><tbody>' + badan + '</tbody></table></div>' +
      '<button class="of-jadwal-add" onclick="dbTambahWarnaPO(this, ' + n + ')" type="button">+ Tambah Warna</button>' +
      (slot.length ? '' : '<div class="of-komposisi-hint">Artikel ini belum punya komposisi kain di Master Artikel, jadi kolom kode kain tidak muncul.</div>') +
    '</div>';
  }).join("");

  document.getElementById("db-editpo-body").innerHTML =
    '<div class="of-form-section">' +
      '<h4>Detail Pengiriman</h4>' +
      '<label style="display:block">Target Tanggal Kirim' +
        '<input id="db-editpo-deadline" type="date" value="' + rjdEscapeHtml_(d.deadlineIso || "") + '"/></label>' +
      '<div class="of-jadwal-wrap">' +
        '<div class="of-jadwal-lbl">Jadwal Kirim Bertahap</div>' +
        '<div id="db-editpo-jadwal"></div>' +
        '<button class="of-jadwal-add" onclick="ofTambahBarisJadwal_(\'db-editpo-jadwal\')" type="button">+ Tambah Tahap</button>' +
      '</div>' +
      '<div class="of-jadwal-wrap">' +
        '<div class="of-jadwal-lbl">Kain Dari Klien</div>' +
        '<div id="db-editpo-kaink"></div>' +
        '<button class="of-jadwal-add" onclick="ofTambahBarisKainKlien_(\'db-editpo-kaink\')" type="button">+ Tambah Kain</button>' +
      '</div>' +
      '<label style="display:block;margin-top:14px">Catatan Klien' +
        '<textarea class="rjd-autogrow" id="db-editpo-catatan" rows="3">' + rjdEscapeHtml_(d.catatanKlien || "") + '</textarea></label>' +
    '</div>' +
    itemHtml +
    '<p style="font-size:11.5px;color:var(--ink-soft);margin-top:14px">' +
      'Mengubah qty otomatis memperbarui Detail PO untuk order ini saja -- order lain tidak tersentuh. ' +
      'Menambah atau menghapus warna belum bisa dari sini; gunakan AppSheet, karena warna yang sudah punya catatan progres produksi perlu diperiksa dulu.' +
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
    const rapikan = function(x){ return String(x || "").trim().toLowerCase().replace(/\s+/g, " "); };
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

function dbSimpanEditPO(){
  const btn = document.getElementById("db-editpo-simpan");
  const statusEl = document.getElementById("db-editpo-status");
  btn.disabled = true;
  statusEl.textContent = "Menyimpan...";

  const bacaSize = function(tr){
    const o = {};
    tr.querySelectorAll(".dbep-qty").forEach(function(inp){ o[inp.dataset.size] = Number(inp.value) || 0; });
    return o;
  };
  const bacaKain = function(tr){
    return Array.prototype.slice.call(tr.querySelectorAll(".dbep-kain"))
      .map(function(inp){ return { slot: inp.dataset.slot || "", kode: (inp.value || "").trim() }; })
      .filter(function(b){ return b.slot && b.kode; });
  };

  const semua = Array.prototype.slice.call(document.querySelectorAll(".dbep-baris"));
  // Baris yang DITANDAI hapus tidak ikut dikirim sebagai perubahan biasa --
  // kalau ikut, backend akan menulis nilainya dulu lalu menghapus barisnya.
  const baris = semua
    .filter(function(tr){ return tr.dataset.baru !== "1" && !tr.classList.contains("dbep-dihapus"); })
    .map(function(tr){
      return {
        nomorBaris: Number(tr.dataset.baris) || 0,
        harga: Number(tr.querySelector(".dbep-harga").value) || 0,
        sizeQty: bacaSize(tr),
        bahan: bacaKain(tr)
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
        warnaBaru: warnaBaru
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
