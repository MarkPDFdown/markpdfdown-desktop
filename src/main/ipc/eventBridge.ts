import { eventBus, TaskEventType, TaskEventData } from '../../server/events/EventBus.js';
import { windowManager } from '../WindowManager.js';

export class EventBridge {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized) return;

    eventBus.onTaskEvent('task:*', this.handleTaskEvent.bind(this));
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

  cleanup(): void {
    eventBus.removeAllListeners();
    this.isInitialized = false;
  }
}

export const eventBridge = new EventBridge();
