import system from '../../services/system.js';

export default function Cpu() {
    return Widget.Box({
        className: system.bind('cpu').as((cpu) => {
            if (cpu < 70) return 'cpu';
            if (cpu < 90) return 'cpu warning';
            return 'cpu danger';
        }),
        children: [
            Widget.CircularProgress({
                value: system.bind('cpu').as((cpu) => cpu / 100),
                child: Widget.Icon({
                    icon: 'cpu-symbolic',
                }),
                startAt: 0.75,
            }),
            Widget.Label({
                label: system.bind('cpu').as((cpu) => `${cpu}%`),
            }),
        ],
    });
}
