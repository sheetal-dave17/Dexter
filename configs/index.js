require('dotenv').config()

const env = process.env.ENV || 'dev';
const config = require('./' + env);

module.exports = config
