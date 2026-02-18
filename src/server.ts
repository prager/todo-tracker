import express from "express";
import path from "path";
import { config } from "./config";
import {
  createTodo,
  deleteTodoById,
  getDb,
  getEmailRecipient,
  getTodoById,
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
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv, baseUrl: config.baseUrl });
});

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
