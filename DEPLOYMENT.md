# Panduan Deployment Production

## Checklist Sebelum Deploy

1. ✅ **Server.js sudah dikonfigurasi untuk production**

   - Binding ke `0.0.0.0` (bukan localhost)
   - Trust proxy enabled
   - Session cookie secure untuk HTTPS

2. ✅ **Environment Variables**

   - `PORT` - Port yang digunakan (biasanya dari hosting provider)
   - `NODE_ENV=production` - Set environment ke production
   - `HOST=0.0.0.0` - Optional, default sudah 0.0.0.0

3. ✅ **Dependencies terinstall**

   ```bash
   npm install --production
   ```

4. ✅ **Build CSS untuk production**
   ```bash
   npm run build-css-prod
   ```

## Langkah Deployment di cPanel

### 1. Upload Files

- Upload semua file ke `/home2/appsbeem/was-adm.appsbee.my.id`
- Pastikan file `.env` (jika ada) juga di-upload

### 2. Install Dependencies

Di terminal cPanel atau SSH:

```bash
cd /home2/appsbeem/was-adm.appsbee.my.id
npm install --production
```

### 3. Build CSS

```bash
npm run build-css-prod
```

### 4. Setup Process Manager (PM2) - Recommended

```bash
# Install PM2 globally
npm install -g pm2

# Start aplikasi dengan PM2
pm2 start server.js --name organisasi-app

# Save PM2 configuration
pm2 save

# Setup PM2 untuk auto-start saat server restart
pm2 startup
```

### 5. Atau Gunakan Node.js App di cPanel

1. Buka **Node.js App** di cPanel
2. Pilih **Create Application**
3. Set:
   - **Node.js version**: Latest LTS
   - **Application mode**: Production
   - **Application root**: `/home2/appsbeem/was-adm.appsbee.my.id`
   - **Application URL**: `/` atau sesuai domain
   - **Application startup file**: `server.js`
   - **Application port**: Sesuai yang diberikan hosting (biasanya otomatis)
4. Set **Environment Variables**:
   - `NODE_ENV=production`
   - `PORT=<port dari hosting>`
5. Klik **Create**
6. Klik **Run NPM Install**
7. Klik **Start App**

## Troubleshooting

### Error: Connection Refused

**Kemungkinan penyebab:**

1. Server tidak berjalan
   - Cek di cPanel Node.js App apakah status "Running"
   - Atau cek dengan PM2: `pm2 list`
2. Port tidak sesuai

   - Pastikan `PORT` environment variable sesuai dengan yang diberikan hosting
   - Cek di cPanel Node.js App → Application Details → Port

3. Firewall memblokir

   - Cek firewall settings di hosting
   - Pastikan port yang digunakan tidak diblokir

4. Server crash
   - Cek logs di cPanel Node.js App → Logs
   - Atau dengan PM2: `pm2 logs organisasi-app`

### Error: Cannot find module

- Pastikan `npm install` sudah dijalankan
- Pastikan semua dependencies ada di `package.json`

### Error: EADDRINUSE

- Port sudah digunakan oleh aplikasi lain
- Restart aplikasi atau gunakan port lain

### Session tidak tersimpan

- Pastikan `secure: true` untuk HTTPS
- Pastikan `trust proxy` sudah di-set
- Cek cookie settings di browser

## Verifikasi Deployment

1. **Cek server running:**

   ```bash
   pm2 list
   # atau
   ps aux | grep node
   ```

2. **Cek logs:**

   ```bash
   pm2 logs organisasi-app
   # atau di cPanel Node.js App → Logs
   ```

3. **Test endpoint:**

   - Buka `https://was-adm.appsbee.my.id`
   - Harus redirect ke `/auth/login`
   - Coba login

4. **Cek database:**
   - Pastikan file `database/organisasi.db` ada dan bisa diakses
   - Pastikan permission file database benar (read/write)

## Maintenance

### Restart Aplikasi

```bash
pm2 restart organisasi-app
# atau di cPanel Node.js App → Restart
```

### Update Aplikasi

1. Upload file baru
2. Di terminal:
   ```bash
   cd /home2/appsbeem/was-adm.appsbee.my.id
   npm install --production
   npm run build-css-prod
   pm2 restart organisasi-app
   ```

### Backup Database

```bash
cp database/organisasi.db database/organisasi.db.backup.$(date +%Y%m%d)
```
