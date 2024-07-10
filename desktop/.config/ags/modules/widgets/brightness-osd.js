import brightness from '../../services/brightness.js';

const icons = {
    67: 'high',
    34: 'medium',
    1: 'low',
    0: 'off',
};

export default function BrightnessOsd() {
    return Widget.Box({
        className: 'notification',
        children: [
            Widget.Icon({
                icon: brightness.bind('value').as((value) => {
                    const icon = [67, 34, 1, 0].find((threshold) => threshold <= value * 100);
                    console.log(value, icon);

                    return `display-brightness-${icons[icon]}-symbolic`;
                }),
            }),
            Widget.Box({
                vertical: true,
                expand: true,
                vpack: 'center',
                children: [
                    Widget.Label({
                        className: 'title',
                        xalign: 0,
                        label: brightness.bind('value').as((value) => `${Math.round(value * 100)}%`),
                    }),
                    Widget.LevelBar({
                        value: brightness.bind('value'),
                    }),
                ],
            }),
        ],
    });
}
