// Runs a Zod schema against req.body before the controller runs.
// On failure the client gets a 400 listing every bad field at once.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
  }
  req.body = result.data;
  next();
};
