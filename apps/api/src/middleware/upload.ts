import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function imageUpload(env: Env) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MEDIA_MAX_BYTES, files: 1 },
  });
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('MEDIA_INVALID', 'Image exceeds the size limit', 413));
        return;
      }
      next(new AppError('MEDIA_INVALID', 'Unable to read the uploaded file', 400));
    });
  };
}
