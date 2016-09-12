export default class Lifecycle {
    constructor() {
        this._listeners = [];
    }
    addListener(callback) {
        this._listeners.push(callback);
    }
    trigger() {
        for (let i = 0; i < this._listeners.length; i++) {
            this._listeners[i]();
        }
    }
}
//# sourceMappingURL=lifecycle.js.map