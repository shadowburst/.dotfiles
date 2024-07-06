import Backdrop from './backdrop.js';
import Power from './power.js';
import Torrents from './torrents.js';

/**
 * @typedef WindowName
 * @type {'power'|'torrents'}
 */

export function closeAll() {
    for (const win of App.windows.filter((win) => !win.name?.startsWith('bar-'))) {
        App.removeWindow(win);
    }
}

export function open(/** @type {WindowName} */ name) {
    if (App.windows.some((win) => win.name === name)) {
        return;
    }

    closeAll();
    App.addWindow(Backdrop(['power'].includes(name)));

    switch (name) {
        case 'power':
            App.addWindow(Power());
            break;
        case 'torrents':
            App.addWindow(Torrents());
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
