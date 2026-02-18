export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface Todo {
  id: number;
  title: string;
  notes: string | null;
  due_date: string | null;
  completed: number;
  notify_on_complete: number;
  created_at: string;
  completed_at: string | null;
}

export interface TodoInput {
  title: string;
  notes?: string;
  dueDate?: string;
  notifyOnComplete?: boolean;
}

export interface ReportData {
  period: ReportPeriod;
  start: string;
  end: string;
  generatedAt: string;
  completedCount: number;
  tasks: Todo[];
}
