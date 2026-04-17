import { Box, Text } from "ink";
import type React from "react";

interface TagListProps {
	tags: string[];
	selectedTag: string;
	width?: number;
}

const TagList: React.FC<TagListProps> = ({ tags, selectedTag, width = 30 }) => {
	return (
		<Box
			flexDirection="column"
			width={width}
			borderStyle="single"
			borderColor="gray"
		>
			<Box marginBottom={1}>
				<Text bold>Tags</Text>
			</Box>
			{tags.length === 0 && <Text dimColor> (no tags defined)</Text>}
			{tags.map((tag) => {
				const isSelected = tag === selectedTag;
				return (
					<Box key={tag}>
						<Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
							{isSelected ? "> " : "  "}
						</Text>
						<Text color="magenta" wrap="truncate-end">
							#{tag}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
};

export default TagList;
