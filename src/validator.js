import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GSSK Model",
  "description": "Schema for General Systems Simulation Kernel (GSSK) models.",
  "type": "object",
  "required": [
    "nodes"
  ],
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "type",
          "value"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "type": {
            "type": "string",
            "enum": [
              "storage",
              "source",
              "sink",
              "constant",
              "producer",
              "consumer",
              "interaction",
              "transaction",
              "switch",
              "receiver",
              "amplifier",
              "box"
            ]
          },
          "value": {
            "type": "number"
          },
          "currentValue": {
            "type": "number"
          },
          "dataType": {
            "type": "string"
          },
          "visual": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "additionalProperties": false
      },
      "minItems": 1
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "origin",
          "target",
          "logic",
          "params"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "origin": {
            "type": "string"
          },
          "target": {
            "type": "string"
          },
          "logic": {
            "type": "string",
            "enum": [
              "constant",
              "linear",
              "interaction",
              "limit",
              "threshold"
            ]
          },
          "params": {
            "type": "object",
            "required": [
              "k"
            ],
            "properties": {
              "k": {
                "type": "number"
              },
              "control_node": {
                "type": "string"
              },
              "threshold": {
                "type": "number"
              }
            },
            "additionalProperties": false
          },
          "visual": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "additionalProperties": false
      }
    },
    "config": {
      "type": "object",
      "properties": {
        "t_start": {
          "type": "number",
          "default": 0.0
        },
        "t_end": {
          "type": "number",
          "default": 100.0
        },
        "dt": {
          "type": "number",
          "exclusiveMinimum": 0,
          "default": 0.1
        },
        "method": {
          "type": "string",
          "enum": [
            "euler",
            "rk4"
          ],
          "default": "euler"
        }
      },
      "additionalProperties": false
    },
    "metadata": {
      "type": "object",
      "properties": {
        "datasource": {
          "type": "object",
          "properties": {
            "apiUrl": { "type": "string" },
            "name": { "type": "string" },
            "apiKeyName": { "type": "string" },
            "providerName": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": true
    },
    "boundaries": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "x": { "type": "number" },
          "y": { "type": "number" },
          "w": { "type": "number" },
          "h": { "type": "number" },
          "label": { "type": "string" }
        },
        "required": ["x", "y", "w", "h"]
      }
    }
  },
  "additionalProperties": false
};

const validate = ajv.compile(schema);

export function validateModel(data) {
  const valid = validate(data);
  return {
    valid,
    errors: validate.errors
  };
}
