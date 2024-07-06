const audio = await Service.import('audio');

export default function Volume() {
    const icons = {
        101: 'overamplified',
        67: 'high',
        34: 'medium',
        1: 'low',
        0: 'muted',
    };

    return Widget.Button({
        classNames: audio.speaker.bind('is_muted').as((isMuted) => ['volume', isMuted ? 'muted' : '']),
        child: Widget.Box({
            children: [
                Widget.CircularProgress({
                    value: Utils.merge(
                        [audio.speaker.bind('volume'), audio.speaker.bind('is_muted')],
                        (volume, isMuted) => (isMuted ? 0 : volume)
                    ),
                    child: Widget.Icon({
                        icon: Utils.merge(
                            [audio.speaker.bind('volume'), audio.speaker.bind('is_muted')],
                            (volume, isMuted) => {
                                const icon = isMuted
                                    ? 0
                                    : [101, 67, 34, 1, 0].find((threshold) => threshold <= volume * 100);

                                return `audio-volume-${icons[icon]}-symbolic`;
                            }
                        ),
                    }),
                    startAt: 0.75,
                }),
                Widget.Label({
                    label: audio.speaker.bind('volume').as((volume) => `${Math.round(volume * 100)}%`),
                }),
            ],
        }),
        onPrimaryClick: () => Utils.execAsync('pavucontrol'),
    });
}
