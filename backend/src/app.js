const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const nodeRoutes = require('./routes/nodes');
const threadRoutes = require('./routes/threads');
const messageRoutes = require('./routes/messages');
const pinRoutes = require('./routes/pins');
const uploadRoutes = require('./routes/uploads');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/uploads', uploadRoutes);

module.exports = app;
