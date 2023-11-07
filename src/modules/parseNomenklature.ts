import { regexPatterns } from '../types/C1NomPaterns.js';

interface Output {
  obj_name: string;
  params: string;
  values: string;
}

function replaceCyrillicCharacters(str: string): string {
  const cyrillicToLatinMap: Record<string, string> = {
    а: 'a',
    А: 'A',
    в: 'b',
    В: 'B',
    е: 'e',
    Е: 'E',
    к: 'k',
    К: 'K',
    м: 'm',
    М: 'M',
    н: 'h',
    Н: 'H',
    о: 'o',
    О: 'O',
    р: 'p',
    Р: 'P',
    с: 'c',
    С: 'C',
    т: 't',
    Т: 'T',
    у: 'y',
    У: 'Y',
    х: 'x',
    Х: 'X',
  };

  return str
    .split('')
    .map((char) => cyrillicToLatinMap[char] || char)
    .join('');
}

function parseNomString(str: string): Output {
  const paramNames: string[] = [];
  const paramValues: string[] = [];

  for (const pattern of regexPatterns) {
    const namePattern = new RegExp(`^${pattern.name}`, 'i');
    if (str.match(namePattern)) {
      let remainingStr = str.replace(namePattern, '');
      remainingStr = replaceCyrillicCharacters(remainingStr);
      for (const param of pattern.params) {
        const result = remainingStr.match(param.pattern);
        if (result) {
          paramNames.push(param.name);
          paramValues.push(result[0]);
          remainingStr = remainingStr.replace(result[0], '');
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
