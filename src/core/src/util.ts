import log from "loglevel";

const originalFactory = log.methodFactory;
log.methodFactory = (methodName, logLevel, loggerName) => {
  const original = originalFactory(methodName, logLevel, loggerName);
  if (methodName === "error")
    return (...args) =>
      original("\x1b[31m" + args[0].toString(), ...args.slice(1), "\x1b[0m");
  else if (methodName === "warn")
    return (...args) =>
      original("\x1b[33m" + args[0].toString(), ...args.slice(1), "\x1b[0m");
  else return original;
};
log.rebuild();

export const terminate = (message?: string) => {
  if (message) log.error(message);
  process.exit(1);
};
