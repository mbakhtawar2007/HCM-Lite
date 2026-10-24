// Throw this anywhere in a controller to send a clean client-facing error.
// Anything else reaching the error handler becomes a generic 500.
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const badRequest = (message) => new ApiError(400, message);
export const unauthorized = (message = 'Not authorized') => new ApiError(401, message);
export const notFoundError = (message = 'Resource not found') => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);
export const forbidden = (message = 'Forbidden') => new ApiError(403, message);
