#!/usr/bin/env bash
# Membuat tag git dari nilai "web" di VERSI.json, pada commit yang diberikan.
#
# Kenapa ini ada: proxy git sesi Claude Code on the web hanya mengizinkan push
# CABANG; push TAG ditolak HTTP 403. Jadi rilis web dari container tidak bisa
# membuat tagnya sendiri, dan sampai 12 Sep 2026 tagnya dibuat tangan dari
# laptop. Workflow yang memanggil skrip ini menutup langkah manual itu.
#
# Yang lebih penting daripada kenyamanan: ia menutup jendela berbahaya secara
# struktural. Bahaya lamanya adalah VERSI.json menyebut vNNN sementara tag vNNN
# belum ada -- loader lalu meminta @vNNN/simpro-*.js, mendapat 404, dan SEMUA
# halaman kehilangan JS-nya (nyaris terjadi 12 Sep 2026, v338). Karena tag di
# sini dibuat KARENA VERSI.json berubah, keduanya tidak bisa berpisah lebih lama
# daripada satu jalanan Actions -- jauh di bawah TTL cabang main di jsDelivr.
#
# Dipakai juga di luar Actions untuk mengujinya:
#   bash .github/buat-tag-dari-versi.sh <sha>
set -euo pipefail
SHA="${1:?sha commit yang akan ditag}"

[ -f VERSI.json ] || { echo "!! VERSI.json tidak ada di direktori ini"; exit 1; }
V="$(python3 -c "import json,io;print(json.load(io.open('VERSI.json',encoding='utf-8')).get('web',''))")"

# PENJAGA 1: bentuknya. Salah ketik di VERSI.json tidak boleh melahirkan tag
# sampah yang tidak bisa dihapus dari cache CDN siapa pun.
printf '%s' "$V" | grep -qE '^v[0-9]+$' || {
  echo "!! VERSI.json \"web\" = '$V' bukan bentuk v<angka> -- tidak membuat tag"; exit 1; }

# PENJAGA 2: tag yang sudah ada TIDAK disentuh, dan itu bukan kegagalan.
# Aturan proyek: tag tidak pernah dipakai ulang. Memindahkan tag yang sudah
# dipakai jsDelivr berarti URL yang sama menyajikan isi berbeda -- dan cache
# edge-nya tidak bisa ditarik kembali.
if git ls-remote --exit-code --tags origin "refs/tags/$V" >/dev/null 2>&1; then
  echo "tag $V sudah ada di remote -- tidak disentuh (tag tidak pernah dipakai ulang)"
  exit 0
fi
if git rev-parse -q --verify "refs/tags/$V" >/dev/null; then
  echo "tag $V sudah ada lokal -- tidak disentuh"
  exit 0
fi

git tag "$V" "$SHA"
git push origin "refs/tags/$V"
echo "tag $V dibuat pada $SHA"
