export function getValueByPath(obj: any, path: string) {
  if (path === '' ) return obj;
  return path.split('.').reduce((prev, curr) => {
    return (prev && prev[curr] !== undefined && prev[curr] !== null) ? prev[curr] : undefined;
}, obj);
}
