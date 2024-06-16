import { string } from '../../utils/index.js';

const mpris = await Service.import('mpris');

export default function Media() {
    const currentPlayer = Variable(mpris.getPlayer() ?? undefined);

    mpris.connect('changed', () => {
        currentPlayer.value = mpris.players.find((player) => player.play_back_status !== 'Stopped');
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
                        onPrimaryClick: player.playPause,
                        onScrollUp: player.next,
                        onScrollDown: player.previous,
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
                                    rounded: true,
                                    inverted: false,
                                }).poll(1000, (self) => {
                                    self.value =
                                        player != null && player.length > 0 ? player.position / player.length : 0;
                                }),
                                Widget.Label({
                                    label: player.bind('track_title').as((title) => string.truncate(title)),
                                }),
                            ],
                        }),
                    }),
                ];
            }),
        }),
    });
}
