/**
 * @param {string} value
 * @param {number} length
 * @returns {string}
 */
export function truncate(value, length = 40) {
    return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function capitalize(value) {
    if (value.length === 0) {
        return value;
    }

    return `${value[0].toUpperCase()}${value.slice(1)}`;
}
