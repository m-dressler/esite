import logger from "loglevel";

const { error, warn } = logger;
logger.error = (...args: [any, ...any[]]) =>
  error("\x1b[31m" + args[0].toString(), ...args.slice(1), "\x1b[0m");
logger.warn = (...args: [any, ...any[]]) =>
  warn("\x1b[33m" + args[0].toString(), ...args.slice(1), "\x1b[0m");

export const terminate = (message?: string) => {
  if (message) logger.error(message);
  process.exit(1);
};
