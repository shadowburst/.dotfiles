const audio = await Service.import('audio');

const icons = {
    101: 'overamplified',
    67: 'high',
    34: 'medium',
    1: 'low',
    0: 'muted',
};

export default function VolumeOsd() {
    return Widget.Box({
        className: 'notification',
        children: [
            Widget.Icon({
                classNames: audio.speaker.bind('is_muted').as((isMuted) => ['volume', isMuted ? 'muted' : '']),
                icon: Utils.merge([audio.speaker.bind('volume'), audio.speaker.bind('is_muted')], (volume, isMuted) => {
                    const icon = isMuted ? 0 : [101, 67, 34, 1, 0].find((threshold) => threshold <= volume * 100);

                    return `audio-volume-${icons[icon]}-symbolic`;
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
                        label: audio.speaker.bind('volume').as((volume) => `${Math.round(volume * 100)}%`),
                    }),
                    Widget.LevelBar({
                        className: audio.speaker.bind('is_muted').as((isMuted) => (isMuted ? 'muted' : '')),
                        value: audio.speaker.bind('volume'),
                    }),
                ],
            }),
        ],
    });
}
