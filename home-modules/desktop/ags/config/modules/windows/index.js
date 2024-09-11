import Applications from './applications.js';
import Backdrop from './backdrop.js';
import Power from './power.js';
import Torrents from './torrents.js';

/**
 * @typedef WindowName
 * @type {'applications'|'power'|'torrents'}
 */

export function closeAll() {
    App.windows.forEach(App.removeWindow);
}

export function open(/** @type {WindowName} */ name) {
    if (App.windows.some((win) => win.name === name)) {
        return;
    }

    closeAll();
    App.addWindow(Backdrop(['applications', 'power'].includes(name)));

    switch (name) {
        case 'applications':
            App.addWindow(Applications());
            break;
        case 'power':
            App.addWindow(Power());
            break;
        case 'torrents':
            App.addWindow(Torrents());
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
