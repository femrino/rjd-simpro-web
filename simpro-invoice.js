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
