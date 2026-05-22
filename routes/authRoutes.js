const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// Endpoint: POST http://localhost:5000/api/auth/register
router.post('/register', register);

// Endpoint: POST http://localhost:5000/api/auth/login
router.post('/login', login);

module.exports = router;