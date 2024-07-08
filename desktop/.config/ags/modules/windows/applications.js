import * as windows from './index.js';
import { array } from '../../utils/index.js';
const applications = await Service.import('applications');
const hyprland = await Service.import('hyprland');

function launch(/** @type {import('resource:///com/github/Aylur/ags/service/applications.js').Application?} */ app) {
    windows.closeAll();
    app?.launch();
}

export default function Applications() {
    const apps = Variable(applications.list);

    function AppButton(
        /** @type {import('resource:///com/github/Aylur/ags/service/applications.js').Application} */ app
    ) {
        return Widget.Button({
            child: Widget.Box({
                vertical: true,
                children: [
                    Widget.Icon({ icon: app.icon_name ?? 'system-help-symbolic', size: 80 }),
                    Widget.Label(app.name),
                ],
            }),
            onPrimaryClickRelease: () => launch(app),
        }).keybind('Return', () => launch(app));
    }

    return Widget.Window({
        name: 'applications',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        layer: 'overlay',
        anchor: ['top', 'bottom', 'left', 'right'],
        margins: [100, 100, 100, 100],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        child: Widget.Box({
            className: 'applications',
            vertical: true,
            children: [
                Widget.CenterBox({
                    centerWidget: Widget.Entry({
                        className: 'search',
                        placeholderText: 'Search applications',
                        onChange: ({ text }) => {
                            apps.value = applications.query(text ?? '');
                        },
                        onAccept: () => launch(apps.value[0]),
                    }),
                }),
                Widget.Scrollable({
                    hscroll: 'never',
                    vscroll: 'automatic',
                    css: 'min-height: 100%',
                    expand: true,
                    child: Widget.Box({
                        vertical: true,
                        children: Utils.merge([apps.bind(), hyprland.active.monitor.bind('id')], (list, monitorId) => {
                            const monitor = hyprland.getMonitor(monitorId);

                            /** @type {import('resource:///com/github/Aylur/ags/service/applications.js').Application[][]} */
                            const rows = array.chunk(
                                list.sort((a, b) => a.name.localeCompare(b.name)),
                                monitor ? Math.floor(monitor?.width / 350) : 5
                            );

                            return rows.map((row) =>
                                Widget.Box({
                                    homogeneous: true,
                                    children: row.map(AppButton),
                                })
                            );
                        }),
                    }),
                }),
            ],
        }).keybind('Escape', () => windows.closeAll()),
    });
}
