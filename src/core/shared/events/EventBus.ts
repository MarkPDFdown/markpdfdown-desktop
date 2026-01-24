import { EventEmitter } from 'events';
import { Task } from '../../../shared/types/Task.js';

export enum TaskEventType {
  TASK_UPDATED = 'task:updated',
  TASK_STATUS_CHANGED = 'task:status_changed',
  TASK_PROGRESS_CHANGED = 'task:progress_changed',
  TASK_DELETED = 'task:deleted',
  // TaskDetail events
  TASK_DETAIL_UPDATED = 'taskDetail:updated',
}

export interface TaskEventData {
  taskId: string;
  task?: Partial<Task>;
  timestamp: number;
}

export interface TaskDetailEventData {
  taskId: string;
  pageId: number;
  page: number;
  status: number;
  timestamp: number;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emitTaskEvent(type: TaskEventType, data: TaskEventData): void {
    this.emit(type, data);
    this.emit('task:*', { type, ...data });
  }

  emitTaskDetailEvent(type: TaskEventType, data: TaskDetailEventData): void {
    this.emit(type, data);
    this.emit('taskDetail:*', { type, ...data });
  }

  onTaskEvent(type: TaskEventType | 'task:*', handler: (data: any) => void): void {
    this.on(type, handler);
  }

  onTaskDetailEvent(type: TaskEventType | 'taskDetail:*', handler: (data: any) => void): void {
    this.on(type, handler);
  }
}

export const eventBus = EventBus.getInstance();
