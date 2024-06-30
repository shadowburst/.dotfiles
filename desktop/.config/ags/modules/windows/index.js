import Backdrop from './backdrop/backdrop.js';

export function closeAll() {
    for (const win of App.windows.filter((win) => !win.name?.startsWith('bar-'))) {
        App.removeWindow(win);
    }
}

/**
 * @param {import('types/widgets/window').Window} window
 */
export function open(window) {
    if (App.windows.some((win) => win.name === window.name)) {
        return;
    }

    closeAll();
    App.addWindow(Backdrop());
    App.addWindow(window);
}
