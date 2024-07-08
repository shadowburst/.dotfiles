export function chunk(/** @type {any[]} */ array, /** @type {number} */ size) {
    return Array.from(Array(Math.ceil(array.length / size)), (_, i) => array.slice(i * size, i * size + size));
}
