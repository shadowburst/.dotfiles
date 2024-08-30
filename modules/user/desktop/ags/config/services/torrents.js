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

export class Torrent extends Service {
    static {
        Service.register(
            this,
            {
                paused: [],
                resumed: [],
                finished: [],
                removed: [],
            },
            {
                paused: ['boolean'],
                finished: ['boolean'],
                size: ['int'],
                percent: ['float'],
                eta: ['int'],
                rate_download: ['float'],
                rate_upload: ['float'],
            }
        );
    }

    /** @type {number} */
    _id;

    /** @type {string} */
    _name;

    /** @type {boolean} */
    _paused = false;

    /** @type {boolean} */
    _finished = false;

    /** @type {number} */
    _size = 0;

    /** @type {number} */
    _percent = 0;

    /** @type {number} */
    _eta = 0;

    /** @type {number} */
    _rate_download = 0;

    /** @type {number} */
    _rate_upload = 0;

    /** @type {number} */
    get id() {
        return this._id;
    }

    /** @type {string} */
    get name() {
        return this._name;
    }
    set name(/** @type {string} */ name) {
        if (this._name === name) {
            return;
        }

        this._name = name;
        this.notify('name');
    }

    /** @type {boolean} */
    get paused() {
        return this._paused;
    }
    set paused(/** @type {boolean} */ paused) {
        if (this._paused === paused) {
            return;
        }

        this._paused = paused;
        this.notify('paused');
        this.emit(paused ? 'paused' : 'resumed');
    }

    /** @type {boolean} */
    get finished() {
        return this._finished;
    }
    set finished(/** @type {boolean} */ finished) {
        if (this._finished === finished) {
            return;
        }

        this._finished = finished;
        this.notify('finished');
        if (finished) {
            this.emit('finished');
        }
    }

    /** @type {number} */
    get size() {
        return this._size;
    }
    set size(/** @type {number} */ size) {
        if (this._size === size) {
            return;
        }

        this._size = size;
        this.notify('size');
    }

    /** @type {number} */
    get percent() {
        return this._percent;
    }
    set percent(/** @type {number} */ percent) {
        if (this._percent === percent) {
            return;
        }

        this._percent = percent;
        this.notify('percent');
    }

    /** @type {number} */
    get eta() {
        return this._eta;
    }
    set eta(/** @type {number} */ eta) {
        if (this._eta === eta) {
            return;
        }

        this._eta = eta;
        this.notify('eta');
    }

    /** @type {number} */
    get rate_download() {
        return this._rate_download;
    }
    set rate_download(/** @type {number} */ rate_download) {
        if (this._rate_download === rate_download) {
            return;
        }

        this._rate_download = rate_download;
        this.notify('rate_download');
    }

    /** @type {number} */
    get rate_upload() {
        return this._rate_upload;
    }
    set rate_upload(/** @type {number} */ rate_upload) {
        if (this._rate_upload === rate_upload) {
            return;
        }

        this._rate_upload = rate_upload;
        this.notify('rate_upload');
    }

    constructor(
        /** @type {number} */ id,
        /** @type {string} */ name,
        /** @type {boolean} */ paused,
        /** @type {boolean} */ finished,
        /** @type {number} */ size,
        /** @type {number} */ percent,
        /** @type {number} */ eta,
        /** @type {number} */ rate_download,
        /** @type {number} */ rate_upload
    ) {
        super();

        this._id = id;
        this._name = name;
        this._paused = paused;
        this._finished = finished;
        this._size = size;
        this._percent = percent;
        this._eta = eta;
        this._rate_download = rate_download;
        this._rate_upload = rate_upload;
    }

    update(
        /** @type {string} */ name,
        /** @type {boolean} */ paused,
        /** @type {boolean} */ finished,
        /** @type {number} */ size,
        /** @type {number} */ percent,
        /** @type {number} */ eta,
        /** @type {number} */ rate_download,
        /** @type {number} */ rate_upload
    ) {
        this.name = name;
        this.paused = paused;
        this.finished = finished;
        this.size = size;
        this.percent = percent;
        this.eta = eta;
        this.rate_download = rate_download;
        this.rate_upload = rate_upload;
    }

    async resume() {
        await Utils.execAsync(`transmission-remote -t ${this._id} --start`);

        this.emit('resumed');
    }

    async pause() {
        await Utils.execAsync(`transmission-remote -t ${this._id} --stop`);

        this.emit('paused');
    }

    async remove() {
        await Utils.execAsync(
            `transmission-remote -t ${this._id} ${this.finished ? '--remove' : '--remove-and-delete'}`
        );

        this.emit('removed');
    }
}

class TorrentService extends Service {
    static {
        Service.register(
            this,
            {
                'torrent-added': ['jsobject'],
                'torrent-finished': ['jsobject'],
                'torrent-removed': ['int'],
            },
            {
                torrents: ['jsobject'],
                downloads: ['jsobject'],
                uploads: ['jsobject'],
                percent: ['float'],
                status: ['string'],
            }
        );
    }

    /** @type {Map<number, Torrent>} */
    _torrents = new Map();

    /** @type {Torrent[]} */
    get torrents() {
        const torrents = [...this._torrents.values()];

        return [...torrents.filter((t) => !t.finished), ...torrents.filter((t) => t.finished)];
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

        this.update();

        Utils.interval(2000, () => this.update());
    }

    async update() {
        const value = JSON.parse(await Utils.execAsync('transmission-remote -j -l'));

        /** @type {TransmissionTorrent[]} */
        const transmissionTorrents = value.arguments.torrents;

        for (const torrent of transmissionTorrents) {
            const size = torrent.sizeWhenDone > 0 ? torrent.sizeWhenDone - torrent.leftUntilDone : 0;
            if (!this._torrents.has(torrent.id)) {
                const newTorrent = new Torrent(
                    torrent.id,
                    torrent.name,
                    torrent.status === 0,
                    torrent.sizeWhenDone > 0 && torrent.leftUntilDone === 0,
                    size,
                    torrent.sizeWhenDone > 0 ? size / torrent.sizeWhenDone : 0,
                    torrent.eta,
                    torrent.rateDownload,
                    torrent.rateUpload
                );
                newTorrent.connect('resumed', () => this.update());
                newTorrent.connect('paused', () => this.update());
                newTorrent.connect('finished', (self) => this.emit('torrent-finished', self));
                newTorrent.connect('removed', () => this.update());

                this._torrents.set(torrent.id, newTorrent);

                this.emit('torrent-added', newTorrent);
            } else {
                this._torrents
                    .get(torrent.id)
                    ?.update(
                        torrent.name,
                        torrent.status === 0,
                        torrent.sizeWhenDone > 0 && torrent.leftUntilDone === 0,
                        size,
                        torrent.sizeWhenDone > 0 ? size / torrent.sizeWhenDone : 0,
                        torrent.eta,
                        torrent.rateDownload,
                        torrent.rateUpload
                    );
            }
        }
        for (const id of [...this._torrents.keys()].filter((id) => !transmissionTorrents.some((t) => t.id === id))) {
            this._torrents.delete(id);
            this.emit('torrent-removed', id);
        }

        this.notify('torrents');
        this.notify('downloads');
        this.notify('uploads');
        this.notify('percent');
        this.notify('status');
    }

    async resumeAll() {
        await Utils.execAsync(`transmission-remote -t all --start`);

        this.update();
    }

    async pauseAll() {
        await Utils.execAsync(`transmission-remote -t all --stop`);

        this.update();
    }

    async removeAll() {
        await Utils.execAsync(`transmission-remote -t all --remove`);

        this.update();
    }
}

const service = new TorrentService();

export default service;
