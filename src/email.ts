import nodemailer from "nodemailer";
import { config, hasSmtpConfig } from "./config";
import { getEmailRecipient } from "./db";
import type { ReportData, Todo } from "./types";
import { reportToText } from "./reports";

const getTransporter = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
};

const sendMail = async (subject: string, text: string): Promise<boolean> => {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured; skipping email send.");
    return false;
  }

  const recipient = await getEmailRecipient();
  if (!recipient) {
    console.warn("No recipient email configured; skipping email send.");
    return false;
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    subject,
    text,
  });

  return true;
};

export const sendCompletedTaskEmail = async (task: Todo): Promise<boolean> => {
  const text = [
    "A task was marked as completed.",
    "",
    `Title: ${task.title}`,
    `Notes: ${task.notes ?? ""}`,
    `Due date: ${task.due_date ?? ""}`,
    `Completed at: ${task.completed_at ?? ""}`,
  ].join("\n");

  return sendMail(`Task Completed: ${task.title}`, text);
};

export const sendCreatedTaskEmail = async (task: Todo): Promise<boolean> => {
  const text = [
    "A new task was created.",
    "",
    `Title: ${task.title}`,
    `Notes: ${task.notes ?? ""}`,
    `Due date: ${task.due_date ?? ""}`,
    `Created at: ${task.created_at}`,
  ].join("\n");

  return sendMail(`Task Created: ${task.title}`, text);
};

export const sendReopenedTaskEmail = async (task: Todo): Promise<boolean> => {
  const text = [
    "A task was reopened.",
    "",
    `Title: ${task.title}`,
    `Notes: ${task.notes ?? ""}`,
    `Due date: ${task.due_date ?? ""}`,
    `Reopened at: ${new Date().toISOString()}`,
  ].join("\n");

  return sendMail(`Task Reopened: ${task.title}`, text);
};

export const sendUpdatedTaskEmail = async (task: Todo): Promise<boolean> => {
  const text = [
    "A task was edited.",
    "",
    `Title: ${task.title}`,
    `Notes: ${task.notes ?? ""}`,
    `Due date: ${task.due_date ?? ""}`,
    `Edited at: ${new Date().toISOString()}`,
  ].join("\n");

  return sendMail(`Task Updated: ${task.title}`, text);
};

export const sendReportEmail = async (report: ReportData): Promise<boolean> => {
  const subject = `Todo ${report.period} report: ${report.completedCount} completed`;
  return sendMail(subject, reportToText(report));
};
