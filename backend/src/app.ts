import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { requireAuth } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { equipmentRouter } from './routes/equipment.js';
import { healthRouter } from './routes/health.js';
import { sitesRouter } from './routes/sites.js';

/**
 * Builds the Express app without starting a server, so integration tests can
 * drive it with supertest.
 */
export function createApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  // Public routes.
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Everything below requires a logged-in user.
  app.use('/api/sites', requireAuth, sitesRouter);
  app.use('/api/equipment', requireAuth, equipmentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
