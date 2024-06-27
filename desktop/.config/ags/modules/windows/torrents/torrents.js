import Backdrop from '../backdrop/backdrop.js';
import torrents from '../../../services/torrents.js';
import { format, string } from '../../../utils/index.js';

const hyprland = await Service.import('hyprland');

export default function Torrents() {
    return Widget.Window({
        name: 'torrents',
        className: 'window',
        anchor: ['top', 'right'],
        monitor: hyprland.active.monitor.bind('id'),
        child: Widget.Box({
            className: 'torrents',
            vertical: true,
            children: Utils.merge([torrents.bind('downloads'), torrents.bind('uploads')], (downloads, uploads) => [
                Widget.CenterBox({
                    startWidget: Widget.Label({
                        className: 'title',
                        xalign: 0,
                        label: 'Torrents',
                    }),
                    endWidget: Widget.Box({
                        vpack: 'start',
                        hpack: 'end',
                        children:
                            downloads.length > 0
                                ? [
                                      Widget.Button({
                                          className: 'primary',
                                          child: Widget.Icon({
                                              icon: downloads.some((torrent) => !torrent.paused)
                                                  ? 'media-playback-pause-symbolic'
                                                  : 'media-playback-start-symbolic',
                                              size: 20,
                                          }),
                                          onPrimaryClick: () => torrents.togglePause(),
                                      }),
                                  ]
                                : [],
                    }),
                }),
                ...[...downloads, ...uploads].map((torrent) => {
                    let levelbarClass = torrent.paused ? 'paused' : '';
                    levelbarClass = torrent.isFinished ? 'finished' : levelbarClass;

                    return Widget.Box({
                        className: 'torrent',
                        children: [
                            Widget.Box({
                                vertical: true,
                                expand: true,
                                children: [
                                    Widget.Label({
                                        className: 'name',
                                        xalign: 0,
                                        label: string.truncate(torrent.name, 50),
                                    }),
                                    Widget.Label({
                                        className: 'details',
                                        xalign: 0,
                                        label: `${format.bytes(torrent.size)} (${format.percent(torrent.percent)})  -  ${torrent.isFinished ? 'Finished' : format.seconds(torrent.eta)}`,
                                    }),
                                    Widget.LevelBar({
                                        className: levelbarClass,
                                        widthRequest: 200,
                                        value: torrent.percent,
                                    }),
                                    Widget.Box({
                                        className: 'progress',
                                        children: [
                                            Widget.Icon({
                                                icon: 'chevron-down-symbolic',
                                                size: 10,
                                            }),
                                            Widget.Label({
                                                label: `${format.bytes(torrent.rateDownload)}/s`,
                                            }),
                                            Widget.Icon({
                                                icon: 'chevron-up-symbolic',
                                                size: 10,
                                            }),
                                            Widget.Label({
                                                label: `${format.bytes(torrent.rateUpload)}/s`,
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                            Widget.Box({
                                className: 'actions',
                                vertical: true,
                                hpack: 'center',
                                children: [
                                    ...(torrent.isFinished
                                        ? []
                                        : [
                                              Widget.Button({
                                                  className: 'primary',
                                                  child: Widget.Icon({
                                                      icon: torrent.paused
                                                          ? 'media-playback-start-symbolic'
                                                          : 'media-playback-pause-symbolic',
                                                      size: 18,
                                                  }),
                                                  onPrimaryClick: () => torrents.togglePause(torrent.id),
                                              }),
                                          ]),
                                    Widget.Button({
                                        className: 'danger',
                                        child: Widget.Icon({
                                            icon: 'remove-symbolic',
                                            size: 18,
                                        }),
                                        onPrimaryClick: () => torrents.remove(torrent.id),
                                    }),
                                ],
                            }),
                        ],
                    });
                }),
            ]),
        }),
    });
}

export function openTorrents() {
    App.addWindow(Backdrop());
    App.addWindow(Torrents());
}
