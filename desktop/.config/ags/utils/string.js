/**
 * @param {string} value
 * @param {number} length
 */
export function truncate(value, length = 40) {
    return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}
