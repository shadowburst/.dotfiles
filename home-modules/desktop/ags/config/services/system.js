class SystemService extends Service {
    static {
        Service.register(
            this,
            {},
            {
                cpu: ['int', 'r'],
                ram: ['int', 'r'],
            }
        );
    }

    /** @type {number} */
    _cpu = 0;

    /** @type {number} */
    _ram = 0;

    get cpu() {
        return this._cpu;
    }

    get ram() {
        return this._ram;
    }

    constructor() {
        super();

        Utils.interval(2000, () => this._updateCpu());
        Utils.interval(2000, () => this._updateRam());

        this._updateCpu();
        this._updateRam();
    }

    async _updateCpu() {
        const value = await Utils.execAsync(['bash', '-c', "top -b -n 1 | awk '/Cpu/ {print $2}'"]);
        this._cpu = Math.min(100, Math.floor(Number(value)));
        this.notify('cpu');
    }

    async _updateRam() {
        const value = await Utils.execAsync(['bash', '-c', "free | awk '/Mem/ {print $3/$2}'"]);
        this._ram = Math.min(100, Math.floor(Number(value) * 100));
        this.notify('ram');
    }
}

const service = new SystemService();

export default service;
