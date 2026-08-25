/**
 * buat-sop-md.js -- EKSPOR dokumen SOP-SIMPRO-PRODUKSI.md dari simpro-sop.js.
 *
 * Sumber SOP hanya satu: data di simpro-sop.js (SOP_* ). Halaman /p/sop.html
 * dan tab SOP di produksi merender data itu langsung; dokumen MD ini adalah
 * turunan untuk dicetak / dibagikan di luar SIMPRO. Jangan pernah mengedit
 * MD-nya langsung -- ubah simpro-sop.js, lalu jalankan:
 *
 *   node buat-sop-md.js simpro-sop.js > SOP-SIMPRO-PRODUKSI.md
 *
 * Skrip ini memuat simpro-sop.js dalam sandbox Node dengan window/document
 * palsu secukupnya; bagian login/OAuth tidak dijalankan.
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const sumber = process.argv[2] || "simpro-sop.js";
const kode = fs.readFileSync(sumber, "utf8");

const sandbox = {
  window: { addEventListener: function () {}, location: { search: "" } },
  document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
  localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  console: console, fetch: function () {}, google: undefined
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(kode + "\n;this.__sop = { SOP_VERSI, SOP_RANTAI_TAB, SOP_PAGAR_QC, SOP_ATURAN_BESI, " +
  "SOP_ANGKA_MUTU, SOP_ANGKA_MUTU_CATATAN, SOP_KEPUTUSAN, SOP_KEPUTUSAN_CATATAN, SOP_DUA_BUKU, SOP_DUA_BUKU_CATATAN, SOP_FASE, SOP_SKENARIO, SOP_CEK_MINGGUAN };",
  sandbox, { filename: sumber });
const S = sandbox.__sop;

// HTML ringan di dalam data -> markdown.
function md(t) {
  return String(t || "")
    .replace(/<b>(.*?)<\/b>/g, "**$1**")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#8212;/g, "\u2014").replace(/&#8594;/g, "\u2192").replace(/&#8592;/g, "\u2190")
    .replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d").replace(/&#183;/g, "\u00b7")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ").trim();
}
function tabel(kepala, baris) {
  return "| " + kepala.join(" | ") + " |\n|" + kepala.map(function () { return "---"; }).join("|") + "|\n" +
    baris.map(function (r) { return "| " + r.map(md).join(" | ") + " |"; }).join("\n") + "\n";
}

const out = [];
out.push("# SOP SIMPRO \u2014 Order sampai QC & Penanganan Kasus");
out.push("**RJD Apparel \u00b7 berlaku mulai " + md(S.SOP_VERSI) + "**");
out.push("");
out.push("> Dokumen ini DIEKSPOR dari `simpro-sop.js` (`node buat-sop-md.js`). Sumber SOP hanya satu: " +
  "halaman SOP dan tab SOP di SIMPRO membaca data yang sama. Jangan mengedit file ini langsung.");
out.push("");
out.push("Bagan pendamping: `bagan-alur-11-tahap.svg` dan `bagan-peta-kasus.svg`.");
out.push("");
out.push("---\n\n## 1. Prinsip pencatatan (berlaku di semua tab)\n");
S.SOP_ATURAN_BESI.forEach(function (a, i) { out.push((i + 1) + ". **" + md(a[0]) + ".** " + md(a[1])); });
out.push("\n---\n\n## 2. Rantai utama \u2014 siapa mencatat apa, di tab mana\n");
out.push(tabel(["#", "Tahap", "Tab", "Yang mencatat", "Inti"], S.SOP_RANTAI_TAB));
out.push("**" + md(S.SOP_PAGAR_QC) + "**");
out.push("\n---\n\n## 3. Form QC \u2014 empat angka mutu\n");
out.push(tabel(["Isian", "Arti"], S.SOP_ANGKA_MUTU));
out.push(md(S.SOP_ANGKA_MUTU_CATATAN));
out.push("\n### 3a. Keputusan QC \u2014 tiga label, satu pertanyaan\n");
out.push(tabel(["Keputusan", "Kapan", "Artinya"], S.SOP_KEPUTUSAN));
out.push(md(S.SOP_KEPUTUSAN_CATATAN));
out.push("\n### 3b. Dua buku re-cut \u2014 bukan dobel, dua hal berbeda\n");
out.push(tabel(["Buku", "Tab", "Mencatat", "Menambah set lengkap?"], S.SOP_DUA_BUKU));
out.push(md(S.SOP_DUA_BUKU_CATATAN));
out.push("\n---\n\n## 4. Per fase\n");
S.SOP_FASE.forEach(function (f) {
  out.push("### " + md(f.nama) + " \u00b7 tab " + md(f.tab) + " \u00b7 pengisi: " + md(f.siapa));
  out.push(md(f.inti) + "\n");
  f.aturan.forEach(function (a) { out.push("- **" + md(a[0]) + "** \u2014 " + md(a[1])); });
  if (f.salah && f.salah.length) {
    out.push("\nYang sering salah:");
    f.salah.forEach(function (a) { out.push("- **" + md(a[0]) + "** \u2014 " + md(a[1])); });
  }
  out.push("");
});
out.push("---\n\n## 5. Skenario & penanganannya\n");
S.SOP_SKENARIO.forEach(function (s, i) {
  out.push("### Kasus " + String.fromCharCode(65 + i) + " \u2014 " + md(s.judul));
  out.push("_" + md(s.tanya) + "_\n");
  out.push(tabel(["Kalau", "Catat di", "Akibatnya"], s.baris));
});
out.push("---\n\n## 6. Tanda buku sehat (cek mingguan \u2014 Femri / kepala produksi)\n");
S.SOP_CEK_MINGGUAN.forEach(function (a) { out.push("- **" + md(a[0])+ ":** " + md(a[1])); });
out.push("");
process.stdout.write(out.join("\n"));
