import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without starting a server, so integration tests can
 * drive it with supertest.
 */
export function createApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  // Public routes. Everything added after these should use requireAuth.
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
