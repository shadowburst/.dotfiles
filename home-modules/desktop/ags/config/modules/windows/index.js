import Backdrop from './backdrop.js';
import Power from './power.js';

/**
 * @typedef WindowName
 * @type {'power'}
 */

export function closeAll() {
    App.windows.forEach(App.removeWindow);
}

export function open(/** @type {WindowName} */ name) {
    if (App.windows.some((win) => win.name === name)) {
        return;
    }

    closeAll();
    App.addWindow(Backdrop());

    switch (name) {
        case 'power':
            App.addWindow(Power());
            break;
        default:
            break;
    }
}

export function toggle(/** @type {WindowName} */ name) {
    if (App.windows.some((win) => win.name === name)) {
        closeAll();
    } else {
        open(name);
    }
}
