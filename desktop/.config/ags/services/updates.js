class UpdatesService extends Service {
    static {
        Service.register(
            this,
            {},
            {
                list: ['string', 'r'],
                count: ['int', 'r'],
            }
        );
    }

    _list = '';

    get list() {
        return this._list;
    }

    get count() {
        return this._list.split('\n').length;
    }

    constructor() {
        super();

        // Every hour
        Utils.interval(3600000, () => this._updateList());

        this._updateList();
    }

    async _updateList() {
        const value = await Utils.execAsync([
            'bash',
            '-c',
            '(checkupdates; paru -Qua) | column -t | cut -c 1-70 | sort',
        ]);
        this._list = value;
        this.notify('list');
        this.notify('count');
    }
}

const service = new UpdatesService();

export default service;
