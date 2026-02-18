import type { ReportData, ReportPeriod, Todo } from "./types";
import { completedInRange } from "./db";

const startOfDayUtc = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDaysUtc = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfWeekUtc = (date: Date): Date => {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const dayStart = startOfDayUtc(date);
  return addDaysUtc(dayStart, mondayOffset);
};

const startOfMonthUtc = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const getRangeForPeriod = (period: ReportPeriod, referenceDate: Date = new Date()): { start: Date; end: Date } => {
  if (period === "daily") {
    const start = startOfDayUtc(referenceDate);
    return { start, end: addDaysUtc(start, 1) };
  }
  if (period === "weekly") {
    const start = startOfWeekUtc(referenceDate);
    return { start, end: addDaysUtc(start, 7) };
  }

  const start = startOfMonthUtc(referenceDate);
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
};

export const getCompletedReport = async (period: ReportPeriod, referenceDate: Date = new Date()): Promise<ReportData> => {
  const { start, end } = getRangeForPeriod(period, referenceDate);
  const tasks = await completedInRange(start.toISOString(), end.toISOString());
  return {
    period,
    start: start.toISOString(),
    end: end.toISOString(),
    generatedAt: new Date().toISOString(),
    completedCount: tasks.length,
    tasks,
  };
};

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const reportToCsv = (report: ReportData): string => {
  const header = [
    "Task ID",
    "Title",
    "Notes",
    "Due Date",
    "Completed At",
    "Created At",
  ].join(",");

  const rows = report.tasks.map((task: Todo) => {
    return [
      String(task.id),
      csvEscape(task.title),
      csvEscape(task.notes ?? ""),
      csvEscape(task.due_date ?? ""),
      csvEscape(task.completed_at ?? ""),
      csvEscape(task.created_at),
    ].join(",");
  });

  return [
    `Period,${report.period}`,
    `Range Start,${report.start}`,
    `Range End,${report.end}`,
    `Completed Count,${report.completedCount}`,
    "",
    header,
    ...rows,
  ].join("\n");
};

export const reportToText = (report: ReportData): string => {
  const lines = [
    `Todo completion report (${report.period})`,
    `Range: ${report.start} to ${report.end}`,
    `Completed count: ${report.completedCount}`,
    "",
  ];

  if (report.tasks.length === 0) {
    lines.push("No tasks were completed in this period.");
    return lines.join("\n");
  }

  report.tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.title}`);
    if (task.notes) {
      lines.push(`   Notes: ${task.notes}`);
    }
    if (task.due_date) {
      lines.push(`   Due: ${task.due_date}`);
    }
    lines.push(`   Completed: ${task.completed_at ?? "n/a"}`);
  });

  return lines.join("\n");
};
