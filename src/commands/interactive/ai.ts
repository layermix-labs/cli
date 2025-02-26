import { confirm, editor, input, checkbox } from "@inquirer/prompts";
import { execSync } from "child_process";
import {
  searchDocs,
  isOpenAIKeyAvailable,
  findDocsFiles,
} from "../../utils/docs-embeddings";

function isAiderAvailable(): boolean {
  try {
    execSync("which aider");
    return true;
  } catch {
    return false;
  }
}

export default async function enhanceWithAI(filePaths: string[]) {
  if (!isAiderAvailable()) {
    console.log("Aider is not installed. Skipping AI enhancement.");
    console.log("Visit https://aider.chat to learn how to install aider");
    return;
  }

  const shouldEnhance = await confirm({
    message: "Would you like to enhance your code with AI?",
    default: true,
  });

  if (!shouldEnhance) return;

  // Get user's enhancement request
  const message = await editor({
    message: "How would you like to augment the generated code?",
    postfix: ".md",
    validate: (value) => value.trim().length > 0,
  });

  if (!message?.trim()) {
    console.log("No message provided. Skipping AI enhancement.");
    return;
  }

  // Check if OpenAI API key is available for embeddings
  const openAIKeyAvailable = isOpenAIKeyAvailable();
  let docPaths: string[] = [];

  // Ask if user wants to include relevant documentation

  if (!openAIKeyAvailable) {
    console.log("\nNote: OPENAI_API_KEY environment variable not found.");
    console.log(
      "Vector search is not available, but you can manually select documentation files.\n",
    );

    // Find all docs files
    const allDocsFiles = await findDocsFiles();

    if (allDocsFiles.length > 0) {
      // Offer multi-select option for docs files
      docPaths = await checkbox({
        message: "Select documentation files to include:",
        choices: allDocsFiles.map((file) => ({
          name: file,
          value: file,
        })),
      });

      // if (docPaths.length > 0) {
      //   console.log("Selected documentation files:");
      //   docPaths.forEach((path) => console.log(`- ${path}`));
      // } else {
      //   console.log("No documentation files selected.");
      // }
    } else {
      console.log("No documentation files found in docs directory.");
    }
  } else {
    // Get search query for docs
    const searchQuery = message.substring(0, 200);
    console.log("Searching for relevant documentation...");
    const relevantDocPaths = await searchDocs(searchQuery);

    if (relevantDocPaths.length > 0) {
      console.log("Found relevant documentation files:");
      relevantDocPaths.forEach((path, index) =>
        console.log(`${index + 1}. ${path}`),
      );

      // Let user select which docs to include
      docPaths = await checkbox({
        message: "Select documentation files to include:",
        choices: relevantDocPaths.map((file) => ({
          name: file,
          value: file,
          checked: true, // Pre-check the relevant docs
        })),
      });

      // if (docPaths.length > 0) {
      //   console.log("Selected documentation files:");
      //   docPaths.forEach((path) => console.log(`- ${path}`));
      // } else {
      //   console.log("No documentation files selected.");
      // }
    } else {
      console.log("No relevant documentation found.");
    }
  }

  try {
    // Combine code files and doc files for aider
    const allPaths = [...filePaths, ...docPaths];
    const command = `aider --no-auto-commits --no-gitignore --message "${message}" ${allPaths.join(" ")}`;
    console.log("Running aider with enhanced context...");
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error("Failed to run aider:", error);
  }
}
