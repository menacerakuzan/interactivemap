const path = require('path');

const PORT = Number(process.env.PORT || 3001);
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? '' : 'odesa-map-dev-secret');
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'odesa-map.db');

module.exports = {
  PORT,
  JWT_SECRET,
  DB_PATH,
};
