export type TodoPriority = "LOW" | "MEDIUM" | "HIGH";

export type TodoDto = {
  id: string;
  title: string;
  description: string | null;
  priority: TodoPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateNodeDto = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  parentId: string | null;
};

export type TemplateDto = {
  id: string;
  name: string;
  description: string | null;
  nodes: TemplateNodeDto[];
  nodeCount: number;
  hasRuns: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RunStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type RunNodeDto = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  parentId: string | null;
  isParent: boolean;
  completedAt: string | null;
  firstCompletedAt: string | null;
  lastModifiedAt: string | null;
};

export type RunDto = {
  id: string;
  templateId: string;
  templateName: string;
  templateDescription: string | null;
  version: string;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  completedCount: number;
  totalCount: number;
  requiredCompletedCount: number;
  requiredTotalCount: number;
  progressPercent: number;
  nodes: RunNodeDto[];
  createdAt: string;
  updatedAt: string;
};
