  export const nomSchema = {
    type: 'object',
    properties: {
      NOM: {
        type: 'array',
        items: { type: 'number' }
      }
    },
    required: ['NOM'],
    additionalProperties: false // не допускать дополнительных свойств
  };

  export const docSchema = {
    type: 'object',
    properties: {
      DOC: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['DOC'],
    additionalProperties: false // не допускать дополнительных свойств
  };

  export const refSchema = {
    type: 'object',
    properties: {
      REF_ID: {
        type: 'array',
        items: { type: 'integer' }
      }
    },
    required: ['REF_ID'],
    additionalProperties: false // не допускать дополнительных свойств
  };

  export const c1CUID = {
    type: 'object',
    properties: {
      objectName: {
        type: 'string'
      },
      ref_id: {
        type: 'integer'
      }
    },
    required: [
      'objectName',
      'ref_id'
    ],
    additionalProperties: false
  }