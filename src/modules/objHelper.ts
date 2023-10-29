export function getValueByPath(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}
