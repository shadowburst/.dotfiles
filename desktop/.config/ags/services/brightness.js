class BrightnessService extends Service {
    static {
        Service.register(
            this,
            {
                value: ['float'],
            },
            {
                value: ['float', 'rw'],
            }
        );
    }

    /** @type {string} */
    _interface = Utils.exec("sh -c 'ls -w1 /sys/class/backlight | head -1'");

    /** @type {number} */
    _value = 0;

    /** @type {number} */
    _max = Number(Utils.exec('brightnessctl max'));

    get value() {
        return this._value;
    }
    set value(/** @type {number} */ percent) {
        percent = Math.min(1, Math.max(0, percent)) * 100;

        Utils.execAsync(`brightnessctl set ${percent}% -q`);
    }

    constructor() {
        super();

        const brightness = `/sys/class/backlight/${this._interface}/brightness`;
        Utils.monitorFile(brightness, () => this._update());

        this._update();
    }

    _update() {
        this._value = Number(Utils.exec('brightnessctl get')) / this._max;

        this.emit('changed');
        this.notify('value');
    }
}

const service = new BrightnessService();

export default service;
