/**
 * @typedef Update
 * @property {string} name
 * @property {string} old_version
 * @property {string} new_version
 */

class UpdatesService extends Service {
    static {
        Service.register(
            this,
            {},
            {
                list: ['jsobject'],
                count: ['int'],
            }
        );
    }

    /** @type {Update[]} */
    _list = [];

    get list() {
        return this._list;
    }

    get count() {
        return this._list.length;
    }

    constructor() {
        super();

        // Every hour
        Utils.interval(3600000, () => this.fetch());
    }

    /** Fetches the list of updates */
    async fetch() {
        const value = await Utils.execAsync(['bash', '-c', '(checkupdates; paru -Qua) | column -t | sort']);
        this._list = value
            .split('\n')
            .filter((line) => line.length > 0)
            .map((line) => {
                const [name, old_version, _, new_version] = line.split(/\s+/);

                return { name, old_version, new_version };
            });

        this.notify('list');
        this.notify('count');
    }

    /** Updates the system */
    async update() {
        await Utils.execAsync(['bash', '-c', '$TERMINAL -e paru -Syu']);
        this.fetch();
    }
}

const service = new UpdatesService();

export default service;
