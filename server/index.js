import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import { initDb } from './services/db.js';
import { startScheduler } from './services/scheduler.js';

initDb().catch(err => {
  console.error('Failed to initialize database:', err.message);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.VERCEL 
    ? true 
    : process.env.NODE_ENV === 'production' 
      ? false 
      : ['http://localhost:5173', 'http://127.0.0.1:5173']
}));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// API routes
app.use('/api', apiRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message
  });
});

// Graceful shutdown
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║   🇵🇰  PricePK Server Running         ║
  ║   → http://localhost:${PORT}            ║
  ║   → Environment: ${process.env.NODE_ENV || 'development'}    ║
  ╚═══════════════════════════════════════╝
    `);

    startScheduler();
    console.log('Background scraper scheduler started.');
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down...');
    server.close(() => process.exit(0));
  });
}

export default app;
