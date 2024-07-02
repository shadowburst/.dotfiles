import * as windows from '../windows/index.js';
import torrents from '../../services/torrents.js';

export default function () {
    return Widget.Revealer({
        revealChild: torrents.bind('torrents').as((torrents) => torrents.length > 0),
        transition: 'slide_left',
        child: Widget.Button({
            className: torrents.bind('status').as((status) => {
                switch (status) {
                    case 'paused':
                        return 'torrents warning';
                    case 'finished':
                        return 'torrents success';
                    default:
                        return 'torrents';
                }
            }),
            child: Widget.Box({
                children: [
                    Widget.Label({
                        label: torrents.bind('downloads').as((downloads) => `${downloads.length}`),
                    }),
                    Widget.CircularProgress({
                        value: torrents.bind('percent').as((percent) => percent / 100),
                        child: Widget.Icon({
                            icon: 'download-symbolic',
                        }),
                        startAt: 0.75,
                    }),
                    Widget.Label({
                        label: torrents.bind('uploads').as((uploads) => `${uploads.length}`),
                    }),
                ],
            }),
            onPrimaryClickRelease: () => windows.open('torrents'),
        }),
    });
}
