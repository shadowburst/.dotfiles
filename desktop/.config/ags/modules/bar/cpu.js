import system from '../../services/system.js';

export default function Cpu() {
    return Widget.Box({
        classNames: system.bind('cpu').as((cpu) => {
            const classes = ['cpu'];
            if (cpu >= 90) {
                classes.push('danger');
            } else if (cpu >= 70) {
                classes.push('warning');
            }
            return classes;
        }),
        children: [
            Widget.CircularProgress({
                value: system.bind('cpu').as((cpu) => cpu / 100),
                child: Widget.Icon('cpu-symbolic'),
                startAt: 0.75,
            }),
            Widget.Label({
                label: system.bind('cpu').as((cpu) => `${cpu}%`),
            }),
        ],
    });
}
