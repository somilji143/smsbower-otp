const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { generateToken } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const existing = await db.users.findByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    await db.users.create(email, password, 'user');
    const user = await db.users.findByEmail(email);
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, balance: user.balance } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await db.users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is disabled' });
    if (!db.users.verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, balance: user.balance } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
