import { string } from '../../utils/index.js';

const mpris = await Service.import('mpris');

export default function Media() {
    const currentPlayer = Variable(mpris.getPlayer());

    mpris.connect('changed', () => {
        const player = mpris.getPlayer();

        currentPlayer.value = !player || player.length <= 0 ? null : player;
    });

    return Widget.Revealer({
        revealChild: currentPlayer.bind().as((player) => player != null),
        transition: 'slide_right',
        child: Widget.Box({
            children: currentPlayer.bind().as((player) => {
                if (!player) {
                    return [];
                }

                return [
                    Widget.Button({
                        className: 'media',
                        child: Widget.Box({
                            children: [
                                Widget.CircularProgress({
                                    child: Widget.Icon({
                                        icon: player
                                            .bind('play_back_status')
                                            .as((status) =>
                                                status === 'Playing'
                                                    ? 'media-playback-pause-symbolic'
                                                    : 'media-playback-start-symbolic'
                                            ),
                                    }),
                                    startAt: 0.75,
                                }).poll(1000, (self) => {
                                    self.value = player.position / player.length;
                                }),
                                Widget.Label({
                                    label: player.bind('track_title').as((title) => string.truncate(title)),
                                }),
                            ],
                        }),
                        onPrimaryClick: player.playPause,
                        onScrollUp: player.next,
                        onScrollDown: player.previous,
                    }),
                ];
            }),
        }),
    });
}
