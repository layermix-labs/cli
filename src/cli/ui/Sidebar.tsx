import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import { STATUS_COLOR, STATUS_ICON } from "./status.js";
import type { TaskState } from "./useTaskState.js";

// The one canonical nav-item type for the sidebar. The App builds a flat
// navItems array in this shape and the Sidebar walks it once — transitions
// between `kind`s drive the section headers. `under` on a task distinguishes
// "top-level ungrouped task" from "child row inside an expanded group/tag".
export type NavItem =
	| { kind: "overview" }
	| {
			kind: "task";
			id: string;
			under?: { section: "group" | "tag"; name: string };
	  }
	| { kind: "group"; name: string }
	| { kind: "tag"; name: string };

interface SidebarProps {
	width: number;
	navItems: NavItem[];
	selectedIndex: number;
	tasksMap: Record<string, TaskState>;
	expandedGroups: Set<string>;
	expandedTags: Set<string>;
	searchActive: boolean;
	searchQuery: string;
}

const renderTaskRow = (
	task: TaskState,
	isSelected: boolean,
	indent: boolean,
) => {
	const color = STATUS_COLOR[task.status];
	const icon = STATUS_ICON[task.status];
	return (
		<Box key={`task:${task.id}:${indent ? "i" : "o"}`}>
			<Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
				{isSelected ? "> " : "  "}
			</Text>
			{indent && <Text dimColor>│ </Text>}
			<Text color={color} wrap="truncate-end">
				{task.status === "RUNNING" ? <Spinner type="dots" /> : icon} {task.id}
			</Text>
		</Box>
	);
};

const renderCollapsibleHeader = (
	kind: "group" | "tag",
	name: string,
	isSelected: boolean,
	expanded: boolean,
) => {
	const marker = expanded ? "▾" : "▸";
	const color = kind === "tag" ? "magenta" : "blue";
	const prefix = kind === "tag" ? "#" : "";
	return (
		<Box key={`${kind}:${name}`}>
			<Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
				{isSelected ? "> " : "  "}
			</Text>
			<Text color={color} wrap="truncate-end">
				{marker} {prefix}
				{name}
			</Text>
		</Box>
	);
};

// Converts a nav item kind → which section header should precede it. Indented
// tasks (those under a group/tag) don't reset the section — their header was
// already planted by the group/tag row above them. Group headers live inside
// the Tasks section (they're a flavor of task row), so they don't open a new
// section either.
const sectionForItem = (item: NavItem): string | null => {
	if (item.kind === "overview") return null;
	if (item.kind === "task" && !item.under) return "tasks";
	if (item.kind === "group") return "tasks";
	if (item.kind === "tag") return "tags";
	return null;
};

const renderSectionHeader = (
	section: "tasks" | "tags",
	searchActive: boolean,
	searchQuery: string,
) => {
	const showSearchBar = searchActive && section === "tasks";
	const label = showSearchBar
		? `/${searchQuery}`
		: section === "tasks"
			? "Tasks"
			: "Tags";
	return (
		<Box
			key={`hdr:${section}`}
			paddingX={1}
			marginTop={section === "tasks" ? 0 : 1}
		>
			{showSearchBar ? (
				<Text color="cyan" wrap="truncate-end">
					{label}
					<Text bold>▌</Text>
				</Text>
			) : (
				<Text bold>{label}</Text>
			)}
		</Box>
	);
};

const renderOverviewRow = (selected: boolean) => (
	<Box
		key="overview"
		paddingX={1}
		flexShrink={0}
		borderStyle="single"
		borderColor="gray"
		borderTop={false}
		borderLeft={false}
		borderRight={false}
	>
		<Text color={selected ? "cyan" : undefined} bold={selected}>
			{selected ? "> " : "  "}Overview
		</Text>
	</Box>
);

// Resolve a single navItem into its rendered row. Returning null means this
// item carries no visible row by itself (shouldn't happen, but keeps the
// caller's loop shape consistent).
const renderRow = (
	item: NavItem,
	index: number,
	selected: boolean,
	tasksMap: Record<string, TaskState>,
	expandedGroups: Set<string>,
	expandedTags: Set<string>,
): React.ReactNode => {
	if (item.kind === "overview") return renderOverviewRow(selected);

	if (item.kind === "task") {
		const task = tasksMap[item.id] ?? {
			id: item.id,
			status: "IDLE" as const,
			output: [],
		};
		return (
			<Box key={`row:${index}`} paddingX={1}>
				{renderTaskRow(task, selected, !!item.under)}
			</Box>
		);
	}

	const expanded =
		item.kind === "group"
			? expandedGroups.has(item.name)
			: expandedTags.has(item.name);
	return (
		<Box key={`row:${index}`} paddingX={1}>
			{renderCollapsibleHeader(item.kind, item.name, selected, expanded)}
		</Box>
	);
};

const Sidebar: React.FC<SidebarProps> = ({
	width,
	navItems,
	selectedIndex,
	tasksMap,
	expandedGroups,
	expandedTags,
	searchActive,
	searchQuery,
}) => {
	const innerWidth = width - 1; // minus own right-border column
	const children: React.ReactNode[] = [];
	let currentSection: string | null = null;

	for (let i = 0; i < navItems.length; i++) {
		const item = navItems[i];
		const section = sectionForItem(item);
		if (section && section !== currentSection) {
			children.push(
				renderSectionHeader(
					section as "tasks" | "tags",
					searchActive,
					searchQuery,
				),
			);
			currentSection = section;
		}
		children.push(
			renderRow(
				item,
				i,
				i === selectedIndex,
				tasksMap,
				expandedGroups,
				expandedTags,
			),
		);
	}

	return (
		<Box
			flexDirection="column"
			width={width}
			flexShrink={0}
			borderStyle="single"
			borderColor="gray"
			borderTop={false}
			borderLeft={false}
			borderBottom={false}
		>
			<Box flexDirection="column" width={innerWidth}>
				{children}
			</Box>
		</Box>
	);
};

export default Sidebar;
