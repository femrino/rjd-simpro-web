/**
 * ============================================================
 * SIMPRO -- simpro-kas  (v225)
 * ============================================================
 * BUKU KAS & BANK (kas.html) -- tahap 1 sistem keuangan.
 *
 * Halaman ini hanya MENCATAT dan MENAMPILKAN; semua aturan (kategori sah,
 * bulan tertutup, siapa boleh apa) ada di keuangan-kas.gs. Kas masuk dari
 * klien tidak diketik di sini -- dibaca backend dari SD Pelunasan.
 *
 * Bagian: saldo per akun -> form catat -> buku kas bulan -> arus kas 6 bulan
 * -> rekonsiliasi & tutup bulan (finance).
 *
 * DIMUAT DI : kas.html. URUTAN: simpro-global.js WAJIB lebih dulu.
 * JANGAN diunggah ke Apps Script. Ini kode BROWSER, bukan server.
 */

const KS_OAUTH_CLIENT_ID = "1004242498410-6g4palcfo8p4kifmpkhnu1b9eaq424nl.apps.googleusercontent.com";
const KS_API_URL = "https://script.google.com/macros/s/AKfycbwIe9qIookHaaYNEyQ0OdX5mtIVXXwQThMKnvKBOslSxlstZaPjvqmiTeC9pz_FMpfLig/exec";

let KS_ID_TOKEN = null;
let KS_DATA = null;
let KS_BULAN = null;          // "yyyy-MM" yang sedang dilihat
let KS_BUKTI = null;          // { base64, mime, nama } foto yang siap dikirim
let KS_SIBUK = false;

const KS_BULAN_NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KS_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ---------- util ----------
function ksEsc_(s) {
  return (typeof rjdEscapeHtml_ === "function") ? rjdEscapeHtml_(s)
    : String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function ksRp(n) { n = Math.round(Number(n) || 0); return (n < 0 ? "\u2212" : "") + Math.abs(n).toLocaleString("id-ID"); }
function ksTgl(iso) { if (!iso) return ""; const p = iso.split("-"); return Number(p[2]) + " " + KS_BULAN_PENDEK[Number(p[1]) - 1]; }
function ksNamaBulan(b) { const p = b.split("-"); return KS_BULAN_NAMA[Number(p[1]) - 1] + " " + p[0]; }
function ksGeserBulan(b, n) { const y = Number(b.slice(0, 4)), m = Number(b.slice(5, 7)) - 1 + n; const d = new Date(y, m, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function ksShow(id) {
  ["ks-login-box", "ks-loading", "ks-isi"].forEach(function (x) { const el = document.getElementById(x); if (el) el.classList.add("hidden"); });
  const t = document.getElementById(id); if (t) t.classList.remove("hidden");
}
function ksNamaAkun(kode) {
  const a = (KS_DATA && KS_DATA.akun || []).filter(function (x) { return x.kode === kode; })[0];
  return a ? a.nama : kode;
}

// ---------- sesi (pola sama dengan jadwal/upah) ----------
function ksBacaSesi_() {
  try { const raw = localStorage.getItem("db_session"); if (!raw) return null; const d = JSON.parse(raw); if (!d.exp || d.exp * 1000 <= Date.now()) return null; return d.token; } catch (e) { return null; }
}
function ksSimpanSesi_(token) {
  try { const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); localStorage.setItem("db_session", JSON.stringify({ token: token, exp: p.exp })); } catch (e) { /* private mode */ }
}
function ksHandleGoogleLogin(response) { KS_ID_TOKEN = response.credential; ksSimpanSesi_(response.credential); ksMulai(); }
function ksLogout() {
  KS_ID_TOKEN = null; try { localStorage.removeItem("db_session"); } catch (e) { /* private mode */ }
  if (typeof google !== "undefined" && google.accounts) google.accounts.id.disableAutoSelect();
  const b = document.getElementById("ks-nav-logout"); if (b) b.classList.add("hidden");
  ksShow("ks-login-box");
}
function ksMulai() { if (typeof rjdJagaHalaman === "function") rjdJagaHalaman(KS_ID_TOKEN, KS_API_URL, ksMulaiIsi_); else ksMulaiIsi_(); }
function ksMulaiIsi_() {
  const b = document.getElementById("ks-nav-logout"); if (b) b.classList.remove("hidden");
  ksShow("ks-loading"); ksMuatPertama_();
}

// ---------- API ----------
function ksKirim_(action, muatan) {
  return fetch(KS_API_URL, { method: "POST", body: JSON.stringify(Object.assign({ idToken: KS_ID_TOKEN, action: action }, muatan || {})) })
    .then(function (r) { return r.text(); })
    .then(function (teks) {
      let d; try { d = JSON.parse(teks); } catch (e) { throw new Error("jawaban server tidak terbaca: " + String(teks).replace(/<[^>]*>/g, " ").trim().slice(0, 80)); }
      if (!d || !d.success) throw new Error((d && d.error) || "Permintaan ditolak server.");
      return d;
    });
}
/* v228 -- SNAPSHOT LOKAL (Tipe B), khusus buku kas.
   Uang menuntut kehati-hatian lebih daripada daftar produksi: snapshot di sini
   HANYA dipakai oleh pemuatan pertama halaman (ksMulaiIsi_), TIDAK PERNAH oleh
   ksMuat() yang dipanggil ulang sesudah menyimpan transaksi, membatalkan, atau
   menutup bulan. Menampilkan saldo lama sesaat sesudah orang mencatat uang
   keluar adalah cara tercepat membuat orang mencatatnya dua kali.
   Kuncinya memuat BULAN supaya bulan berbeda tidak saling menimpa. */
var KS_SUDAH_SEGAR = false;
/* v229: umur snapshot halaman uang dipendekkan dari 3 hari jadi 1 hari.
   Daftar produksi yang basi cuma bikin orang menyegarkan; saldo kas yang basi
   bisa jadi dasar keputusan. Ubah angka ini ke 8 * 60 kalau ingin snapshot
   selalu mati semalam. */
var KS_SNAP_UMUR_MENIT = 24 * 60;
/* Waktu snapshot yang SEDANG ditampilkan -- dipakai bilah versi gagal. */
var KS_SNAP_WAKTU = null;

function ksMuatPertama_() {
  if (!KS_SUDAH_SEGAR && typeof rjdSnapshotBaca_ === "function") {
    var snap = rjdSnapshotBaca_("kas_" + (KS_BULAN || "kini"), KS_SNAP_UMUR_MENIT);
    if (snap && snap.data && snap.data.akun) {
      KS_DATA = snap.data; KS_BULAN = snap.data.bulan; KS_SNAP_WAKTU = snap.waktu;
      ksShow("ks-isi"); ksRender();
      // v229: bilah ditaruh di #ks-saldo, BUKAN #ks-buku. Penangan galat
      // ksMuat menimpa seluruh isi #ks-buku -- dulu bilahnya ikut terhapus
      // justru saat paling dibutuhkan, sementara kartu saldo di #ks-saldo
      // tetap memajang angka lama tanpa keterangan apa pun.
      if (typeof rjdSnapshotBar_ === "function") rjdSnapshotBar_("ks-saldo", snap.waktu);
    }
  }
  return ksMuat(KS_BULAN);
}

function ksMuat(bulan) {
  return ksKirim_("getKas", { bulan: bulan || KS_BULAN || undefined })
    .then(function (d) {
      KS_DATA = d; KS_BULAN = d.bulan; ksShow("ks-isi"); ksRender();
      KS_SUDAH_SEGAR = true; KS_SNAP_WAKTU = null;
      if (typeof rjdSnapshotSimpan_ === "function") rjdSnapshotSimpan_("kas_" + d.bulan, d);
      if (typeof rjdSnapshotBarHapus_ === "function") rjdSnapshotBarHapus_("ks-saldo");
    })
    .catch(function (e) {
      ksShow("ks-isi");
      document.getElementById("ks-buku").innerHTML = '<div class="ks-kartu"><p class="ks-galat">' + ksEsc_(e.message || "Gagal memuat.") + '</p></div>';
      // v229: kalau yang tampil di atas adalah SALDO TERSIMPAN, katakan begitu.
      // ksRender menulis ulang #ks-saldo, jadi bilahnya dipasang SESUDAH ini.
      if (KS_SNAP_WAKTU && typeof rjdSnapshotBarGagal_ === "function") {
        rjdSnapshotBarGagal_("ks-saldo", KS_SNAP_WAKTU);
      }
    });
}

// ---------- render ----------
function ksRender() {
  ksRenderSaldo_(); ksRenderForm_(); ksRenderBulan_(); ksRenderBuku_(); ksRenderArus_(); ksRenderRekon_(); ksRenderPeringatan_();
}

function ksRenderSaldo_() {
  const el = document.getElementById("ks-saldo"); if (!el) return;
  const d = KS_DATA; let total = 0;
  el.innerHTML = (d.akun || []).filter(function (a) { return a.aktif; }).map(function (a) {
    const s = d.saldo[a.kode] || 0; total += s;
    return '<div class="ks-saldo-kartu"><div class="ks-saldo-lbl">' + ksEsc_(a.nama) + '</div><div class="ks-saldo-nilai' + (s < 0 ? ' ks-minus' : '') + '">Rp ' + ksRp(s) + '</div></div>';
  }).join("") + '<div class="ks-saldo-kartu ks-saldo-total"><div class="ks-saldo-lbl">Total uang usaha</div><div class="ks-saldo-nilai">Rp ' + ksRp(total) + '</div></div>';
  const info = document.getElementById("ks-saldo-info");
  if (info) info.innerHTML = d.adaSaldoAwal ? 'Saldo per hari ini, ' + ksEsc_(ksTgl(d.hariIni)) + ' ' + d.hariIni.slice(0, 4) + '.'
    : '<b>Saldo awal belum diisi.</b> Catat saldo tiap akun per ' + ksEsc_(ksTgl(d.tanggalMulai)) + ' ' + d.tanggalMulai.slice(0, 4) + ' lewat form di bawah (arah "Saldo Awal", hanya owner/finance).';
}

function ksRenderForm_() {
  const d = KS_DATA;
  const selAkun = document.getElementById("ks-in-akun"), selTujuan = document.getElementById("ks-in-tujuan");
  const opsiAkun = (d.akun || []).filter(function (a) { return a.aktif; }).map(function (a) { return '<option value="' + ksEsc_(a.kode) + '">' + ksEsc_(a.nama) + '</option>'; }).join("");
  if (selAkun && !selAkun.options.length) selAkun.innerHTML = opsiAkun;
  if (selTujuan && !selTujuan.options.length) selTujuan.innerHTML = '<option value="">-- akun tujuan --</option>' + opsiAkun;
  const tgl = document.getElementById("ks-in-tanggal"); if (tgl && !tgl.value) tgl.value = d.hariIni;
  const saldoAwal = document.getElementById("ks-arah-saldoawal-wrap"); if (saldoAwal) saldoAwal.classList.toggle("hidden", !d.bisaFinance);
  ksFormArahBerubah();
}

/** Kategori mengikuti arah. Transfer: tanpa kategori, tampilkan akun tujuan. */
function ksFormArahBerubah() {
  const arah = (document.querySelector('input[name="ks-arah"]:checked') || {}).value || "Keluar";
  const wKat = document.getElementById("ks-in-kategori-wrap"), wTujuan = document.getElementById("ks-in-tujuan-wrap");
  const sel = document.getElementById("ks-in-kategori");
  const punyaKategori = arah === "Masuk" || arah === "Keluar";
  if (wKat) wKat.classList.toggle("hidden", !punyaKategori);
  if (wTujuan) wTujuan.classList.toggle("hidden", arah !== "Transfer");
  if (sel && KS_DATA) {
    const lama = sel.value;
    const daftar = (KS_DATA.kategori || []).filter(function (k) { return k.arah === arah && k.kategori !== "Pelunasan klien"; });
    sel.innerHTML = '<option value="">-- kategori --</option>' + daftar.map(function (k) { return '<option value="' + ksEsc_(k.kategori) + '">' + ksEsc_(k.kategori) + '</option>'; }).join("");
    if (daftar.some(function (k) { return k.kategori === lama; })) sel.value = lama;
  }
  const lblAkun = document.getElementById("ks-in-akun-label");
  if (lblAkun) lblAkun.textContent = arah === "Transfer" ? "Dari akun" : (arah === "Masuk" ? "Masuk ke akun" : (arah === "Saldo Awal" ? "Akun" : "Dibayar dari akun"));
  const tglIn = document.getElementById("ks-in-tanggal");
  if (tglIn && arah === "Saldo Awal" && KS_DATA) tglIn.value = KS_DATA.tanggalMulai;
}

/** Foto bukti: diperkecil di browser (maks 1280 px, JPEG 0,75) supaya unggahan ringan dari HP. */
function ksBuktiDipilih(input) {
  const f = input.files && input.files[0]; const info = document.getElementById("ks-bukti-info");
  KS_BUKTI = null;
  if (!f) { if (info) info.textContent = ""; return; }
  const img = new Image(); const url = URL.createObjectURL(f);
  img.onload = function () {
    const maks = 1280; let w = img.width, h = img.height;
    if (w > maks || h > maks) { const r = Math.min(maks / w, maks / h); w = Math.round(w * r); h = Math.round(h * r); }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/jpeg", 0.75);
    KS_BUKTI = { base64: dataUrl.split(",")[1], mime: "image/jpeg", nama: f.name };
    if (info) info.textContent = "Bukti siap (" + Math.round(dataUrl.length * 0.75 / 1024) + " KB).";
    URL.revokeObjectURL(url);
  };
  img.onerror = function () { if (info) info.textContent = "File bukan gambar -- lewati atau pilih foto."; URL.revokeObjectURL(url); };
  img.src = url;
}

function ksPesan_(teks, galat) {
  const el = document.getElementById("ks-form-pesan"); if (!el) return;
  el.textContent = teks || ""; el.classList.toggle("ks-form-galat", !!galat); el.classList.toggle("hidden", !teks);
}
function ksSibuk_(v) { KS_SIBUK = v; const b = document.getElementById("ks-btn-simpan"); if (b) b.disabled = v; }

function ksSimpan() {
  if (KS_SIBUK) return;
  const arah = (document.querySelector('input[name="ks-arah"]:checked') || {}).value || "";
  const data = {
    tanggal: document.getElementById("ks-in-tanggal").value, arah: arah,
    akun: document.getElementById("ks-in-akun").value, akunTujuan: document.getElementById("ks-in-tujuan").value,
    kategori: document.getElementById("ks-in-kategori").value,
    jumlah: Number(String(document.getElementById("ks-in-jumlah").value).replace(/[^0-9]/g, "")) || 0,
    ref: document.getElementById("ks-in-ref").value.trim(), pihak: document.getElementById("ks-in-pihak").value.trim(),
    keterangan: document.getElementById("ks-in-ket").value.trim(),
    buktiBase64: KS_BUKTI ? KS_BUKTI.base64 : "", buktiMime: KS_BUKTI ? KS_BUKTI.mime : ""
  };
  if (!data.tanggal) { ksPesan_("Isi tanggal.", true); return; }
  if (!data.jumlah) { ksPesan_("Isi jumlah.", true); return; }
  if ((arah === "Masuk" || arah === "Keluar") && !data.kategori) { ksPesan_("Pilih kategori.", true); return; }
  if (arah === "Transfer" && !data.akunTujuan) { ksPesan_("Pilih akun tujuan.", true); return; }
  if (arah === "Keluar" && !KS_BUKTI && !window.confirm("Tanpa foto bukti? Struk/nota sebaiknya difoto.")) return;
  ksSibuk_(true); ksPesan_("Menyimpan...");
  ksKirim_("simpanKas", { data: data })
    .then(function (res) {
      ksSibuk_(false);
      ksPesan_(res.kembar ? "Transaksi yang sama persis baru saja dicatat -- tidak digandakan." : "Tercatat: " + arah + " Rp " + ksRp(data.jumlah) + (data.kategori ? " (" + data.kategori + ")" : "") + (res.bukti ? " · bukti tersimpan" : ""));
      ["ks-in-jumlah", "ks-in-ref", "ks-in-pihak", "ks-in-ket"].forEach(function (id) { document.getElementById(id).value = ""; });
      const fb = document.getElementById("ks-in-bukti"); if (fb) fb.value = ""; KS_BUKTI = null; const bi = document.getElementById("ks-bukti-info"); if (bi) bi.textContent = "";
      const bulanTrx = data.tanggal.slice(0, 7);
      ksMuat(bulanTrx);
    })
    .catch(function (e) {
      ksSibuk_(false);
      const jaringan = e instanceof TypeError;
      ksPesan_(jaringan ? "Jawaban server tidak sampai. Daftar dimuat ulang -- periksa apakah transaksinya sudah ada sebelum mencatat lagi." : e.message, true);
      if (jaringan) ksMuat(data.tanggal.slice(0, 7));
    });
}

function ksRenderBulan_() {
  const el = document.getElementById("ks-bulan-judul"); if (el) el.textContent = ksNamaBulan(KS_BULAN);
  const badge = document.getElementById("ks-bulan-status");
  if (badge) { badge.textContent = KS_DATA.tertutup ? "Ditutup" : "Terbuka"; badge.classList.toggle("ks-badge-tutup", !!KS_DATA.tertutup); }
}
function ksGeser(n) { ksShow("ks-loading"); ksMuat(ksGeserBulan(KS_BULAN, n)); }

function ksRenderBuku_() {
  const el = document.getElementById("ks-buku"); if (!el) return;
  const trx = KS_DATA.transaksi || [];
  if (!trx.length) { el.innerHTML = '<div class="ks-kartu"><p class="ks-info">Belum ada transaksi di ' + ksEsc_(ksNamaBulan(KS_BULAN)) + '.</p></div>'; return; }
  let masuk = 0, keluar = 0;
  const baris = trx.slice().reverse().map(function (t) {
    const batal = !!t.dibatalkanOleh, pembalik = t.status === "Pembalik";
    if (!batal && !pembalik) { if (t.arah === "Masuk") masuk += t.jumlah; else if (t.arah === "Keluar") keluar += t.jumlah; }
    const kelas = "ks-r" + (batal ? " ks-r-batal" : "") + (pembalik ? " ks-r-pembalik" : "");
    const arahTeks = t.arah === "Transfer" ? "Transfer → " + ksEsc_(ksNamaAkun(t.akunTujuan)) : t.arah;
    const tanda = t.arah === "Masuk" || t.arah === "Saldo Awal" ? "+" : (t.arah === "Keluar" ? "\u2212" : "");
    return '<tr class="' + kelas + '">' +
      '<td class="ks-td-tgl">' + ksEsc_(ksTgl(t.tanggal)) + '</td>' +
      '<td><span class="ks-arah ks-arah-' + t.arah.replace(/\s/g, "").toLowerCase() + '">' + arahTeks + '</span>' + (t.sumber === "pelunasan" ? ' <span class="ks-otomatis" title="dari SD Pelunasan">auto</span>' : '') + '</td>' +
      '<td>' + ksEsc_(ksNamaAkun(t.akun)) + '</td>' +
      '<td>' + ksEsc_(t.kategori) + (t.pihak ? '<div class="ks-sub">' + ksEsc_(t.pihak) + '</div>' : '') + (t.keterangan ? '<div class="ks-sub">' + ksEsc_(t.keterangan) + '</div>' : '') + '</td>' +
      '<td class="ks-mono">' + ksEsc_(t.ref) + '</td>' +
      '<td class="ks-td-rp ' + (t.arah === "Masuk" || t.arah === "Saldo Awal" ? "ks-plus" : (t.arah === "Keluar" ? "ks-min" : "")) + '">' + tanda + ksRp(t.jumlah) + '</td>' +
      '<td class="ks-td-aksi">' + (t.bukti ? '<a href="' + ksEsc_(t.bukti) + '" target="_blank" rel="noopener" title="Lihat bukti">📎</a>' : '') +
        (KS_DATA.bisaFinance && !batal && !pembalik && t.sumber === "kas" ? ' <button class="ks-btn-kecil" data-id="' + ksEsc_(t.id) + '" onclick="ksBatalkan(this)" type="button">Batalkan</button>' : '') +
        (batal ? '<span class="ks-sub">dibatalkan</span>' : '') + '</td>' +
      '</tr>';
  }).join("");
  el.innerHTML = '<div class="ks-kartu ks-kartu-tabel"><table class="ks-tabel"><thead><tr><th>Tgl</th><th>Arah</th><th>Akun</th><th>Kategori / pihak</th><th>Ref</th><th class="ks-td-rp">Jumlah</th><th></th></tr></thead><tbody>' + baris + '</tbody>' +
    '<tfoot><tr><td colspan="5">Masuk <b>Rp ' + ksRp(masuk) + '</b> · Keluar <b>Rp ' + ksRp(keluar) + '</b> · Bersih <b>Rp ' + ksRp(masuk - keluar) + '</b></td><td colspan="2"></td></tr></tfoot></table></div>';
}

function ksBatalkan(btn) {
  const id = btn.getAttribute("data-id");
  const alasan = window.prompt("Alasan pembatalan (wajib, akan tercatat):");
  if (alasan === null) return;
  btn.disabled = true;
  ksKirim_("batalkanKas", { id: id, alasan: alasan })
    .then(function () { ksMuat(KS_BULAN); })
    .catch(function (e) { btn.disabled = false; window.alert(e.message); });
}

function ksRenderArus_() {
  const el = document.getElementById("ks-arus"); if (!el) return;
  const arus = KS_DATA.arusKas || []; if (!arus.length) { el.innerHTML = ""; return; }
  const kMasuk = {}, kKeluar = {};
  arus.forEach(function (b) { Object.keys(b.masuk).forEach(function (k) { kMasuk[k] = 1; }); Object.keys(b.keluar).forEach(function (k) { kKeluar[k] = 1; }); });
  const kolom = arus.map(function (b) { return '<th class="ks-td-rp">' + ksEsc_(KS_BULAN_PENDEK[Number(b.bulan.slice(5, 7)) - 1] + " " + b.bulan.slice(2, 4)) + '</th>'; }).join("");
  const barisK = function (nama, ambil, kelas) { return '<tr class="' + (kelas || "") + '"><td>' + ksEsc_(nama) + '</td>' + arus.map(function (b) { const v = ambil(b); return '<td class="ks-td-rp">' + (v ? ksRp(v) : '<span class="ks-nol">–</span>') + '</td>'; }).join("") + '</tr>'; };
  let html = '<tr class="ks-r-judul"><td>Saldo awal</td>' + arus.map(function (b) { return '<td class="ks-td-rp">' + ksRp(b.saldoAwal) + '</td>'; }).join("") + '</tr>';
  html += '<tr class="ks-r-grup"><td colspan="' + (arus.length + 1) + '">Masuk</td></tr>';
  Object.keys(kMasuk).sort().forEach(function (k) { html += barisK(k, function (b) { return b.masuk[k]; }); });
  html += barisK("Total masuk", function (b) { return b.totalMasuk; }, "ks-r-total");
  html += '<tr class="ks-r-grup"><td colspan="' + (arus.length + 1) + '">Keluar</td></tr>';
  Object.keys(kKeluar).sort().forEach(function (k) { html += barisK(k, function (b) { return b.keluar[k]; }); });
  html += barisK("Total keluar", function (b) { return b.totalKeluar; }, "ks-r-total");
  html += barisK("Bersih (masuk − keluar)", function (b) { return b.totalMasuk - b.totalKeluar; }, "ks-r-total");
  html += '<tr class="ks-r-judul"><td>Saldo akhir</td>' + arus.map(function (b) { return '<td class="ks-td-rp">' + ksRp(b.saldoAkhir) + '</td>'; }).join("") + '</tr>';
  el.innerHTML = '<div class="ks-kartu ks-kartu-tabel"><table class="ks-tabel ks-tabel-arus"><thead><tr><th>Rp</th>' + kolom + '</tr></thead><tbody>' + html + '</tbody></table></div>';
}

function ksRenderRekon_() {
  const el = document.getElementById("ks-rekon"); if (!el) return;
  if (!KS_DATA.bisaFinance) { el.innerHTML = ""; return; }
  const b = KS_BULAN, rekon = KS_DATA.rekonsiliasi || {}, tutup = KS_DATA.tertutup;
  const arusBulan = (KS_DATA.arusKas || []).filter(function (x) { return x.bulan === b; })[0];
  const perAkun = arusBulan ? arusBulan.perAkunAkhir : {};
  let semuaCocok = true;
  const baris = (KS_DATA.akun || []).filter(function (a) { return a.aktif; }).map(function (a) {
    const r = rekon[a.kode]; const buku = perAkun[a.kode] || 0;
    const cocok = r && r.selisih === 0; if (!cocok) semuaCocok = false;
    return '<tr><td>' + ksEsc_(a.nama) + '</td><td class="ks-td-rp">' + ksRp(buku) + '</td>' +
      '<td>' + (tutup ? '<span class="ks-td-rp">' + (r ? ksRp(r.saldoBank) : "–") + '</span>' : '<input class="ks-in-rp" data-akun="' + ksEsc_(a.kode) + '" inputmode="numeric" placeholder="saldo menurut ' + ksEsc_(a.jenis === "Bank" ? "rekening" : "hitungan laci") + '" type="text" value="' + (r ? r.saldoBank : "") + '" data-awal="' + (r ? r.saldoBank : "") + '"/>') + '</td>' +
      '<td class="ks-td-rp ' + (r ? (cocok ? "ks-plus" : "ks-min") : "") + '">' + (r ? ksRp(r.selisih) : "–") + '</td>' +
      '<td>' + (r ? '<span class="ks-sub">' + ksEsc_(r.oleh.split("@")[0]) + '</span>' : (tutup ? '' : '<span class="ks-sub">belum</span>')) + '</td></tr>';
  }).join("");
  const bolehTutup = !tutup && semuaCocok && b < KS_DATA.hariIni.slice(0, 7);
  el.innerHTML = '<div class="ks-kartu"><div class="ks-kartu-judul">Rekonsiliasi ' + ksEsc_(ksNamaBulan(b)) + '</div>' +
    '<p class="ks-info">Isi saldo tiap akun per akhir bulan menurut rekening/laci. Selisih 0 = buku cocok. Bulan hanya bisa ditutup kalau semua akun cocok.</p>' +
    '<div class="ks-gulir"><table class="ks-tabel"><thead><tr><th>Akun</th><th class="ks-td-rp">Saldo buku</th><th>Saldo bank/laci</th><th class="ks-td-rp">Selisih</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>' +
    '<div class="ks-aksi">' + (tutup ? '<span class="ks-badge ks-badge-tutup">Bulan ini sudah ditutup</span>' :
      '<button class="ks-btn" onclick="ksRekonSimpan()" type="button">Simpan rekonsiliasi</button>' +
      '<button class="ks-btn ks-btn-utama" ' + (bolehTutup ? '' : 'disabled="disabled" title="Semua akun harus cocok dan bulan sudah lewat"') + ' onclick="ksTutupBulan()" type="button">Tutup bulan</button>') +
    '<span class="ks-form-pesan hidden" id="ks-rekon-pesan"></span></div></div>';
}

function ksRekonSimpan() {
  const inputs = Array.prototype.slice.call(document.querySelectorAll("#ks-rekon input[data-akun]"));
  // Hanya yang diisi DAN berubah dari nilai tersimpan -- rekonsiliasi yang
  // sama tidak ditulis ulang.
  const isi = inputs.filter(function (i) { const v = String(i.value).trim(); return v !== "" && String(Number(v.replace(/[^0-9-]/g, "")) || 0) !== String(i.getAttribute("data-awal") || ""); });
  if (!isi.length) { window.alert("Tidak ada saldo baru/berubah untuk disimpan."); return; }
  const pesan = document.getElementById("ks-rekon-pesan"); pesan.classList.remove("hidden"); pesan.textContent = "Menyimpan...";
  let rantai = Promise.resolve();
  isi.forEach(function (i) {
    rantai = rantai.then(function () { return ksKirim_("rekonsiliasiKas", { data: { bulan: KS_BULAN, akun: i.getAttribute("data-akun"), saldoBank: Number(String(i.value).replace(/[^0-9-]/g, "")) || 0 } }); });
  });
  rantai.then(function () { ksMuat(KS_BULAN); }).catch(function (e) { pesan.textContent = e.message; pesan.classList.add("ks-form-galat"); });
}
function ksTutupBulan() {
  if (!window.confirm("Tutup " + ksNamaBulan(KS_BULAN) + "? Setelah ditutup, transaksi bertanggal di bulan ini tidak bisa ditambah; koreksi dicatat di bulan berjalan.")) return;
  ksKirim_("tutupBulanKas", { bulan: KS_BULAN }).then(function () { ksMuat(KS_BULAN); }).catch(function (e) { window.alert(e.message); });
}

function ksRenderPeringatan_() {
  const el = document.getElementById("ks-peringatan"); if (!el) return;
  const p = KS_DATA.peringatan || [];
  if (!KS_DATA.sheetAda) { el.classList.remove("hidden"); el.innerHTML = '<b>Sheet "SD Kas" belum ada.</b> Jalankan <code>buatSheetKas()</code> di Apps Script.'; return; }
  if (!p.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = '<b>' + p.length + ' baris di SD Kas tidak bisa dihitung</b> -- perbaiki di sheet:<ul>' + p.map(function (x) { return '<li>Baris ' + x.baris + ' <span class="ks-mono">' + ksEsc_(x.id) + '</span>: ' + ksEsc_(x.pesan) + '</li>'; }).join("") + '</ul>';
}

// ---------- mulai ----------
window.addEventListener("load", function () {
  const sesi = ksBacaSesi_();
  if (sesi) { KS_ID_TOKEN = sesi; ksMulai(); return; }
  if (typeof google === "undefined" || !google.accounts) { ksShow("ks-login-box"); return; }
  google.accounts.id.initialize({ client_id: KS_OAUTH_CLIENT_ID, callback: ksHandleGoogleLogin });
  const t = document.getElementById("ks-google-btn"); if (t) google.accounts.id.renderButton(t, { theme: "outline", size: "large", width: 260 });
  ksShow("ks-login-box");
});
