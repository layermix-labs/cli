import { TaskStatus } from '../../core/task-runner.js';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  IDLE: 'Waiting',
  QUEUED: 'Waiting',
  RUNNING: 'Running',
  SUCCESS: 'Success',
  FAILURE: 'Failed',
  SKIPPED: 'Not Started',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  IDLE: 'yellow',
  QUEUED: 'yellow',
  RUNNING: 'blue',
  SUCCESS: 'green',
  FAILURE: 'red',
  SKIPPED: 'gray',
};

export const STATUS_ICON: Record<TaskStatus, string> = {
  IDLE: '○',
  QUEUED: '○',
  RUNNING: '•',
  SUCCESS: '✓',
  FAILURE: '✗',
  SKIPPED: '-',
};
