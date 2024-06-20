import updates from '../../services/updates.js';

export default function Updates() {
    return Widget.Revealer({
        revealChild: updates.bind('count').as((count) => count > 0),
        transition: 'slide_left',
        child: Widget.Box({
            children: [
                Widget.Button({
                    className: 'updates',
                    child: Widget.Box({
                        children: [
                            Widget.CircularProgress({
                                value: 1,
                                child: Widget.Icon({
                                    icon: 'arch-updates-symbolic',
                                }),
                                startAt: 0.75,
                                rounded: true,
                                inverted: false,
                            }),
                            Widget.Label({
                                label: updates.bind('count').as((count) => `${count} updates`),
                            }),
                        ],
                    }),
                    onPrimaryClick: () => Utils.execAsync(['bash', '-c', '$TERMINAL -e paru -Syu']),
                }),
            ],
        }),
    });
}
