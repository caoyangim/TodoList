export type TodoPriority = "LOW" | "MEDIUM" | "HIGH";
export type TodoStatus = "PENDING" | "RESOLVED" | "COMPLETED";

export type TodoDto = {
  id: string;
  title: string;
  description: string | null;
  note: NoteContentDto | null;
  verificationReport: NoteContentDto | null;
  status: TodoStatus;
  timePriority: TodoPriority;
  importancePriority: TodoPriority;
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

/** @deprecated Use NoteFileDto instead */
export type NoteImageDto = NoteFileDto;

export type NoteFileDto = {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  originalName: string;
};

export type NoteContentDto = {
  html: string;
  files: NoteFileDto[];
};

export type UserRole = "ADMIN" | "USER";

export type CurrentUserDto = {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type AdminUserDto = CurrentUserDto & {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RunNodeDto = {
  id: string;
  name: string;
  description: string | null;
  note: NoteContentDto | null;
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
  title: string;
  version: string | null;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  completedCount: number;
  totalCount: number;
  requiredCompletedCount: number;
  requiredTotalCount: number;
  progressPercent: number;
  nodes: RunNodeDto[];
  createdAt: string;
  updatedAt: string;
};
