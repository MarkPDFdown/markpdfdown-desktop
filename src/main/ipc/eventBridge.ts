import { eventBus, TaskEventType, TaskEventData, TaskDetailEventData } from '../../core/shared/events/EventBus.js';
import { windowManager } from '../WindowManager.js';

export class EventBridge {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized) return;

    eventBus.onTaskEvent('task:*', this.handleTaskEvent.bind(this));
    eventBus.onTaskDetailEvent('taskDetail:*', this.handleTaskDetailEvent.bind(this));
    this.isInitialized = true;
    console.log('[EventBridge] Initialized');
  }

  private handleTaskEvent(data: { type: TaskEventType } & TaskEventData): void {
    const { type, taskId, task, timestamp } = data;

    windowManager.sendToRenderer('task:event', {
      type,
      taskId,
      task,
      timestamp,
    });
  }

  private handleTaskDetailEvent(data: { type: TaskEventType } & TaskDetailEventData): void {
    const { type, taskId, pageId, page, status, timestamp } = data;

    windowManager.sendToRenderer('taskDetail:event', {
      type,
      taskId,
      pageId,
      page,
      status,
      timestamp,
    });
  }

  cleanup(): void {
    eventBus.removeAllListeners();
    this.isInitialized = false;
  }
}

export const eventBridge = new EventBridge();
