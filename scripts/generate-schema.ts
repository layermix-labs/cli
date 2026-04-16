import { z } from 'zod';
import { ConfigSchema } from '../src/types/config.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  const schema = z.toJSONSchema(ConfigSchema);
  const outputPath = path.resolve(__dirname, '../schema.json');

  await fs.writeFile(outputPath, JSON.stringify(schema, null, 2));
  console.log(`Schema generated at ${outputPath}`);
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
