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

function krMulai(){
  krShow("kr-loading");
  ["kr-nav-logout", "kr-nav-refresh"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.classList.remove("hidden");
  });
  window.KR_DAFTAR = null;
  krMuat();
}

function krMuat(){
  if(window.KR_DAFTAR){ krRender(); return; }
  fetch(KR_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: KR_ID_TOKEN, action: "getDaftarPengiriman" })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    krShow("kr-isi");
    if(!d || !d.success){
      document.getElementById("kr-tabel").innerHTML =
        '<p style="font-size:12.5px;color:var(--thread)">' + rjdEscapeHtml_((d && d.error) || "Gagal memuat data.") + '</p>';
      return;
    }
    window.KR_DAFTAR = d.daftar || [];
    krRender();
  })
  .catch(function(){
    krShow("kr-isi");
    document.getElementById("kr-tabel").innerHTML =
      '<p style="font-size:12.5px;color:var(--thread)">Gagal menghubungi server.</p>';
  });
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
        '<td>' + rjdEscapeHtml_(p.namaKlien) + '</td>' +
        '<td class="num">' + (p.qtyOrder || 0) + '</td>' +
        '<td class="num">' + (p.terkirim || 0) + '</td>' +
        // Sisa NEGATIF berarti terkirim melebihi qty order -- bisa jadi kelebihan
        // kirim atau qty PO belum diperbarui. Ditandai supaya tidak lewat begitu saja.
        '<td class="num ' + (p.sisa > 0 ? 'kurang' : (p.sisa < 0 ? 'lebih' : '')) + '">' +
          (p.sisa === 0 ? '-' : (p.sisa > 0 ? p.sisa : '+' + Math.abs(p.sisa))) + '</td>' +
        '<td><div class="kr-bar"><div class="kr-bar-isi ' + kelasStatus + '" style="width:' + p.persen + '%"/></div>' +
          '<div class="kr-persen">' + p.persen + '%</div></td>' +
        '<td>' + rjdEscapeHtml_(p.deadline || "-") +
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
  return '<table class="kr-subtabel"><thead><tr>' +
      '<th>Tanggal</th><th>Artikel</th><th class="num">Jumlah</th>' +
      '<th>Jenis</th><th>Metode</th><th>Resi</th><th>Catatan</th>' +
    '</tr></thead><tbody>' +
    p.rincian.map(function(k){
      return '<tr>' +
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
  const token = krBacaSesi_();
  if(token){
    KR_ID_TOKEN = token;
    krMulai();
  } else {
    krShow("kr-login-box");
  }
};
