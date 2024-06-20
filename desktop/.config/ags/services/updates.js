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

    #list = '';

    get list() {
        return this.#list;
    }

    get count() {
        return this.#list.split('\n').length;
    }

    constructor() {
        super();

        // Every hour
        Utils.interval(3600000, () => this.#onChange());

        this.#onChange();
    }

    async #onChange() {
        const value = await Utils.execAsync([
            'bash',
            '-c',
            '(checkupdates; paru -Qua) | column -t | cut -c 1-70 | sort',
        ]);
        this.#list = value;
        this.notify('list');
        this.notify('count');
    }
}

const service = new UpdatesService();

export default service;
