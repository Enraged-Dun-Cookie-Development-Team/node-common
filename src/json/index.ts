import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import { Resolver } from '@stoplight/json-ref-resolver';

type MyAjv = {
  errorMessagesToString(): string;
} & Ajv;

export const JsonValidator = addFormats(new Ajv({ allErrors: true, useDefaults: true }), ['ipv4']) as MyAjv;
JsonValidator.addFormat('url', {
  type: 'string',
  validate: /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{2,5})?(\/\S*)?$/,
});

JsonValidator.errorMessagesToString = () => {
  return (JsonValidator.errors || []).map((it) => `'${it.instancePath || '/'}' ${it.message || it.keyword}`).toString();
};

export const JsonRefResolver = new Resolver();
