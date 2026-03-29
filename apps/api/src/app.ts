import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

// ========================
// SECURITY MIDDLEWARE - MUST BE FIRST
// ========================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================
// BASIC HEALTH ROUTE (Temporary until routes folder is set up)
// ========================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'Health Watchers API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ========================
// 404 Handler
// ========================
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
});

export default app;