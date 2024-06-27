import { string } from '../../utils/index.js';

const hyprland = await Service.import('hyprland');

/**
 * @param {number} monitorId
 */
export default function Window(monitorId = 0) {
    const client = hyprland.bind('active').as((active) => {
        const c = hyprland.getClient(active.client.address);

        if (c?.monitor !== monitorId) {
            return;
        }

        return c;
    });

    return Widget.Box({
        className: 'window',
        vertical: true,
        visible: client.as((client) => client != null),
        children: [
            Widget.Label({
                className: 'title',
                label: client.as((c) => string.capitalize(string.truncate(c?.title ?? ''))),
                xalign: 0,
            }),
            Widget.Label({
                className: 'class',
                label: client.as((c) => string.capitalize(string.truncate(c?.class ?? ''))),
                xalign: 0,
            }),
        ],
    });
}
