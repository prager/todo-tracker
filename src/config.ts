/* update 1 */
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  dbPath:
    process.env.DB_PATH ?? path.join(process.cwd(), "data", "todos.sqlite"),
  timezone: process.env.TIMEZONE ?? "UTC",
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
  },
  enableScheduledEmails: toBool(process.env.ENABLE_SCHEDULED_EMAILS, true),
  auth: {
    username: process.env.AUTH_USERNAME ?? "admin",
    password: process.env.AUTH_PASSWORD_B64
      ? Buffer.from(process.env.AUTH_PASSWORD_B64, "base64").toString("utf-8")
      : process.env.AUTH_PASSWORD ?? "change-me",
    sessionSecret:
      process.env.AUTH_SESSION_SECRET ?? "change-this-session-secret",
    sessionMaxAgeHours: Number(process.env.AUTH_SESSION_MAX_AGE_HOURS ?? 12),
  },
};

export const hasSmtpConfig = (): boolean => {
  return Boolean(
    config.smtp.host &&
      config.smtp.port &&
      config.smtp.user &&
      config.smtp.pass &&
      config.smtp.from
  );
};
