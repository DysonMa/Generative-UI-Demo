import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { catalog } from '../src/catalog.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const outputDirectory = path.join(repositoryRoot, 'backend', 'Catalog');
const outputPath = path.join(outputDirectory, 'catalog-contract.json');

const contract = {
  contractVersion: 1,
  source: 'frontend/src/catalog.js',
  componentNames: catalog.componentNames,
  components: Object.fromEntries(
    catalog.componentNames.map((name) => {
      const definition = catalog.data.components[name];
      return [name, {
        description: definition.description,
        ...(definition.example ? { example: definition.example } : {}),
      }];
    }),
  ),
  actions: catalog.actionNames,
  specJsonSchema: catalog.jsonSchema({ strict: false }),
  catalogPrompt: catalog.prompt(),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
console.log(`Exported ${catalog.componentNames.length} components to ${path.relative(repositoryRoot, outputPath)}`);
