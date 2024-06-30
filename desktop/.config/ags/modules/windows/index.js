import Backdrop from './backdrop/backdrop.js';
import Torrents from './torrents/torrents.js';

export function closeAll() {
    for (const win of App.windows.filter((win) => !win.name?.startsWith('bar-'))) {
        App.removeWindow(win);
    }
}

/**
 * @param {'torrents'} name
 */
export function open(name) {
    if (App.windows.some((win) => win.name === name)) {
        return;
    }

    closeAll();
    App.addWindow(Backdrop());

    switch (name) {
        case 'torrents':
            App.addWindow(Torrents());
            break;
    }
}
