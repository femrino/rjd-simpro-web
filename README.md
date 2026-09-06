# rjd-simpro-web

Berkas frontend (JS/CSS) SIMPRO, sistem manajemen produksi RJD Apparel.

- **Disajikan lewat jsDelivr**, di-pin per tag: `https://cdn.jsdelivr.net/gh/femrino/rjd-simpro-web@vNNN/<berkas>`.
  Halaman Blogger merujuk satu tag untuk semua berkas; tag tidak pernah dipakai ulang.
- **Repo ini publik.** Yang boleh ada di sini hanya `simpro-*.js`, `simpro-*.css`,
  dan aset statis. Template Blogger (XML), catatan sesi, harness, dan berkas
  Apps Script disimpan di repo privat.
- Rilis dilakukan lewat skrip di repo privat (`rilis-web.sh`): harness harus
  hijau, tag dibuat, lalu byte di CDN dicocokkan dengan repo.
- Tidak menerima kontribusi luar; issue/PR tidak dipantau.

Backend: Google Apps Script (repo privat `rjd-simpro-gs`). Database: Google Sheets.
