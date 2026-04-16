import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { TaskState } from './useTaskState.js';

interface TaskListProps {
  tasks: TaskState[];
  selectedTaskId: string;
  width?: number;
}

const TaskList: React.FC<TaskListProps> = ({ tasks, selectedTaskId, width = 30 }) => {
  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray">
        <Box marginBottom={1}>
            <Text bold>Tasks</Text>
        </Box>
      {tasks.map(task => {
        const isSelected = task.id === selectedTaskId;
        let color = 'white';
        let icon = ' ';

        switch (task.status) {
          case 'SUCCESS':
            color = 'green';
            icon = '✓';
            break;
          case 'FAILURE':
            color = 'red';
            icon = '✗';
            break;
          case 'RUNNING':
            color = 'blue';
            icon = '•'; // Spinner handled below
            break;
          case 'QUEUED':
          case 'IDLE':
            color = 'yellow';
            icon = '○';
            break;
          case 'SKIPPED':
            color = 'gray';
            icon = '-';
            break;
        }

        return (
          <Box key={task.id}>
            <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Text color={color} wrap="truncate-end">
              {task.status === 'RUNNING' ? <Spinner type="dots" /> : icon} {task.id}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default TaskList;
