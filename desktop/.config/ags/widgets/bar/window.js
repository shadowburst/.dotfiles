import { string } from '../../utils/index.js';

const hyprland = await Service.import('hyprland');

/**
 * @param {number} monitorIndex
 */
export default function Window(monitorIndex = 0) {
    const client = Utils.merge([hyprland.bind('monitors'), hyprland.bind('workspaces')], (monitors, workspaces) => {
        const monitor = monitors[monitorIndex];
        if (!monitor) {
            return;
        }

        const workspace = workspaces[monitor.activeWorkspace.id - 1];
        if (!workspace) {
            return;
        }

        return hyprland.getClient(workspace.lastwindow);
    });

    return Widget.Box({
        className: 'window',
        vertical: true,
        visible: client.as((client) => client != null),
        children: [
            Widget.Label({
                className: 'title',
                label: client.as((c) => string.truncate(c?.title ?? '')),
                xalign: 0,
            }),
            Widget.Label({
                className: 'class',
                label: client.as((c) => string.truncate(c?.class ?? '')),
                xalign: 0,
            }),
        ],
    });
}
