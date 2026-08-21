const jwt = require('jsonwebtoken');
const db = require('../database/db');

const SECRET = process.env.JWT_SECRET || 'default_secret_change_me';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '7d' });
}

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = await db.users.findById(decoded.id);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account disabled' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

module.exports = { auth, adminOnly, generateToken };
