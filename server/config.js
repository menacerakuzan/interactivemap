const path = require('path');

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'odesa-map-dev-secret';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'odesa-map.db');

module.exports = {
  PORT,
  JWT_SECRET,
  DB_PATH,
};
