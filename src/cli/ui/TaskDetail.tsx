import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import clipboardy from 'clipboardy';
import useStdoutDimensions from './useStdoutDimensions.js';
import { TaskState } from './useTaskState.js';

interface TaskDetailProps {
  task: TaskState;
  width: number;
  onRetry?: () => void;
  onClose?: () => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, width, onRetry, onClose }) => {
  const [, rows] = useStdoutDimensions();
  const isFailed = task.status === 'FAILURE';
  const [selectedOption, setSelectedOption] = useState(0);
  const options = ['Retry', 'Copy Logs', 'Close'];
  
  // Feedback for copy
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (key.leftArrow) {
        setSelectedOption(prev => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.rightArrow) {
        setSelectedOption(prev => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
        if (options[selectedOption] === 'Retry') {
            onRetry?.();
        } else if (options[selectedOption] === 'Copy Logs') {
            try {
                const logs = task.output.join('\n');
                clipboardy.writeSync(logs);
                setMessage('Logs copied!');
                setTimeout(() => setMessage(''), 2000);
            } catch (e) {
                setMessage('Copy failed');
            }
        } else if (options[selectedOption] === 'Close') {
            onClose?.();
        }
    }
  });

  // Calculate available height for logs
  // Header: 3 lines
  // Footer (if failed): ~5 lines
  // Global UI: ~3 lines
  const footerHeight = isFailed ? 6 : 0;
  const availableHeight = Math.max(5, rows - 6 - footerHeight);

  const visibleOutput = useMemo(() => {
    if (task.output.length <= availableHeight) {
      return task.output;
    }
    return task.output.slice(-availableHeight);
  }, [task.output, availableHeight]);

  // border (2) + paddingX (2) consumed by the outer box; log lines wrap to the inner width.
  const innerWidth = Math.max(10, width - 4);

  return (
    <Box flexDirection="column" flexGrow={1} width={width} borderStyle="single" borderColor={isFailed ? 'red' : 'green'} paddingX={1}>
      <Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="gray">
        <Text bold>Task: {task.id} </Text>
        <Text color={isFailed ? 'red' : 'green'}>[{task.status}]</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} width={innerWidth} overflowX="hidden">
          {visibleOutput.map((line, i) => (
              <Text key={i} wrap="truncate-end">{line}</Text>
          ))}
          {task.output.length === 0 && <Text color="gray">No output yet...</Text>}
      </Box>

          <Box borderStyle="bold" borderColor={isFailed ? "red" : "green"} marginTop={0} flexDirection="column" flexShrink={0} width={innerWidth}>
              <Box justifyContent="space-between">
              <Box>
                <Text color={isFailed ? "red" : "green"} bold>Task Failed</Text>
                <Text dimColor> Use Left/Right + Enter</Text>
              </Box>
                {message ? <Text color="green">{message}</Text> : null}
              </Box>
              <Box>
                  {options.map((opt, i) => (
                      <Box key={opt} marginRight={2}>
                          <Text 
                              color={i === selectedOption ? 'black' : 'white'}
                              backgroundColor={i === selectedOption ? 'white' : undefined}
                          >
                              {' ' + opt + ' '}
                          </Text>
                      </Box>
                  ))}
              </Box>
          </Box>
    </Box>
  );
};

export default TaskDetail;
