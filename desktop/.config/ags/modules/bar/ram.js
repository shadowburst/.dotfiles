import system from '../../services/system.js';

export default function Ram() {
    return Widget.Box({
        classNames: system.bind('ram').as((ram) => {
            const classes = ['ram'];
            if (ram >= 90) {
                classes.push('danger');
            } else if (ram >= 70) {
                classes.push('warning');
            }
            return classes;
        }),
        children: [
            Widget.CircularProgress({
                value: system.bind('ram').as((ram) => ram / 100),
                child: Widget.Icon('ram-symbolic'),
                startAt: 0.75,
            }),
            Widget.Label({
                label: system.bind('ram').as((ram) => `${ram}%`),
            }),
        ],
    });
}
