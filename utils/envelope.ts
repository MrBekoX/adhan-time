export type ApiResponse<T> = {
  success: boolean;
  code: number;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
  timestamp?: number;
};

export function isApiResponse<T = unknown>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'code' in value &&
    'data' in value
  );
}
