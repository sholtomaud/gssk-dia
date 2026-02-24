import Ajv from 'ajv';

const ajv = new Ajv();

const schema = {
  type: 'object',
  properties: {
    settings: {
      type: 'object',
      properties: {
        dt: { type: 'number' },
        t_start: { type: 'number' },
        t_end: { type: 'number' },
        method: { type: 'string' }
      }
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['source', 'storage', 'sink', 'constant'] },
          value: { type: 'number' },
          visual: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              label: { type: 'string' },
              capacity: { type: 'number' },
              symbol: { type: 'string' }
            },
            required: ['x', 'y']
          }
        },
        required: ['id', 'type', 'visual']
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          origin: { type: 'string' },
          target: { type: 'string' },
          logic: { type: 'string' },
          params: { type: 'object' },
          control_node: { type: 'string' },
          visual: {
            type: 'object',
            properties: {
              points: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } },
              max_flow: { type: 'number' }
            }
          }
        },
        required: ['id', 'origin', 'target']
      }
    }
  },
  required: ['nodes', 'edges']
};

const validate = ajv.compile(schema);

export function validateModel(data) {
  const valid = validate(data);
  if (!valid) {
    console.error('Validation errors:', validate.errors);
    return false;
  }
  return true;
}
