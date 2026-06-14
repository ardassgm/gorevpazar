require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { nanoid } = require('nanoid');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const db = new sqlite3.Database(path.join(__dirname, 'gorevpazar.db'));
const run = (q, p = []) => new Promise((res, rej) => db.run(q, p, function (e) { e ? rej(e) : res(this); }));
const get = (q, p = []) => new Promise((res, rej) => db.get(q, p, (e, r) => e ? rej(e) : res(r)));
const all = (q, p = []) => new Promise((res, rej) => db.all(q, p, (e, r) => e ? rej(e) : res(r)));

function tokenFor(u) {
  return jwt.sign({ id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) return res.status(401).json({ error: 'Giriş yapmalısınız.' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Oturum süresi doldu, tekrar giriş yapın.' }); }
}
async function notBanned(req, res, next) {
  const u = await get('SELECT banned FROM users WHERE id=?', [req.user.id]);
  if (u && u.banned) return res.status(403).json({ error: 'Hesabınız admin tarafından banlandı.' });
  next();
}
function admin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin yetkisi gerekli.' });
  next();
}
const bad = ['şiddet', 'silah', 'uyuşturucu', 'taciz', 'tehdit', 'dolandır', 'sahte kimlik', 'hack', 'hacking', 'spam', 'yasa dışı', 'yasadışı', 'porno', 'cinsel'];
function checkTask(t) { const s = [t.title, t.description, t.city, t.category].join(' ').toLowerCase(); return bad.find(w => s.includes(w)); }
function code6() { return String(Math.floor(100000 + Math.random() * 900000)); }

function mailReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}
async function sendMail(to, subject, html) {
  if (!mailReady()) {
    console.warn('SMTP ayarları eksik. Mail gönderilemedi:', { to, subject });
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_PORT) === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const from = process.env.MAIL_FROM_NAME ? `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>` : process.env.MAIL_FROM;
  await transporter.sendMail({ from, to, subject, html });
  return true;
}
function codeMailHtml(title, code, note='') {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:16px">
    <h2 style="margin:0 0 12px;color:#111827">${title}</h2>
    <p style="color:#374151">GörevPazar hesabın için doğrulama kodun:</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:18px;text-align:center;border-radius:12px;color:#111827">${code}</div>
    ${note ? `<p style="color:#6b7280;margin-top:16px">${note}</p>` : ''}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.</p>
  </div>`;
}


async function init() {
  await run(`CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT,
    is_admin INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, phone TEXT DEFAULT '',
    email_verified INTEGER DEFAULT 0, email_code TEXT DEFAULT '', reset_code TEXT DEFAULT '',
    banned INTEGER DEFAULT 0, rating_avg REAL DEFAULT 0, rating_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn('users', 'phone', "TEXT DEFAULT ''");
  await ensureColumn('users', 'email_verified', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'email_code', "TEXT DEFAULT ''");
  await ensureColumn('users', 'reset_code', "TEXT DEFAULT ''");
  await ensureColumn('users', 'banned', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'rating_avg', 'REAL DEFAULT 0');
  await ensureColumn('users', 'rating_count', 'INTEGER DEFAULT 0');

  await run(`CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,owner_id TEXT,title TEXT,category TEXT,city TEXT,budget INTEGER,duration TEXT,description TEXT,status TEXT DEFAULT 'draft',assigned_to TEXT,payment_status TEXT DEFAULT 'unpaid',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,task_id TEXT,user_id TEXT,message TEXT,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,task_id TEXT,user_id TEXT,note TEXT,proof TEXT,file_name TEXT DEFAULT '',file_data TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await ensureColumn('submissions', 'file_name', "TEXT DEFAULT ''");
  await ensureColumn('submissions', 'file_data', "TEXT DEFAULT ''");
  await run(`CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,task_id TEXT,user_id TEXT,amount INTEGER,status TEXT DEFAULT 'pending',provider TEXT DEFAULT 'demo',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS withdrawals(id TEXT PRIMARY KEY,user_id TEXT,amount INTEGER,full_name TEXT,iban TEXT,status TEXT DEFAULT 'pending',admin_note TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,task_id TEXT,sender_id TEXT,receiver_id TEXT,body TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,task_id TEXT,reviewer_id TEXT,reviewed_id TEXT,rating INTEGER,comment TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS support_tickets(id TEXT PRIMARY KEY,user_id TEXT,subject TEXT,message TEXT,status TEXT DEFAULT 'open',admin_reply TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  const a = await get('SELECT id FROM users WHERE email=?', ['admin@gorevpazar.com']);
  if (!a) await run('INSERT INTO users(id,name,email,password_hash,is_admin,balance,email_verified) VALUES(?,?,?,?,?,?,?)', ['u_admin', 'GörevPazar Admin', 'admin@gorevpazar.com', bcrypt.hashSync('admin123', 10), 1, 0, 1]);
  const count = await get('SELECT COUNT(*) c FROM tasks');
  if (count.c === 0) {
    const samples = [
      ['Elazığ merkezde mağaza vitrini fotoğrafı çekilecek', 'Fotoğraf & Video', 'Elazığ', 250, '2 saat', 'Konuma gidip 5 net fotoğraf çekilecek. Teslim sonrası ödeme serbest bırakılır.'],
      ['Instagram gönderime gerçek kullanıcı yorumu yap', 'Sosyal Medya', 'Online', 150, '1 gün', 'Marka kurallarına uygun, spam olmayan doğal yorum yapılacak.'],
      ['Ürün araştırması ve fiyat karşılaştırması yapılacak', 'Araştırma', 'Online', 300, '3 saat', '3 farklı siteden fiyat karşılaştırması ve kısa rapor isteniyor.']
    ];
    for (const x of samples) await run('INSERT INTO tasks(id,owner_id,title,category,city,budget,duration,description,status,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?)', [nanoid(), 'u_admin', ...x, 'open', 'funded']);
  }
}
async function ensureColumn(table, column, type) {
  const cols = await all(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

app.post('/api/register', async (req, res) => {
  try {
    let { name, email, password, phone = '' } = req.body; email = (email || '').trim().toLowerCase();
    if (!name || !email || !password) return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunlu.' });
    if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
    if (await get('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });
    const id = nanoid(), email_code = code6();
    await run('INSERT INTO users(id,name,email,password_hash,phone,email_code,email_verified) VALUES(?,?,?,?,?,?,0)', [id, name, email, bcrypt.hashSync(password, 10), phone, email_code]);
    await sendMail(email, 'GörevPazar E-posta Doğrulama Kodu', codeMailHtml('E-posta doğrulama', email_code, 'Kodu sitedeki E-posta Doğrulama alanına gir.'));
    const u = await get('SELECT id,name,email,is_admin,balance,phone,email_verified,banned,rating_avg,rating_count FROM users WHERE id=?', [id]);
    res.json({ token: tokenFor(u), user: u, message: 'Kayıt başarılı. Doğrulama kodu e-posta adresine gönderildi.' });
  } catch (e) { res.status(500).json({ error: 'Kayıt sırasında hata oluştu.' }); }
});
app.post('/api/login', async (req, res) => {
  try {
    let { email, password } = req.body; email = (email || '').trim().toLowerCase();
    const u = await get('SELECT * FROM users WHERE email=?', [email]);
    if (!u) return res.status(404).json({ error: 'Bu e-posta kayıtlı değil. Önce kayıt olun.' });
    if (u.banned) return res.status(403).json({ error: 'Hesabınız admin tarafından banlandı.' });
    if (!bcrypt.compareSync(password || '', u.password_hash)) return res.status(401).json({ error: 'Şifre hatalı.' });
    res.json({ token: tokenFor(u), user: { id: u.id, name: u.name, email: u.email, is_admin: u.is_admin, balance: u.balance, phone: u.phone, email_verified: u.email_verified, rating_avg: u.rating_avg, rating_count: u.rating_count } });
  } catch { res.status(500).json({ error: 'Giriş sırasında hata oluştu.' }); }
});
app.get('/api/me', auth, async (req, res) => {
  const u = await get('SELECT id,name,email,is_admin,balance,phone,email_verified,banned,rating_avg,rating_count FROM users WHERE id=?', [req.user.id]);
  res.json(u);
});
app.post('/api/profile', auth, notBanned, async (req, res) => {
  await run('UPDATE users SET name=?, phone=? WHERE id=?', [req.body.name || '', req.body.phone || '', req.user.id]);
  res.json({ message: 'Profil güncellendi.' });
});
app.post('/api/change-password', auth, notBanned, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const u = await get('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(currentPassword || '', u.password_hash)) return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
  await run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(newPassword, 10), req.user.id]);
  res.json({ message: 'Şifre değiştirildi.' });
});
app.post('/api/forgot-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const u = await get('SELECT id FROM users WHERE email=?', [email]);
  if (!u) return res.status(404).json({ error: 'Bu e-posta kayıtlı değil.' });
  const reset_code = code6(); await run('UPDATE users SET reset_code=? WHERE id=?', [reset_code, u.id]);
  await sendMail(email, 'GörevPazar Şifre Sıfırlama Kodu', codeMailHtml('Şifre sıfırlama', reset_code, 'Kodu sitedeki Şifremi Unuttum ekranına girerek yeni şifreni belirle.'));
  res.json({ message: 'Şifre sıfırlama kodu e-posta adresine gönderildi.' });
});
app.post('/api/reset-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { code, newPassword } = req.body;
  const u = await get('SELECT id,reset_code FROM users WHERE email=?', [email]);
  if (!u || !u.reset_code || u.reset_code !== code) return res.status(400).json({ error: 'Kod hatalı.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
  await run('UPDATE users SET password_hash=?, reset_code="" WHERE id=?', [bcrypt.hashSync(newPassword, 10), u.id]);
  res.json({ message: 'Şifre sıfırlandı. Yeni şifreyle giriş yapabilirsiniz.' });
});
app.post('/api/send-verification', auth, notBanned, async (req, res) => {
  const u = await get('SELECT email FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const code = code6(); await run('UPDATE users SET email_code=? WHERE id=?', [code, req.user.id]);
  await sendMail(u.email, 'GörevPazar E-posta Doğrulama Kodu', codeMailHtml('E-posta doğrulama', code, 'Kodu sitedeki E-posta Doğrulama alanına gir.'));
  res.json({ message: 'Doğrulama kodu e-posta adresine gönderildi.' });
});
app.post('/api/verify-email', auth, notBanned, async (req, res) => {
  const u = await get('SELECT email_code FROM users WHERE id=?', [req.user.id]);
  if (!u || !u.email_code || u.email_code !== req.body.code) return res.status(400).json({ error: 'Doğrulama kodu hatalı.' });
  await run('UPDATE users SET email_verified=1,email_code="" WHERE id=?', [req.user.id]);
  res.json({ message: 'E-posta doğrulandı.' });
});

app.get('/api/tasks', async (req, res) => {
  const { q = '', category = '', city = '' } = req.query;
  const rows = await all(`SELECT t.*, u.name owner_name, u.rating_avg owner_rating, (SELECT COUNT(*) FROM applications a WHERE a.task_id=t.id) app_count FROM tasks t LEFT JOIN users u ON u.id=t.owner_id WHERE t.status!='draft' AND t.status!='deleted' AND (?='' OR t.title LIKE ? OR t.description LIKE ?) AND (?='' OR t.category=?) AND (?='' OR t.city LIKE ?) ORDER BY t.created_at DESC`, [q, `%${q}%`, `%${q}%`, category, category, city, `%${city}%`]);
  res.json(rows);
});
app.get('/api/tasks/:id', async (req, res) => {
  const t = await get('SELECT t.*,u.name owner_name FROM tasks t LEFT JOIN users u ON u.id=t.owner_id WHERE t.id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Görev bulunamadı.' });
  const apps = await all('SELECT a.*,u.name user_name,u.rating_avg FROM applications a JOIN users u ON u.id=a.user_id WHERE task_id=?', [t.id]);
  const subs = await all('SELECT s.*,u.name user_name FROM submissions s JOIN users u ON u.id=s.user_id WHERE task_id=?', [t.id]);
  const reviews = await all('SELECT r.*,u.name reviewer_name FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE task_id=?', [t.id]);
  res.json({ ...t, applications: apps, submissions: subs, reviews });
});
app.post('/api/tasks', auth, notBanned, async (req, res) => {
  const u = await get('SELECT email_verified FROM users WHERE id=?', [req.user.id]);
  if (!u.email_verified) return res.status(403).json({ error: 'Görev açmak için önce e-postanı doğrula.' });
  const b = req.body; const badword = checkTask(b);
  if (badword) return res.status(400).json({ error: `Bu görev yayınlanamaz. Yasaklı içerik algılandı: ${badword}` });
  if (!b.title || !b.budget || !b.description) return res.status(400).json({ error: 'Başlık, bütçe ve açıklama zorunlu.' });
  const id = nanoid();
  await run('INSERT INTO tasks(id,owner_id,title,category,city,budget,duration,description,status,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, req.user.id, b.title, b.category || 'Diğer', b.city || 'Online', parseInt(b.budget), b.duration || 'Belirtilmedi', b.description, 'pending_payment', 'unpaid']);
  res.json({ id, message: 'Görev oluşturuldu. Yayın için ödeme adımına geçin.' });
});
app.post('/api/tasks/:id/apply', auth, notBanned, async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Görev bulunamadı.' });
  if (t.owner_id === req.user.id) return res.status(400).json({ error: 'Kendi görevine başvuramazsın.' });
  if (t.status !== 'open') return res.status(400).json({ error: 'Bu görev şu anda başvuru almıyor.' });
  if (await get('SELECT id FROM applications WHERE task_id=? AND user_id=?', [t.id, req.user.id])) return res.status(409).json({ error: 'Bu göreve zaten başvurdun.' });
  await run('INSERT INTO applications(id,task_id,user_id,message) VALUES(?,?,?,?)', [nanoid(), t.id, req.user.id, req.body.message || 'Göreve talibim.']);
  res.json({ message: 'Başvurun gönderildi.' });
});
app.post('/api/applications/:id/accept', auth, notBanned, async (req, res) => {
  const a = await get('SELECT a.*,t.owner_id FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
  if (a.owner_id !== req.user.id) return res.status(403).json({ error: 'Bu işlem sadece görev sahibi tarafından yapılabilir.' });
  await run('UPDATE applications SET status="accepted" WHERE id=?', [a.id]);
  await run('UPDATE applications SET status="rejected" WHERE task_id=? AND id!=?', [a.task_id, a.id]);
  await run('UPDATE tasks SET assigned_to=?, status="in_progress" WHERE id=?', [a.user_id, a.task_id]);
  res.json({ message: 'Başvuru kabul edildi. Görev devam ediyor.' });
});
app.post('/api/tasks/:id/submit', auth, notBanned, async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Görev bulunamadı.' });
  if (t.assigned_to !== req.user.id) return res.status(403).json({ error: 'Bu görev sana atanmadı.' });
  await run('INSERT INTO submissions(id,task_id,user_id,note,proof,file_name,file_data) VALUES(?,?,?,?,?,?,?)', [nanoid(), t.id, req.user.id, req.body.note || '', req.body.proof || '', req.body.file_name || '', req.body.file_data || '']);
  await run('UPDATE tasks SET status="submitted" WHERE id=?', [t.id]);
  res.json({ message: 'Teslim gönderildi. Görev sahibinin onayı bekleniyor.' });
});
app.post('/api/tasks/:id/approve', auth, notBanned, async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Görev bulunamadı.' });
  if (t.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Sadece görev sahibi veya admin onaylayabilir.' });
  const commission = Math.round(t.budget * 0.15), payout = t.budget - commission;
  await run('UPDATE users SET balance=balance+? WHERE id=?', [payout, t.assigned_to]);
  await run('UPDATE tasks SET status="completed", payment_status="released" WHERE id=?', [t.id]);
  res.json({ message: `Görev onaylandı. ${payout} TL görev yapana aktarıldı.` });
});
app.post('/api/tasks/:id/revision', auth, notBanned, async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
  if (!t || t.owner_id !== req.user.id) return res.status(403).json({ error: 'Yetki yok.' });
  await run('UPDATE tasks SET status="in_progress" WHERE id=?', [t.id]);
  res.json({ message: 'Revizyon istendi. Görev yeniden devam ediyor.' });
});
app.post('/api/tasks/:id/dispute', auth, notBanned, async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
  if (!t || (t.owner_id !== req.user.id && t.assigned_to !== req.user.id)) return res.status(403).json({ error: 'Yetki yok.' });
  await run('UPDATE tasks SET status="dispute" WHERE id=?', [t.id]);
  res.json({ message: 'Uyuşmazlık açıldı. Admin inceleyecek.' });
});
app.post('/api/reviews', auth, notBanned, async (req, res) => {
  const { task_id, reviewed_id, rating, comment } = req.body;
  const t = await get('SELECT * FROM tasks WHERE id=?', [task_id]);
  if (!t || t.status !== 'completed') return res.status(400).json({ error: 'Yorum için görev tamamlanmış olmalı.' });
  if (![t.owner_id, t.assigned_to].includes(req.user.id) || ![t.owner_id, t.assigned_to].includes(reviewed_id) || req.user.id === reviewed_id) return res.status(403).json({ error: 'Bu yorum için yetkin yok.' });
  if (await get('SELECT id FROM reviews WHERE task_id=? AND reviewer_id=? AND reviewed_id=?', [task_id, req.user.id, reviewed_id])) return res.status(409).json({ error: 'Bu kullanıcı için zaten yorum yaptın.' });
  const r = Math.max(1, Math.min(5, parseInt(rating || 5)));
  await run('INSERT INTO reviews(id,task_id,reviewer_id,reviewed_id,rating,comment) VALUES(?,?,?,?,?,?)', [nanoid(), task_id, req.user.id, reviewed_id, r, comment || '']);
  const avg = await get('SELECT AVG(rating) avg, COUNT(*) c FROM reviews WHERE reviewed_id=?', [reviewed_id]);
  await run('UPDATE users SET rating_avg=?, rating_count=? WHERE id=?', [avg.avg || 0, avg.c || 0, reviewed_id]);
  res.json({ message: 'Yorum ve puan kaydedildi.' });
});

app.post('/api/payments/paytr/create', auth, notBanned, async (req, res) => {
  const { task_id } = req.body; const t = await get('SELECT * FROM tasks WHERE id=? AND owner_id=?', [task_id, req.user.id]);
  if (!t) return res.status(404).json({ error: 'Görev bulunamadı.' });
  const pid = nanoid(); await run('INSERT INTO payments(id,task_id,user_id,amount,status,provider) VALUES(?,?,?,?,?,?)', [pid, t.id, req.user.id, t.budget, 'paid', 'demo']);
  await run('UPDATE tasks SET status="open", payment_status="funded" WHERE id=?', [t.id]);
  res.json({ demo: true, message: 'Demo ödeme başarılı. PayTR bilgileri eklenince canlı ödeme açılır.' });
});
app.get('/api/dashboard', auth, async (req, res) => {
  const owned = await all('SELECT * FROM tasks WHERE owner_id=? ORDER BY created_at DESC', [req.user.id]);
  const assigned = await all('SELECT * FROM tasks WHERE assigned_to=? ORDER BY created_at DESC', [req.user.id]);
  const apps = await all('SELECT a.*,t.title,t.budget,t.id task_id FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.user_id=? ORDER BY a.created_at DESC', [req.user.id]);
  const withdrawals = await all('SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
  const tickets = await all('SELECT * FROM support_tickets WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
  const messages = await all('SELECT m.*, t.title task_title, s.name sender_name, r.name receiver_name FROM messages m JOIN tasks t ON t.id=m.task_id JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id WHERE m.sender_id=? OR m.receiver_id=? ORDER BY m.created_at DESC', [req.user.id, req.user.id]);
  res.json({ owned, assigned, apps, withdrawals, tickets, messages });
});
app.post('/api/withdrawals', auth, notBanned, async (req, res) => {
  const amount = parseInt(req.body.amount || 0); const { full_name, iban } = req.body;
  const u = await get('SELECT balance,email_verified FROM users WHERE id=?', [req.user.id]);
  if (!u.email_verified) return res.status(403).json({ error: 'Para çekmek için e-postanı doğrula.' });
  if (!amount || amount < 50) return res.status(400).json({ error: 'Minimum çekim 50 TL.' });
  if (amount > u.balance) return res.status(400).json({ error: 'Yetersiz bakiye.' });
  if (!full_name || !iban || !iban.startsWith('TR')) return res.status(400).json({ error: 'Ad soyad ve TR ile başlayan IBAN gerekli.' });
  await run('UPDATE users SET balance=balance-? WHERE id=?', [amount, req.user.id]);
  await run('INSERT INTO withdrawals(id,user_id,amount,full_name,iban) VALUES(?,?,?,?,?)', [nanoid(), req.user.id, amount, full_name, iban]);
  res.json({ message: 'Para çekme talebi oluşturuldu.' });
});
app.post('/api/messages', auth, notBanned, async (req, res) => {
  const { task_id, receiver_id, body } = req.body;
  const t = await get('SELECT * FROM tasks WHERE id=?', [task_id]);
  if (!t || ![t.owner_id, t.assigned_to].includes(req.user.id) || ![t.owner_id, t.assigned_to].includes(receiver_id)) return res.status(403).json({ error: 'Mesaj için görev sahibi veya görevli olmalısın.' });
  if (!body) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  await run('INSERT INTO messages(id,task_id,sender_id,receiver_id,body) VALUES(?,?,?,?,?)', [nanoid(), task_id, req.user.id, receiver_id, body]);
  res.json({ message: 'Mesaj gönderildi.' });
});
app.post('/api/support', auth, notBanned, async (req, res) => {
  if (!req.body.subject || !req.body.message) return res.status(400).json({ error: 'Konu ve mesaj gerekli.' });
  await run('INSERT INTO support_tickets(id,user_id,subject,message) VALUES(?,?,?,?)', [nanoid(), req.user.id, req.body.subject, req.body.message]);
  res.json({ message: 'Destek talebi gönderildi.' });
});

app.get('/api/admin/stats', auth, admin, async (req, res) => res.json({ users: (await get('SELECT COUNT(*) c FROM users')).c, tasks: (await get('SELECT COUNT(*) c FROM tasks')).c, payments: (await get('SELECT COUNT(*) c FROM payments')).c, volume: (await get('SELECT COALESCE(SUM(amount),0) c FROM payments WHERE status="paid"')).c, withdrawals: (await get('SELECT COUNT(*) c FROM withdrawals WHERE status="pending"')).c, disputes: (await get('SELECT COUNT(*) c FROM tasks WHERE status="dispute"')).c }));
app.get('/api/admin/users', auth, admin, async (req, res) => res.json(await all('SELECT id,name,email,is_admin,balance,phone,email_verified,banned,rating_avg,rating_count,created_at FROM users ORDER BY created_at DESC')));
app.get('/api/admin/tasks', auth, admin, async (req, res) => res.json(await all('SELECT t.*,u.name owner_name FROM tasks t LEFT JOIN users u ON u.id=t.owner_id ORDER BY t.created_at DESC')));
app.get('/api/admin/withdrawals', auth, admin, async (req, res) => res.json(await all('SELECT w.*,u.name,u.email FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC')));
app.get('/api/admin/tickets', auth, admin, async (req, res) => res.json(await all('SELECT s.*,u.name,u.email FROM support_tickets s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC')));
app.post('/api/admin/users/:id/ban', auth, admin, async (req, res) => { await run('UPDATE users SET banned=? WHERE id=?', [req.body.banned ? 1 : 0, req.params.id]); res.json({ message: req.body.banned ? 'Kullanıcı banlandı.' : 'Ban kaldırıldı.' }); });
app.post('/api/admin/tasks/:id/delete', auth, admin, async (req, res) => { await run('UPDATE tasks SET status="deleted" WHERE id=?', [req.params.id]); res.json({ message: 'Görev silindi/pasife alındı.' }); });
app.post('/api/admin/tasks/:id/status', auth, admin, async (req, res) => { await run('UPDATE tasks SET status=? WHERE id=?', [req.body.status, req.params.id]); res.json({ message: 'Durum güncellendi.' }); });
app.post('/api/admin/withdrawals/:id', auth, admin, async (req, res) => {
  const w = await get('SELECT * FROM withdrawals WHERE id=?', [req.params.id]); if (!w) return res.status(404).json({ error: 'Talep bulunamadı.' });
  const status = req.body.status;
  if (w.status === 'pending' && status === 'rejected') await run('UPDATE users SET balance=balance+? WHERE id=?', [w.amount, w.user_id]);
  await run('UPDATE withdrawals SET status=?,admin_note=? WHERE id=?', [status, req.body.admin_note || '', w.id]);
  res.json({ message: 'Çekim talebi güncellendi.' });
});
app.post('/api/admin/tickets/:id/reply', auth, admin, async (req, res) => { await run('UPDATE support_tickets SET admin_reply=?,status=? WHERE id=?', [req.body.reply || '', req.body.status || 'answered', req.params.id]); res.json({ message: 'Destek talebi cevaplandı.' }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

init().then(() => app.listen(PORT, () => console.log(`GörevPazar Full çalışıyor: http://localhost:${PORT}`)));
