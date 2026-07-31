/**
 * ============================================================
 * SIMPRO -- simpro-order
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : order.html
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const OF_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const OF_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";


let OF_JALUR = null; // "existing" | "baru"
let OF_ID_TOKEN = null;
// CATATAN: OF_ITEM_COUNTER SUDAH dideklarasikan di blok JS GLOBAL (bareng
// komponen form order yang dipakai juga oleh modal Edit di Portal Klien).
// JANGAN dideklarasikan ulang di sini -- dua `let` dengan nama sama di dua
// <script> bikin SELURUH JS halaman ini gagal parse.

function ofPilihJalur(jalur){
  OF_JALUR = jalur;
  document.getElementById("of-step-pilih").classList.add("hidden");
  if(jalur === "existing"){
    document.getElementById("of-flow-existing").classList.remove("hidden");
  } else {
    document.getElementById("of-flow-baru").classList.remove("hidden");
    ofTampilkanFormUtama();
  }
}

function ofKembaliPilih(){
  OF_JALUR = null;
  document.getElementById("of-flow-existing").classList.add("hidden");
  document.getElementById("of-flow-baru").classList.add("hidden");
  document.getElementById("of-form-utama").classList.add("hidden");
  document.getElementById("of-step-pilih").classList.remove("hidden");
}

function ofTampilkanFormUtama(){
  document.getElementById("of-form-utama").classList.remove("hidden");
  if(document.getElementById("of-items-container").children.length === 0){
    ofTambahItem();
    // Halaman Form Order: daftar artikel tersimpan dimuat setelah klien
    // teridentifikasi (idKlien diisi jalur klien terdaftar / mode staff).
    if(typeof ofMuatMasterArtikel_ === "function"){
      ofMuatMasterArtikel_(typeof OF_ID_KLIEN_DIPILIH !== "undefined" ? (OF_ID_KLIEN_DIPILIH || null) : null);
    }
  }
}

function ofHandleGoogleLogin(response){
  OF_ID_TOKEN = response.credential;
  // Daftar artikel tersimpan butuh token -- saat halaman pertama dimuat token
  // belum ada, jadi dimuat ULANG di sini. Tanpa ini selektor "Isi dari artikel
  // tersimpan" tidak akan pernah muncul di halaman Form Order.
  setTimeout(function(){
    if(typeof ofMuatMasterArtikel_ === "function"){
      ofMuatMasterArtikel_(typeof OF_ID_KLIEN_DIPILIH !== "undefined" ? (OF_ID_KLIEN_DIPILIH || null) : null);
    }
  }, 0);
  try{
    const payload = JSON.parse(atob(response.credential.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    document.getElementById("of-login-email").textContent = payload.email || "";
  }catch(e){}
  document.getElementById("of-login-box").classList.add("hidden");
  document.getElementById("of-login-info").classList.remove("hidden");
  ofTampilkanFormUtama();
  // Cek apakah yang login STAFF -> kalau iya, munculkan mode "isi atas nama klien".
  ofCekStaff_();
}

// Kalau pengaju staff, tampilkan banner MODE STAFF + dropdown pilih klien.
// Klien biasa: nggak terjadi apa-apa (dropdown tetap tersembunyi).
var OF_IS_STAFF = false;
var OF_ID_KLIEN_DIPILIH = "";
function ofCekStaff_(){
  if(!OF_ID_TOKEN) return;
  fetch(OF_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: OF_ID_TOKEN, action: "cekStaffFormOrder" })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(!data || !data.staff) return;
    OF_IS_STAFF = true;
    const box = document.getElementById("of-staff-box");
    if(!box) return;
    const sel = document.getElementById("of-staff-klien");
    sel.innerHTML = '<option value="">-- Pilih klien yang diwakili --</option>' +
      (data.daftarKlien || []).map(function(k){
        return '<option value="' + k.id + '">' + (k.nama || k.id) + '</option>';
      }).join("");
    document.getElementById("of-staff-nama").textContent = data.staffNama || "Staff";
    box.classList.remove("hidden");
  })
  .catch(function(){ /* diamkan -- kalau gagal, form jalan normal sebagai klien */ });
}
function ofStaffPilihKlien(){
  OF_ID_KLIEN_DIPILIH = document.getElementById("of-staff-klien").value || "";
  // Daftar artikel tersimpan MILIK KLIEN -- begitu staff berganti klien,
  // daftarnya harus ikut berganti. Tanpa ini, artikel klien sebelumnya masih
  // terpajang dan bisa ter-autofill ke order klien yang salah.
  if(typeof ofMuatMasterArtikel_ === "function"){
    ofMuatMasterArtikel_(OF_ID_KLIEN_DIPILIH || null);
  }
}

function ofLogoutRingan(){
  OF_ID_TOKEN = null;
  OF_IS_STAFF = false;
  OF_ID_KLIEN_DIPILIH = "";
  var sb = document.getElementById("of-staff-box");
  if(sb) sb.classList.add("hidden");
  document.getElementById("of-login-info").classList.add("hidden");
  document.getElementById("of-login-box").classList.remove("hidden");
  document.getElementById("of-form-utama").classList.add("hidden");
}


// ---------- Submit ----------


function ofTampilkanError(pesan){
  const el = document.getElementById("of-submit-error");
  el.textContent = pesan;
  el.classList.remove("hidden");
}

async function ofSubmitOrder(){
  document.getElementById("of-submit-error").classList.add("hidden");
  const btn = document.getElementById("of-submit-btn");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  // Cek kelengkapan SEBELUM mengumpulkan -- item setengah jadi dulu dibuang
  // diam-diam di sini dan hilang tanpa pesan.
  const masalahItem = ofCekItemBelumLengkap_();
  if(masalahItem.length){
    ofTampilkanError("Ada item yang belum lengkap dan TIDAK akan tersimpan:\n\n- " + masalahItem.join("\n- "));
    btn.disabled = false;
    btn.textContent = "Kirim Order";
    return;
  }

  let items;
  try{
    items = await ofKumpulkanItemsAsync();
  }catch(errBaca){
    ofTampilkanError(errBaca.message || "Gagal membaca file.");
    btn.disabled = false;
    btn.textContent = "Kirim Order";
    return;
  }

  if(!items.length){
    ofTampilkanError("Isi minimal 1 item (Artikel & Warna wajib diisi) dengan minimal 1 ukuran.");
    btn.disabled = false;
    btn.textContent = "Kirim Order";
    return;
  }
  const adaQty = items.some(function(it){ return Object.keys(it.sizeQty).length > 0 || (it.detailAllSize && it.detailAllSize.trim() !== ""); });
  if(!adaQty){
    ofTampilkanError("Isi jumlah (qty) minimal untuk 1 ukuran di salah satu item.");
    btn.disabled = false;
    btn.textContent = "Kirim Order";
    return;
  }

  let fileLainnyaList = [];
  try{
    const fileLainnyaInput = document.getElementById("of-file-lainnya");
    fileLainnyaList = await ofBacaBanyakFileSebagaiBase64_(fileLainnyaInput ? fileLainnyaInput.files : null);
  }catch(errBaca2){
    ofTampilkanError(errBaca2.message || "Gagal membaca file.");
    btn.disabled = false;
    btn.textContent = "Kirim Order";
    return;
  }

  const payload = {
    tipeKlien: OF_JALUR === "existing" ? "Existing" : "Baru",
    targetTanggalKirim: document.getElementById("of-target-tanggal").value,
    jadwalKirim: ofKumpulkanJadwalKirim_("of-jadwal"),
    kainDariKlien: ofKumpulkanKainKlien_("of-kaink"),
    catatanKlien: document.getElementById("of-catatan").value.trim(),
    items: items,
    fileLainnyaList: fileLainnyaList
  };

  if(OF_JALUR === "existing"){
    if(!OF_ID_TOKEN){
      ofTampilkanError("Silakan login dengan Google terlebih dahulu.");
      btn.disabled = false;
      btn.textContent = "Kirim Order";
      return;
    }
    // Kalau yang login STAFF, dia WAJIB pilih klien yang diwakili dulu.
    if(OF_IS_STAFF && !OF_ID_KLIEN_DIPILIH){
      ofTampilkanError("Pilih dulu klien yang diwakili di bagian MODE STAFF.");
      btn.disabled = false;
      btn.textContent = "Kirim Order";
      return;
    }
  } else {
    payload.namaPerusahaanBaru = document.getElementById("of-nama-perusahaan").value.trim();
    payload.picBaru = document.getElementById("of-pic").value.trim();
    payload.noWaBaru = document.getElementById("of-wa").value.trim();
    payload.emailBaru = document.getElementById("of-email-baru").value.trim();
    if(!payload.namaPerusahaanBaru || !payload.noWaBaru){
      ofTampilkanError("Nama Perusahaan/Brand dan No WhatsApp wajib diisi.");
      btn.disabled = false;
      btn.textContent = "Kirim Order";
      return;
    }
  }

  btn.textContent = "Mengirim...";

  fetch(OF_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: OF_ID_TOKEN, action: "submitOrderRequest", payload: payload, idKlienDipilih: (OF_IS_STAFF ? OF_ID_KLIEN_DIPILIH : "") })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(!data.success){
      ofTampilkanError(data.error || "Gagal mengirim order. Coba lagi.");
      btn.disabled = false;
      btn.textContent = "Kirim Order";
      return;
    }
    document.getElementById("of-sukses-id").textContent = data.idOrderRequest;
    document.getElementById("of-app").querySelectorAll(":scope > div:not(#of-sukses)").forEach(function(el){
      el.classList.add("hidden");
    });
    document.getElementById("of-sukses").classList.remove("hidden");
    const hero = document.getElementById("of-hero");
    if(hero) hero.style.display = "none";
  })
  .catch(function(){
    ofTampilkanError("Gagal menghubungi server. Coba beberapa saat lagi.");
    btn.disabled = false;
    btn.textContent = "Kirim Order";
  });
}

/**
 * Baca token sesi Portal Klien (key localStorage "lp_session", di-set saat klien login di
 * Portal). Portal & halaman Order sama-sama di origin www.rjdapparel.id, jadi localStorage-
 * nya dibagi -- token bisa dibaca lintas halaman TANPA lewat URL (sengaja nggak lewat query
 * string: token di URL bocor ke log/history/referrer). Return null kalau nggak ada / udah
 * expired -> jatuh ke alur pilih jalur + login manual seperti biasa. Logika exp niru
 * lpGetCachedToken() di Portal, ditambah buffer 60 detik biar nggak mepet pas ngisi form.
 */
function ofBacaTokenPortal_(){
  try{
    const raw = localStorage.getItem("lp_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !data.token) return null;
    if(!data.exp || (data.exp * 1000) <= (Date.now() + 60000)) return null;
    return data.token;
  }catch(e){ return null; }
}

/**
 * Fast-path: kalau ada sesi Portal Klien yang masih valid, langsung masuk form sebagai
 * klien terdaftar -- lewati layar "pilih jalur" & login Google ulang (persis kondisi di
 * mana user udah login: form + banner "Login sebagai X / Ganti akun"). Ini MURNI pintasan
 * UX; backend tetap validasi idToken pas submit (submitOrderRequest), jadi nggak ada celah
 * keamanan -- token expired/palsu tetap ditolak server. Klien yang belum login / datang
 * dari luar (token null) tetap lihat layar pilih jalur seperti biasa. Tombol "Ganti akun"
 * (ofLogoutRingan) tetap jadi jalan keluar kalau mau pakai akun lain.
 */
function ofCobaAutoLoginPortal_(){
  const token = ofBacaTokenPortal_();
  if(!token) return false;
  OF_JALUR = "existing";
  OF_ID_TOKEN = token;
  // Login otomatis dari sesi tersimpan -- sama alasannya dengan di
  // ofHandleGoogleLogin: token baru tersedia di titik ini.
  setTimeout(function(){
    if(typeof ofMuatMasterArtikel_ === "function"){
      ofMuatMasterArtikel_(typeof OF_ID_KLIEN_DIPILIH !== "undefined" ? (OF_ID_KLIEN_DIPILIH || null) : null);
    }
  }, 0);
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    document.getElementById("of-login-email").textContent = payload.email || "";
  }catch(e){}
  document.getElementById("of-step-pilih").classList.add("hidden");
  document.getElementById("of-flow-existing").classList.remove("hidden");
  document.getElementById("of-login-box").classList.add("hidden");
  document.getElementById("of-login-info").classList.remove("hidden");
  ofTampilkanFormUtama();
  return true;
}

window.onload = function(){
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.initialize({
      client_id: OF_OAUTH_CLIENT_ID,
      callback: ofHandleGoogleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("of-google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }
  // Kalau user datang dari Portal Klien yang masih login (sesi lp_session valid), skip layar
  // pilih jalur + login ulang -> langsung ke form sebagai klien terdaftar. Dijalankan
  // SETELAH init tombol Google, biar tombolnya tetap siap kalau auto-login gagal / user
  // klik "Ganti akun".
  ofCobaAutoLoginPortal_();
  // Pasang auto-grow ke semua textarea .rjd-autogrow yang sudah ada di markup awal
  // (mis. Catatan Tambahan). Yang dinamis di-bind di dalam ofTambahItem.
  rjdBindAutoGrowAll(document);
};
