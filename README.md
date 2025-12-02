# Aplikasi Manajemen Organisasi

Aplikasi web untuk mengelola data organisasi, user, anggota, iuran bulanan, dan buku kas.

## Teknologi

- **Node.js + Express** - Backend framework
- **SQLite3** - Database (file: `database/organisasi.db`)
- **Tailwind CSS** - Styling framework
- **SweetAlert2** - Alert/notification
- **Boxicons** - Icon library
- **bcryptjs** - Password hashing

## Instalasi

1. Install dependencies:

```bash
npm install
```

2. Build CSS (di terminal terpisah):

```bash
npm run build-css
```

3. Jalankan server:

```bash
npm start
# atau untuk development
npm run dev
```

4. Akses aplikasi di: http://localhost:3000

## Default Login

- Username: admin
- Password: admin123

## Database

Aplikasi menggunakan **SQLite3** sebagai database. File database disimpan di:

- Lokasi: `database/organisasi.db`
- Database akan dibuat otomatis saat pertama kali menjalankan aplikasi
- Tabel yang dibuat:
  - `organisasi` - Data organisasi
  - `users` - Data user/admin
  - `anggota` - Data anggota
  - `iuran` - Data iuran bulanan
  - `buku_kas` - Data transaksi keuangan

## Struktur Folder

```
organisasi/
├── config/          # Konfigurasi database (SQLite3)
├── database/         # File database SQLite (.db)
├── routes/           # Route handlers
├── views/            # Halaman HTML
├── public/           # Assets statis
│   ├── css/          # CSS files
│   └── js/           # JavaScript files
├── utils/            # Utility functions
├── middleware/       # Middleware (auth)
└── server.js         # Entry point
```
