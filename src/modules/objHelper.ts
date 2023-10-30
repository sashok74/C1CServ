export function getValueByPath(obj: any, path: string) {
  return path.split('.').reduce((prev, curr) => {
    return (prev && prev[curr] !== undefined && prev[curr] !== null) ? prev[curr] : undefined;
}, obj);
}
