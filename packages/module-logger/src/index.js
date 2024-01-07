import crypto from "crypto";
import chalk from "chalk";
import context from "express-http-context";
import * as winston from "winston";
import "winston-daily-rotate-file";

let _logger;

let _defaultConfig = {
  transportOverrides: [],
  console: {
    enabled: true,
    options: {}
  },
  file: {
    enabled: false,
    options: {}
  },
  globalAttributes: {}
};

const _defaultKeys = ["level", "correlationId", "timestamp", "message"];

const _createLogger = () => {
  let transports = [];

  if (_defaultConfig.console?.enabled) {
    transports.push(
      new winston.transports.Console({
        handleRejections: true,
        handleExceptions: true,
        ...(_defaultConfig.console?.options ?? {})
      })
    );
  }

  if (_defaultConfig.file?.enabled) {
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: "%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: false,
        maxFiles: "7d",
        dirname: "./logs",
        ...(_defaultConfig.file?.options ?? {})
      })
    );
  }

  if (_defaultConfig.transportOverrides?.length) transports = [..._defaultConfig.transportOverrides];

  if (!transports.length) throw new Error("No transports configured for logger");

  _logger = winston.createLogger({
    format: winston.format.combine(
      winston.format((infoObj) => {
        let correlationId = context.get("correlationId");
        if (!correlationId) {
          correlationId = crypto.randomBytes(16).toString("hex");
          context.set("correlationId", correlationId);
        }
        infoObj["correlationId"] = chalk.blue(correlationId);
        return { ...infoObj, ...(_defaultConfig.globalAttributes ?? {}) };
      })(),
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.colorize({ all: true }),
      winston.format.printf((info) => {
        return `${[..._defaultKeys, ...Object.keys(info)].reduce((acc, key, i) => {
          if ((_defaultKeys.includes(key) && i <= 3) || (i > 3 && !_defaultKeys.includes(key))) {
            if (i > 0) acc += ", ";
            return (acc += `"${chalk.gray(key)}": "${info[key]}"`);
          }
          return acc;
        }, "{ ")} }`;
      })
    ),
    transports
  });

  _logger.exitOnError = false;
};

export * from "winston";

export const configure = (userConfig) => {
  _defaultConfig = Object.assign(_defaultConfig, userConfig);
};

export const moduleLogger = (moduleName) => {
  if (global.unit_tests_running || !_logger) _createLogger();
  const prefix = moduleName ? `[${moduleName}] - ` : "";
  return {
    ..._logger,
    ...["debug", "info", "trace", "warn", "error", "log"].reduce((acc, level) => {
      acc[level] = (message, infoObj = {}) => {
        _logger[level](`${prefix}${message}`, infoObj);
      };
      return acc;
    }, {})
  };
};

export default _logger;
