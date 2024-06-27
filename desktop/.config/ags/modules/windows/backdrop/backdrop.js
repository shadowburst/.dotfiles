const hyprland = await Service.import('hyprland');

export default function Backdrop() {
    return Widget.Window({
        name: 'backdrop',
        className: 'backdrop',
        css: 'background-color: rgba(0, 0, 0, 0.5);',
        anchor: ['left', 'top', 'bottom', 'right'],
        monitor: hyprland.active.monitor.bind('id'),
        exclusivity: 'ignore',
        child: Widget.EventBox({
            onPrimaryClick: () => {
                for (const win of App.windows.filter((win) => !win.name?.startsWith('bar-'))) {
                    App.removeWindow(win);
                }
            },
        }),
    });
}
