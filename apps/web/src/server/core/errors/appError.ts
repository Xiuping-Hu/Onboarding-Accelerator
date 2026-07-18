export type AppErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'FEATURE_DISABLED'
  | 'CONFLICT'
  | 'RATE_LIMITED';

const statusByCode: Record<AppErrorCode, number> = {
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  FEATURE_DISABLED: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = statusByCode[code];
  }

  static validation(message = 'Invalid request', details?: unknown): AppError {
    return new AppError('VALIDATION_FAILED', message, details);
  }

  static notFound(message: string): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static featureDisabled(message: string): AppError {
    return new AppError('FEATURE_DISABLED', message);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }
}
