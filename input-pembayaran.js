/**
 * ============================================================
 * INPUT PEMBAYARAN KLIEN -- dari web, menggantikan AppSheet
 * ============================================================
 * Satu formulir untuk DUA jenis pembayaran yang selama ini bentuknya berbeda:
 *
 *   1. Pembayaran atas INVOICE     -> baris SD Pelunasan dengan ID Invoice
 *   2. UANG MUKA atas ORDER (DP)   -> baris SD Pelunasan dengan ID Purchase Order
 *
 * Jenis kedua belum pernah ada sebelum Proforma Invoice: DP dibayar sebelum
 * barang dikirim, sementara invoice RJD baru lahir dari pengiriman. Uang itu
 * dulu tidak punya tempat sama sekali.
 *
 * ============================================================
 * SATU HAL YANG TIDAK BOLEH DILUPAKAN SAAT MENGUBAH BERKAS INI
 * ============================================================
 * SD Pelunasan adalah CERMIN, bukan buku tambah-tambahan.
 * syncStatusPembayaranSemuaInvoice_ menghitung ULANG DARI NOL setiap kali
 * dipanggil. Artinya:
 *
 *   - menambah baris  -> Total Dibayar naik
 *   - MENGHAPUS baris -> Total Dibayar TURUN, status ikut turun
 *
 * Itu memang yang diinginkan (koreksi harus bisa sampai), tapi berarti
 * menghapus baris di sini bukan operasi sepele: satu penghapusan yang keliru
 * bisa mengembalikan invoice yang sudah Lunas jadi piutang. Karena itu
 * hapusPembayaran_ menuntut ID yang persis, mencatat isi barisnya ke log
 * sebelum menghapus, dan tidak punya versi "hapus banyak sekaligus".
 *
 * BERKAS TERKAIT: pelunasan.gs (sync & alokasi), cetak-proforma.gs (nilai DP
 * yang diminta), buat-invoice.gs (pola penomoran).
 */

/** Metode bayar yang ditawarkan formulir. Teks bebas tetap diterima backend. */
const METODE_BAYAR_PILIHAN = ["Transfer BCA", "Transfer Bank Lain", "Tunai", "Giro/Cek", "Lainnya"];

/**
 * ID Pelunasan baru -- "BYR-{YYMM}.{3 digit}".
 *
 * HANYA memindai ID yang cocok pola ini. Baris lama yang dibuat AppSheet
 * boleh berformat apa pun; karena tidak dipindai, keduanya tidak akan pernah
 * bertabrakan. Itu juga sebabnya prefiksnya "BYR-" dan bukan sesuatu yang
 * generik: kalau suatu saat AppSheet ikut memakai pola yang sama, tabrakannya
 * akan segera kelihatan alih-alih menumpuk diam-diam.
 */
function generateIdPelunasanBaru_(sheet) {
  const data = sheet.getDataRange().getValues();
  const idx = data[0].indexOf(KOLOM_PELUNASAN.idPelunasan);
  if (idx === -1) throw new Error("Kolom '" + KOLOM_PELUNASAN.idPelunasan + "' tidak ketemu.");

  const now = new Date();
  const yymm = Utilities.formatDate(now, "GMT+7", "yyMM");
  const prefixTahunIni = "BYR-" + Utilities.formatDate(now, "GMT+7", "yy");

  let terbesar = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idx] || "");
    if (id.indexOf(prefixTahunIni) !== 0) continue;
    const m = /^BYR-\d{4}\.(\d+)/.exec(id);
    if (!m) continue;
    const angka = parseInt(m[1], 10);
    if (!isNaN(angka) && angka > terbesar) terbesar = angka;
  }
  return "BYR-" + yymm + "." + String(terbesar + 1).padStart(3, "0");
}

/**
 * ============================================================
 * DAFTAR TUJUAN PEMBAYARAN -- untuk dropdown formulir
 * ============================================================
 * Dua daftar sekaligus:
 *   invoice : yang BELUM lunas (yang sudah lunas tidak perlu dibayar lagi)
 *   order   : PO yang punya proforma aktif -- inilah tujuan uang muka
 *
 * Keduanya dikirim dalam satu panggilan, bukan dua: formulir ini selalu
 * membutuhkan keduanya sekaligus, dan dua panggilan berarti dua kesempatan
 * gagal untuk satu layar yang sama.
 *
 * STAFF ONLY.
 */
function getTujuanPembayaran_(email) {
  const staff = findStaffByEmail(email);
  if (!staff) throw new Error("Halaman ini khusus staff internal RJD Apparel.");

  const ss = SpreadsheetApp.openById(SHEET_ID);

  // ---------- nama klien ----------
  const klienNama = {};
  try {
    const kl = ss.getSheetByName(KLIEN_SHEET_NAME);
    if (kl && kl.getLastRow() > 1) {
      const d = kl.getDataRange().getValues();
      const h = d[0];
      const a = h.indexOf(KOLOM_KLIEN.id), b = h.indexOf(KOLOM_KLIEN.nama);
      if (a !== -1 && b !== -1) for (let i = 1; i < d.length; i++) if (d[i][a]) klienNama[d[i][a]] = d[i][b];
    }
  } catch (e) { /* nama klien opsional */ }

  // ---------- invoice belum lunas ----------
  const invoice = [];
  const invSheet = ss.getSheetByName(INVOICE_SHEET_NAME);
  if (invSheet && invSheet.getLastRow() > 1) {
    const data = invSheet.getDataRange().getValues();
    const idx = petaKolomInvoice_(data[0]);
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = row[idx.idInvoice];
      if (!id) continue;
      const status = row[idx.statusPembayaran] || "";
      if (status === "Dibatalkan") continue;

      // Angka dihitung ulang lewat hitungNilaiInvoice_, BUKAN dibaca dari kolom
      // turunan -- alasan yang sama seperti di seluruh sistem: kolom turunan
      // bisa basi, hasil hitung dari kolom input tidak bisa.
      const n = hitungNilaiInvoice_(ambilNilaiInvoice_(row, idx));
      if (n.sisaTagihan <= 0) continue;

      const idKlien = idx.idKlien !== -1 ? row[idx.idKlien] : "";
      invoice.push({
        id: id,
        idPurchaseOrder: idx.idPurchaseOrder !== -1 ? (row[idx.idPurchaseOrder] || "") : "",
        idKlien: idKlien,
        namaKlien: klienNama[idKlien] || idKlien || "-",
        tanggal: idx.tanggalInvoice !== -1 ? formatTanggal(row[idx.tanggalInvoice]) : "",
        tanggalIso: idx.tanggalInvoice !== -1 ? isoTanggal_(row[idx.tanggalInvoice]) : "",
        nilaiTransfer: n.nilaiTransfer,
        sudahDibayar: n.totalDibayar,
        sisa: n.sisaTagihan,
        status: status || "Belum Dibayar"
      });
    }
    invoice.sort(function (a, b) { return String(a.tanggalIso).localeCompare(String(b.tanggalIso)); });
  }

  // ---------- PO dengan proforma aktif ----------
  const order = [];
  const prSheet = ss.getSheetByName(PROFORMA_SHEET_NAME);
  if (prSheet && prSheet.getLastRow() > 1) {
    const data = prSheet.getDataRange().getValues();
    const idx = petaKolomProforma_(data[0]);
    const terbaikPerPo = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const po = String(row[idx.idPurchaseOrder] || "").trim();
      if (!po) continue;
      if (!proformaMasihAktif_(row[idx.status])) continue;
      const versi = Number(row[idx.versi]) || 1;
      if (terbaikPerPo[po] && terbaikPerPo[po].versi > versi) continue;
      terbaikPerPo[po] = { row: row, versi: versi };
    }

    // Uang muka yang SUDAH masuk per PO -- supaya formulir bisa menampilkan
    // "DP diminta 6.524.000, sudah masuk 3.000.000" alih-alih memaksa staf
    // membuka SD Pelunasan untuk mengeceknya.
    const sudahMasuk = hitungUangMukaPerPo_(ss);

    Object.keys(terbaikPerPo).forEach(function (po) {
      const row = terbaikPerPo[po].row;
      const idKlien = row[idx.idKlien] || "";
      const diminta = Number(row[idx.nilaiDP]) || 0;
      const masuk = sudahMasuk[po] || 0;
      order.push({
        idPurchaseOrder: po,
        idProforma: row[idx.idProforma],
        versi: terbaikPerPo[po].versi,
        idKlien: idKlien,
        namaKlien: klienNama[idKlien] || idKlien || "-",
        kodeTermin: row[idx.kodeTermin] || "",
        nilaiProforma: Number(row[idx.nilaiProforma]) || 0,
        nilaiDPDiminta: diminta,
        uangMukaMasuk: masuk,
        kurangDP: Math.max(0, diminta - masuk),
        status: row[idx.status] || "",
        tanggal: formatTanggal(row[idx.tanggalTerbit]),
        jatuhTempoDP: row[idx.jatuhTempoDP] ? formatTanggal(row[idx.jatuhTempoDP]) : ""
      });
    });
    // Yang DP-nya masih kurang di atas -- itu daftar tagih harian CS.
    order.sort(function (a, b) {
      if ((a.kurangDP > 0) !== (b.kurangDP > 0)) return a.kurangDP > 0 ? -1 : 1;
      return String(a.idProforma).localeCompare(String(b.idProforma));
    });
  }

  return { invoice: invoice, order: order, metode: METODE_BAYAR_PILIHAN };
}

/** Total uang muka (baris ber-ID Purchase Order) per PO. */
function hitungUangMukaPerPo_(ss) {
  const sheet = pastikanSheetPelunasan_(ss);
  const hasil = {};
  if (sheet.getLastRow() <= 1) return hasil;
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const iPo = h.indexOf(KOLOM_PELUNASAN.idPurchaseOrder);
  const iInv = h.indexOf(KOLOM_PELUNASAN.idInvoice);
  const iJml = h.indexOf(KOLOM_PELUNASAN.jumlahDibayar);
  if (iPo === -1) return hasil;

  for (let i = 1; i < data.length; i++) {
    // Baris yang punya ID Invoice BUKAN uang muka, walau kolom PO-nya kebetulan
    // ikut terisi -- aturan "ID Invoice menang" harus sama persis dengan yang
    // dipakai sync, kalau tidak dua tempat akan melaporkan angka berbeda.
    if (iInv !== -1 && data[i][iInv]) continue;
    const po = String(data[i][iPo] || "").trim();
    if (!po) continue;
    hasil[po] = (hasil[po] || 0) + (Number(data[i][iJml]) || 0);
  }
  return hasil;
}

/**
 * ============================================================
 * SIMPAN PEMBAYARAN -- SATU ATAU BANYAK TUJUAN SEKALIGUS
 * ============================================================
 * Menulis SATU ATAU LEBIH baris ke SD Pelunasan dari SATU transfer bank, lalu
 * menjalankan sync sekali di akhir.
 *
 * ============================================================
 * KENAPA SATU FUNGSI UNTUK KEDUANYA
 * ============================================================
 * Pembayaran satu invoice dan pembayaran yang dipecah ke beberapa invoice
 * TAMPAK seperti dua fitur, padahal yang pertama cuma kasus khusus dari yang
 * kedua dengan satu alokasi. Kalau ditulis sebagai dua fungsi terpisah,
 * keduanya akan menyimpan validasi yang sama dalam dua salinan -- dan salinan
 * yang jarang dipakai adalah yang akan ketinggalan saat aturannya berubah.
 * simpanPembayaran_ di bawah cuma membungkus fungsi ini.
 *
 * ============================================================
 * SYNC DIJALANKAN SEKALI, DI AKHIR
 * ============================================================
 * BUKAN sekali per baris. syncStatusPembayaranSemuaInvoice_ membaca &
 * menghitung ulang SELURUH SD Invoice tiap kali dipanggil; memanggilnya per
 * alokasi berarti pekerjaan yang sama diulang N kali untuk hasil akhir yang
 * identik. Pada transfer yang dipecah ke lima invoice itu lima kali pembacaan
 * sheet penuh -- cukup untuk menabrak batas waktu Apps Script.
 *
 * @param {Object} p {tanggalBayar, metodeBayar?, noReferensi?, catatan?,
 *                    totalTransfer?, alokasi:[{tujuan,idInvoice?,idPurchaseOrder?,jumlah}]}
 */
function simpanPembayaranBatch_(p, email) {
  const staff = findStaffByEmail(email);
  if (!staff) throw new Error("Pencatatan pembayaran hanya bisa dilakukan staff internal RJD Apparel.");
  if (!p) throw new Error("Data pembayaran kosong.");

  const alokasi = (p.alokasi || []).filter(function (a) { return a && Number(a.jumlah) > 0; });
  if (!alokasi.length) throw new Error("Belum ada alokasi. Isi jumlah untuk minimal satu tujuan.");

  const tanggal = normalisasiTanggal_(p.tanggalBayar); // order-request.gs
  if (!tanggal) throw new Error("Tanggal bayar tidak terbaca. Pakai format tanggal yang sah.");

  // ---------- Validasi bentuk tiap alokasi ----------
  const tujuanTerpakai = {};
  let totalAlokasi = 0;
  alokasi.forEach(function (a) {
    const jumlah = Number(a.jumlah) || 0;
    if (jumlah <= 0) throw new Error("Jumlah alokasi harus lebih besar dari nol.");
    const idInvoice = String(a.idInvoice || "").trim();
    const idPO = String(a.idPurchaseOrder || "").trim();

    if (idInvoice && idPO) {
      throw new Error("Satu alokasi tidak boleh menyebut invoice DAN order sekaligus.");
    }
    if (!idInvoice && !idPO) throw new Error("Ada alokasi tanpa tujuan.");

    // Tujuan ganda dalam satu transfer DITOLAK. Dua baris ke invoice yang sama
    // memang akan dijumlahkan benar oleh sync, tapi hampir selalu berarti salah
    // input -- dan kalau dibiarkan, staf mengira alokasinya tersimpan dua-duanya
    // sebagai hal berbeda.
    const kunci = idInvoice || ("PO:" + idPO);
    if (tujuanTerpakai[kunci]) {
      throw new Error("Tujuan '" + kunci.replace("PO:", "") + "' dialokasikan lebih dari sekali. " +
        "Gabungkan jadi satu baris.");
    }
    tujuanTerpakai[kunci] = true;
    totalAlokasi += jumlah;
  });

  // Total transfer WAJIB habis dibagi. Selisih satu rupiah pun ditolak: kalau
  // sebagian dana dibiarkan tidak teralokasi, uang itu tercatat di rekening
  // tapi tidak ada di sistem mana pun -- persis keadaan yang seluruh fitur ini
  // dibuat untuk mencegah. Kalau memang ada sisa yang belum ada tagihannya,
  // sisa itu harus dialokasikan sebagai UANG MUKA ke ordernya, bukan dibiarkan.
  const totalTransfer = Number(p.totalTransfer) || 0;
  if (totalTransfer > 0 && totalAlokasi !== totalTransfer) {
    const selisih = totalTransfer - totalAlokasi;
    throw new Error("Alokasi belum pas. Total transfer " + totalTransfer +
      ", teralokasi " + totalAlokasi + ", " +
      (selisih > 0 ? "kurang " + selisih : "kelebihan " + Math.abs(selisih)) + ".");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Sistem sedang sibuk. Coba lagi beberapa detik.");

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const peringatan = [];

    // ---------- Validasi tujuan ke data nyata ----------
    // SEMUA divalidasi DULU, sebelum satu baris pun ditulis. Kalau divalidasi
    // sambil menulis, alokasi ketiga yang gagal meninggalkan dua baris pertama
    // sudah tersimpan -- separuh transfer tercatat, separuh tidak, dan tidak
    // ada yang tahu kecuali kebetulan membaca log.
    //
    // klienTerpakai mengumpulkan ID Klien tiap tujuan untuk penjaga lintas
    // klien di bawah -- lihat penjelasannya sesudah loop ini.
    const klienTerpakai = {};
    alokasi.forEach(function (a) {
      const idInvoice = String(a.idInvoice || "").trim();
      const idPO = String(a.idPurchaseOrder || "").trim();
      const jumlah = Number(a.jumlah) || 0;

      if (idInvoice) {
        const cek = cariBarisInvoice_(ss, idInvoice);
        if (!cek) throw new Error("Invoice '" + idInvoice + "' tidak ditemukan.");
        if (cek.status === "Dibatalkan") {
          throw new Error("Invoice '" + idInvoice + "' berstatus Dibatalkan. Batalkan dulu status itu " +
            "kalau memang ada pembayaran yang masuk untuknya.");
        }
        // Kelebihan bayar TIDAK ditolak -- itu kejadian nyata (klien membulatkan
        // ke atas). Dicatat sebagai peringatan supaya terlihat; menolaknya akan
        // memaksa staf mengarang angka yang tidak sesuai bukti transfer, dan
        // bukti transfer selalu lebih benar daripada aturan kita.
        if (jumlah > cek.sisa + 1) {
          peringatan.push("Alokasi ke " + idInvoice + " (" + jumlah + ") melebihi sisa tagihannya (" +
            cek.sisa + "). Tetap dicatat.");
        }
        if (cek.idKlien) {
          if (!klienTerpakai[cek.idKlien]) klienTerpakai[cek.idKlien] = [];
          klienTerpakai[cek.idKlien].push(idInvoice);
        }
        return;
      }

      let poBaris;
      try {
        poBaris = bacaBarisPO_(ss, idPO); // cetak-proforma.gs -- melempar kalau PO tidak ada
      } catch (e) {
        throw new Error("Purchase Order '" + idPO + "' tidak ditemukan.");
      }
      const iKlienPO = poBaris.headers.indexOf(KOLOM_ORDER.idKlien);
      const klienPO = iKlienPO !== -1 ? String(poBaris.baris[iKlienPO] || "").trim() : "";
      if (klienPO) {
        if (!klienTerpakai[klienPO]) klienTerpakai[klienPO] = [];
        klienTerpakai[klienPO].push(idPO);
      }
      if (!cariProformaAktifPO_(ss, idPO)) {
        // TIDAK ditolak: klien kadang mentransfer duluan sebelum proforma sempat
        // diterbitkan. Menolak uang yang sudah masuk ke rekening tidak membuatnya
        // hilang -- cuma membuatnya tidak tercatat.
        peringatan.push("PO " + idPO + " belum punya proforma aktif. Uang muka tetap dicatat, " +
          "tapi sebaiknya proformanya diterbitkan supaya klien punya dasar dokumennya.");
      }
    });

    // ---------- PENJAGA LINTAS KLIEN ----------
    // Satu transfer bank berasal dari SATU rekening, jadi normalnya satu klien.
    // Alokasi yang menyentuh dua klien hampir selalu berarti salah pilih baris
    // di daftar -- dan akibatnya buruk & senyap: uang klien A menutup piutang
    // klien B, aging piutang keduanya jadi salah, dan tidak ada gejala apa pun
    // sampai salah satu klien menagih bukti.
    //
    // DITOLAK, bukan sekadar diperingatkan: peringatan pada layar yang sedang
    // sibuk akan terbaca sebagai derau, sementara akibat kekeliruan ini butuh
    // penelusuran manual untuk dibereskan.
    //
    // JALAN KELUAR yang disengaja & TERBUKA: izinkanLintasKlien. Kasus sahnya
    // nyata -- induk perusahaan membayarkan tagihan dua anak usaha yang di
    // sistem terdaftar sebagai klien terpisah. Formulir web memasang bendera
    // ini HANYA sesudah pengguna menyetujui konfirmasi yang menyebut nama
    // kedua kliennya, jadi keputusannya sadar, bukan tak sengaja.
    const daftarKlien = Object.keys(klienTerpakai);
    if (daftarKlien.length > 1 && !p.izinkanLintasKlien) {
      const rincianKlien = daftarKlien.map(function (k) {
        return k + " (" + klienTerpakai[k].join(", ") + ")";
      }).join(" | ");
      throw new Error("Alokasi ini menyentuh " + daftarKlien.length + " klien berbeda: " +
        rincianKlien + ".\n\nSatu transfer bank berasal dari satu rekening. " +
        "Periksa kembali pilihan barisnya -- kalau memang satu pembayar menanggung " +
        "tagihan beberapa klien, ulangi dengan mencentang persetujuan lintas klien.");
    }
    if (daftarKlien.length > 1) {
      Logger.log("!! Pembayaran LINTAS KLIEN disetujui " + email + ": " + daftarKlien.join(", "));
      peringatan.push("Transfer ini dialokasikan ke " + daftarKlien.length +
        " klien berbeda (" + daftarKlien.join(", ") + ").");
    }

    // ---------- Tulis semua baris ----------
    const sheet = pastikanSheetPelunasan_(ss);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = {};
    Object.keys(KOLOM_PELUNASAN).forEach(function (k) { idx[k] = headers.indexOf(KOLOM_PELUNASAN[k]); });

    const noReferensi = String(p.noReferensi || "").trim();
    const catatanDasar = String(p.catatan || "").trim();
    const idAwal = generateIdPelunasanBaru_(sheet);
    const cocok = /^BYR-(\d{4})\.(\d+)$/.exec(idAwal);
    const prefiks = "BYR-" + cocok[1] + ".";
    let urut = parseInt(cocok[2], 10);

    const barisBaru = [];
    const idDibuat = [];
    alokasi.forEach(function (a, i) {
      const id = prefiks + String(urut + i).padStart(3, "0");
      idDibuat.push(id);

      const baris = new Array(headers.length).fill("");
      baris[idx.idPelunasan] = id;
      const idInvoice = String(a.idInvoice || "").trim();
      const idPO = String(a.idPurchaseOrder || "").trim();
      if (idx.idInvoice !== -1) baris[idx.idInvoice] = idInvoice;
      if (idx.idPurchaseOrder !== -1) baris[idx.idPurchaseOrder] = idPO;
      baris[idx.tanggalBayar] = tanggal;
      baris[idx.jumlahDibayar] = Number(a.jumlah) || 0;
      if (idx.metodeBayar !== -1) baris[idx.metodeBayar] = String(p.metodeBayar || "");
      if (idx.noReferensi !== -1) baris[idx.noReferensi] = noReferensi;
      if (idx.catatan !== -1) {
        // Penanda (n/N) ditulis HANYA kalau alokasinya memang lebih dari satu.
        // Pada pembayaran tunggal, "(1/1)" cuma derau yang membuat catatan
        // sulit dibaca sekilas.
        const bagian = alokasi.length > 1 ? " (" + (i + 1) + "/" + alokasi.length + ")" : "";
        baris[idx.catatan] = (catatanDasar ? catatanDasar + " " : "") +
          "[dicatat " + email + "]" + bagian;
      }
      barisBaru.push(baris);
    });

    // Ditulis SEKALIGUS dengan satu setValues, bukan appendRow berulang: satu
    // panggilan tulis untuk N baris, dan tidak ada keadaan setengah jadi kalau
    // eksekusinya terputus di tengah.
    const barisMulai = sheet.getLastRow() + 1;
    sheet.getRange(barisMulai, 1, barisBaru.length, headers.length).setValues(barisBaru);

    Logger.log("Pembayaran dicatat: " + barisBaru.length + " baris, total " + totalAlokasi +
      (noReferensi ? ", ref " + noReferensi : "") + ", oleh " + email +
      " -- " + idDibuat.join(", "));

    // ---------- Sync ----------
    // Kalau sync gagal, baris-barisnya SUDAH tertulis dan itu benar -- uangnya
    // memang sudah masuk. Yang gagal cuma pembaruan status turunan, dan itu bisa
    // diulang kapan saja. Menghapus balik barisnya justru menghilangkan catatan
    // uang yang nyata.
    let hasilSync = null;
    try {
      hasilSync = syncStatusPembayaranSemuaInvoice_();
    } catch (errSync) {
      Logger.log("!! Sync sesudah simpanPembayaranBatch_ GAGAL: " + String(errSync));
      peringatan.push("Pembayaran tersimpan, tapi pembaruan status otomatis gagal: " +
        String(errSync.message || errSync) + ". Jalankan sync ulang.");
    }

    // ---------- Umpan balik per tujuan ----------
    const rincian = alokasi.map(function (a, i) {
      const idInvoice = String(a.idInvoice || "").trim();
      const item = { idPelunasan: idDibuat[i], jumlah: Number(a.jumlah) || 0 };
      if (idInvoice) {
        const sesudah = cariBarisInvoice_(ss, idInvoice);
        item.tujuan = "invoice";
        item.id = idInvoice;
        if (sesudah) { item.status = sesudah.status; item.sisa = sesudah.sisa; }
      } else {
        const idPO = String(a.idPurchaseOrder || "").trim();
        item.tujuan = "order";
        item.id = idPO;
        if (hasilSync) {
          item.uangMukaTotal = (hasilSync.uangMukaPerPo || {})[idPO] || 0;
          item.saldoUangMuka = (hasilSync.saldoUangMukaPerPo || {})[idPO] || 0;
        }
      }
      return item;
    });

    return {
      jumlahBaris: barisBaru.length,
      totalDicatat: totalAlokasi,
      klien: daftarKlien,
      noReferensi: noReferensi,
      idPelunasan: idDibuat,
      rincian: rincian,
      peringatan: peringatan
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pembayaran SATU tujuan. Cuma pembungkus simpanPembayaranBatch_ dengan satu
 * alokasi -- sengaja tidak punya logika sendiri, supaya validasi & penulisan
 * baris tidak pernah punya dua versi yang bisa berbeda.
 *
 * @param {Object} p {tujuan:"invoice"|"order", idInvoice?, idPurchaseOrder?,
 *                    tanggalBayar, jumlahDibayar, metodeBayar?, noReferensi?, catatan?}
 */
function simpanPembayaran_(p, email) {
  if (!p) throw new Error("Data pembayaran kosong.");
  const tujuan = String(p.tujuan || "").trim();
  const idInvoice = String(p.idInvoice || "").trim();
  const idPO = String(p.idPurchaseOrder || "").trim();

  if (tujuan === "invoice") {
    if (!idInvoice) throw new Error("Pilih invoice yang mau dibayar.");
    if (idPO) throw new Error("Pembayaran atas invoice tidak boleh sekaligus diisi ID Purchase Order.");
  } else if (tujuan === "order") {
    if (!idPO) throw new Error("Pilih order (PO) tujuan uang muka.");
    if (idInvoice) throw new Error("Uang muka order tidak boleh sekaligus diisi ID Invoice.");
  } else {
    throw new Error("Tujuan pembayaran harus 'invoice' atau 'order'.");
  }

  const hasil = simpanPembayaranBatch_({
    tanggalBayar: p.tanggalBayar,
    metodeBayar: p.metodeBayar,
    noReferensi: p.noReferensi,
    catatan: p.catatan,
    alokasi: [{
      tujuan: tujuan,
      idInvoice: tujuan === "invoice" ? idInvoice : "",
      idPurchaseOrder: tujuan === "order" ? idPO : "",
      jumlah: p.jumlahDibayar
    }]
  }, email);

  // Bentuk keluaran LAMA dipertahankan supaya frontend versi sebelumnya, dan
  // pemanggil lain mana pun, tidak putus.
  const r = hasil.rincian[0] || {};
  return {
    idPelunasan: hasil.idPelunasan[0],
    jumlah: hasil.totalDicatat,
    tujuan: tujuan,
    statusInvoice: r.status,
    sisaInvoice: r.sisa,
    uangMukaTotal: r.uangMukaTotal,
    saldoUangMuka: r.saldoUangMuka,
    peringatan: hasil.peringatan
  };
}

/** Ringkasan 1 invoice untuk validasi & umpan balik formulir. null kalau tidak ada. */
function cariBarisInvoice_(ss, idInvoice) {
  const sheet = ss.getSheetByName(INVOICE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getDataRange().getValues();
  const idx = petaKolomInvoice_(data[0]);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx.idInvoice]).trim() !== String(idInvoice).trim()) continue;
    const n = hitungNilaiInvoice_(ambilNilaiInvoice_(data[i], idx));
    return {
      id: data[i][idx.idInvoice],
      idPurchaseOrder: idx.idPurchaseOrder !== -1 ? (data[i][idx.idPurchaseOrder] || "") : "",
      // Dipakai penjaga lintas klien di simpanPembayaranBatch_.
      idKlien: idx.idKlien !== -1 ? String(data[i][idx.idKlien] || "").trim() : "",
      status: data[i][idx.statusPembayaran] || "",
      nilaiTransfer: n.nilaiTransfer,
      totalDibayar: n.totalDibayar,
      sisa: n.sisaTagihan,
      nomorBaris: i + 1
    };
  }
  return null;
}

/**
 * ============================================================
 * RIWAYAT PEMBAYARAN
 * ============================================================
 * Terbaru di atas, dibatasi jumlahnya. Formulir memakainya untuk dua hal:
 * memastikan pembayaran yang baru saja dicatat memang masuk, dan menemukan
 * baris yang perlu dihapus kalau salah input.
 *
 * STAFF ONLY.
 */
function getRiwayatPembayaran_(email, batas) {
  const staff = findStaffByEmail(email);
  if (!staff) throw new Error("Halaman ini khusus staff internal RJD Apparel.");

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = pastikanSheetPelunasan_(ss);
  if (sheet.getLastRow() <= 1) return { daftar: [] };

  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const idx = {};
  Object.keys(KOLOM_PELUNASAN).forEach(function (k) { idx[k] = h.indexOf(KOLOM_PELUNASAN[k]); });

  const daftar = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = row[idx.idPelunasan];
    const jumlah = Number(row[idx.jumlahDibayar]) || 0;
    const idInv = idx.idInvoice !== -1 ? String(row[idx.idInvoice] || "").trim() : "";
    const idPo = idx.idPurchaseOrder !== -1 ? String(row[idx.idPurchaseOrder] || "").trim() : "";
    if (!id && !jumlah) continue;

    daftar.push({
      idPelunasan: id || "",
      tujuan: idInv ? "invoice" : (idPo ? "order" : "-"),
      idInvoice: idInv,
      idPurchaseOrder: idPo,
      tanggal: formatTanggal(row[idx.tanggalBayar]),
      tanggalIso: isoTanggal_(row[idx.tanggalBayar]),
      jumlah: jumlah,
      metode: idx.metodeBayar !== -1 ? (row[idx.metodeBayar] || "") : "",
      // Nomor referensi bank -- inilah yang menyambungkan beberapa baris hasil
      // satu transfer yang dipecah, dan menyambungkan semuanya ke rekening koran.
      noReferensi: idx.noReferensi !== -1 ? String(row[idx.noReferensi] || "") : "",
      catatan: idx.catatan !== -1 ? (row[idx.catatan] || "") : "",
      // Baris tanpa ID tidak bisa dihapus lewat web -- penghapusan dicocokkan
      // dengan ID, dan mencocokkan dengan nomor baris berbahaya karena nomor
      // baris berubah setiap ada penghapusan lain.
      bisaDihapus: !!id
    });
  }

  daftar.sort(function (a, b) {
    const c = String(b.tanggalIso || "").localeCompare(String(a.tanggalIso || ""));
    return c !== 0 ? c : String(b.idPelunasan).localeCompare(String(a.idPelunasan));
  });

  const n = Math.min(Math.max(1, Number(batas) || 50), 200);
  return { daftar: daftar.slice(0, n), total: daftar.length };
}

/**
 * ============================================================
 * HAPUS PEMBAYARAN -- untuk koreksi salah input
 * ============================================================
 * BUKAN operasi ringan. Karena sync menghitung ulang dari nol, menghapus baris
 * akan MENURUNKAN Total Dibayar dan bisa mengembalikan invoice yang sudah
 * Lunas menjadi piutang. Itu memang perilaku yang benar -- koreksi harus
 * sampai -- tapi berarti penghapusan yang keliru punya akibat nyata.
 *
 * Tiga pengaman:
 *   1. Dicocokkan dengan ID Pelunasan, bukan nomor baris (nomor baris bergeser).
 *   2. Isi baris dicatat UTUH ke log sebelum dihapus, supaya bisa direkonstruksi.
 *   3. Tidak ada versi massal. Satu panggilan, satu baris.
 *
 * STAFF ONLY.
 */
function hapusPembayaran_(idPelunasan, email) {
  const staff = findStaffByEmail(email);
  if (!staff) throw new Error("Penghapusan pembayaran hanya bisa dilakukan staff internal RJD Apparel.");

  const id = String(idPelunasan || "").trim();
  if (!id) throw new Error("ID Pelunasan wajib diisi.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Sistem sedang sibuk. Coba lagi beberapa detik.");

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = pastikanSheetPelunasan_(ss);
    const data = sheet.getDataRange().getValues();
    const idxId = data[0].indexOf(KOLOM_PELUNASAN.idPelunasan);
    if (idxId === -1) throw new Error("Kolom '" + KOLOM_PELUNASAN.idPelunasan + "' tidak ketemu.");

    let nomorBaris = -1;
    let isiBaris = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxId]).trim() === id) { nomorBaris = i + 1; isiBaris = data[i]; break; }
    }
    if (nomorBaris === -1) throw new Error("Pembayaran '" + id + "' tidak ditemukan.");

    Logger.log("HAPUS pembayaran '" + id + "' oleh " + email +
      " -- isi baris sebelum dihapus: " + JSON.stringify(isiBaris));

    sheet.deleteRow(nomorBaris);

    let hasilSync = null;
    try {
      hasilSync = syncStatusPembayaranSemuaInvoice_();
    } catch (errSync) {
      Logger.log("!! Sync sesudah hapusPembayaran_ GAGAL: " + String(errSync));
    }
    return { idPelunasan: id, dihapus: true, sync: !!hasilSync };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ============================================================
 * DIAGNOSTIK -- read-only, jalankan dari editor SEBELUM memakai formulir
 * ============================================================
 * Menjawab pertanyaan yang paling penting sebelum perubahan ini dipakai:
 * apakah sync versi baru mengubah sesuatu pada data yang SUDAH ADA?
 *
 * Jawabannya seharusnya TIDAK. Semua baris lama punya kolom ID Purchase Order
 * kosong, jadi tidak ada uang muka, jadi tidak ada alokasi, jadi hasilnya
 * identik dengan perilaku lama. Fungsi ini membuktikannya alih-alih
 * mengandalkan penalaran saja.
 *
 * TIDAK menulis apa pun.
 */
function diagnosaAlokasiUangMuka() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  Logger.log("=== DIAGNOSA ALOKASI UANG MUKA (read-only) ===");
  Logger.log("");

  const sheet = ss.getSheetByName(PELUNASAN_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("SD Pelunasan kosong / belum ada. Tidak ada yang bisa dianalisis.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const iPo = h.indexOf(KOLOM_PELUNASAN.idPurchaseOrder);
  const iInv = h.indexOf(KOLOM_PELUNASAN.idInvoice);
  const iJml = h.indexOf(KOLOM_PELUNASAN.jumlahDibayar);

  if (iPo === -1) {
    Logger.log("[INFO] Kolom '" + KOLOM_PELUNASAN.idPurchaseOrder + "' BELUM ADA di SD Pelunasan.");
    Logger.log("       Akan ditambahkan otomatis saat sync/formulir pertama kali dipakai.");
    Logger.log("       Artinya: nol baris uang muka, jadi sync baru = perilaku lama, persis.");
    return;
  }

  let barisInvoice = 0, barisUangMuka = 0, barisAmbigu = 0, barisKosong = 0;
  const uangMuka = {};
  for (let i = 1; i < data.length; i++) {
    const inv = String(data[i][iInv] || "").trim();
    const po = String(data[i][iPo] || "").trim();
    const jml = Number(data[i][iJml]) || 0;
    if (inv && po) { barisAmbigu++; barisInvoice++; continue; }
    if (inv) { barisInvoice++; continue; }
    if (po) { barisUangMuka++; uangMuka[po] = (uangMuka[po] || 0) + jml; continue; }
    barisKosong++;
  }

  Logger.log("Total baris SD Pelunasan : " + (data.length - 1));
  Logger.log("  ke invoice             : " + barisInvoice);
  Logger.log("  UANG MUKA ke PO        : " + barisUangMuka);
  Logger.log("  ambigu (dua-duanya)    : " + barisAmbigu + (barisAmbigu ? "   << periksa, biasanya salah input" : ""));
  Logger.log("  tanpa tujuan           : " + barisKosong);
  Logger.log("");

  if (!barisUangMuka) {
    Logger.log("[AMAN] Nol baris uang muka -> alokasi tidak berjalan sama sekali ->");
    Logger.log("       hasil sync IDENTIK dengan perilaku sebelum perubahan ini.");
    return;
  }

  Logger.log("=== SIMULASI ALOKASI (tidak ditulis) ===");
  Object.keys(uangMuka).forEach(function (po) {
    Logger.log("PO " + po + " -- uang muka masuk: " + uangMuka[po]);
    const invSheet = ss.getSheetByName(INVOICE_SHEET_NAME);
    const invData = invSheet.getDataRange().getValues();
    const idx = petaKolomInvoice_(invData[0]);
    const daftar = [];
    for (let i = 1; i < invData.length; i++) {
      const row = invData[i];
      if (!row[idx.idInvoice]) continue;
      if (String(row[idx.idPurchaseOrder] || "").trim() !== po) continue;
      if ((row[idx.statusPembayaran] || "") === "Dibatalkan") continue;
      const n = hitungNilaiInvoice_(ambilNilaiInvoice_(row, idx));
      const tgl = row[idx.tanggalInvoice];
      daftar.push({
        id: row[idx.idInvoice],
        urut: (tgl instanceof Date && !isNaN(tgl.getTime())) ? tgl.getTime() : 0,
        nilaiTransfer: n.nilaiTransfer
      });
    }
    daftar.sort(function (a, b) {
      if (!a.urut !== !b.urut) return a.urut ? -1 : 1;
      return a.urut - b.urut || String(a.id).localeCompare(String(b.id));
    });

    if (!daftar.length) {
      Logger.log("   (belum ada invoice untuk PO ini -> SELURUH " + uangMuka[po] + " jadi saldo)");
      return;
    }
    let sisa = uangMuka[po];
    daftar.forEach(function (inv) {
      const pakai = Math.min(Math.max(0, inv.nilaiTransfer), sisa);
      Logger.log("   -> " + inv.id + " (nilai transfer " + inv.nilaiTransfer + ") dialokasi " + pakai);
      sisa -= pakai;
    });
    Logger.log("   SALDO tersisa: " + sisa);
  });
  Logger.log("");
  Logger.log("=== SELESAI (tidak ada data yang ditulis) ===");
}
