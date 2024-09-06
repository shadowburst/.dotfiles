import * as windows from './index.js';

const hyprland = await Service.import('hyprland');
const powerProfiles = await Service.import('powerprofiles');

/** @type {{name: string, value: string}[]} */
const profiles = [
    {
        name: 'Power saver',
        value: 'power-saver',
    },
    {
        name: 'Balanced',
        value: 'balanced',
    },
    {
        name: 'Performance',
        value: 'performance',
    },
];

function setProfile(/** @type {string} */ profile) {
    windows.closeAll();
    powerProfiles.active_profile = profile;
}

export default function PowerProfiles() {
    const focused = Variable(profiles.findIndex((p) => p.value === powerProfiles.active_profile) ?? 1);

    return Widget.Window({
        name: 'power-profiles',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        anchor: ['top', 'right'],
        keymode: 'exclusive',
        child: Widget.Box({
            className: 'power-profiles',
            vertical: true,
            children: [
                Widget.CenterBox({
                    startWidget: Widget.Label({
                        className: 'title',
                        xalign: 0,
                        label: 'Power Profiles',
                    }),
                }),
                Widget.Box({
                    homogeneous: true,
                    children: profiles.map((profile, index) =>
                        Widget.Button({
                            className: 'primary',
                            isFocus: focused.bind().as((value) => value === index),
                            child: Widget.Box({
                                vertical: true,
                                children: [
                                    Widget.Icon(`power-profile-${profile.value}-symbolic`),
                                    Widget.Label(profile.name),
                                ],
                            }),
                            onPrimaryClickRelease: () => setProfile(profiles[index].value),
                        })
                            .keybind('Return', () => setProfile(profiles[index].value))
                            .keybind('leftarrow', () => (focused.value = Math.max(0, focused.value - 1)))
                            .keybind(
                                'rightarrow',
                                () => (focused.value = Math.min(profiles.length - 1, focused.value + 1))
                            )
                            .keybind('Escape', () => windows.closeAll())
                    ),
                }),
            ],
        }),
    });
}
