export function truncate(/** @type {string} */ value, /** @type {number} */ length = 40) /** @type {string} */ {
    return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

export function capitalize(/** @type {string} */ value) /** @type {string} */ {
    if (value.length === 0) {
        return value;
    }

    return `${value[0].toUpperCase()}${value.slice(1)}`;
}
