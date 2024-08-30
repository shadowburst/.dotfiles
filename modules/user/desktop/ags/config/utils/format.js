export function bytes(/** @type {number} */ value) /** @type {string} */ {
    const gb = Math.pow(1024, 3);
    if (value > gb) {
        return `${(value / gb).toFixed(2)} GB`;
    }

    const mb = Math.pow(1024, 2);
    if (value > mb) {
        return `${(value / mb).toFixed(2)} MB`;
    }

    return `${(value / 1024).toFixed(2)} KB`;
}

export function percent(/** @type {number} */ value) /** @type {string} */ {
    return `${(value * 100).toFixed(2)}%`;
}

export function seconds(/** @type {number} */ value) /** @type {string} */ {
    if (value < 0) {
        return 'Unknown';
    }

    const day = 86400;
    if (value > day) {
        return `${Math.floor(value / day)} days ${Math.floor((value % day) / 3600)} hours`;
    }

    const hour = 3600;
    if (value > hour) {
        return `${Math.floor(value / hour)} hours ${Math.floor((value % hour) / 60)} minutes`;
    }

    const minute = 60;
    if (value > minute) {
        return `${Math.floor(value / minute)} minutes ${value % minute} seconds`;
    }

    return `${Math.floor(value)} seconds`;
}
