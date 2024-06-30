import system from '../../services/system.js';

export default function Ram() {
    return Widget.Box({
        className: system.bind('ram').as((ram) => {
            if (ram < 70) return 'ram';
            if (ram < 90) return 'ram warning';
            return 'ram danger';
        }),
        children: [
            Widget.CircularProgress({
                value: system.bind('ram').as((ram) => ram / 100),
                child: Widget.Icon({
                    icon: 'ram-symbolic',
                }),
                startAt: 0.75,
            }),
            Widget.Label({
                label: system.bind('ram').as((ram) => `${ram}%`),
            }),
        ],
    });
}
