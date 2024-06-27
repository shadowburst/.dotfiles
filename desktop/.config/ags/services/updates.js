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

    /** @type {string[]} */
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
        Utils.interval(3600000, () => this._updateList());
    }

    async _updateList() {
        const value = await Utils.execAsync([
            'bash',
            '-c',
            '(checkupdates; paru -Qua) | column -t | cut -c 1-70 | sort',
        ]);
        this._list = value.split('\n').filter((line) => line.length > 0);
        this.notify('list');
        this.notify('count');
    }

    async update() {
        await Utils.execAsync(['bash', '-c', 'paru -Syu; echo Done - Press enter to exit...; read _']);
        this._updateList();
    }
}

const service = new UpdatesService();

export default service;
