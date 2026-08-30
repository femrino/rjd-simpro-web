/**
 * ============================================================
 * SIMPRO -- simpro-jadwal  (v214)
 * ============================================================
 * MATRIKS JADWAL PRODUKSI (jadwal.html).
 *
 * Meniru matriks Gantt yang dulu dipelihara di spreadsheet: baris = artikel
 * x tahap (Sewing dipecah per line), kolom = hari kerja Senin-Sabtu, sel
 * diwarnai menurut tahap. Bedanya: datanya dibaca dari "SD Jadwal Produksi"
 * lewat backend (jadwal-manual.gs), jadi satu sumber untuk semua orang.
 *
 * HALAMAN INI TIDAK MENGHITUNG APA PUN. Ia hanya menggambar apa yang diisi
 * manusia di sheet. Kalau ada baris yang tidak bisa digambar (PO tidak
 * ditemukan, tanggal terbalik), baris itu ditampilkan sebagai peringatan di
 * atas matriks -- bukan dihilangkan diam-diam.
 *
 * Satu-satunya data otomatis: GARIS DEADLINE PO (dari SD Purchase Order) dan
 * penanda HARI INI. Keduanya konteks, bukan rencana.
 *
 * DIMUAT DI : jadwal.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const JM_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const JM_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let JM_ID_TOKEN = null;
let JM_DATA = null;

// Keadaan tampilan. Disimpan di sessionStorage supaya tidak kembali ke minggu
// ini setiap kali halaman dimuat ulang -- kepala produksi biasanya sedang
// melihat 2-3 minggu ke depan, dan kehilangan posisi itu menyebalkan.
const JM_LIHAT = {
  mulai: null,        // Date (Senin) kolom pertama
  minggu: 6,          // jumlah minggu yang digambar
  klien: "",          // filter ID klien ("" = semua)
  line: "",           // filter ID line ("" = semua)
  sembunyiLewat: true // sembunyikan item yang semua bar-nya sudah lewat
};

const JM_HARI = ["S", "S", "R", "K", "J", "S"]; // Senin..Sabtu
const JM_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Kelas warna per tahap. Nama tahap datang dari backend (TAHAP_JADWAL); kalau
// backend menambah tahap baru yang belum ada di sini, jatuh ke kelas "lain".
const JM_KELAS_TAHAP = {
  "Pola & Konsumsi": "pola",
  "Pengadaan Bahan": "bahan",
  "Cutting": "cutting",
  "Interlining": "interlining",
  "Sewing": "sewing",
  "Finishing": "finishing",
  "Pengiriman": "kirim"
};

// ---------- util ----------

function jmEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function")
    ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jmIso_(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function jmDariIso_(s) {
  // "yyyy-MM-dd" -> Date lokal tengah malam. Sengaja tidak new Date(s) --
  // itu ditafsirkan UTC dan mundur sehari di WIB.
  const p = String(s || "").split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function jmSenin_(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const geser = (x.getDay() + 6) % 7; // Senin=0 ... Minggu=6
  x.setDate(x.getDate() - geser);
  return x;
}

function jmTambahHari_(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function jmShow(id) {
  ["jm-login-box", "jm-loading", "jm-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

// ---------- sesi (pola sama dengan halaman upah) ----------

function jmBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}

function jmSimpanSesi_(token) {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp }));
  } catch (e) { /* private mode */ }
}

function jmHandleGoogleLogin(response) {
  JM_ID_TOKEN = response.credential;
  jmSimpanSesi_(response.credential);
  jmMulai();
}

function jmLogout() {
  JM_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("jm-nav-logout");
  if (b) b.classList.add("hidden");
  jmShow("jm-login-box");
}

function jmMulai() {
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(JM_ID_TOKEN, JM_API_URL, jmMulaiIsi_);
  } else {
    jmMulaiIsi_();
  }
}

function jmMulaiIsi_() {
  const b = document.getElementById("jm-nav-logout");
  if (b) b.classList.remove("hidden");
  jmBacaLihat_();
  jmShow("jm-loading");
  jmMuat();
}

// ---------- keadaan tampilan ----------

function jmBacaLihat_() {
  try {
    const raw = sessionStorage.getItem("jm_lihat");
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.mulai) JM_LIHAT.mulai = jmDariIso_(d.mulai);
    if (d.minggu) JM_LIHAT.minggu = Number(d.minggu) || 6;
    if (typeof d.klien === "string") JM_LIHAT.klien = d.klien;
    if (typeof d.line === "string") JM_LIHAT.line = d.line;
    if (typeof d.sembunyiLewat === "boolean") JM_LIHAT.sembunyiLewat = d.sembunyiLewat;
  } catch (e) { /* abaikan */ }
}

function jmSimpanLihat_() {
  try {
    sessionStorage.setItem("jm_lihat", JSON.stringify({
      mulai: JM_LIHAT.mulai ? jmIso_(JM_LIHAT.mulai) : null,
      minggu: JM_LIHAT.minggu, klien: JM_LIHAT.klien, line: JM_LIHAT.line,
      sembunyiLewat: JM_LIHAT.sembunyiLewat
    }));
  } catch (e) { /* abaikan */ }
}

// ---------- muat data ----------

function jmMuat() {
  fetch(JM_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: JM_ID_TOKEN, action: "getJadwalManual" })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (!data || !data.success) {
      jmShow("jm-isi");
      document.getElementById("jm-matriks").innerHTML =
        '<div class="jm-kartu"><p class="jm-galat">' + jmEsc_((data && data.error) || "Gagal memuat jadwal.") + '</p></div>';
      return;
    }
    JM_DATA = data;
    // Jendela default: seminggu ke belakang dari hari ini, supaya bar yang
    // sedang berjalan kelihatan awalnya.
    if (!JM_LIHAT.mulai) JM_LIHAT.mulai = jmSenin_(jmTambahHari_(jmDariIso_(data.hariIni), -7));
    jmShow("jm-isi");
    jmIsiFilter_();
    jmRender();
  })
  .catch(function () {
    jmShow("jm-isi");
    document.getElementById("jm-matriks").innerHTML =
      '<div class="jm-kartu"><p class="jm-galat">Gagal menghubungi server. Periksa jaringan lalu muat ulang.</p></div>';
  });
}

function jmIsiFilter_() {
  const selK = document.getElementById("jm-f-klien");
  const selL = document.getElementById("jm-f-line");
  if (selK) {
    const klien = {};
    (JM_DATA.items || []).forEach(function (it) { klien[it.idKlien] = it.namaKlien || it.idKlien; });
    selK.innerHTML = '<option value="">Semua klien</option>' +
      Object.keys(klien).sort(function (a, b) { return String(klien[a]).localeCompare(String(klien[b])); })
        .map(function (id) { return '<option value="' + jmEsc_(id) + '">' + jmEsc_(klien[id]) + '</option>'; }).join("");
    selK.value = JM_LIHAT.klien;
    if (selK.value !== JM_LIHAT.klien) { JM_LIHAT.klien = ""; selK.value = ""; }
  }
  if (selL) {
    selL.innerHTML = '<option value="">Semua line</option>' +
      (JM_DATA.lines || []).map(function (l) {
        return '<option value="' + jmEsc_(l.idLine) + '">' + jmEsc_(l.namaLine) + '</option>';
      }).join("");
    selL.value = JM_LIHAT.line;
    if (selL.value !== JM_LIHAT.line) { JM_LIHAT.line = ""; selL.value = ""; }
  }
  const cb = document.getElementById("jm-f-lewat");
  if (cb) cb.checked = JM_LIHAT.sembunyiLewat;
  const selM = document.getElementById("jm-f-minggu");
  if (selM) selM.value = String(JM_LIHAT.minggu);
}

// ---------- kendali ----------

function jmGeser(n) { JM_LIHAT.mulai = jmTambahHari_(JM_LIHAT.mulai, n * 7); jmSimpanLihat_(); jmRender(); }
function jmKeHariIni() {
  JM_LIHAT.mulai = jmSenin_(jmTambahHari_(jmDariIso_(JM_DATA.hariIni), -7));
  jmSimpanLihat_(); jmRender();
}
function jmUbahFilter() {
  JM_LIHAT.klien = (document.getElementById("jm-f-klien") || {}).value || "";
  JM_LIHAT.line = (document.getElementById("jm-f-line") || {}).value || "";
  JM_LIHAT.minggu = Number((document.getElementById("jm-f-minggu") || {}).value) || 6;
  JM_LIHAT.sembunyiLewat = !!((document.getElementById("jm-f-lewat") || {}).checked);
  jmSimpanLihat_(); jmRender();
}

// ---------- render ----------

function jmRender() {
  if (!JM_DATA) return;
  jmRenderPeringatan_();
  jmRenderMatriks_();
}

function jmRenderPeringatan_() {
  const el = document.getElementById("jm-peringatan");
  if (!el) return;
  const p = JM_DATA.peringatan || [];
  if (!JM_DATA.sheetAda) {
    el.classList.remove("hidden");
    el.innerHTML = '<b>Sheet "SD Jadwal Produksi" belum ada.</b> Jalankan <code>buatSheetJadwalProduksi()</code> ' +
      'lalu <code>segarkanPilihanJadwal()</code> di Apps Script, isi jadwalnya, dan muat ulang halaman ini.';
    return;
  }
  if (!p.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = '<b>' + p.length + ' baris di sheet tidak bisa digambar</b> -- perbaiki di "SD Jadwal Produksi":' +
    '<ul>' + p.map(function (x) {
      return '<li>Baris ' + x.baris + (x.item ? ' <span class="jm-mono">' + jmEsc_(x.item) + '</span>' : '') +
        (x.tahap ? ' (' + jmEsc_(x.tahap) + ')' : '') + ': ' + jmEsc_(x.pesan) + '</li>';
    }).join("") + '</ul>';
}

/** Susun kolom hari kerja (Senin-Sabtu) untuk jendela yang dilihat. */
function jmKolom_() {
  const kolom = [];
  for (let m = 0; m < JM_LIHAT.minggu; m++) {
    for (let h = 0; h < 6; h++) {
      const d = jmTambahHari_(JM_LIHAT.mulai, m * 7 + h);
      kolom.push({ tgl: d, iso: jmIso_(d), minggu: m, hari: h });
    }
  }
  return kolom;
}

/** Kelompokkan bar per item, terapkan filter, urutkan menurut bar paling awal. */
function jmKelompok_() {
  const hariIni = JM_DATA.hariIni;
  const petaItem = {};
  (JM_DATA.items || []).forEach(function (it) { petaItem[it.kunci] = it; });

  const grup = {};
  (JM_DATA.bar || []).forEach(function (b) {
    const it = petaItem[b.item];
    if (!it) return;
    if (JM_LIHAT.klien && it.idKlien !== JM_LIHAT.klien) return;
    if (!grup[b.item]) grup[b.item] = { item: it, bar: [], mulaiMin: b.mulai, selesaiMax: b.selesai };
    grup[b.item].bar.push(b);
    if (b.mulai < grup[b.item].mulaiMin) grup[b.item].mulaiMin = b.mulai;
    if (b.selesai > grup[b.item].selesaiMax) grup[b.item].selesaiMax = b.selesai;
  });

  return Object.keys(grup).map(function (k) { return grup[k]; })
    .filter(function (g) {
      if (JM_LIHAT.sembunyiLewat && g.selesaiMax < hariIni) return false;
      // Filter line: tampilkan item yang punya bar Sewing di line itu.
      if (JM_LIHAT.line && !g.bar.some(function (b) { return b.line === JM_LIHAT.line; })) return false;
      return true;
    })
    .sort(function (a, b) {
      if (a.mulaiMin !== b.mulaiMin) return a.mulaiMin < b.mulaiMin ? -1 : 1;
      return String(a.item.artikel).localeCompare(String(b.item.artikel));
    });
}

/** Baris-baris matriks untuk satu grup: satu per tahap; Sewing satu per line. */
function jmBarisGrup_(g) {
  const urutan = JM_DATA.tahap || Object.keys(JM_KELAS_TAHAP);
  const baris = [];
  urutan.forEach(function (tahap) {
    const bars = g.bar.filter(function (b) { return b.tahap === tahap; });
    if (!bars.length) return;
    if (tahap === "Sewing") {
      const perLine = {};
      bars.forEach(function (b) { (perLine[b.line] = perLine[b.line] || []).push(b); });
      Object.keys(perLine).sort().forEach(function (idLine) {
        if (JM_LIHAT.line && idLine !== JM_LIHAT.line) return;
        baris.push({ label: "Sewing", sub: perLine[idLine][0].namaLine || idLine, tahap: tahap, bar: perLine[idLine] });
      });
    } else {
      baris.push({ label: tahap, sub: "", tahap: tahap, bar: bars });
    }
  });
  return baris;
}

function jmRenderMatriks_() {
  const wadah = document.getElementById("jm-matriks");
  if (!JM_DATA.sheetAda) { wadah.innerHTML = ""; jmRenderInfo_(0, 0); return; }

  const kolom = jmKolom_();
  const grup = jmKelompok_();
  const hariIni = JM_DATA.hariIni;

  if (!grup.length) {
    wadah.innerHTML = '<div class="jm-kartu"><p class="jm-info">' +
      ((JM_DATA.bar || []).length
        ? 'Tidak ada item yang cocok dengan filter ini.'
        : 'Belum ada baris jadwal. Isi "SD Jadwal Produksi" di spreadsheet, lalu muat ulang.') +
      '</p></div>';
    jmRenderInfo_(0, 0);
    return;
  }

  // ---- header: baris 1 = minggu (bulan + rentang), baris 2 = hari + tanggal
  let thead = '<tr class="jm-h-minggu"><th class="jm-sticky jm-th-kiri" rowspan="2">' +
    '<span>Artikel &amp; Tahap</span></th>';
  for (let m = 0; m < JM_LIHAT.minggu; m++) {
    const a = kolom[m * 6].tgl, z = kolom[m * 6 + 5].tgl;
    const label = (a.getMonth() === z.getMonth())
      ? JM_BULAN[a.getMonth()] + " " + a.getFullYear()
      : JM_BULAN[a.getMonth()] + "\u2013" + JM_BULAN[z.getMonth()] + " " + z.getFullYear();
    thead += '<th class="jm-th-minggu" colspan="6">' + label + '</th>';
  }
  thead += '</tr><tr class="jm-h-hari">';
  kolom.forEach(function (k) {
    const kelas = ["jm-th-hari"];
    if (k.hari === 0) kelas.push("jm-awal-minggu");
    if (k.iso === hariIni) kelas.push("jm-hari-ini");
    thead += '<th class="' + kelas.join(" ") + '"><span class="jm-h-inisial">' + JM_HARI[k.hari] +
      '</span><span class="jm-h-tgl">' + k.tgl.getDate() + '</span></th>';
  });
  thead += '</tr>';

  // ---- badan
  let tbody = "";
  let jumlahBaris = 0;
  grup.forEach(function (g, gi) {
    const it = g.item;
    const baris = jmBarisGrup_(g);
    const deadlineLewat = it.deadline && it.deadline < hariIni;

    // Baris judul item
    const judul = [it.artikel, it.style].filter(String).join(" ");
    tbody += '<tr class="jm-r-item">' +
      '<td class="jm-sticky jm-td-item">' +
        '<div class="jm-item-nama">' + jmEsc_(judul || it.po) + '</div>' +
        '<div class="jm-item-meta">' + jmEsc_(it.namaKlien || it.idKlien) +
          ' <span class="jm-mono">' + jmEsc_(it.po) + '</span>' +
          (it.qtyPo ? ' &#183; ' + it.qtyPo.toLocaleString("id-ID") + ' pcs' : '') +
          (it.deadline ? ' &#183; <span class="jm-dl' + (deadlineLewat ? ' jm-dl-lewat' : '') + '">deadline ' +
            jmTanggalPendek_(it.deadline) + '</span>' : '') +
        '</div>' +
      '</td>';
    kolom.forEach(function (k) {
      tbody += '<td class="' + jmKelasSel_(k, hariIni, it.deadline) + '"></td>';
    });
    tbody += '</tr>';

    // Baris tahap
    baris.forEach(function (b) {
      jumlahBaris++;
      tbody += '<tr class="jm-r-tahap">' +
        '<td class="jm-sticky jm-td-tahap"><span class="jm-swatch jm-t-' + (JM_KELAS_TAHAP[b.tahap] || "lain") + '"></span>' +
          jmEsc_(b.label) + (b.sub ? ' <span class="jm-tahap-sub">' + jmEsc_(b.sub) + '</span>' : '') +
        '</td>';
      kolom.forEach(function (k) {
        const kelas = jmKelasSel_(k, hariIni, it.deadline);
        const bar = b.bar.filter(function (x) { return x.mulai <= k.iso && k.iso <= x.selesai; });
        if (!bar.length) { tbody += '<td class="' + kelas + '"></td>'; return; }
        const x = bar[0];
        const tepi = (x.mulai === k.iso ? " jm-bar-awal" : "") + (x.selesai === k.iso ? " jm-bar-akhir" : "");
        const tip = b.label + (b.sub ? " " + b.sub : "") + ": " + jmTanggalPendek_(x.mulai) + " - " + jmTanggalPendek_(x.selesai) +
          (x.qty ? " \u00b7 " + x.qty + " pcs" : "") + (x.keterangan ? "\n" + x.keterangan : "");
        tbody += '<td class="' + kelas + ' jm-bar jm-t-' + (JM_KELAS_TAHAP[b.tahap] || "lain") + tepi +
          '" title="' + jmEsc_(tip) + '"></td>';
      });
      tbody += '</tr>';
    });
    if (gi < grup.length - 1) tbody += '<tr class="jm-r-pisah"><td colspan="' + (kolom.length + 1) + '"></td></tr>';
  });

  wadah.innerHTML = '<div class="jm-gulir"><table class="jm-tabel"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
  jmRenderInfo_(grup.length, jumlahBaris);
}

function jmKelasSel_(k, hariIni, deadline) {
  const kelas = ["jm-sel"];
  if (k.hari === 0) kelas.push("jm-awal-minggu");
  if (k.iso === hariIni) kelas.push("jm-hari-ini");
  if (deadline && k.iso === deadline) kelas.push("jm-deadline");
  return kelas.join(" ");
}

function jmTanggalPendek_(iso) {
  const d = jmDariIso_(iso);
  return d.getDate() + " " + JM_BULAN[d.getMonth()];
}

function jmRenderInfo_(jumlahItem, jumlahBaris) {
  const el = document.getElementById("jm-rentang");
  if (!el || !JM_LIHAT.mulai) return;
  const a = JM_LIHAT.mulai, z = jmTambahHari_(a, JM_LIHAT.minggu * 7 - 2);
  el.innerHTML = jmTanggalPendek_(jmIso_(a)) + " \u2013 " + jmTanggalPendek_(jmIso_(z)) + " " + z.getFullYear() +
    (jumlahItem ? ' <span class="jm-rentang-sub">' + jumlahItem + ' item &#183; ' + jumlahBaris + ' baris</span>' : '');
}

// ---------- legenda ----------

function jmRenderLegenda_() {
  const el = document.getElementById("jm-legenda");
  if (!el) return;
  el.innerHTML = Object.keys(JM_KELAS_TAHAP).map(function (t) {
    return '<span class="jm-leg"><span class="jm-swatch jm-t-' + JM_KELAS_TAHAP[t] + '"></span>' + jmEsc_(t) + '</span>';
  }).join("") +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-dl"></span>deadline PO</span>' +
  '<span class="jm-leg"><span class="jm-swatch jm-swatch-ini"></span>hari ini</span>';
}

// ---------- mulai ----------

window.addEventListener("load", function () {
  jmRenderLegenda_();
  const sesi = jmBacaSesi_();
  if (sesi) { JM_ID_TOKEN = sesi; jmMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { jmShow("jm-login-box"); return; }
  google.accounts.id.initialize({ client_id: JM_OAUTH_CLIENT_ID, callback: jmHandleGoogleLogin });
  const t = document.getElementById("jm-google-btn");
  if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  jmShow("jm-login-box");
});
