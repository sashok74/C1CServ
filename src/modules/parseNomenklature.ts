import { regexPatterns } from '../types/C1NomPaterns.js';

interface Output {
  obj_name: string;
  params: string;
  values: string;
}

function parseNomString(str: string): Output {
  const paramNames: string[] = [];
  const paramValues: string[] = [];

  for (const pattern of regexPatterns) {
    const namePattern = new RegExp(`^${pattern.name}`, 'i');
    if (str.match(namePattern)) {
      for (const param of pattern.params) {
        const result = str.match(param.pattern);
        if (result) {
          paramNames.push(param.name);
          paramValues.push(result[0]);
        } else {
          break;
        }
      }
      if (paramNames.length === pattern.params.length) {
        return {
          obj_name: pattern.name,
          params: paramNames.join('|'),
          values: paramValues.join('|'),
        };
      }
    }
  }
  return {
    obj_name: '',
    params: '',
    values: '',
  };
}

export default parseNomString;