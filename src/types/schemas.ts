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
