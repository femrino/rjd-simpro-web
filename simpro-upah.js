/**
 * ============================================================
 * SIMPRO -- simpro-upah  (v171)
 * ============================================================
 * UPAH BORONGAN (upah.html).
 *
 * KENAPA HALAMAN SENDIRI, BUKAN TAB DI PRODUKSI
 * Sejak v156 halaman produksi membuka SEMUA tab untuk semua staf -- yang
 * dibatasi cuma kemampuan mengisi. Aturan itu benar untuk data BARANG (qty,
 * lokasi, tanggal): orang yang pekerjaannya dicatat berhak memeriksa
 * catatannya.
 *
 * Upah bukan data barang. Ia data ORANG, dan upah yang saling terlihat
 * mengubah hubungan kerja -- sekali terlihat, tidak bisa ditarik kembali.
 * Karena itu halaman ini berdiri sendiri dengan gerbang PERAN, mengikuti pola
 * Invoice dan Laporan, bukan pola halaman produksi.
 *
 * TIGA TINGKAT (ditegakkan BACKEND, bukan di sini)
 *   Akses penuh -> semua operator, semua lokasi
 *   Kepala line -> hanya upah yang dihasilkan DI LOKASINYA, per operator
 *   Selain itu  -> ditolak dengan pesan yang menjelaskan sebabnya
 *
 * Halaman ini TIDAK pernah menyaring sendiri. Yang tiba di layar sudah hasil
 * saringan server; kalau penyaringan ditaruh di sini, siapa pun yang membuka
 * alat pengembang bisa melihat data yang seharusnya tidak sampai padanya.
 *
 * DIMUAT DI : upah.html
 * URUTAN    : simpro-global.js WAJIB lebih dulu.
 *
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const UP_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const UP_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let UP_ID_TOKEN = null;

function upEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function")
    ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function upRp_(n) {
  return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

function upShow(id) {
  ["up-login-box", "up-loading", "up-isi"].forEach(function (x) {
    const el = document.getElementById(x);
    if (el) el.classList.add("hidden");
  });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function upBacaSesi_() {
  try {
    const raw = localStorage.getItem("db_session");
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d.exp || d.exp * 1000 <= Date.now()) return null;
    return d.token;
  } catch (e) { return null; }
}

function upSimpanSesi_(token) {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp }));
  } catch (e) { /* private mode */ }
}

function upHandleGoogleLogin(response) {
  UP_ID_TOKEN = response.credential;
  upSimpanSesi_(response.credential);
  upMulai();
}

function upLogout() {
  UP_ID_TOKEN = null;
  try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("up-nav-logout");
  if (b) b.classList.add("hidden");
  upShow("up-login-box");
}

function upMulai() {
  if (typeof rjdJagaHalaman === "function") {
    rjdJagaHalaman(UP_ID_TOKEN, UP_API_URL, upMulaiIsi_);
  } else {
    upMulaiIsi_();
  }
}

function upMulaiIsi_() {
  const b = document.getElementById("up-nav-logout");
  if (b) b.classList.remove("hidden");
  upIsiPeriodeDefault_();
  upShow("up-isi");
  upMuat();
}

/**
 * Periode default: BULAN LALU, bukan bulan berjalan.
 *
 * Penggajian borongan dihitung atas periode yang sudah selesai; membuka
 * halaman langsung ke bulan berjalan menampilkan angka setengah jadi yang
 * tidak pernah dipakai membayar siapa pun -- dan angka setengah jadi yang
 * terlihat seperti angka final adalah cara termudah membuat orang salah
 * mentransfer.
 */
function upIsiPeriodeDefault_() {
  const kini = new Date();
  const awalBulanLalu = new Date(kini.getFullYear(), kini.getMonth() - 1, 1);
  const akhirBulanLalu = new Date(kini.getFullYear(), kini.getMonth(), 0);
  const iso = function (d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  };
  const a = document.getElementById("up-dari");
  const b = document.getElementById("up-sampai");
  if (a && !a.value) a.value = iso(awalBulanLalu);
  if (b && !b.value) b.value = iso(akhirBulanLalu);
}

function upMuat() {
  const dari = (document.getElementById("up-dari") || {}).value || "";
  const sampai = (document.getElementById("up-sampai") || {}).value || "";
  if (!dari || !sampai) return;
  if (dari > sampai) {
    document.getElementById("up-hasil").innerHTML =
      '<div class="up-kartu"><p class="up-galat">Tanggal mulai lebih baru daripada ' +
      'tanggal akhir.</p></div>';
    return;
  }

  document.getElementById("up-hasil").innerHTML =
    '<div class="up-kartu">' +
      // Setikan jahit dari simpro-global.css (v166). Markup ditulis langsung,
      // bukan lewat helper: helper-nya (spMuatHtml_) tinggal di simpro-spk.js
      // dan halaman ini tidak memuat berkas itu. Kalau kelak ada tiga halaman
      // yang menyalin markup ini, barulah ia layak naik ke global.
      '<div class="rjd-muat">' +
        '<span class="rjd-muat-teks">Menghitung upah...</span>' +
        '<span class="rjd-muat-jahit"></span>' +
      '</div>' +
      '<p class="up-info">Perhitungan membaca seluruh arsip harian pada periode ini ' +
      '&#8212; untuk periode sebulan biasanya belasan detik.</p>' +
    '</div>';

  fetch(UP_API_URL, {
    method: "POST",
    body: JSON.stringify({ idToken: UP_ID_TOKEN, action: "getUpahBorongan",
      dari: dari, sampai: sampai })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d || !d.success) {
      document.getElementById("up-hasil").innerHTML =
        '<div class="up-kartu"><p class="up-galat">' +
        upEsc_((d && d.error) || "Gagal menghitung upah.") + '</p></div>';
      return;
    }
    window.UP_DATA = d;
    upRender_();
  })
  .catch(function () {
    document.getElementById("up-hasil").innerHTML =
      '<div class="up-kartu"><p class="up-galat">Gagal menghubungi server.</p></div>';
  });
}

function upToggleRincian_(i) {
  const el = document.getElementById("up-rinci-" + i);
  if (el) el.classList.toggle("hidden");
}

function upRender_() {
  const d = window.UP_DATA;
  if (!d) return;
  const lingkupPenuh = !(d.lingkup && d.lingkup.penuh === false);
  const daftarLokasi = (d.lingkup && d.lingkup.lokasi) || [];

  const q = String((document.getElementById("up-cari") || {}).value || "")
    .trim().toLowerCase();
  const semua = d.operator || [];
  const baris = q
    ? semua.filter(function (o) { return String(o.nama || "").toLowerCase().indexOf(q) !== -1; })
    : semua;

  // ---- Peringatan dulu, sebelum angka ----
  // Angka upah yang belum lengkap tarifnya HARUS diberi tahu sebelum orang
  // membacanya sebagai jumlah final. Ditaruh di bawah tabel, ia akan dibaca
  // sesudah keputusan transfer terlanjur diambil.
  const p = d.peringatan || {};
  let peringatan = "";
  if ((p.prosesTanpaTarif || []).length) {
    const total = p.prosesTanpaTarif.reduce(function (a, x) { return a + (x.pcs || 0); }, 0);
    peringatan +=
      '<div class="up-waspada">' +
        '<b>' + p.prosesTanpaTarif.length + ' proses belum punya tarif</b> ' +
        '(' + total.toLocaleString("id-ID") + ' pcs). Pekerjaan itu TIDAK ikut ' +
        'terhitung di angka bawah &#8212; upah yang tampil lebih kecil dari yang ' +
        'seharusnya dibayar.' +
        '<ul>' + p.prosesTanpaTarif.slice(0, 8).map(function (x) {
          return '<li>' + upEsc_(x.divisi) + ' &#183; ' + upEsc_(x.proses) +
            ' <span>' + (x.pcs || 0).toLocaleString("id-ID") + ' pcs</span></li>';
        }).join("") + '</ul>' +
        (p.prosesTanpaTarif.length > 8
          ? '<p class="up-info">dan ' + (p.prosesTanpaTarif.length - 8) + ' lainnya. ' +
            'Lengkapi di sheet <b>SD Tarif Borongan</b>.</p>'
          : '<p class="up-info">Lengkapi di sheet <b>SD Tarif Borongan</b>.</p>') +
      '</div>';
  }
  if ((p.operatorBelumTerdaftar || []).length) {
    peringatan +=
      '<div class="up-waspada up-waspada-lembut">' +
        '<b>' + p.operatorBelumTerdaftar.length + ' nama belum ada di SD Master Operator.</b> ' +
        'Upahnya tetap dihitung, tapi status dan nomor rekeningnya kosong: ' +
        upEsc_(p.operatorBelumTerdaftar.slice(0, 10).join(", ")) +
        (p.operatorBelumTerdaftar.length > 10 ? ", ..." : "") +
      '</div>';
  }

  const r = d.ringkasan || {};
  const html =
    (lingkupPenuh ? '' :
      '<div class="up-lingkup">Kamu melihat <b>upah yang dihasilkan di ' +
        upEsc_(daftarLokasi.join(", ") || "lokasimu") + '</b> saja. ' +
        'Operator yang juga bekerja di tempat lain hanya ditampilkan bagian ' +
        'yang dikerjakan di sini.</div>') +

    '<div class="up-ringkas">' +
      '<div class="up-kotak"><span>Periode</span><b>' +
        upEsc_((d.periode || {}).dari || "-") + ' &#8212; ' +
        upEsc_((d.periode || {}).sampai || "-") + '</b></div>' +
      '<div class="up-kotak"><span>Operator</span><b>' + (r.jumlahOperator || 0) + '</b></div>' +
      '<div class="up-kotak"><span>Total pcs</span><b>' +
        (r.totalPcs || 0).toLocaleString("id-ID") + '</b></div>' +
      '<div class="up-kotak up-kotak-utama"><span>Total upah</span><b>' +
        upRp_(r.totalUpah) + '</b></div>' +
    '</div>' +

    peringatan +

    (baris.length
      ? '<div class="up-tabelwrap"><table class="up-tabel"><thead><tr>' +
          '<th>Operator</th><th class="num">Pcs</th><th class="num">Upah</th>' +
          (lingkupPenuh ? '<th>Rekening</th>' : '<th>Lokasi</th>') +
        '</tr></thead><tbody>' +
        baris.map(function (o, i) {
          const bolehRinci = !o.rincianDisembunyikan && (o.rincian || []).length;
          const lok = (o.lokasi || []).map(function (x) { return upEsc_(x.lokasi); }).join(", ");
          return '<tr class="up-baris' + (bolehRinci ? ' up-baris-klik' : '') + '"' +
              (bolehRinci ? ' onclick="upToggleRincian_(' + i + ')"' : '') + '>' +
              '<td><b>' + upEsc_(o.nama || "-") + '</b>' +
                (o.terdaftar ? '' : ' <span class="up-tag">belum terdaftar</span>') +
                (o.adaProsesTanpaTarif
                  ? ' <span class="up-tag up-tag-warn">' + o.pcsTanpaTarif +
                    ' pcs tanpa tarif</span>' : '') +
                (bolehRinci ? '<div class="up-sub">' + o.rincian.length +
                  ' jenis pekerjaan &#183; klik untuk rincian</div>' : '') +
              '</td>' +
              '<td class="num">' + (o.totalPcs || 0).toLocaleString("id-ID") + '</td>' +
              '<td class="num"><b>' + upRp_(o.totalUpah) + '</b></td>' +
              (lingkupPenuh
                ? '<td class="up-rek">' + upEsc_(o.noRekening || "-") + '</td>'
                : '<td>' + (lok || "-") + '</td>') +
            '</tr>' +
            (bolehRinci
              ? '<tr class="hidden up-rinci" id="up-rinci-' + i + '"><td colspan="4">' +
                  '<table class="up-tabel-rinci"><tbody>' +
                  o.rincian.map(function (x) {
                    return '<tr>' +
                      '<td>' + upEsc_([x.divisi, x.proses].filter(String).join(" &#183; ")) +
                        '<div class="up-sub">' +
                        upEsc_([x.brand, x.artikel, x.style].filter(String).join(" / ")) +
                        '</div></td>' +
                      '<td class="num">' + (x.pcs || 0).toLocaleString("id-ID") + '</td>' +
                      '<td class="num">' + (x.adaTarif ? upRp_(x.tarif)
                        : '<span class="up-tag up-tag-warn">tarif kosong</span>') + '</td>' +
                      '<td class="num"><b>' + upRp_(x.subtotal) + '</b></td>' +
                    '</tr>';
                  }).join("") +
                  '</tbody></table>' +
                '</td></tr>'
              : '');
        }).join("") +
        '</tbody></table></div>'
      : '<p class="up-info">' + (q ? 'Tidak ada operator yang cocok dengan pencarian.'
          : 'Tidak ada output pada periode ini.') + '</p>');

  document.getElementById("up-hasil").innerHTML = '<div class="up-kartu">' + html + '</div>';
}

function upCari_() { if (window.UP_DATA) upRender_(); }

window.addEventListener("load", function () {
  const sesi = upBacaSesi_();
  if (sesi) { UP_ID_TOKEN = sesi; upMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { upShow("up-login-box"); return; }
  google.accounts.id.initialize({ client_id: UP_OAUTH_CLIENT_ID, callback: upHandleGoogleLogin });
  const t = document.getElementById("up-google-btn");
  if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  upShow("up-login-box");
});
