import Bar from './widgets/bar/main.js';

const scss = `${App.configDir}/scss/main.scss`;
const css = '/tmp/ags-style.css';
Utils.exec(`sass ${scss} ${css}`);

const hyprland = await Service.import('hyprland');

function createWindows() {
    return hyprland.monitors.map((monitor) => Bar(monitor.id));
    //.map((win) => win.on('destroy', (self) => App.removeWindow(self)));
}

function openWindows() {
    for (const win of App.windows) {
        App.removeWindow(win);
    }
    App.config({ windows: createWindows() });
}

App.config({
    style: css,
    windows: createWindows(),
    onConfigParsed() {
        hyprland.connect('monitor-removed', openWindows);
        hyprland.connect('monitor-added', openWindows);
    },
});
