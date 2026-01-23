import { EventEmitter } from 'events';
import { Task } from '../types/Task';

export enum TaskEventType {
  TASK_UPDATED = 'task:updated',
  TASK_STATUS_CHANGED = 'task:status_changed',
  TASK_PROGRESS_CHANGED = 'task:progress_changed',
  TASK_DELETED = 'task:deleted',
}

export interface TaskEventData {
  taskId: string;
  task?: Partial<Task>;
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

  onTaskEvent(type: TaskEventType | 'task:*', handler: (data: any) => void): void {
    this.on(type, handler);
  }
}

export const eventBus = EventBus.getInstance();
