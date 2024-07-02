import Bar from './modules/bar/bar.js';
import Popups from './modules/windows/popups.js';

const scss = `${App.configDir}/scss/main.scss`;
const css = '/tmp/ags-style.css';
Utils.exec(`sass ${scss} ${css}`);

const hyprland = await Service.import('hyprland');

function createWindows() {
    return [...hyprland.monitors.map((monitor) => Bar(monitor.id)), Popups()];
    //.map((win) => win.on('destroy', (self) => App.removeWindow(self)));
}

function openWindows() {
    for (const win of App.windows) {
        App.removeWindow(win);
    }
    App.config({ windows: createWindows() });
}

App.addIcons(`${App.configDir}/icons`);
App.config({
    style: css,
    windows: createWindows(),
    onConfigParsed() {
        hyprland.connect('monitor-removed', openWindows);
        hyprland.connect('monitor-added', openWindows);
    },
});
