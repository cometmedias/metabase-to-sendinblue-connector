import Promise from 'bluebird';

// Execute each Promise concurrently and return Promises' result
export async function mapAsync(list, callbackFn, options = {concurrency: 10}) {
    return Promise.map(list, callbackFn, options);
}

// Execute each Promise concurrently
export async function forEachAsync(list, callbackFn, options = {concurrency: 10}) {
    await Promise.map(list, callbackFn, options);
}

// Execute each Promise in arguments, giving previous Promise result to the next one
export function pipeAsync(...fns) {
    return (arg) => fns.reduce((p, f) => p.then(f), Promise.resolve(arg));
}
