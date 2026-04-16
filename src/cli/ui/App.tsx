import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Executor } from '../../core/executor.js';
import { useTaskExecutor } from './useTaskState.js';
import useStdoutDimensions from './useStdoutDimensions.js';
import TaskList from './TaskList.js';
import TaskDetail from './TaskDetail.js';
import Overview from './Overview.js';

const SIDEBAR_WIDTH = 30;
const SIDEBAR_GAP = 1;

interface AppProps {
  executor: Executor;
  initialTaskIds: string[];
}

const App: React.FC<AppProps> = ({ executor, initialTaskIds }) => {
  const { exit } = useApp();
  const tasksMap = useTaskExecutor(executor, initialTaskIds);
  const [columns, rows] = useStdoutDimensions();
  const contentWidth = Math.max(20, columns - SIDEBAR_WIDTH - SIDEBAR_GAP);
  
  // List of all items in navigation: 'overview' + task IDs
  // We might want to sort tasks or keep them in execution order
  // For now, let's just use initialTaskIds as the order
  const navItems = useMemo(() => ['overview', ...initialTaskIds], [initialTaskIds]);
  
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Convert map to array for TaskList
  const tasksList = useMemo(() => initialTaskIds.map(id => tasksMap[id]), [initialTaskIds, tasksMap]);

  useInput((input, key) => {
    if (key.escape || (input === 'c' && key.ctrl)) {
      // We should probably stop the executor?
      // For now just exit UI.
      exit();
      process.exit(0);
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : navItems.length - 1));
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev < navItems.length - 1 ? prev + 1 : 0));
    }
  });

  const selectedItem = navItems[selectedIndex];

  // Determine if all finished to show "Done" message or exit automatically?
  // Requirements don't specify auto-exit on success, usually runners stay open or exit.
  // Standard CLI runners exit when done.
  // We can listen to executor "end" event if we had one?
  // Executor execute() returns a promise. We can handle that in index.ts and unmount App.

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box borderStyle="single" borderColor="blue" paddingX={1} width={columns} flexShrink={0}>
        <Text bold>My-Runner TUI</Text>
        <Text> | </Text>
        <Text>Nav: Arrows | Quit: Ctrl+C</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        {/* Sidebar / Tabs */}
        <Box flexDirection="column" marginRight={SIDEBAR_GAP} width={SIDEBAR_WIDTH} flexShrink={0}>
             {/* We manually render the "Overview" item in the list style */}
             <Box borderStyle="single" borderColor="gray" marginBottom={0} width={SIDEBAR_WIDTH}>
                 <Text color={selectedItem === 'overview' ? 'cyan' : undefined} bold={selectedItem === 'overview'}>
                    {selectedItem === 'overview' ? '> ' : '  '}Overview
                 </Text>
             </Box>
             <TaskList tasks={tasksList} selectedTaskId={selectedItem === 'overview' ? '' : selectedItem} width={SIDEBAR_WIDTH} />
        </Box>

        {/* Content Area */}
        <Box width={contentWidth} flexDirection="column" flexShrink={0}>
            {selectedItem === 'overview' ? (
                <Overview tasks={tasksMap} width={contentWidth} />
            ) : (
                <TaskDetail
                    task={tasksMap[selectedItem]}
                    width={contentWidth}
                    onRetry={() => executor.retry(selectedItem)}
                    onClose={() => setSelectedIndex(0)}
                />
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default App;
