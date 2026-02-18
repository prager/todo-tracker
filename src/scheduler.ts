import cron from "node-cron";
import { config } from "./config";
import { getCompletedReport } from "./reports";
import { sendReportEmail } from "./email";

const isLastDayOfMonthUtc = (date: Date): boolean => {
  const tomorrow = new Date(date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.getUTCDate() === 1;
};

const runReportJob = async (period: "daily" | "weekly" | "monthly") => {
  try {
    const report = await getCompletedReport(period);
    await sendReportEmail(report);
    console.log(`[scheduler] ${period} report processed (${report.completedCount} completed).`);
  } catch (error) {
    console.error(`[scheduler] Failed to process ${period} report`, error);
  }
};

export const setupSchedulers = () => {
  if (!config.enableScheduledEmails) {
    console.log("[scheduler] Scheduled emails disabled via ENABLE_SCHEDULED_EMAILS=false");
    return;
  }

  cron.schedule("55 23 * * *", () => {
    void runReportJob("daily");
  }, { timezone: config.timezone });

  cron.schedule("55 23 * * 0", () => {
    void runReportJob("weekly");
  }, { timezone: config.timezone });

  cron.schedule("55 23 28-31 * *", () => {
    if (isLastDayOfMonthUtc(new Date())) {
      void runReportJob("monthly");
    }
  }, { timezone: config.timezone });

  console.log(`[scheduler] Started with timezone ${config.timezone}`);
};
