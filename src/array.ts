export class ArrayUtils {
    static elementsNotInArray(firstArray: any[], secondArray: any[], key?: string): any[] {
        return firstArray.filter((firstElement) => {
            return !secondArray.find((secondElement) => {
                if (key) {
                    return firstElement[key] === secondElement[key];
                }

                return firstElement === secondElement;
            });
        });
    }

    static distinctArray<T>(array: T[]): T[] {
        return [...new Set(array)];
    }
}
