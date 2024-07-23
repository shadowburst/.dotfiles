import * as windows from './index.js';
import { string } from '../../utils/index.js';
import updates from '../../services/updates.js';

const hyprland = await Service.import('hyprland');

export default function Updates() {
    return Widget.Window({
        name: 'updates',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        layer: 'overlay',
        anchor: ['top', 'right'],
        margins: [0, 500, 0, 0],
        child: Widget.Box({
            className: 'updates',
            vertical: true,
            children: [
                Widget.CenterBox({
                    startWidget: Widget.Label({
                        className: 'title',
                        label: 'Updates',
                        xalign: 0,
                    }),
                    endWidget: Widget.Box({
                        vpack: 'start',
                        hpack: 'end',
                        children: [
                            Widget.Button({
                                className: 'primary',
                                child: Widget.Icon({
                                    icon: 'browser-download-symbolic',
                                    size: 18,
                                }),
                                onPrimaryClick: () => {
                                    windows.closeAll();
                                    updates.update();
                                },
                            }),
                        ],
                    }),
                }),
                Widget.Scrollable({
                    hscroll: 'never',
                    vscroll: 'automatic',
                    css: updates.bind('count').as((count) => `min-height: ${Math.min(20, count) * 1.3}rem`),
                    child: Widget.Box({
                        className: 'update',
                        vertical: true,
                        children: updates.bind('list').as((list) =>
                            list.map((update) =>
                                Widget.Box({
                                    homogeneous: true,
                                    children: [
                                        Widget.Label({
                                            label: string.truncate(update.name),
                                            xalign: 0,
                                        }),
                                        Widget.Box({
                                            children: [
                                                Widget.Label({
                                                    className: 'old',
                                                    label: update.old_version,
                                                    expand: true,
                                                    truncate: 'start',
                                                    xalign: 1,
                                                }),
                                                Widget.Icon('chevron-right-symbolic'),
                                                Widget.Label({
                                                    className: 'new',
                                                    label: update.new_version,
                                                    expand: true,
                                                    truncate: 'start',
                                                    xalign: 0,
                                                }),
                                            ],
                                        }),
                                    ],
                                })
                            )
                        ),
                    }),
                }),
            ],
        }),
    });
}
