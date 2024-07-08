import * as windows from '../windows/index.js';
import updates from '../../services/updates.js';

export default function Updates() {
    return Widget.Revealer({
        revealChild: updates.bind('count').as((count) => count > 0),
        transition: 'slide_left',
        child: Widget.Button({
            className: 'updates',
            child: Widget.Box({
                children: [
                    Widget.CircularProgress({
                        value: 1,
                        child: Widget.Icon('browser-download-symbolic'),
                    }),
                    Widget.Label({
                        label: updates.bind('count').as((count) => `${count} updates`),
                    }),
                ],
            }),
            onPrimaryClick: () => windows.open('updates'),
        }),
    });
}
