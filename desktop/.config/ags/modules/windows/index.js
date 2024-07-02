import Backdrop from './backdrop.js';
import Torrents from './torrents.js';

export function closeAll() {
    for (const win of App.windows.filter((win) => !win.name?.startsWith('bar-'))) {
        App.removeWindow(win);
    }
}

export function open(/** @type {'torrents'} */ name) {
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
