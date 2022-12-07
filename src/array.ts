function getValue(el: any, key?: string) {
  return key ? el[key] : el;
}

export function elementsNotInArray(firstArray: any[], secondArray: any[], key?: string): any[] {
  const second = new Set(secondArray.map((el) => getValue(el, key)));
  return firstArray.filter((el) => {
    return !second.has(getValue(el, key));
  });
}

export function diff<T, U>(firstArray: T[], secondArray: U[], key?: string): {added: U[]; removed: T[]} {
  const firstArraySet = new Set(firstArray.map((el: any) => getValue(el, key)));
  const secondArraySet = new Set(secondArray.map((el: any) => getValue(el, key)));
  return {
    added: secondArray.filter((el: any) => !firstArraySet.has(getValue(el, key))),
    removed: firstArray.filter((el: any) => !secondArraySet.has(getValue(el, key)))
  };
}
