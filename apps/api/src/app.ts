import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { logger } from './config/logger.js';
import type { Env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestId } from './middleware/request-id.js';
import { openApiSpec } from './openapi/spec.js';
import { createV1Router, streamMedia } from './routes/v1.js';
import { asyncHandler } from './middleware/async-handler.js';
import './types/http.js';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'ETag'],
    }),
  );
  app.use(cookieParser());
  app.use(
    express.json({
      limit: '1mb',
      verify(req, _res, buffer) {
        (req as Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
      customLogLevel(_req, res, error) {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url };
        },
      },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'Aprotel Solar API',
      version: '1.0.0',
      documentation: '/api/docs',
      health: '/health',
    });
  });
  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: process.uptime() } });
  });
  app.get('/ready', asyncHandler(async (_req, res) => {
    const mongoose = await import('mongoose');
    const ready = mongoose.default.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ data: { status: ready ? 'ready' : 'not_ready' } });
  }));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Aprotel Solar API' }));
  app.use('/api', rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX, name: 'api' }));
  app.use('/api/v1', createV1Router(env));
  app.get('/api/media/:id', asyncHandler(streamMedia));
  app.get('/api/v1/media/:id', asyncHandler(streamMedia));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
