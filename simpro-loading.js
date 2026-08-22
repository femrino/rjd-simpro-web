/**
 * ============================================================
 * SIMPRO -- simpro-loading  (v144)
 * ============================================================
 * PAPAN KERJA TIM LOADING (loading.html) -- LINTAS PO.
 *
 * KENAPA HALAMAN SENDIRI, BUKAN TAB DI HALAMAN PRODUKSI
 *
 * Tab Loading di /p/produksi.html menjawab "PO ini dibagi ke mana saja" --
 * itu pertanyaan kepala produksi. Tim loading punya pertanyaan yang berbeda
 * bentuknya: "hari ini saya harus menyiapkan apa saja". Jawabannya melintasi
 * banyak PO sekaligus, jadi memaksanya masuk ke halaman per-PO berarti
 * mereka harus membuka PO satu per satu untuk tahu pekerjaan sendiri.
 *
 * PEMISAHAN PERAN (akar kebingungan 22 Agu 2026)
 *
 *   Kepala produksi / PPIC -> MEMUTUSKAN pembagian (form di halaman Produksi:
 *     berapa pcs ke line mana, target selesai kapan)
 *   Tim loading            -> MENYIAPKAN fisiknya, lalu menandai di sini
 *   Kepala line            -> KONFIRMASI terima (tab Sewing)
 *
 * Halaman ini SENGAJA tidak bisa membagi apa pun. Menyediakan tombol bagi di
 * sini akan mengembalikan kebingungan yang sama: dua pintu untuk satu
 * keputusan, dan jejak "Diserahkan Oleh" jadi menunjuk orang yang salah.
 *
 * PENANDAAN BUKAN GERBANG
 *
 * Menandai "sudah disiapkan" TIDAK diperlukan agar line bisa konfirmasi
 * terima. Kalau tim loading sedang sibuk dan tidak sempat menandai, alur
 * lama tetap berjalan seperti sebelum halaman ini ada. Yang hilang cuma
 * jejak waktunya -- bukan barangnya.
 *
 * SESI LOGIN DIPAKAI BERSAMA dengan halaman staf lain (localStorage
 * "db_session").
 *
 * DIMUAT DI : loading.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const LD_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const LD_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let LD_ID_TOKEN = null;

function ldEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function")
    ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function ldShow(id) {
  ["ld-login-box", "ld-loading", "ld-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function ldBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.exp || data.exp * 1000 <= Date.now()) return null;
    return data.token;
  } catch (e) { return null; }
}

function ldSimpanSesi_(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: payload.exp }));
  } catch (e) { /* private mode */ }
}

function ldHandleGoogleLogin(response) {
  LD_ID_TOKEN = response.credential;
  ldSimpanSesi_(response.credential);
  ldMulai();
}

function ldLogout() {
  LD_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  ["ld-nav-logout", "ld-nav-refresh"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  ldShow("ld-login-box");
}

function ldMulai() {
  // Satpam halaman -- sama polanya dengan halaman staf lain. Dibungkus typeof:
  // kalau simpro-global.js gagal dimuat, halaman tetap jalan dan backend yang
  // menolak datanya.
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(LD_ID_TOKEN, LD_API_URL, ldMulaiIsi_);
  } else {
    ldMulaiIsi_();
  }
}

function ldMulaiIsi_() {
  ldShow("ld-loading");
  ["ld-nav-logout", "ld-nav-refresh"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  });
  window.LD_DAFTAR = null;
  ldMuat();
}

function ldRefresh() {
  window.LD_DAFTAR = null;
  ldShow("ld-loading");
  ldMuat();
}

function ldMuat() {
  if (window.LD_DAFTAR) { ldRender(); return; }
  fetch(LD_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: LD_ID_TOKEN, action: "getPerluDisiapkan", opsi: {} })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      ldShow("ld-isi");
      if (!d || !d.success) {
        document.getElementById("ld-tabel").innerHTML =
          '<p class="ld-kosong">' + ldEsc_((d && d.error) || "Gagal memuat data.") + '</p>';
        return;
      }
      window.LD_DAFTAR = d.baris || [];
      window.LD_PILIH = {};
      ldRender();
    })
    .catch(function (e) {
      ldShow("ld-isi");
      document.getElementById("ld-tabel").innerHTML =
        '<p class="ld-kosong">' + ldEsc_(String(e)) + '</p>';
    });
}

/** Umur antrean dalam hari -- yang paling lama menunggu paling mungkin menahan line. */
function ldUmurHari_(iso) {
  if (!iso) return null;
  const t = new Date(iso + "T00:00:00");
  if (isNaN(t.getTime())) return null;
  const kini = new Date();
  return Math.floor((kini.setHours(0, 0, 0, 0) - t.getTime()) / 86400000);
}

function ldTogglePilih_(id, el) {
  if (!window.LD_PILIH) window.LD_PILIH = {};
  if (el.checked) window.LD_PILIH[id] = true; else delete window.LD_PILIH[id];
  ldPerbaruiTombol_();
}

function ldPilihSemuaLine_(idLine, el) {
  (window.LD_DAFTAR || []).forEach(function (b) {
    if (b.idLine !== idLine) return;
    if (el.checked) window.LD_PILIH[b.idDistribusi] = true;
    else delete window.LD_PILIH[b.idDistribusi];
    const kotak = document.getElementById("ld-cek-" + b.idDistribusi);
    if (kotak) kotak.checked = !!el.checked;
  });
  ldPerbaruiTombol_();
}

function ldPerbaruiTombol_() {
  const n = Object.keys(window.LD_PILIH || {}).length;
  const btn = document.getElementById("ld-btn-tandai");
  const info = document.getElementById("ld-pilih-info");
  if (btn) btn.disabled = n === 0;
  if (info) {
    let pcs = 0;
    (window.LD_DAFTAR || []).forEach(function (b) {
      if (window.LD_PILIH[b.idDistribusi]) pcs += b.totalQty || 0;
    });
    info.textContent = n ? (n + " baris dipilih \u00b7 " + pcs + " pcs") : "Belum ada yang dipilih";
  }
}

function ldRender() {
  const daftar = window.LD_DAFTAR || [];
  const wadah = document.getElementById("ld-tabel");
  const ringkas = document.getElementById("ld-ringkas");
  if (!wadah) return;

  if (!daftar.length) {
    if (ringkas) ringkas.innerHTML = "";
    wadah.innerHTML = '<p class="ld-kosong">Tidak ada potongan yang menunggu disiapkan. ' +
      'Semua pembagian sudah ditandai atau sudah diterima line.</p>';
    ldPerbaruiTombol_();
    return;
  }

  let totalPcs = 0;
  const perLine = {};
  daftar.forEach(function (b) {
    totalPcs += b.totalQty || 0;
    if (!perLine[b.idLine]) perLine[b.idLine] = { nama: b.namaLine, lokasi: b.lokasi, baris: [], pcs: 0 };
    perLine[b.idLine].baris.push(b);
    perLine[b.idLine].pcs += b.totalQty || 0;
  });

  if (ringkas) {
    ringkas.innerHTML =
      '<div class="ld-ringkas-kotak"><span>Baris menunggu</span><b>' + daftar.length + '</b></div>' +
      '<div class="ld-ringkas-kotak"><span>Total pcs</span><b>' + totalPcs + '</b></div>' +
      '<div class="ld-ringkas-kotak"><span>Line tujuan</span><b>' + Object.keys(perLine).length + '</b></div>';
  }

  // Dikelompokkan per LINE: tim loading menyiapkan per tujuan, bukan per PO.
  // Satu tumpuk untuk satu line, sekali angkut.
  wadah.innerHTML = Object.keys(perLine).map(function (idLine) {
    const g = perLine[idLine];
    return '<div class="ld-grup">' +
      '<div class="ld-grup-kepala">' +
        '<label class="ld-cek-semua">' +
          '<input onchange="ldPilihSemuaLine_(\'' + ldEsc_(idLine) + '\', this)" type="checkbox"/>' +
          '<span><b>' + ldEsc_(g.nama) + '</b>' +
            (g.lokasi ? ' <small>' + ldEsc_(g.lokasi) + '</small>' : '') + '</span>' +
        '</label>' +
        '<span class="ld-grup-pcs">' + g.pcs + ' pcs \u00b7 ' + g.baris.length + ' baris</span>' +
      '</div>' +
      g.baris.map(function (b) {
        const per = Object.keys(b.sizeQty || {}).map(function (sz) {
          return ldEsc_(sz) + " " + b.sizeQty[sz];
        }).join("  ");
        const umur = ldUmurHari_(b.tanggalSerah);
        // Umur antrean ditandai keras setelah 2 hari: kalau potongan sudah
        // dibagi tapi belum disiapkan selama itu, biasanya ada line yang
        // sedang menganggur menunggu.
        const tandaUmur = (umur !== null && umur >= 2)
          ? '<span class="ld-tag-lama">' + umur + ' hari</span>' : '';
        return '<label class="ld-baris">' +
          '<input id="ld-cek-' + ldEsc_(b.idDistribusi) + '" ' +
            'onchange="ldTogglePilih_(\'' + ldEsc_(b.idDistribusi) + '\', this)" type="checkbox"/>' +
          '<span class="ld-baris-isi">' +
            '<span class="ld-baris-judul">' + ldEsc_(b.warna || "-") +
              ' <small>' + ldEsc_([b.artikel, b.style].filter(String).join(" / ")) + '</small>' +
              tandaUmur + '</span>' +
            '<span class="ld-baris-detail">' + ldEsc_(b.idPurchaseOrder) +
              (per ? ' \u00b7 ' + ldEsc_(per) : '') + '</span>' +
            (b.catatan ? '<span class="ld-baris-catatan">\u201c' + ldEsc_(b.catatan) + '\u201d</span>' : '') +
          '</span>' +
          '<b class="ld-baris-qty">' + (b.totalQty || 0) + '</b>' +
        '</label>';
      }).join("") +
    '</div>';
  }).join("");

  ldPerbaruiTombol_();
}

function ldTandaiTerpilih() {
  const ids = Object.keys(window.LD_PILIH || {});
  if (!ids.length) return;
  let pcs = 0;
  (window.LD_DAFTAR || []).forEach(function (b) {
    if (window.LD_PILIH[b.idDistribusi]) pcs += b.totalQty || 0;
  });
  if (!confirm("Tandai " + ids.length + " baris (" + pcs + " pcs) sebagai SUDAH DISIAPKAN?\n\n" +
      "Namamu dan waktunya tercatat. Ini catatan penyiapan \u2014 kepala line tetap " +
      "perlu konfirmasi terima seperti biasa.")) return;

  const btn = document.getElementById("ld-btn-tandai");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  fetch(LD_API_URL, {
    method: "POST",
    body: JSON.stringify({
      idToken: LD_ID_TOKEN, action: "tandaiDisiapkan",
      payload: { idDistribusi: ids }
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      btn.textContent = "Tandai sudah disiapkan";
      if (!d || !d.success) { alert((d && d.error) || "Gagal menandai."); return; }
      let pesan = d.ditandai + " baris ditandai disiapkan.";
      if (d.dilewati && d.dilewati.length) {
        pesan += "\n\nDilewati: " + d.dilewati.join(", ");
      }
      alert(pesan);
      ldRefresh();
    })
    .catch(function (e) {
      btn.disabled = false;
      btn.textContent = "Tandai sudah disiapkan";
      alert(String(e));
    });
}

window.addEventListener("load", function () {
  const sesi = ldBacaSesi_();
  if (sesi) { LD_ID_TOKEN = sesi; ldMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { ldShow("ld-login-box"); return; }
  google.accounts.id.initialize({ client_id: LD_OAUTH_CLIENT_ID, callback: ldHandleGoogleLogin });
  const tombol = document.getElementById("ld-google-btn");
  if (tombol) {
    google.accounts.id.renderButton(tombol, { theme: "outline", size: "large", width: 260 });
  }
  ldShow("ld-login-box");
});
