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

  /* v228 -- SNAPSHOT LOKAL (Tipe B).
     Halaman ini yang paling panjang menunggunya: perhitungan membaca seluruh
     arsip harian, belasan detik untuk sebulan. Kunci snapshot memuat PERIODE,
     karena hasil periode lain sama sekali bukan jawaban untuk periode ini --
     kesalahan yang di halaman upah berarti salah bayar orang.
     Bendera segar tidak dipakai di sini: setiap penekanan Hitung adalah
     permintaan eksplisit atas periode tertentu, jadi snapshot boleh tampil
     lagi saat orang berpindah periode -- selama labelnya ikut tampil. */
  const kunciSnap = "upah_" + dari + "_" + sampai;
  if (typeof rjdSnapshotBaca_ === "function") {
    const snap = rjdSnapshotBaca_(kunciSnap, 7 * 24 * 60);
    if (snap && snap.data) {
      window.UP_DATA = snap.data;
      upRender_();
      if (typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("up-hasil", snap.waktu);
    }
  }

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
    if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_(kunciSnap, d);
    upRender_();
    if (typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("up-hasil");
    upSlipPasang_(d);   // v385 (Tahap 5C): kartu slip gaji di bawah hasil, hanya lingkup penuh
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
                      '<td>' + [x.divisi, x.proses].filter(String).map(upEsc_).join(" &#183; ") +   // v308 (KF-6): escape per bagian, entity titik tengah tidak ikut ter-escape
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


/* ============================================================================
 * ROADMAP-ERP Tahap 5 sub-rilis C (v385, butuh gs >= @420) -- KARTU SLIP GAJI di bawah hasil upah.
 * Hanya untuk lingkup PENUH (owner/finance): kepala line melihat upah lokasinya, bukan slip (server juga menolak lewat
 * area "penggajian"). Alur: Muat slip (getPenggajian, malas) -> Buat draf periode ini (buatDrafSlip) -> Ubah per baris Draf
 * (ubahSlipDraf: tunjangan/THR/potongan) -> centang Draf, pilih akun & tanggal, Bayar (bayarSlip; kunci kiriman terikat
 * ISIAN lewat rjdKunciIsian_, tombol dikunci selama sibuk) -> Batal (batalkanSlip, alasan wajib). Slip lama tidak dihitung
 * ulang: yang tampil apa adanya dari SD Slip Gaji. Periode berganti = slip lama dibuang (jawaban periode lain bukan jawaban).
 * Jawaban getPenggajian yang disusul dibuang (UP_SLIP_URUT). Semua teks lewat upEsc_, ID di handler lewat rjdAttrJs_.
 * ========================================================================== */
let UP_SLIP = null, UP_SLIP_URUT = 0, UP_SLIP_STATUS = "", UP_SLIP_PESAN = null, UP_SLIP_SIBUK = false, UP_SLIP_EDIT = null, UP_SLIP_PERIODE = null;

function upSlipWadah_() {
  let el = document.getElementById("up-slip");
  if (el) return el;
  const j = document.getElementById("up-hasil"); if (!j || !j.parentNode) return null;
  el = document.createElement("div"); el.id = "up-slip";
  j.parentNode.insertBefore(el, j.nextSibling);
  return el;
}
function upSlipPeriode_() {
  return { dari: (document.getElementById("up-dari") || {}).value || "", sampai: (document.getElementById("up-sampai") || {}).value || "" };
}
/** Dipanggil sesudah getUpahBorongan sukses: kartu hanya untuk lingkup penuh; periode berganti -> slip lama dibuang. */
function upSlipPasang_(d) {
  const el = upSlipWadah_(); if (!el) return;
  if (d && d.lingkup && d.lingkup.penuh === false) { el.innerHTML = ""; UP_SLIP = null; UP_SLIP_STATUS = ""; return; }
  const per = upSlipPeriode_();
  if (UP_SLIP_PERIODE && (UP_SLIP_PERIODE.dari !== per.dari || UP_SLIP_PERIODE.sampai !== per.sampai)) { UP_SLIP = null; UP_SLIP_STATUS = ""; UP_SLIP_PESAN = null; UP_SLIP_EDIT = null; UP_SLIP_PERIODE = null; }
  upSlipRender_();
}
function upSlipKirim_(action, payload) {
  return fetch(UP_API_URL, { method: "POST", body: JSON.stringify({ idToken: UP_ID_TOKEN, action: action, payload: payload || {} }) })
    .then(function (r) { return r.text(); })
    .then(function (teks) {
      let d; try { d = JSON.parse(teks); } catch (e) { throw new Error("jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 80)); }
      if (!d || !d.success) throw new Error((d && d.error) || "Permintaan ditolak server.");
      return d;
    });
}
function upSlipPesanGagal_(e) {
  const m = String(e && e.message || e);
  return /Failed to fetch|NetworkError|jaringan/i.test(m) ? "Slip gaji tidak sampai ke server -- sambungan terputus di tengah jalan. Coba lagi." : m;
}
function upSlipMuat() {
  const per = upSlipPeriode_(); if (!per.dari || !per.sampai) return;
  const urut = ++UP_SLIP_URUT;
  UP_SLIP_PERIODE = per; UP_SLIP_STATUS = "memuat"; UP_SLIP_EDIT = null; upSlipRender_();
  upSlipKirim_("getPenggajian", per)
    .then(function (d) { if (urut !== UP_SLIP_URUT) return; UP_SLIP = d; UP_SLIP_STATUS = ""; upSlipRender_(); })
    .catch(function (e) { if (urut !== UP_SLIP_URUT) return; UP_SLIP_STATUS = upSlipPesanGagal_(e); upSlipRender_(); });
}
function upSlipPesan_(teks, galat) {
  UP_SLIP_PESAN = teks ? { teks: teks, galat: !!galat } : null;
  const el = document.getElementById("up-slip-pesan");
  if (el) { el.textContent = teks || ""; el.className = "up-slip-pesan" + (galat ? " up-galat" : (teks ? " up-slip-ok" : "")); }
}
/** Satu jalur untuk semua aksi tulis: dikunci selama sibuk, sukses -> pesan + muat ulang, gagal -> pesan server apa adanya. */
function upSlipAksi_(action, payload, sesudah) {
  if (UP_SLIP_SIBUK) return;
  UP_SLIP_SIBUK = true; upSlipPesan_("Mengirim...", false); upSlipRender_();
  upSlipKirim_(action, payload)
    .then(function (d) { UP_SLIP_SIBUK = false; UP_SLIP_EDIT = null; UP_SLIP_PESAN = { teks: sesudah(d), galat: false }; upSlipMuat(); })
    .catch(function (e) { UP_SLIP_SIBUK = false; upSlipPesan_(upSlipPesanGagal_(e), true); upSlipRender_(); });
}
function upSlipBuatDraf() {
  const per = upSlipPeriode_(); if (!per.dari || !per.sampai) return;
  const isian = { dari: per.dari, sampai: per.sampai };
  isian.idPermintaan = typeof rjdKunciIsian_ === "function" ? rjdKunciIsian_("up-slip-draf", isian) : "";
  upSlipAksi_("buatDrafSlip", isian, function (d) {
    return "Draf dibuat: " + d.jumlah + " slip" + ((d.dilewati || []).length ? "; dilewati " + d.dilewati.length + " (" + d.dilewati.slice(0, 5).join(", ") + (d.dilewati.length > 5 ? ", ..." : "") + ")" : "") +
      ((d.belumTerdaftar || []).length ? "; BELUM TERDAFTAR di master (tidak dibuat): " + d.belumTerdaftar.join(", ") : "") +
      ((d.peringatan && d.peringatan.prosesTanpaTarif || []).length ? "; " + d.peringatan.prosesTanpaTarif.length + " proses tanpa tarif (upahnya belum terhitung)" : "") + ".";
  });
}
function upSlipBayar() {
  const ids = Array.prototype.map.call(document.querySelectorAll("#up-slip-tabel input.up-slip-pilih:checked"), function (c) { return c.value; });
  if (!ids.length) { upSlipPesan_("Centang slip Draf yang mau dibayar dulu.", true); return; }
  const akun = (document.getElementById("up-slip-akun") || {}).value || "", tgl = (document.getElementById("up-slip-tanggal") || {}).value || "";
  if (!akun || !tgl) { upSlipPesan_("Akun kas dan tanggal bayar wajib diisi.", true); return; }
  const isian = { idSlip: ids, akun: akun, tanggal: tgl };
  isian.idPermintaan = typeof rjdKunciIsian_ === "function" ? rjdKunciIsian_("up-slip-bayar", isian) : "";
  upSlipAksi_("bayarSlip", isian, function (d) {
    const ulang = (d.slip || []).filter(function (x) { return x.sudahTercatat; }).length;
    return "Dibayar " + d.jumlahSlip + " slip, " + d.barisKas + " baris kas, netto " + upRp_(d.totalNetto) + (ulang ? " (" + ulang + " slip sudah tercatat sebelumnya, tidak dibayar dua kali)" : "") + ".";
  });
}
function upSlipEdit(id) { UP_SLIP_EDIT = id; upSlipRender_(); }
function upSlipEditBatal() { UP_SLIP_EDIT = null; upSlipRender_(); }
function upSlipSimpanEdit(id) {
  const v = function (k) { const el = document.querySelector('#up-slip-tabel tr[data-slip="' + id + '"] input[data-medan="' + k + '"]'); return el ? el.value : ""; };
  const angka = function (k) { const s = String(v(k)).replace(/[^0-9]/g, ""); return s === "" ? 0 : Number(s); };
  upSlipAksi_("ubahSlipDraf", { idSlip: id, tunjangan: angka("tunjangan"), thr: angka("thr"), potonganKasbon: angka("potonganKasbon"), potonganLain: angka("potonganLain"), keteranganPotongan: v("keteranganPotongan") },
    function (d) { return "Slip " + d.idSlip + " diubah: netto " + upRp_(d.netto) + "."; });
}
function upSlipBatal(id) {
  const alasan = String(window.prompt("Alasan membatalkan slip " + id + " (min. 5 huruf). Slip yang sudah Dibayar akan dibalik di buku kas:") || "").trim();
  if (!alasan) return;
  if (alasan.length < 5) { upSlipPesan_("Alasan pembatalan minimal 5 huruf.", true); return; }
  upSlipAksi_("batalkanSlip", { idSlip: id, alasan: alasan }, function (d) { return "Slip " + d.idSlip + " dibatalkan" + ((d.pembalik || []).length ? " -- " + d.pembalik.length + " baris kas dibalik" : "") + "."; });
}
function upSlipRp_(v) { return upRp_(Number(v) || 0); }
function upSlipRender_() {
  const el = upSlipWadah_(); if (!el) return;
  const judul = '<div class="up-slip-judul">Slip gaji</div>';
  if (UP_SLIP_STATUS) {
    const memuat = UP_SLIP_STATUS === "memuat";
    el.innerHTML = '<div class="up-kartu">' + judul + '<p class="' + (memuat ? 'up-info' : 'up-galat') + '" id="up-slip-status">' + upEsc_(memuat ? "Memuat slip gaji..." : UP_SLIP_STATUS) + '</p>' +
      (memuat ? '' : '<button class="up-btn up-btn-kecil" type="button" onclick="upSlipMuat()">Coba lagi</button>') + '</div>';
    return;
  }
  const per = upSlipPeriode_();
  if (!UP_SLIP) {
    el.innerHTML = '<div class="up-kartu">' + judul + '<p class="up-info">Draf per karyawan dari upah di atas (borongan) dan Gaji Pokok di master (tetap), potongan kasbon diusulkan dari saldo; Bayar menulis buku kas bruto + pengembalian kasbon dan membekukan slipnya.</p>' +
      '<button id="up-slip-buka" class="up-btn" type="button" onclick="upSlipMuat()">Muat slip ' + upEsc_(per.dari) + ' &#8212; ' + upEsc_(per.sampai) + '</button></div>';
    return;
  }
  const d = UP_SLIP, slip = d.slip || [], saldo = (d.kasbon && d.kasbon.saldo) || {};
  const jum = function (st) { return slip.filter(function (s) { return s.Status === st; }); };
  const draf = jum("Draf"), dibayar = jum("Dibayar"), batal = jum("Dibatalkan");
  const nettoDibayar = dibayar.reduce(function (t, s) { return t + (Number(s.Netto) || 0); }, 0);
  const pesan = '<div id="up-slip-pesan" class="up-slip-pesan' + (UP_SLIP_PESAN ? (UP_SLIP_PESAN.galat ? ' up-galat' : ' up-slip-ok') : '') + '">' + (UP_SLIP_PESAN ? upEsc_(UP_SLIP_PESAN.teks) : '') + '</div>';
  let peringatan = "";
  const tanpaPadanan = (d.kasbon && d.kasbon.tanpaPadanan) || [];
  if (tanpaPadanan.length) peringatan += '<div class="up-waspada" id="up-slip-kasbon-awas"><b>' + tanpaPadanan.length + ' baris kasbon tidak bertemu siapa pun di master</b> (Pihak kosong/tidak dikenal) -- tidak bisa dipotong dari gaji: ' +
    tanpaPadanan.slice(0, 5).map(function (x) { return upEsc_(x.id) + ' ' + upEsc_(x.tanggal) + ' ' + upEsc_(x.pihak || "(tanpa Pihak)") + ' ' + upSlipRp_(x.jumlah); }).join("; ") + (tanpaPadanan.length > 5 ? "; ..." : "") + '. Isi kolom Pihak di Buku Kas.</div>';
  const tetapKosong = (d.karyawan || []).filter(function (k) { return String(k.status).toLowerCase() === "tetap" && k.aktif !== false && !(k.gajiPokok > 0); });
  if (tetapKosong.length) peringatan += '<div class="up-waspada up-waspada-lembut" id="up-slip-tetap-awas"><b>' + tetapKosong.length + ' karyawan Tetap tanpa Gaji Pokok</b> di SD Master Operator (dilewati saat draf): ' + upEsc_(tetapKosong.map(function (k) { return k.nama; }).join(", ")) + '</div>';
  if (d.bulanTertutup) peringatan += '<div class="up-waspada" id="up-slip-tutup-awas">Bulan gaji periode ini SUDAH DITUTUP di buku kas -- draf baru & pembayaran bertanggal bulan itu ditolak server.</div>';
  const hariIni = new Date(), isoHariIni = hariIni.getFullYear() + "-" + String(hariIni.getMonth() + 1).padStart(2, "0") + "-" + String(hariIni.getDate()).padStart(2, "0");
  const tglBayar = (document.getElementById("up-slip-tanggal") || {}).value || isoHariIni, akunPilih = (document.getElementById("up-slip-akun") || {}).value || "";
  const bilah = '<div class="up-slip-bilah">' +
    '<button id="up-slip-draf" class="up-btn up-btn-kecil" type="button" onclick="upSlipBuatDraf()"' + (UP_SLIP_SIBUK || d.bulanTertutup ? ' disabled' : '') + '>Buat draf periode ini</button>' +
    '<label>Akun kas<select id="up-slip-akun">' + (d.akun || []).map(function (a) { return '<option value="' + upEsc_(a.kode) + '"' + (a.kode === akunPilih ? ' selected' : '') + '>' + upEsc_(a.kode + " - " + a.nama) + '</option>'; }).join("") + '</select></label>' +
    '<label>Tanggal bayar<input id="up-slip-tanggal" type="date" value="' + upEsc_(tglBayar) + '"></label>' +
    '<button id="up-slip-bayar" class="up-btn up-btn-kecil" type="button" onclick="upSlipBayar()"' + (UP_SLIP_SIBUK || !draf.length ? ' disabled' : '') + '>' + (UP_SLIP_SIBUK ? 'Mengirim...' : 'Bayar slip yang dicentang') + '</button>' +
    '<button class="up-btn up-btn-kecil up-btn-putih" type="button" onclick="upSlipMuat()">Muat ulang</button></div>';
  const ringkas = '<div class="up-slip-ringkas" id="up-slip-ringkas"><span>Draf<b>' + draf.length + '</b></span><span>Dibayar<b>' + dibayar.length + '</b></span><span>Dibatalkan<b>' + batal.length + '</b></span><span>Netto dibayar<b>' + upSlipRp_(nettoDibayar) + '</b></span></div>';
  const baris = slip.map(function (s) {
    const id = String(s["ID Slip"] || ""), st = String(s.Status || ""), isDraf = st === "Draf", edit = UP_SLIP_EDIT === id;
    const kelas = st === "Dibatalkan" ? "up-slip-batal" : (st === "Dibayar" ? "up-slip-dibayar" : "");
    const idJs = typeof rjdAttrJs_ === "function" ? rjdAttrJs_(id) : upEsc_(id);
    const inp = function (medan, nilai, kelasTambah) { return '<input data-medan="' + medan + '" class="' + (kelasTambah || "") + '" value="' + upEsc_(nilai) + '">'; };
    const sk = saldo[String(s["ID Karyawan"] || "")];
    return '<tr data-slip="' + upEsc_(id) + '" class="' + kelas + (edit ? ' up-slip-edit' : '') + '">' +
      '<td>' + (isDraf ? '<input type="checkbox" class="up-slip-pilih" value="' + upEsc_(id) + '">' : '') + '</td>' +
      '<td><span class="up-rek">' + upEsc_(id) + '</span></td>' +
      '<td><b>' + upEsc_(s.Nama) + '</b><div class="up-sub">' + upEsc_(s.Jenis) + (s.Bagian ? ' &#183; ' + upEsc_(s.Bagian) : '') + (s["Hari Hadir"] !== "" && s["Hari Hadir"] !== undefined ? ' &#183; hadir ' + upEsc_(s["Hari Hadir"]) + ' hari' : '') + '</div></td>' +
      '<td class="num">' + (Number(s.Pcs) || 0).toLocaleString("id-ID") + '</td>' +
      '<td class="num">' + upSlipRp_((Number(s["Upah Borongan"]) || 0) + (Number(s["Gaji Pokok"]) || 0)) + '</td>' +
      '<td class="num">' + (edit ? inp("tunjangan", Number(s.Tunjangan) || 0) : upSlipRp_(s.Tunjangan)) + '</td>' +
      '<td class="num">' + (edit ? inp("thr", Number(s.THR) || 0) : upSlipRp_(s.THR)) + '</td>' +
      '<td class="num">' + (edit ? inp("potonganKasbon", Number(s["Potongan Kasbon"]) || 0) : upSlipRp_(s["Potongan Kasbon"])) + (sk !== undefined ? '<div class="up-sub">saldo ' + upSlipRp_(sk) + '</div>' : '') + '</td>' +
      '<td class="num">' + (edit ? inp("potonganLain", Number(s["Potongan Lain"]) || 0) + '<div>' + inp("keteranganPotongan", s["Keterangan Potongan"] || "", "up-slip-ket") + '</div>' : upSlipRp_(s["Potongan Lain"]) + (s["Keterangan Potongan"] ? '<div class="up-sub">' + upEsc_(s["Keterangan Potongan"]) + '</div>' : '')) + '</td>' +
      '<td class="num"><b>' + upSlipRp_(s.Netto) + '</b></td>' +
      '<td class="up-slip-st">' + upEsc_(st) + (st === "Dibayar" ? '<div class="up-sub">' + upEsc_(s["Tanggal Bayar"]) + ' &#183; ' + upEsc_(s["Akun Kas"]) + '</div>' : '') + (st === "Dibatalkan" && s["Alasan Batal"] ? '<div class="up-sub">' + upEsc_(s["Alasan Batal"]) + '</div>' : '') + '</td>' +
      '<td class="up-slip-aksi">' + (edit
        ? '<button class="up-btn up-btn-kecil" type="button" onclick="upSlipSimpanEdit(\'' + idJs + '\')"' + (UP_SLIP_SIBUK ? ' disabled' : '') + '>Simpan</button> <button class="up-btn up-btn-kecil up-btn-putih" type="button" onclick="upSlipEditBatal()">Batal ubah</button>'
        : (isDraf ? '<button class="up-btn up-btn-kecil up-btn-putih" type="button" onclick="upSlipEdit(\'' + idJs + '\')">Ubah</button> ' : '') +
          (st !== "Dibatalkan" ? '<button class="up-btn up-btn-kecil up-btn-putih" type="button" onclick="upSlipBatal(\'' + idJs + '\')"' + (UP_SLIP_SIBUK ? ' disabled' : '') + '>Batal</button>' : '')) + '</td></tr>';
  }).join("");
  const tabel = slip.length
    ? '<div class="up-tabelwrap"><table class="up-tabel up-slip-tabel" id="up-slip-tabel"><thead><tr><th></th><th>Slip</th><th>Karyawan</th><th class="num">Pcs</th><th class="num">Upah / pokok</th><th class="num">Tunjangan</th><th class="num">THR</th><th class="num">Pot. kasbon</th><th class="num">Pot. lain</th><th class="num">Netto</th><th>Status</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>'
    : '<p class="up-info" id="up-slip-kosong">Belum ada slip untuk periode ini. Tekan <b>Buat draf periode ini</b> sesudah memeriksa upah di atas.</p>';
  el.innerHTML = '<div class="up-kartu">' + judul + '<div class="up-sub">Periode ' + upEsc_((d.periode || {}).dari || per.dari) + ' &#8212; ' + upEsc_((d.periode || {}).sampai || per.sampai) + (d.drafLain ? ' &#183; ' + d.drafLain + ' draf periode lain masih menggantung' : '') + '</div>' +
    ringkas + peringatan + bilah + pesan + tabel + '</div>';
}
