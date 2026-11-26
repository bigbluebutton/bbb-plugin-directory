import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';

const SCHEMA_NAMES = ['plugin', 'release', 'maintainers', 'bbb-sdk-versions', 'contract', 'catalog'];

const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false });
const validators = Object.fromEntries(
  SCHEMA_NAMES.map((name) => {
    const schema = JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
    return [name, ajv.compile(schema)];
  }),
);

/** Returns a list of human-readable errors; empty when `data` is valid. */
export function schemaErrors(name, data) {
  const validate = validators[name];
  if (!validate) throw new Error(`Unknown schema [${name}]`);
  if (validate(data)) return [];
  return validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
}

export function assertSchema(name, data, label = name) {
  const errors = schemaErrors(name, data);
  if (errors.length) throw new Error(`${label} is invalid:\n  ${errors.join('\n  ')}`);
  return data;
}
