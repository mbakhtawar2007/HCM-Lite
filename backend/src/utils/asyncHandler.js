// Wraps an async controller so a thrown error / rejected promise
// goes to the central error handler instead of crashing the request.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
