
class TaskLogic {
    isRunning: boolean;

    constructor() {
        this.isRunning = false;
    }

    async start() {
        this.isRunning = true;
        while (this.isRunning) {
            console.log('Task is running');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async stop() {
        this.isRunning = false;
        console.log('Task stopped');
    }

    // 获取状态
    getStatus() {
        return this.isRunning;
    }
}

export default new TaskLogic();