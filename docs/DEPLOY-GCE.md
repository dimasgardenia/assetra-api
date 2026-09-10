# Deploy Assetra ke Google Compute Engine (satu VM)

Satu VM menjalankan API (Node 22 + SQLite) dan menyajikan frontend hasil build
dari origin yang sama, di belakang Caddy (HTTPS otomatis dari Let's Encrypt).
Semua bisa dilakukan dari HP lewat aplikasi Google Cloud / console.cloud.google.com.

## 1. Buat VM

Compute Engine → VM instances → **Create instance**

| Kolom | Isi |
|---|---|
| Name | `assetra` |
| Region / zone | `asia-southeast2` (Jakarta) |
| Machine type | `e2-small` (2 GB RAM; e2-micro terlalu kecil untuk build) |
| Boot disk | Debian 12, 20 GB |
| Firewall | centang **Allow HTTP traffic** dan **Allow HTTPS traffic** |

Buka bagian **Advanced options → Management → Automation (Startup script)** dan tempel:

```
curl -fsSL https://raw.githubusercontent.com/dimasgardenia/assetra-api/main/scripts/gce/install.sh | bash -s -- --boot
```

Lalu di **Advanced options → Management → Metadata** tambahkan pasangan key/value:

| Key | Value |
|---|---|
| `assetra-admin-password` | sandi admin pilihan Anda (min 8 karakter) |
| `assetra-maps-key` | kunci Google Maps |
| `assetra-domain` | `assetraland.com` |
| `assetra-branch` | cabang git yang mau dipasang (kosongkan = `main`) |
| `assetra-resend-key` | kunci Resend (opsional, untuk email verifikasi) |

Tekan **Create**. Instalasi memakan ±5 menit. Pantau di VM → **Logs → Serial port 1**
sampai muncul baris `Assetra terpasang`.

## 2. IP statis & DNS

1. VPC network → IP addresses → **Reserve** IP eksternal VM (agar tidak berubah).
2. Di registrar domain, buat DNS record:
   - `A  assetraland.com      → <IP VM>`
   - `A  www.assetraland.com  → <IP VM>`
3. Setelah DNS menyebar (5–30 menit) Caddy otomatis mengambil sertifikat;
   `https://assetraland.com` langsung hidup. Sebelum itu situs bisa dites lewat `http://<IP VM>`.

## 3. Google Cloud: OAuth & Maps

- APIs & Services → Credentials → OAuth client "SSO assetra" → **Authorized JavaScript origins**:
  tambah `https://assetraland.com` dan `https://www.assetraland.com`.
- Credentials → kunci Maps → **Website restrictions**: `assetraland.com/*`, `www.assetraland.com/*`.

## 4. Update ke versi terbaru

SSH ke VM (tombol **SSH** di daftar VM, bisa dari HP), lalu:

```
sudo bash /opt/assetra/api/scripts/gce/install.sh
```

Skrip menarik cabang terbaru dari kedua repo, membangun ulang, dan me-restart layanan.
Database dan foto tersimpan di `/var/lib/assetra` dan tidak tersentuh.

## Perintah berguna

```
sudo journalctl -u assetra -f        # log API
sudo systemctl restart assetra       # restart API
sudo nano /etc/assetra/env           # ubah konfigurasi, lalu restart
sudo caddy reload --config /etc/caddy/Caddyfile
```

## Backup

Database SQLite: `/var/lib/assetra/assetra.db`, foto: `/var/lib/assetra/uploads`.
Cara termudah: Compute Engine → Snapshots → jadwal snapshot harian untuk disk VM.
