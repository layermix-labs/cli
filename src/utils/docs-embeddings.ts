import fs from "fs";
import path from "path";
import { embed, embedMany, cosineSimilarity } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Checks if OpenAI API key is available in environment
 */
export function isOpenAIKeyAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const EMBEDDINGS_DIR = "docs/_embeddings";
const CHUNK_SIZE = 1000; // Characters per chunk for large docs

interface DocEmbedding {
  path: string;
  content: string;
  embedding: number[];
}

/**
 * Ensures the embeddings directory exists
 */
function ensureEmbeddingsDir() {
  if (!fs.existsSync(EMBEDDINGS_DIR)) {
    fs.mkdirSync(EMBEDDINGS_DIR, { recursive: true });
  }
}

/**
 * Splits a large document into smaller chunks for embedding
 */
function splitDocIntoChunks(content: string): string[] {
  const chunks: string[] = [];

  // Simple splitting by character count
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.substring(i, i + CHUNK_SIZE));
  }

  return chunks;
}

/**
 * Finds all docs files in the project
 */
export async function findDocsFiles(): Promise<string[]> {
  const docsFiles: string[] = [];

  if (!fs.existsSync("docs")) {
    console.log("No docs directory found");
    return docsFiles;
  }

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && entry.name !== "_embeddings") {
        scanDir(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".md")) {
        docsFiles.push(fullPath);
      }
    }
  }

  scanDir("docs");
  return docsFiles;
}

/**
 * Generates embeddings for a docs file if they don't already exist
 */
export async function generateEmbeddingsForFile(
  filePath: string,
): Promise<DocEmbedding[]> {
  ensureEmbeddingsDir();

  const embeddingsPath = path.join(
    EMBEDDINGS_DIR,
    `${path.basename(filePath)}.json`,
  );

  // Check if embeddings already exist
  if (fs.existsSync(embeddingsPath)) {
    console.log(`Using existing embeddings for ${filePath}`);
    return JSON.parse(fs.readFileSync(embeddingsPath, "utf-8"));
  }

  console.log(`Generating embeddings for ${filePath}`);

  // Read the file content
  const content = fs.readFileSync(filePath, "utf-8");

  // Split into chunks if the content is large
  const chunks = splitDocIntoChunks(content);

  // Generate embeddings for each chunk
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks,
  });

  // Create doc embeddings
  const docEmbeddings: DocEmbedding[] = chunks.map((chunk, index) => ({
    path: filePath,
    content: chunk,
    embedding: embeddings[index],
  }));

  // Save embeddings to disk
  fs.writeFileSync(embeddingsPath, JSON.stringify(docEmbeddings, null, 2));

  return docEmbeddings;
}

/**
 * Ensures all docs files have embeddings
 */
export async function ensureAllDocsEmbeddings(): Promise<DocEmbedding[]> {
  const docsFiles = await findDocsFiles();

  if (docsFiles.length === 0) {
    console.log("No docs files found to embed");
    return [];
  }

  let allEmbeddings: DocEmbedding[] = [];

  for (const file of docsFiles) {
    const embeddings = await generateEmbeddingsForFile(file);
    allEmbeddings = [...allEmbeddings, ...embeddings];
  }

  return allEmbeddings;
}

/**
 * Searches for relevant docs based on a query
 */
export async function searchDocs(
  query: string,
  topK: number = 3,
): Promise<string[]> {
  // Ensure all docs have embeddings
  const allEmbeddings = await ensureAllDocsEmbeddings();

  if (allEmbeddings.length === 0) {
    console.log("No doc embeddings available for search");
    return [];
  }

  // Generate embedding for the query
  const { embedding: queryEmbedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });

  // Calculate similarity scores
  const scoredDocs = allEmbeddings.map((doc) => ({
    ...doc,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // Sort by similarity score (descending)
  scoredDocs.sort((a, b) => b.score - a.score);

  // Get top K results
  const topResults = scoredDocs.slice(0, topK);

  // Return unique file paths
  const uniquePaths = Array.from(new Set(topResults.map((doc) => doc.path)));

  return uniquePaths;
}
