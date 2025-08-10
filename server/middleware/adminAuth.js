import jwt from 'jsonwebtoken';

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'fallback-admin-secret-change-in-production';

export const generateAdminToken = (username) => {
  return jwt.sign(
    { username, role: 'admin', type: 'admin' },
    ADMIN_SECRET,
    { expiresIn: '24h' }
  );
};

export const verifyAdminToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.adminToken;
    
    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const decoded = jwt.verify(token, ADMIN_SECRET);
    
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
};

export const validateAdminCredentials = (username, password) => {
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'change-me-in-production';
  
  return username === validUsername && password === validPassword;
}; 