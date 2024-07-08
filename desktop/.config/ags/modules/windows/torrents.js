import * as windows from './index.js';
import torrents from '../../services/torrents.js';
import { format, string } from '../../utils/index.js';

const hyprland = await Service.import('hyprland');

function Torrent(/** @type {import('../../services/torrents.js').Torrent} */ torrent) {
    return Widget.Box({
        className: 'torrent',
        attribute: {
            id: torrent.id,
        },
        children: [
            Widget.Box({
                vertical: true,
                expand: true,
                children: [
                    Widget.Label({
                        className: 'name',
                        xalign: 0,
                        label: torrent.bind('name').as((name) => string.truncate(name, 50)),
                    }),
                    Widget.Label({
                        className: 'details',
                        xalign: 0,
                        label: Utils.merge(
                            [torrent.bind('size'), torrent.bind('percent'), torrent.bind('eta')],
                            (size, percent, eta) =>
                                `${format.bytes(size)} (${format.percent(percent)})  -  ${torrent.finished ? 'Finished' : format.seconds(eta)}`
                        ),
                    }),
                    Widget.LevelBar({
                        classNames: Utils.merge(
                            [torrent.bind('paused'), torrent.bind('finished')],
                            (paused, finished) => [paused ? 'paused' : '', finished ? 'finished' : '']
                        ),
                        widthRequest: 200,
                        value: torrent.bind('percent'),
                    }),
                    Widget.Box({
                        className: 'progress',
                        children: [
                            Widget.Icon({
                                icon: 'chevron-down-symbolic',
                                size: 10,
                            }),
                            Widget.Label({
                                label: torrent
                                    .bind('rate_download')
                                    .as((rateDownload) => `${format.bytes(rateDownload)}/s`),
                            }),
                            Widget.Icon({
                                icon: 'chevron-up-symbolic',
                                size: 10,
                            }),
                            Widget.Label({
                                label: torrent.bind('rate_upload').as((rateUpload) => `${format.bytes(rateUpload)}/s`),
                            }),
                        ],
                    }),
                ],
            }),
            Widget.Box({
                className: 'actions',
                vertical: true,
                children: [
                    Widget.Button({
                        className: 'primary',
                        visible: Utils.merge(
                            [torrent.bind('paused'), torrent.bind('finished')],
                            (paused, finished) => paused && !finished
                        ),
                        child: Widget.Icon({
                            icon: 'media-playback-start-symbolic',
                            size: 18,
                        }),
                        onPrimaryClick: () => torrent.resume(),
                    }),
                    Widget.Button({
                        className: 'primary',
                        visible: Utils.merge(
                            [torrent.bind('paused'), torrent.bind('finished')],
                            (paused, finished) => !paused && !finished
                        ),
                        child: Widget.Icon({
                            icon: 'media-playback-pause-symbolic',
                            size: 18,
                        }),
                        onPrimaryClick: () => torrent.pause(),
                    }),
                    Widget.Button({
                        className: 'danger',
                        child: Widget.Icon({
                            icon: 'remove-symbolic',
                            size: 18,
                        }),
                        onPrimaryClick: () => torrent.remove(),
                    }),
                ],
            }),
        ],
    });
}

export default function Torrents() {
    torrents.connect('torrent-removed', () => {
        if (torrents.torrents.length === 0) {
            windows.closeAll();
        }
    });

    return Widget.Window({
        name: 'torrents',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        anchor: ['top', 'right'],
        margins: [0, 500, 0, 0],
        child: Widget.Box({
            className: 'torrents',
            vertical: true,
            children: [
                Widget.CenterBox({
                    startWidget: Widget.Label({
                        className: 'title',
                        xalign: 0,
                        label: 'Torrents',
                    }),
                    endWidget: Widget.Box({
                        vpack: 'start',
                        hpack: 'end',
                        children: [
                            Widget.Button({
                                className: 'danger',
                                visible: torrents.bind('status').as((status) => status === 'finished'),
                                child: Widget.Icon({
                                    icon: 'remove-symbolic',
                                    size: 18,
                                }),
                                onPrimaryClick: () => torrents.removeAll(),
                            }),
                            Widget.Button({
                                className: 'primary',
                                visible: torrents.bind('status').as((status) => status === 'paused'),
                                child: Widget.Icon({
                                    icon: 'media-playback-start-symbolic',
                                    size: 18,
                                }),
                                onPrimaryClick: () => torrents.resumeAll(),
                            }),
                            Widget.Button({
                                className: 'primary',
                                visible: torrents.bind('status').as((status) => status === 'downloading'),
                                child: Widget.Icon({
                                    icon: 'media-playback-pause-symbolic',
                                    size: 18,
                                }),
                                onPrimaryClick: () => torrents.pauseAll(),
                            }),
                        ],
                    }),
                }),
                Widget.Scrollable({
                    hscroll: 'never',
                    vscroll: 'automatic',
                    css: torrents.bind('torrents').as((list) => `min-height: ${Math.min(5, list.length) * 7.5}rem`),
                    child: Widget.Box({
                        vertical: true,
                        children: torrents.torrents.map(Torrent),
                    })
                        .hook(
                            torrents,
                            (self, /** @type {import('../../services/torrents.js').Torrent} */ torrent) => {
                                if (torrent) {
                                    self.children = [Torrent(torrent), ...self.children];
                                }
                            },
                            'torrent-added'
                        )
                        .hook(
                            torrents,
                            (self, /** @type {import('../../services/torrents.js').Torrent} */ torrent) => {
                                if (torrent) {
                                    self.children = [
                                        ...self.children.filter((t) => t.attribute.id !== torrent.id),
                                        Torrent(torrent),
                                    ];
                                }
                            },
                            'torrent-finished'
                        )
                        .hook(
                            torrents,
                            (self, /** @type {number} */ id) => {
                                self.children.find((t) => t.attribute.id === id)?.destroy();
                            },
                            'torrent-removed'
                        ),
                }),
            ],
        }),
    });
}
