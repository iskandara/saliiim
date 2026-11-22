/**
 * Privacy policy and terms. English, and formal Bahasa Indonesia for the Jaksel setting
 * (legal text in slang would read oddly). Keep both in step, and keep them true to what the
 * app actually collects: change this file whenever a feature starts collecting something new.
 * A line starting with "- " is a bullet.
 */
export const LEGAL_UPDATED = '2026-11-22';
export const CONTACT_EMAIL = 'aradnaksi@gmail.com';

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: { h: string; body: string[] }[];
}

type Lang = 'en' | 'id';

export const PRIVACY: Record<Lang, LegalDoc> = {
  en: {
    title: 'Privacy policy',
    updated: 'Last updated 22 November 2026',
    intro: `Saliiim is run by the Saliiim team. This page explains what we collect when you use Saliiim, why, and what you can do about it. Questions or requests: ${CONTACT_EMAIL}.`,
    sections: [
      {
        h: 'What we collect',
        body: [
          '- **If you play or watch as a guest:** a random ID for your phone (no name or email attached), the names typed into a session, the scores, results and standings of that session, and which session you joined.',
          '- **If you sign in:** your name and email address, and your profile photo if you sign in with Google. Anything you add to your profile (city, playing hand, preferred format, starting level). The sessions you play, their results, and your level.',
          '- **If you send feedback:** your rating, message and type, a contact address only if you add one, the app language, and which session it came from. We also keep a scrambled form of your phone\'s ID, only to limit how much feedback one phone can send.',
          '- **Usage counts:** anonymous counts such as how often stickers are downloaded or links copied. They are not tied to you or your phone.',
          '- **On your phone only:** your language and theme, and a list of recent sessions. These stay in your browser.',
          'We do not collect your location, contacts or payment details. We do not show ads and we do not sell personal data.',
        ],
      },
      {
        h: 'Why we use it',
        body: [
          '- To run sessions: show courts, scores, the queue and standings to everyone in the session.',
          '- To give signed-in players a profile, match history, stats and a level.',
          '- To send the emails you ask for, such as your sign-in code.',
          '- To fix problems and improve Saliiim, using feedback and anonymous counts.',
          '- To keep Saliiim safe from spam and abuse.',
          'We process this data to provide the service you asked for, and on your consent where we ask for it, such as signing in or sending feedback.',
        ],
      },
      {
        h: 'Who can see it',
        body: [
          '- Anyone with a session\'s link can see that session\'s player names, scores, results and standings. Share links with the people you play with.',
          '- Profiles are public by default: anyone with the link can see your name, photo, level, stats and match history. You can make your profile private, or hide parts of it, in your profile settings.',
          '- Only you can see your email address.',
        ],
      },
      {
        h: 'Services we use',
        body: [
          'These companies process data on our behalf, only to run Saliiim. Your data may be stored or processed on their servers outside Indonesia.',
          '- **Supabase:** database and sign-in.',
          '- **Cloudflare:** hosting the app, and the spam check (Turnstile) that may run when the app starts.',
          '- **Google:** sign-in, if you choose "Continue with Google". Google shares your name, email and photo with us.',
          '- **Brevo:** sends sign-in emails.',
        ],
      },
      {
        h: 'How long we keep it',
        body: [
          'Session results stay so that standings and every player\'s stats remain complete. Your account and profile stay until you delete them. Feedback stays as long as it helps us improve Saliiim. If you ask us to delete your data, we remove it or make it anonymous, unless the law requires us to keep it.',
        ],
      },
      {
        h: 'Your rights',
        body: [
          'Under Indonesia\'s Personal Data Protection Law (UU No. 27 Tahun 2022) you can ask to see the data we hold about you, correct it, delete it, or withdraw your consent. Email ' + CONTACT_EMAIL + ' from the address on your account, or tell us which sessions and names are yours. We aim to reply within 7 days.',
          'If your account is deleted, your name stays in past sessions as a guest name, so other players\' results still add up. Ask us if you want it removed from those too.',
        ],
      },
      {
        h: 'Children',
        body: [
          'You must be at least 13 to create an account. If you are under 18, you need a parent\'s or guardian\'s permission. Guests of any age can play in a session, but please only type in a child\'s name with their parent\'s okay. If you think a child under 13 has an account, email us and we will delete it.',
        ],
      },
      {
        h: 'Security',
        body: [
          'Data travels over encrypted connections, and the database only lets each person reach what their role allows. No system is perfectly secure, so please don\'t put sensitive information in session names, player names or feedback.',
        ],
      },
      {
        h: 'Changes',
        body: [
          'When this policy changes we update the date at the top. If a change is significant, we will tell you in the app before it applies.',
        ],
      },
    ],
  },
  id: {
    title: 'Kebijakan privasi',
    updated: 'Terakhir diperbarui 22 November 2026',
    intro: `Saliiim dikelola oleh tim Saliiim. Halaman ini menjelaskan data apa yang kami kumpulkan saat Anda memakai Saliiim, untuk apa, dan apa yang bisa Anda lakukan. Pertanyaan atau permintaan: ${CONTACT_EMAIL}.`,
    sections: [
      {
        h: 'Data yang kami kumpulkan',
        body: [
          '- **Jika Anda bermain atau menonton sebagai tamu:** ID acak untuk ponsel Anda (tanpa nama atau email), nama-nama yang diketik dalam sesi, skor, hasil dan klasemen sesi tersebut, serta sesi yang Anda ikuti.',
          '- **Jika Anda masuk ke akun:** nama dan alamat email Anda, serta foto profil jika Anda masuk dengan Google. Informasi yang Anda tambahkan ke profil (kota, tangan yang dipakai bermain, format favorit, level awal). Sesi yang Anda mainkan, hasilnya, dan level Anda.',
          '- **Jika Anda mengirim masukan:** rating, pesan dan jenisnya, alamat kontak hanya jika Anda mengisinya, bahasa aplikasi, dan sesi asalnya. Kami juga menyimpan bentuk acak dari ID ponsel Anda, hanya untuk membatasi jumlah masukan dari satu ponsel.',
          '- **Hitungan pemakaian:** hitungan anonim, misalnya berapa kali stiker diunduh atau link disalin. Hitungan ini tidak terkait dengan Anda atau ponsel Anda.',
          '- **Hanya di ponsel Anda:** pilihan bahasa dan tema, serta daftar sesi terakhir. Data ini tersimpan di browser Anda.',
          'Kami tidak mengumpulkan lokasi, kontak, atau data pembayaran Anda. Kami tidak menampilkan iklan dan tidak menjual data pribadi.',
        ],
      },
      {
        h: 'Tujuan penggunaan',
        body: [
          '- Menjalankan sesi: menampilkan lapangan, skor, antrean, dan klasemen kepada semua peserta sesi.',
          '- Memberikan profil, riwayat pertandingan, statistik, dan level kepada pemain yang masuk ke akun.',
          '- Mengirim email yang Anda minta, seperti kode masuk.',
          '- Memperbaiki masalah dan mengembangkan Saliiim, berdasarkan masukan dan hitungan anonim.',
          '- Melindungi Saliiim dari spam dan penyalahgunaan.',
          'Kami memproses data ini untuk menyediakan layanan yang Anda minta, dan atas persetujuan Anda bila kami memintanya, seperti saat masuk ke akun atau mengirim masukan.',
        ],
      },
      {
        h: 'Siapa yang dapat melihatnya',
        body: [
          '- Siapa pun yang memiliki link sebuah sesi dapat melihat nama pemain, skor, hasil, dan klasemen sesi tersebut. Bagikan link hanya kepada teman bermain Anda.',
          '- Profil bersifat publik secara bawaan: siapa pun yang memiliki link dapat melihat nama, foto, level, statistik, dan riwayat pertandingan Anda. Anda dapat menjadikan profil privat atau menyembunyikan sebagiannya di pengaturan profil.',
          '- Hanya Anda yang dapat melihat alamat email Anda.',
        ],
      },
      {
        h: 'Layanan pihak ketiga',
        body: [
          'Perusahaan berikut memproses data atas nama kami, hanya untuk menjalankan Saliiim. Data Anda dapat disimpan atau diproses di server mereka di luar Indonesia.',
          '- **Supabase:** basis data dan sistem masuk akun.',
          '- **Cloudflare:** hosting aplikasi, dan pemeriksaan anti-spam (Turnstile) yang dapat berjalan saat aplikasi dibuka.',
          '- **Google:** masuk akun, jika Anda memilih "Lanjut pakai Google". Google membagikan nama, email, dan foto Anda kepada kami.',
          '- **Brevo:** mengirim email kode masuk.',
        ],
      },
      {
        h: 'Lama penyimpanan',
        body: [
          'Hasil sesi tetap disimpan agar klasemen dan statistik setiap pemain tetap lengkap. Akun dan profil Anda disimpan sampai Anda menghapusnya. Masukan disimpan selama masih berguna untuk mengembangkan Saliiim. Jika Anda meminta penghapusan data, kami akan menghapusnya atau menjadikannya anonim, kecuali jika hukum mewajibkan kami menyimpannya.',
        ],
      },
      {
        h: 'Hak Anda',
        body: [
          'Berdasarkan Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022), Anda berhak meminta akses atas data Anda, memperbaikinya, menghapusnya, atau menarik persetujuan Anda. Kirim email ke ' + CONTACT_EMAIL + ' dari alamat email akun Anda, atau sebutkan sesi dan nama mana yang merupakan milik Anda. Kami berupaya membalas dalam 7 hari.',
          'Jika akun Anda dihapus, nama Anda tetap ada di sesi-sesi sebelumnya sebagai nama tamu, agar hasil pemain lain tetap lengkap. Hubungi kami jika Anda ingin nama tersebut juga dihapus.',
        ],
      },
      {
        h: 'Anak-anak',
        body: [
          'Anda harus berusia minimal 13 tahun untuk membuat akun. Jika Anda berusia di bawah 18 tahun, Anda memerlukan izin orang tua atau wali. Tamu dari segala usia boleh bermain dalam sesi, tetapi mohon hanya mengetik nama anak dengan izin orang tuanya. Jika Anda mengetahui ada anak di bawah 13 tahun yang memiliki akun, kirim email kepada kami dan kami akan menghapusnya.',
        ],
      },
      {
        h: 'Keamanan',
        body: [
          'Data dikirim melalui koneksi terenkripsi, dan basis data hanya mengizinkan setiap orang mengakses apa yang sesuai dengan perannya. Tidak ada sistem yang sepenuhnya aman, jadi mohon jangan menulis informasi sensitif di nama sesi, nama pemain, atau masukan.',
        ],
      },
      {
        h: 'Perubahan',
        body: [
          'Jika kebijakan ini berubah, kami memperbarui tanggal di bagian atas. Untuk perubahan yang penting, kami akan memberi tahu Anda di aplikasi sebelum perubahan berlaku.',
        ],
      },
    ],
  },
};

export const TERMS: Record<Lang, LegalDoc> = {
  en: {
    title: 'Terms of service',
    updated: 'Last updated 22 November 2026',
    intro: `These terms apply when you use Saliiim, run by the Saliiim team. By using Saliiim you agree to them. Questions: ${CONTACT_EMAIL}.`,
    sections: [
      {
        h: 'Who can use Saliiim',
        body: [
          'Anyone can play or watch a session as a guest. To create an account you must be at least 13, and if you are under 18 you need a parent\'s or guardian\'s permission.',
        ],
      },
      {
        h: 'What Saliiim is',
        body: [
          'Saliiim helps casual tennis groups run sessions: schedule matches, keep score and share results. It is free. Scores, standings and levels are for fun and friendly comparison. They are not official rankings, and a level is an estimate based on results entered in the app.',
        ],
      },
      {
        h: 'Your account',
        body: [
          '- Use your real name or the name people know you by, and one account per person.',
          '- Keep access to your Google account or email secure. You are responsible for what happens under your account.',
          '- You can stop using Saliiim at any time, and ask us to delete your account.',
        ],
      },
      {
        h: 'Playing fair',
        body: [
          'When you use Saliiim, please don\'t:',
          '- enter results you know are false, or claim another person\'s results;',
          '- pretend to be someone else, or add people to sessions or groups against their wishes;',
          '- harass anyone, or put offensive or private information in names, sessions or feedback;',
          '- send spam, try to break into or overload the service, or copy it with automated tools.',
          'Hosts are responsible for what they type into their sessions, including other people\'s names.',
        ],
      },
      {
        h: 'Your content',
        body: [
          'What you add to Saliiim (names, scores, profile details, feedback) stays yours. You let us store it and show it to the people it is meant for, such as everyone in a session, visitors to a public profile, or the person you share a sticker with, so that Saliiim can work.',
        ],
      },
      {
        h: 'Changes and availability',
        body: [
          'We may add, change or remove features, and the service may sometimes be unavailable. If we ever plan to close Saliiim or start charging for features you use, we will tell you in the app first.',
        ],
      },
      {
        h: 'Responsibility',
        body: [
          'Saliiim is provided as it is. To the extent the law allows, we are not responsible for lost data, disputes about scores between players, or anything that happens on court. Tennis is a sport: play safely and within your limits.',
        ],
      },
      {
        h: 'Suspension',
        body: [
          'If someone breaks these terms, we may remove their content or suspend their account. Where we can, we will tell them why first.',
        ],
      },
      {
        h: 'Law and changes to these terms',
        body: [
          'These terms are governed by the laws of the Republic of Indonesia. When they change we update the date at the top, and tell you in the app if the change is significant.',
        ],
      },
    ],
  },
  id: {
    title: 'Ketentuan layanan',
    updated: 'Terakhir diperbarui 22 November 2026',
    intro: `Ketentuan ini berlaku saat Anda menggunakan Saliiim, yang dikelola oleh tim Saliiim. Dengan menggunakan Saliiim, Anda menyetujuinya. Pertanyaan: ${CONTACT_EMAIL}.`,
    sections: [
      {
        h: 'Siapa yang dapat menggunakan Saliiim',
        body: [
          'Siapa pun dapat bermain atau menonton sesi sebagai tamu. Untuk membuat akun, Anda harus berusia minimal 13 tahun, dan jika di bawah 18 tahun Anda memerlukan izin orang tua atau wali.',
        ],
      },
      {
        h: 'Tentang Saliiim',
        body: [
          'Saliiim membantu kelompok tenis santai menjalankan sesi: mengatur pertandingan, mencatat skor, dan membagikan hasil. Saliiim gratis. Skor, klasemen, dan level dibuat untuk bersenang-senang dan perbandingan yang bersahabat. Semuanya bukan peringkat resmi, dan level adalah perkiraan berdasarkan hasil yang dicatat di aplikasi.',
        ],
      },
      {
        h: 'Akun Anda',
        body: [
          '- Gunakan nama asli Anda atau nama yang dikenal orang, dan satu akun untuk satu orang.',
          '- Jaga keamanan akun Google atau email Anda. Anda bertanggung jawab atas aktivitas di akun Anda.',
          '- Anda dapat berhenti menggunakan Saliiim kapan saja dan meminta kami menghapus akun Anda.',
        ],
      },
      {
        h: 'Bermain secara adil',
        body: [
          'Saat menggunakan Saliiim, mohon jangan:',
          '- memasukkan hasil yang Anda tahu tidak benar, atau mengklaim hasil milik orang lain;',
          '- menyamar sebagai orang lain, atau menambahkan orang ke sesi atau grup tanpa persetujuannya;',
          '- melecehkan siapa pun, atau menulis hal yang menyinggung atau informasi pribadi di nama, sesi, atau masukan;',
          '- mengirim spam, mencoba membobol atau membebani layanan, atau menyalinnya dengan alat otomatis.',
          'Host bertanggung jawab atas apa yang mereka ketik di sesinya, termasuk nama orang lain.',
        ],
      },
      {
        h: 'Konten Anda',
        body: [
          'Apa yang Anda tambahkan ke Saliiim (nama, skor, detail profil, masukan) tetap milik Anda. Anda mengizinkan kami menyimpan dan menampilkannya kepada pihak yang dituju, seperti semua peserta sesi, pengunjung profil publik, atau orang yang menerima stiker Anda, agar Saliiim dapat berfungsi.',
        ],
      },
      {
        h: 'Perubahan dan ketersediaan',
        body: [
          'Kami dapat menambah, mengubah, atau menghapus fitur, dan layanan terkadang mungkin tidak tersedia. Jika kami berencana menutup Saliiim atau mulai mengenakan biaya untuk fitur yang Anda gunakan, kami akan memberi tahu Anda di aplikasi terlebih dahulu.',
        ],
      },
      {
        h: 'Tanggung jawab',
        body: [
          'Saliiim disediakan apa adanya. Sejauh diizinkan oleh hukum, kami tidak bertanggung jawab atas data yang hilang, perselisihan skor antarpemain, atau kejadian apa pun di lapangan. Tenis adalah olahraga: bermainlah dengan aman dan sesuai kemampuan Anda.',
        ],
      },
      {
        h: 'Penangguhan',
        body: [
          'Jika seseorang melanggar ketentuan ini, kami dapat menghapus kontennya atau menangguhkan akunnya. Bila memungkinkan, kami akan memberi tahu alasannya terlebih dahulu.',
        ],
      },
      {
        h: 'Hukum dan perubahan ketentuan',
        body: [
          'Ketentuan ini tunduk pada hukum Republik Indonesia. Jika ketentuan berubah, kami memperbarui tanggal di bagian atas, dan memberi tahu Anda di aplikasi jika perubahannya penting.',
        ],
      },
    ],
  },
};
