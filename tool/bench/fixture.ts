import fs from 'node:fs';
import path from 'node:path';

/** Fixed, executable-free generated TypeScript; no target modules are imported by the benchmark. */
export function writeBenchmarkFixture(root: string, count: number): void {
  if (!Number.isSafeInteger(count) || count < 1) throw Error('Positive source count required');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [], target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'] }, include: ['*.ts'] }));
  for (let index = 0; index < count; index++) {
    const importLine = index === 0 ? 'export const seed = 1;' : `import { seed as previous } from "./module${index - 1}.js"; export const seed = previous + 1;`;
    const arithmetic = Array.from({ length: 40 }, (_, step) => `  result += seed + ${step};`).join('\n');
    const source = `${importLine}\nexport function calculate(input: number): number {\n  let result = input;\n${arithmetic}\n  return result;\n}\nexport function fanout(values: number[]) { return Promise.all(values.map(async value => value + seed)); }\nexport const decoded = JSON.parse('{"value":1}') as { value: number };\n`;
    fs.writeFileSync(path.join(root, `module${index}.ts`), source);
  }
}
