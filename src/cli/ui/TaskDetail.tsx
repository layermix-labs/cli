import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import clipboardy from 'clipboardy';
import useStdoutDimensions from './useStdoutDimensions.js';
import { TaskState } from './useTaskState.js';
import { STATUS_COLOR, STATUS_LABEL } from './status.js';

interface TaskDetailProps {
  task: TaskState;
  width: number;
  onRun?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
}

const FAILURE_OPTIONS = ['Retry', 'Copy Logs', 'Close'] as const;
const DEFAULT_OPTIONS = ['Run', 'Copy Logs', 'Close'] as const;

const TaskDetail: React.FC<TaskDetailProps> = ({ task, width, onRun, onRetry, onClose }) => {
  const [, rows] = useStdoutDimensions();
  const isFailed = task.status === 'FAILURE';
  const options = isFailed ? FAILURE_OPTIONS : DEFAULT_OPTIONS;
  const [selectedOption, setSelectedOption] = useState(0);
  const [message, setMessage] = useState('');

  // Reset highlight to the default option whenever the status flips between failure and not.
  useEffect(() => {
    setSelectedOption(0);
  }, [isFailed]);

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setSelectedOption(prev => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.rightArrow || input === 'l') {
      setSelectedOption(prev => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      const choice = options[selectedOption];
      if (choice === 'Retry') onRetry?.();
      else if (choice === 'Run') onRun?.();
      else if (choice === 'Copy Logs') {
        try {
          clipboardy.writeSync(task.output.join('\n'));
          setMessage('Logs copied!');
          setTimeout(() => setMessage(''), 2000);
        } catch {
          setMessage('Copy failed');
        }
      } else if (choice === 'Close') onClose?.();
    }
  });

  // Leave ~6 lines for the footer menu always, plus a few for headers/chrome.
  const footerHeight = 6;
  const availableHeight = Math.max(5, rows - 6 - footerHeight);

  const visibleOutput = useMemo(() => {
    if (task.output.length <= availableHeight) return task.output;
    return task.output.slice(-availableHeight);
  }, [task.output, availableHeight]);

  // border (2) + paddingX (2) consumed by the outer box; log lines wrap to the inner width.
  const innerWidth = Math.max(10, width - 4);
  const outlineColor = isFailed ? 'red' : 'gray';
  const statusColor = STATUS_COLOR[task.status];
  const statusLabel = STATUS_LABEL[task.status];

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      width={width}
      borderStyle="single"
      borderColor={outlineColor}
      paddingX={1}
    >
      <Box
        marginBottom={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
      >
        <Text bold>Task: {task.id} </Text>
        <Text color={statusColor}>[{statusLabel}]</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} width={innerWidth} overflowX="hidden">
        {visibleOutput.map((line, i) => (
          <Text key={i} wrap="truncate-end">{line}</Text>
        ))}
        {task.output.length === 0 && <Text color="gray">No output yet...</Text>}
      </Box>

      <Box
        borderStyle="bold"
        borderColor={outlineColor}
        marginTop={0}
        flexDirection="column"
        flexShrink={0}
        width={innerWidth}
      >
        <Box justifyContent="space-between">
          <Box>
            {isFailed && <Text color="red" bold>Task Failed </Text>}
            <Text dimColor>Use Left/Right + Enter</Text>
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
