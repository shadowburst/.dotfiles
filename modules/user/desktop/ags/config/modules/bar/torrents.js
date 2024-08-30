import * as windows from '../windows/index.js';
import torrents from '../../services/torrents.js';

export default function () {
    return Widget.Revealer({
        revealChild: torrents.bind('torrents').as((torrents) => torrents.length > 0),
        transition: 'slide_left',
        child: Widget.Button({
            classNames: torrents
                .bind('status')
                .as((status) => [
                    'torrents',
                    status === 'paused' ? 'warning' : '',
                    status === 'finished' ? 'success' : '',
                ]),
            child: Widget.Box({
                children: [
                    Widget.Label({
                        label: torrents.bind('downloads').as((downloads) => `${downloads.length}`),
                    }),
                    Widget.CircularProgress({
                        value: torrents.bind('percent').as((percent) => percent / 100),
                        child: Widget.Icon({
                            icon: 'browser-download-symbolic',
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
