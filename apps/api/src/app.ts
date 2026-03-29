import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import {config} from '@health-watchers/config';   // adjust path if your config package is different

const app = express();
const PORT = process.env.PORT || 4000;

// ========================
// SECURITY MIDDLEWARE
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
    },
  },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================
// DATABASE CONNECTION
// ========================
const connectDB = async () => {
  try {
    const mongoUri = config.mongoUri;

    if (!mongoUri) {
      console.error('❌ MONGO_URI is not defined in environment variables');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);

    // Log only the host (never log credentials)
    const host = new URL(mongoUri).hostname;
    console.log(`✅ MongoDB connected successfully to ${host}`);

  } catch (error: any) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1); // Fail fast - don't start server without DB
  }
};

// MongoDB error handling after initial connection
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

// ========================
// START SERVER
// ========================
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Rejection:', err.message);
  process.exit(1);
});

startServer();