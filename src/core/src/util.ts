export const logError = (...args: [any, ...any[]]) =>
  console.error("\x1b[31m" + args[0].toString(), ...args.slice(1), "\x1b[0m");
export const terminate = (message?: string) => {
  if (message) logError(message);
  process.exit(1);
};
