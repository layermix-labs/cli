import fs from 'fs';
import path from 'path';
import { input, select } from '@inquirer/prompts';

export async function findDomains(appPath: string): Promise<string[]> {
  const domains: string[] = [];
  
  if (!fs.existsSync(appPath)) return domains;

  const entries = fs.readdirSync(appPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'routes') {
      domains.push(entry.name);
    }
  }
  
  return domains;
}

export async function selectOrCreateDomain(appPath: string): Promise<string> {
  const domains = await findDomains(appPath);
  
  const choices = [
    { value: '_new_', name: '➕ Create new domain' },
    ...domains.map(domain => ({ value: domain, name: domain }))
  ];

  const selected = await select({
    message: 'Select a domain or create a new one:',
    choices
  });

  if (selected === '_new_') {
    const newDomain = await input({
      message: 'Enter the name for the new domain:',
      validate: (input) => {
        if (!input.trim()) return 'Domain name cannot be empty';
        if (domains.includes(input)) return 'Domain already exists';
        return true;
      }
    });

    const domainPath = path.join(appPath, newDomain);
    fs.mkdirSync(domainPath, { recursive: true });
    return newDomain;
  }

  return selected;
}
