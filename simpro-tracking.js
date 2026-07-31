/**
 * ============================================================
 * SIMPRO -- simpro-tracking
 * ============================================================
 * Diekstrak dari template Blogger supaya template tidak menembus batas 1 MB
 * dan supaya JavaScript-nya bisa di-cache browser antar halaman.
 *
 * DIMUAT DI : tracking.html
 * URUTAN    : simpro-global.js WAJIB dimuat lebih dulu -- file cabang memakai
 *             fungsi yang didefinisikan di sana.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const LP_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const LP_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

function lpShow(id){
  ["lp-login-box","lp-loading","lp-error","lp-results"].forEach(function(x){
    document.getElementById(x).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

let LP_ID_TOKEN = null; // disimpan supaya bisa re-fetch saat staff ganti pilihan klien di dropdown

/**
 * Cache token login ke localStorage biar refresh browser nggak perlu ngulang proses
 * Google Sign-In sama sekali (langsung reuse token yang masih berlaku, ~1 jam).
 * Ini SATU-SATUNYA mekanisme "tetap masuk pas refresh" — silent sign-in Google
 * (auto_select/prompt) udah dibuang, karena nggak reliable kalau ada 2+ akun Google
 * aktif di browser & berisiko tumpang tindih sama cache ini (2 lapis proses login bareng).
 */
function lpSaveToken(token){
  try{
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    localStorage.setItem("lp_session", JSON.stringify({ token: token, exp: payload.exp }));
  }catch(e){ /* kalau gagal parse, ya udah, nggak di-cache, nggak fatal */ }
}

function lpGetCachedToken(){
  try{
    const raw = localStorage.getItem("lp_session");
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data.exp || data.exp * 1000 <= Date.now()) return null; // udah expired
    return data.token;
  }catch(e){ return null; }
}

function lpClearCachedToken(){
  try{ localStorage.removeItem("lp_session"); }catch(e){}
}

function handleGoogleLogin(response){
  lpShow("lp-loading");
  LP_ID_TOKEN = response.credential;
  lpSaveToken(response.credential);
  fetchDashboard(null);
}

/**
 * Keluar dari Portal Klien. Hapus token cache + matiin auto sign-in Google
 * (biar refresh berikutnya BENERAN balik ke layar login, bukan langsung masuk lagi)
 * — penting buat kasus ganti akun di komputer/HP yang dipakai bareng.
 */
function lpLogout(){
  LP_ID_TOKEN = null;
  lpClearCachedToken();
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.disableAutoSelect();
  }
  const hero = document.getElementById("lp-hero");
  if(hero) hero.style.display = "";
  const navLogout = document.getElementById("lp-nav-logout");
  if(navLogout) navLogout.classList.add("hidden");
  const navRefresh = document.getElementById("lp-nav-refresh");
  if(navRefresh) navRefresh.classList.add("hidden");
  const navDash = document.getElementById("lp-nav-dashboard");
  if(navDash) navDash.classList.add("hidden");
  lpShow("lp-login-box");
}

function fetchDashboard(filterKlienId){
  fetch(LP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: LP_ID_TOKEN, filterKlienId: filterKlienId })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.error){
      lpClearCachedToken(); // token ditolak backend (bukan cuma expired) -> jangan dipakai lagi pas refresh berikutnya
      document.getElementById("lp-error-message").textContent = data.error;
      const navLogoutErr = document.getElementById("lp-nav-logout");
      if(navLogoutErr) navLogoutErr.classList.add("hidden");
      const navRefreshErr = document.getElementById("lp-nav-refresh");
      if(navRefreshErr) navRefreshErr.classList.add("hidden");
      const navDashErr = document.getElementById("lp-nav-dashboard");
      if(navDashErr) navDashErr.classList.add("hidden");
      lpShow("lp-error");
      return;
    }
    if(data.role === "internal" && !data.klienNama){
      renderInternalKlienPicker(data);
      return;
    }
    renderOrders(data);
  })
  .catch(function(){
    document.getElementById("lp-error-message").textContent = "Gagal menghubungi server. Coba beberapa saat lagi.";
    lpShow("lp-error");
  });
}

var LP_REFRESHING = false; // cegah klik dobel numpuk request bareng

/**
 * Refresh data TANPA reload browser -- dipanggil dari tombol ikon di nav bar
 * (sebelah tombol Keluar). Beda dari fetchDashboard() biasa (dipakai pas login/ganti
 * klien, yang selalu reset ke tab "Produksi" + filter "Aktif"): di sini tab
 * & filter yang lagi dibuka user DIINGAT dulu, terus dipulihkan lagi setelah render
 * ulang -- biar refresh nggak "melempar" user keluar dari tab yang lagi mereka lihat.
 * Kalau gagal (jaringan error dll), gagal diam-diam -- data lama yang udah kebuka
 * TETAP ditampilkan (nggak dilempar ke layar error penuh), cuma ikon tombol kasih
 * tanda merah sebentar, biar user nggak kehilangan konteks yang lagi dilihat.
 */
function lpRefreshData(){
  if(LP_REFRESHING) return;
  LP_REFRESHING = true;

  const btn = document.getElementById("lp-nav-refresh");
  const icon = document.getElementById("lp-refresh-icon");
  if(btn) btn.disabled = true;
  if(icon) icon.classList.add("spinning");

  const activeTabEl = document.querySelector(".lp-section-tab.active");
  const activeSection = activeTabEl ? activeTabEl.dataset.section : "produksi";
  const activeOrderToggle = document.querySelector("#lp-order-toggles .lp-toggle.active");
  const activeOrderFilter = activeOrderToggle ? activeOrderToggle.dataset.filter : "aktif";
  const activeShipToggle = document.querySelector("#lp-shipment-toggles .lp-toggle.active");
  const activeShipFilter = activeShipToggle ? activeShipToggle.dataset.filter : "semua";
  const activeInvToggle = document.querySelector("#lp-invoice-toggles .lp-toggle.active");
  const activeInvFilter = activeInvToggle ? activeInvToggle.dataset.filter : "semua";

  const selector = document.getElementById("lp-klien-selector");
  const currentKlienId = (selector && selector.value) ? selector.value : null;

  fetch(LP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: LP_ID_TOKEN, filterKlienId: currentKlienId })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.error){
      // Token beneran ditolak backend (misal akses dicabut) -- ini kasus yang wajar
      // dilempar ke layar error penuh, sama kayak fetchDashboard biasa.
      lpClearCachedToken();
      document.getElementById("lp-error-message").textContent = data.error;
      const navLogoutErr = document.getElementById("lp-nav-logout");
      if(navLogoutErr) navLogoutErr.classList.add("hidden");
      const navDashErr = document.getElementById("lp-nav-dashboard");
      if(navDashErr) navDashErr.classList.add("hidden");
      if(btn) btn.classList.add("hidden");
      lpShow("lp-error");
      return;
    }
    if(data.role === "internal" && !data.klienNama){
      renderInternalKlienPicker(data);
      return;
    }
    renderOrders(data);
    // Pulihkan tab & filter yang lagi dibuka user sebelum refresh
    switchSectionTab(activeSection);
    const orderBtn = document.querySelector("#lp-order-toggles .lp-toggle[data-filter='" + activeOrderFilter + "']");
    if(orderBtn) orderBtn.click();
    const shipBtn = document.querySelector("#lp-shipment-toggles .lp-toggle[data-filter='" + activeShipFilter + "']");
    if(shipBtn) shipBtn.click();
    const invBtn = document.querySelector("#lp-invoice-toggles .lp-toggle[data-filter='" + activeInvFilter + "']");
    if(invBtn) invBtn.click();
    lpUpdateLastRefreshed();
  })
  .catch(function(){
    // Gagal diam-diam -- kasih tanda merah sebentar di ikon, bukan nutup data yang lagi kebuka.
    if(btn){
      btn.classList.add("nav-icon-btn--error");
      btn.title = "Gagal refresh, coba lagi";
      setTimeout(function(){
        btn.classList.remove("nav-icon-btn--error");
        btn.title = "Refresh data";
      }, 3000);
    }
  })
  .finally(function(){
    LP_REFRESHING = false;
    if(btn) btn.disabled = false;
    if(icon) icon.classList.remove("spinning");
  });
}

function lpUpdateLastRefreshed(){
  const el = document.getElementById("lp-last-updated");
  if(!el) return;
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  el.textContent = "Terakhir diperbarui " + jam;
}

/**
 * Staff internal baru login, belum pilih klien -> tampilkan dropdown pemilih
 * memakai area lp-results (sembunyikan section dashboard sampai klien dipilih).
 */
function renderInternalKlienPicker(data){
  const bar = document.getElementById("lp-internal-bar");
  bar.classList.remove("hidden");
  const navDash = document.getElementById("lp-nav-dashboard");
  if(navDash) navDash.classList.remove("hidden");
  document.getElementById("lp-staff-nama").textContent = data.staffNama;

  const selector = document.getElementById("lp-klien-selector");
  selector.innerHTML = "<option value=''>— Pilih klien untuk dilihat —</option>" +
    data.daftarKlien.map(function(k){
      return "<option value='" + k.id + "'>" + k.nama + "</option>";
    }).join("");

  selector.onchange = function(){
    if(!selector.value) return;
    lpShow("lp-loading");
    fetchDashboard(selector.value);
  };

  // Dukungan tautan langsung: /p/tracking.html?klien=Nooha
  // Dipakai tombol "Buka Detail" di Dashboard, supaya staff tetap bisa lompat
  // ke satu klien dalam 1 klik setelah tab "Detail Klien" di dashboard dihapus
  // (tab itu duplikat murni dari portal ini).
  // Dicocokkan case-insensitive & di-trim biar nama dari URL yang beda kapital
  // atau kena spasi tetap ketemu. Kalau nggak ketemu, dropdown dibiarkan
  // kosong seperti biasa -- staff tinggal pilih manual, bukan error.
  try{
    var klienDariUrl = new URLSearchParams(window.location.search).get("klien");
    if(klienDariUrl){
      var target = String(klienDariUrl).trim().toLowerCase();
      var cocok = data.daftarKlien.filter(function(k){
        return String(k.id).trim().toLowerCase() === target;
      })[0];
      if(cocok){
        selector.value = cocok.id;
        lpShow("lp-loading");
        fetchDashboard(cocok.id);
      }
    }
  }catch(e){ /* URL aneh -- abaikan, jangan sampai nge-block halaman */ }

  // tampilkan bar dropdown, tapi sembunyikan dulu section dashboard sampai klien dipilih
  document.getElementById("lp-results").classList.remove("hidden");
  document.querySelectorAll("#lp-results > *:not(#lp-internal-bar)").forEach(function(el){
    el.style.display = "none";
  });
}

function renderOrders(data){
  lpUpdateLastRefreshed();
  const hero = document.getElementById("lp-hero");
  if(hero) hero.style.display = "none";

  // Munculkan lagi semua section dashboard (kalau sebelumnya disembunyikan oleh renderInternalKlienPicker)
  document.querySelectorAll("#lp-results > *").forEach(function(el){
    el.style.display = "";
  });

  if(data.role === "internal"){
    const bar = document.getElementById("lp-internal-bar");
    bar.classList.remove("hidden");
    const navDash = document.getElementById("lp-nav-dashboard");
    if(navDash) navDash.classList.remove("hidden");
    document.getElementById("lp-staff-nama").textContent = data.staffNama;

    const selector = document.getElementById("lp-klien-selector");
    selector.innerHTML = data.daftarKlien.map(function(k){
      return "<option value='" + k.id + "'" + (k.id === data.klienIdAktif ? " selected" : "") + ">" + k.nama + "</option>";
    }).join("");
    selector.onchange = function(){
      if(!selector.value) return;
      lpShow("lp-loading");
      fetchDashboard(selector.value);
    };
  }

  // Tombol Keluar & Refresh di nav bar — 1 lokasi konsisten buat mode internal maupun klien biasa.
  const navLogout = document.getElementById("lp-nav-logout");
  if(navLogout) navLogout.classList.remove("hidden");
  const navRefresh = document.getElementById("lp-nav-refresh");
  if(navRefresh) navRefresh.classList.remove("hidden");

  // Isi konten (nama klien, 3 sub-tab) -- FUNGSI BERSAMA, sama persis yang dipakai
  // tab "Detail Klien" di Dashboard. Lihat komentar di definisinya (bagian script global).
  lpRenderKlienData(data);
  lpSetupFilterPeriode(data); // isi dropdown periode & simpan data mentah buat filter

  lpShow("lp-results");
}

setupToggleGroup("lp-shipment-toggles", function(filterVal){
  renderShipments(window.LP_SHIPMENTS || [], filterVal);
});

setupToggleGroup("lp-order-toggles", function(filterVal){
  renderOrderList(window.LP_ORDERS || [], filterVal);
});

setupToggleGroup("lp-invoice-toggles", function(filterVal){
  renderInvoices(window.LP_INVOICES || [], filterVal);
});

setupToggleGroup("lp-orderan-toggles", function(filterVal){
  renderOrderanList(window.LP_ORDERAN || [], filterVal);
});

document.querySelectorAll(".lp-detail-tab").forEach(function(tab){
  tab.addEventListener("click", function(){
    switchSectionTab(tab.dataset.section);
  });
});

window.onload = function(){
  // Selalu siapkan tombol Google Sign-In DULUAN, apapun kondisinya — biar tombolnya selalu
  // ada & siap dipakai kapan pun layar login ditampilkan (termasuk nanti abis klik Keluar).
  // Sebelumnya ini di-skip kalau ada cache, akibatnya kotak login jadi kosong tanpa tombol
  // begitu user logout, karena tombolnya emang belum pernah di-render sama sekali.
  if(typeof google !== "undefined" && google.accounts){
    google.accounts.id.initialize({
      client_id: LP_OAUTH_CLIENT_ID,
      callback: handleGoogleLogin
    });
    google.accounts.id.renderButton(
      document.getElementById("google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with" }
    );
  }

  const cachedToken = lpGetCachedToken();
  if(cachedToken){
    // Ada token masih berlaku di cache -> langsung masuk tanpa perlu klik tombol.
    // Ini satu-satunya mekanisme "tetap masuk pas refresh" yang dipakai sekarang —
    // auto_select/prompt() Google udah dibuang karena berisiko tumpang tindih (2 lapis UI
    // Google nongol bareng), dan nggak reliable juga kalau ada 2+ akun Google aktif di browser.
    LP_ID_TOKEN = cachedToken;
    lpShow("lp-loading");
    fetchDashboard(null);
  }
  // Nggak ada cache (login pertama kali, atau abis Keluar, atau cache udah expired)
  // -> biarin default state (lp-login-box udah kelihatan dari markup), tombol udah siap dipakai.
};
