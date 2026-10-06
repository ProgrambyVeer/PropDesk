const ts = () => new Date().toISOString();
export const logger = {
  info: (...a: unknown[]) => process.env.NODE_ENV !== 'test' && console.log(ts(), 'INFO', ...a),
  warn: (...a: unknown[]) => console.warn(ts(), 'WARN', ...a),
  error: (...a: unknown[]) => console.error(ts(), 'ERROR', ...a),
};
