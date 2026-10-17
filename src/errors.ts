export class AppError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = "AppError";
  }
}
export function publicError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message, status: error.status };
  return { code: "INTERNAL_ERROR", message: "Operation failed. Run doctor; do not share tokens or health data in diagnostics." };
}
