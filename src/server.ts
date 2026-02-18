import crypto from "crypto";
import express from "express";
import path from "path";
import { config } from "./config";
import {
  createTodo,
  deleteTodoById,
  getDb,
  getEmailRecipient,
  listTodos,
  setEmailRecipient,
  setTodoCompleted,
  updateTodoDetails,
} from "./db";
import {
  sendCompletedTaskEmail,
  sendCreatedTaskEmail,
  sendReopenedTaskEmail,
  sendReportEmail,
  sendUpdatedTaskEmail,
} from "./email";
import { getCompletedReport, reportToCsv, reportToText } from "./reports";
import { setupSchedulers } from "./scheduler";
import type { ReportPeriod } from "./types";

const app = express();
const publicDir = path.join(process.cwd(), "public");
const authCookieName = "todo_tracker_auth";

app.use(express.json());

const parsePeriod = (value: string): ReportPeriod | null => {
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }
  return null;
};

const parseStartDate = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parseCookies = (header: string | undefined): Record<string, string> => {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
};

const signValue = (value: string): string => {
  return crypto.createHmac("sha256", config.auth.sessionSecret).update(value).digest("hex");
};

const createAuthToken = (username: string): string => {
  const expiresAt = Date.now() + config.auth.sessionMaxAgeHours * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, e: expiresAt })).toString("base64url");
  const signature = signValue(payload);
  return `${payload}.${signature}`;
};

const readAuthUser = (req: express.Request): string | null => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[authCookieName];
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signValue(payload);
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
      u?: string;
      e?: number;
    };

    if (!parsed.u || !parsed.e || Date.now() > parsed.e) {
      return null;
    }

    return parsed.u;
  } catch {
    return null;
  }
};

const setAuthCookie = (res: express.Response, username: string) => {
  const token = createAuthToken(username);
  const maxAge = config.auth.sessionMaxAgeHours * 60 * 60;
  const secure = config.nodeEnv === "production";
  res.setHeader(
    "Set-Cookie",
    `${authCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
  );
};

const clearAuthCookie = (res: express.Response) => {
  const secure = config.nodeEnv === "production";
  res.setHeader(
    "Set-Cookie",
    `${authCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`,
  );
};

const requireApiAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = readAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const requireWebAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = readAuthUser(req);
  if (!user) {
    res.redirect("/login");
    return;
  }
  next();
};

app.get("/login", (req, res) => {
  if (readAuthUser(req)) {
    res.redirect("/");
    return;
  }
  res.sendFile(path.join(publicDir, "login.html"));
});

app.post("/api/auth/login", (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (username !== config.auth.username || password !== config.auth.password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  setAuthCookie(res, username);
  res.json({ ok: true });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/status", (req, res) => {
  const user = readAuthUser(req);
  res.json({ authenticated: Boolean(user), user: user ?? null });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv, baseUrl: config.baseUrl });
});

app.use("/api", requireApiAuth);

app.get("/api/settings/email", async (_req, res) => {
  const email = await getEmailRecipient();
  res.json({ email });
});

app.put("/api/settings/email", async (req, res) => {
  if (typeof req.body.email !== "string") {
    res.status(400).json({ error: "Email must be a string" });
    return;
  }

  const normalizedEmail = req.body.email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const email = await setEmailRecipient(normalizedEmail);
  res.json({ email });
});

app.get("/api/todos", async (req, res) => {
  const status = (req.query.status as string | undefined) ?? "all";
  if (!["all", "active", "completed"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const todos = await listTodos(status as "all" | "active" | "completed");
  res.json(todos);
});

app.post("/api/todos", async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const notes = typeof req.body.notes === "string" ? req.body.notes : undefined;
  const dueDate = typeof req.body.dueDate === "string" ? req.body.dueDate : undefined;
  const emailOnCreate = Boolean(req.body.emailOnCreate);

  if (!title) {
    res.status(400).json({ error: "Task title is required" });
    return;
  }

  const todo = await createTodo({ title, notes, dueDate, notifyOnComplete: emailOnCreate });
  let emailed = false;
  if (emailOnCreate) {
    emailed = await sendCreatedTaskEmail(todo);
  }

  res.status(201).json({ todo, emailed });
});

app.patch("/api/todos/:id/complete", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const emailOnComplete = Boolean(req.body.emailOnComplete);
  const todo = await setTodoCompleted(id, true);
  if (!todo) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  let emailed = false;
  if (emailOnComplete || todo.notify_on_complete === 1) {
    emailed = await sendCompletedTaskEmail(todo);
  }

  res.json({ todo, emailed });
});

app.patch("/api/todos/:id/reopen", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const todo = await setTodoCompleted(id, false);
  if (!todo) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  let emailed = false;
  if (todo.notify_on_complete === 1) {
    emailed = await sendReopenedTaskEmail(todo);
  }

  res.json({ todo, emailed });
});

app.delete("/api/todos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await deleteTodoById(id);
  if (!deleted) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  res.status(204).send();
});

app.patch("/api/todos/:id/notes", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  if (typeof req.body.title !== "string") {
    res.status(400).json({ error: "Title must be a string" });
    return;
  }

  if (typeof req.body.notes !== "string") {
    res.status(400).json({ error: "Notes must be a string" });
    return;
  }

  const normalizedTitle = req.body.title.trim();
  if (!normalizedTitle) {
    res.status(400).json({ error: "Task title is required" });
    return;
  }

  const normalizedNotes = req.body.notes.trim();
  const todo = await updateTodoDetails(id, normalizedTitle, normalizedNotes.length ? normalizedNotes : null);
  if (!todo) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  let emailed = false;
  if (todo.notify_on_complete === 1) {
    emailed = await sendUpdatedTaskEmail(todo);
  }

  res.json({ todo, emailed });
});

app.get("/api/reports/:period", async (req, res) => {
  const period = parsePeriod(req.params.period);
  if (!period) {
    res.status(400).json({ error: "Invalid report period" });
    return;
  }

  const startDateRaw = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const referenceDate = parseStartDate(startDateRaw);
  if (startDateRaw && !referenceDate) {
    res.status(400).json({ error: "Invalid startDate. Use YYYY-MM-DD." });
    return;
  }

  const report = await getCompletedReport(period, referenceDate ?? new Date());
  res.json(report);
});

app.post("/api/reports/:period/email", async (req, res) => {
  const period = parsePeriod(req.params.period);
  if (!period) {
    res.status(400).json({ error: "Invalid report period" });
    return;
  }

  const startDateRaw = typeof req.body.startDate === "string" ? req.body.startDate : undefined;
  const referenceDate = parseStartDate(startDateRaw);
  if (startDateRaw && !referenceDate) {
    res.status(400).json({ error: "Invalid startDate. Use YYYY-MM-DD." });
    return;
  }

  const report = await getCompletedReport(period, referenceDate ?? new Date());
  const emailed = await sendReportEmail(report);
  res.json({ emailed, report });
});

app.get("/api/reports/:period/download", async (req, res) => {
  const period = parsePeriod(req.params.period);
  if (!period) {
    res.status(400).json({ error: "Invalid report period" });
    return;
  }

  const format = req.query.format === "csv" ? "csv" : "txt";
  const startDateRaw = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const referenceDate = parseStartDate(startDateRaw);
  if (startDateRaw && !referenceDate) {
    res.status(400).json({ error: "Invalid startDate. Use YYYY-MM-DD." });
    return;
  }

  const report = await getCompletedReport(period, referenceDate ?? new Date());
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `todo-${period}-report-${timestamp}.${format}`;

  if (format === "csv") {
    const csv = reportToCsv(report);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.send(csv);
    return;
  }

  const txt = reportToText(report);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  res.send(txt);
});

app.get("/", requireWebAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/index.html", requireWebAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/app.js", requireWebAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, "app.js"));
});

app.use(express.static(publicDir));

const bootstrap = async () => {
  await getDb();
  setupSchedulers();
  app.listen(config.port, () => {
    console.log(`Todo tracker listening on port ${config.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
