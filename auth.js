const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const sessions = new Map();

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  }
}

function readUsers() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  if (actualBuffer.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, hashBuffer);
}

function publicUser(user) {
  return { id: user.id, name: user.name, gender: user.gender };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return token;
}

function getToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function getSessionUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const userId = sessions.get(token);
  if (!userId) return null;
  return readUsers().find((user) => user.id === userId) || null;
}

function register({ name, gender, password }) {
  const users = readUsers();
  const cleanName = String(name || '').trim();
  const cleanGender = String(gender || '').trim();

  if (!cleanName || !cleanGender || !password) {
    return { error: '请填写名字、性别和密码' };
  }
  if (!['男', '女', '其他'].includes(cleanGender)) {
    return { error: '性别格式不正确' };
  }
  if (String(password).length < 4) {
    return { error: '密码至少 4 位' };
  }
  if (users.some((user) => user.name.toLowerCase() === cleanName.toLowerCase())) {
    return { error: '这个名字已被使用' };
  }

  const user = {
    id: crypto.randomUUID(),
    name: cleanName,
    gender: cleanGender,
    password: hashPassword(String(password)),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeUsers(users);

  return { token: createSession(user), user: publicUser(user) };
}

function login({ name, password }) {
  const users = readUsers();
  const cleanName = String(name || '').trim();
  const user = users.find((item) => item.name.toLowerCase() === cleanName.toLowerCase());

  if (!user || !verifyPassword(String(password || ''), user.password)) {
    return { error: '名字或密码不正确' };
  }

  return { token: createSession(user), user: publicUser(user) };
}

function logout(req) {
  const token = getToken(req);
  if (token) sessions.delete(token);
}

module.exports = {
  register,
  login,
  logout,
  getSessionUser,
  publicUser
};
