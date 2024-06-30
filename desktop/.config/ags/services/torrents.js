import GLib from 'gi://GLib';

/**
 * @typedef TransmissionTorrent
 * @type {object}
 * @property {number} id
 * @property {string} name
 * @property {boolean} isFinished
 * @property {number} error
 * @property {string} errorString
 * @property {number} eta
 * @property {number} leftUntilDone
 * @property {number} rateDownload
 * @property {number} rateUpload
 * @property {number} sizeWhenDone
 * @property {number} status
 * @property {number} uploadRatio
 */

/**
 * @typedef Torrent
 * @type {object}
 * @property {number} id
 * @property {string} name
 * @property {boolean} paused
 * @property {boolean} finished
 * @property {number} size
 * @property {number} percent
 * @property {number} eta
 * @property {number} rate_download
 * @property {number} rate_upload
 */

class TorrentService extends Service {
    static {
        Service.register(
            this,
            {},
            {
                torrents: ['jsobject'],
                downloads: ['jsobject'],
                uploads: ['jsobject'],
                percent: ['float'],
                status: ['string'],
            }
        );
    }

    /** @type {GLib.Source|null} */
    _timeout = null;

    /** @type {Torrent[]} */
    _torrents = [];

    /** @type {Torrent[]} */
    get torrents() {
        return this._torrents;
    }

    /** @type {Torrent[]} */
    get downloads() {
        return this.torrents.filter((t) => !t.finished);
    }

    /** @type {Torrent[]} */
    get uploads() {
        return this.torrents.filter((t) => t.finished);
    }

    /** @type {number} */
    get percent() {
        if (this.torrents.length === 0) {
            return 0;
        }

        return Math.floor(
            (this.torrents.reduce((total, torrent) => total + torrent.percent, 0) / this.torrents.length) * 100
        );
    }

    /** @type {'paused' | 'downloading' | 'finished'} */
    get status() {
        if (this.downloads.length === 0 && this.uploads.length > 0) {
            return 'finished';
        }

        if (this.downloads.some((torrent) => !torrent.paused)) {
            return 'downloading';
        }

        return 'paused';
    }

    constructor() {
        super();

        this._updateState();
    }

    async _updateState() {
        const value = JSON.parse(await Utils.execAsync('transmission-remote -j -l'));

        /** @type {TransmissionTorrent[]} */
        const transmissionTorrents = value.arguments.torrents;

        this._torrents = transmissionTorrents.map((torrent) => ({
            id: torrent.id,
            name: torrent.name,
            paused: torrent.status === 0,
            finished: torrent.sizeWhenDone > 0 && torrent.leftUntilDone === 0,
            size: torrent.sizeWhenDone - torrent.leftUntilDone,
            percent:
                torrent.sizeWhenDone > 0 ? (torrent.sizeWhenDone - torrent.leftUntilDone) / torrent.sizeWhenDone : 0,
            eta: torrent.eta,
            rate_download: torrent.rateDownload,
            rate_upload: torrent.rateUpload,
        }));
        this.notify('torrents');
        this.notify('downloads');
        this.notify('uploads');
        this.notify('percent');
        this.notify('status');

        this._timeout?.destroy();
        this._timeout = setTimeout(() => this._updateState(), this.downloads.some((t) => !t.paused) ? 1000 : 15000);
    }

    /**
     * @param {number|null} id
     */
    async togglePause(id = null) {
        const target = id ?? 'all';
        let operation = '--stop';

        if (id != null) {
            const torrent = this.torrents.find((t) => t.id === id);
            if (torrent?.paused) {
                operation = '--start';
            }
        } else {
            if (this.torrents.every((t) => t.paused || t.finished)) {
                operation = '--start';
            }
        }

        await Utils.execAsync(`transmission-remote -t ${target} ${operation}`);

        this._updateState();
    }

    /**
     * @param {number} id
     */
    async remove(id) {
        const operation = this.torrents.find((t) => t.id === id)?.finished ? '--remove' : '--remove-and-delete';

        await Utils.execAsync(`transmission-remote -t ${id} ${operation}`);

        this._updateState();
    }
}

const service = new TorrentService();

export default service;
