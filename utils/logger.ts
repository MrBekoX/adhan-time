type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = __DEV__;

function emit(level: Level, message: string, meta?: unknown): void {
  if (!isDev && level === 'debug') return;
  const ts = new Date().toISOString();
  const payload = meta ? ` ${safeStringify(meta)}` : '';
  const line = `[${ts}] [${level}] ${message}${payload}`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else if (isDev) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
